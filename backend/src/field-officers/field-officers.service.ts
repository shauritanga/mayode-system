import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MamcosStaffRole, Prisma, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { AuthService } from '../auth/auth.service';
import { SmsService } from '../messaging/sms.service';
import { createRoleTemplates, FIELD_OFFICER_ROLE } from '../roles/role-templates';
import type { DelegatingActor } from '../auth/delegation';
import {
  AssignOfficerWorkDto,
  CreateFieldOfficerDto,
  UpdateFieldOfficerDto,
} from './dto/field-officers.dto';
import { generateTemporaryPassword, redactPassword, welcomeSms } from './officer-credentials';

const FARMER_COMPLETENESS_FIELDS = [
  'nationalId',
  'village',
  'ward',
  'gender',
  'dateOfBirth',
  'photoUrl',
  'residenceLatitude',
] as const;
const FARM_COMPLETENESS_FIELDS = 6; // GPS centre, boundary, photo, village, ownership type, water source

const bump = (map: Map<string, number>, key?: string | null, by = 1) => {
  if (key) map.set(key, (map.get(key) ?? 0) + by);
};

@Injectable()
export class FieldOfficersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly auth: AuthService,
    private readonly sms: SmsService,
    private readonly config: ConfigService,
  ) {}

  /** Sends the sign-in details; the log keeps the text without the password. */
  private async sendCredentials(
    phone: string,
    person: { firstName: string; language?: string | null },
    password: string,
    reissued = false,
  ): Promise<boolean> {
    const text = welcomeSms({
      firstName: person.firstName,
      phone,
      password,
      language: person.language,
      portalUrl: this.config.get<string>('PORTAL_URL') || undefined,
      appUrl: this.config.get<string>('MOBILE_APP_URL') || undefined,
      reissued,
    });
    return this.sms.sendTransactional(phone, text, 'staff_credentials', redactPassword(text, password));
  }

  private async fieldOfficerRoleId(mamcosId: string): Promise<string> {
    const find = () =>
      this.prisma.role.findFirst({ where: { name: FIELD_OFFICER_ROLE, mamcosId }, select: { id: true } });
    let role = await find();
    if (!role) {
      await this.prisma.$transaction((tx) => createRoleTemplates(tx, mamcosId, [FIELD_OFFICER_ROLE]));
      role = await find();
    }
    if (!role) throw new BadRequestException('Could not prepare the Field Officer role');
    return role.id;
  }

  /**
   * Creates the officer's account with a generated temporary password and texts the sign-in
   * details. If the SMS fails the password is returned once so the admin can pass it on.
   */
  async create(dto: CreateFieldOfficerDto, actor: RequestUser) {
    const tenantId = this.tenant(actor);
    if (tenantId && dto.mamcosId && dto.mamcosId !== tenantId) {
      throw new ForbiddenException('You can only create field officers inside your own cooperative');
    }
    // A cooperative administrator creates officers for their own cooperative; Super Admin (Mayode corporate) picks one.
    const mamcosId = tenantId ?? dto.mamcosId;
    if (!mamcosId) throw new BadRequestException('Choose the cooperative the officer belongs to');
    if (!tenantId) {
      const exists = await this.prisma.mamcos.findUnique({ where: { id: mamcosId }, select: { id: true } });
      if (!exists) throw new NotFoundException('Cooperative not found');
    }
    const roleId = dto.roleId ?? (await this.fieldOfficerRoleId(mamcosId));
    const password = generateTemporaryPassword();
    const language = dto.language ?? 'sw';
    const user = await this.auth.createStaffAccount(
      {
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        phone: dto.phone,
        email: dto.email || undefined,
        password,
        roleId,
        staffType: UserRole.FIELD_OFFICER,
        assignedArea: dto.assignedArea?.trim() || undefined,
        language,
      },
      actor as unknown as DelegatingActor,
      { mustChangePassword: true, ...(tenantId ? {} : { onBehalfOfMamcosId: mamcosId }) },
    );
    const officer = await this.prisma.mamcosStaff.update({
      where: { userId: user.id },
      data: { region: dto.region?.trim() || null, district: dto.district?.trim() || null },
      select: { id: true, employeeCode: true },
    });
    const sent = await this.sendCredentials(user.phone, { firstName: dto.firstName, language }, password);
    return {
      id: officer.id,
      employeeCode: officer.employeeCode,
      credentialsSms: sent ? 'sent' : 'failed',
      ...(sent ? {} : { temporaryPassword: password }),
    };
  }

  /** Issues a fresh temporary password, signs the officer out everywhere and texts it. */
  async resendCredentials(id: string, actor: RequestUser) {
    const officer = await this.officerOrThrow(id, actor);
    const account = await this.prisma.user.findUnique({
      where: { id: officer.userId },
      select: { id: true, phone: true, language: true, firstName: true },
    });
    if (!account) throw new NotFoundException('Field officer not found');
    const password = generateTemporaryPassword();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: account.id },
        data: { passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true },
      }),
      this.prisma.refreshToken.deleteMany({ where: { userId: account.id } }),
    ]);
    const sent = await this.sendCredentials(
      account.phone,
      { firstName: account.firstName ?? officer.firstName, language: account.language },
      password,
      true,
    );
    return { credentialsSms: sent ? 'sent' : 'failed', ...(sent ? {} : { temporaryPassword: password }) };
  }

  private tenant(user: RequestUser) {
    return this.ownership.resolveTenantMamcosId(user);
  }

  /** Records the mobile app's last successful sync for the signed-in user. */
  async recordSync(user: RequestUser) {
    const lastSyncAt = new Date();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastSyncAt },
    });
    return { lastSyncAt };
  }

  /** Every field officer with assignment, registration, visit, task and sync figures. */
  async list(user: RequestUser) {
    const tenantId = this.tenant(user);
    const officers = await this.prisma.mamcosStaff.findMany({
      where: {
        role: MamcosStaffRole.FIELD_OFFICER,
        ...(tenantId ? { mamcosId: tenantId } : {}),
      },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        assignedArea: true,
        region: true,
        district: true,
        mamcos: { select: { id: true, name: true, district: true } },
        user: {
          select: {
            phone: true,
            isActive: true,
            lastSyncAt: true,
            lastLoginAt: true,
          },
        },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    if (!officers.length) return [];
    const ids = officers.map((o) => o.id);
    const now = new Date();

    const [farmers, farms, boundaryFarms, visits, activities] =
      await Promise.all([
        this.prisma.farmer.findMany({
          where: {
            OR: [
              { registeredByOfficerId: { in: ids } },
              { assignedOfficerId: { in: ids } },
            ],
          },
          select: {
            registeredByOfficerId: true,
            assignedOfficerId: true,
            verificationStatus: true,
            nationalId: true,
            village: true,
            ward: true,
            gender: true,
            dateOfBirth: true,
            photoUrl: true,
            residenceLatitude: true,
          },
        }),
        this.prisma.farm.findMany({
          select: {
            id: true,
            registeredByOfficerId: true,
            assignedOfficerId: true,
            isVerified: true,
            centerLatitude: true,
            photoUrls: true,
            village: true,
            ownershipType: true,
            waterSource: true,
          },
          where: {
            OR: [
              { registeredByOfficerId: { in: ids } },
              { assignedOfficerId: { in: ids } },
            ],
          },
        }),
        this.prisma.farm.findMany({
          where: {
            registeredByOfficerId: { in: ids },
            boundaryCoordinates: { not: Prisma.DbNull },
          },
          select: { id: true },
        }),
        this.prisma.fieldOfficerVisit.findMany({
          where: { fieldOfficerId: { in: ids } },
          select: {
            fieldOfficerId: true,
            farmerId: true,
            visitedAt: true,
            nextVisitDate: true,
            cropCycleId: true,
          },
        }),
        this.prisma.activityLog.groupBy({
          by: ['fieldOfficerId'],
          where: { fieldOfficerId: { in: ids } },
          _count: { _all: true },
        }),
      ]);
    const hasBoundary = new Set(boundaryFarms.map((f) => f.id));

    const farmersAssigned = new Map<string, number>();
    const farmersRegistered = new Map<string, number>();
    const pendingVerification = new Map<string, number>();
    const farmerFilled = new Map<string, number>();
    for (const f of farmers) {
      bump(farmersAssigned, f.assignedOfficerId);
      bump(farmersRegistered, f.registeredByOfficerId);
      if (f.assignedOfficerId && f.verificationStatus === 'PENDING')
        bump(pendingVerification, f.assignedOfficerId);
      if (f.registeredByOfficerId)
        bump(
          farmerFilled,
          f.registeredByOfficerId,
          FARMER_COMPLETENESS_FIELDS.filter((k) => f[k] != null && f[k] !== '')
            .length,
        );
    }

    const farmsAssigned = new Map<string, number>();
    const farmsRegistered = new Map<string, number>();
    const unverifiedFarms = new Map<string, number>();
    const farmFilled = new Map<string, number>();
    for (const f of farms) {
      const owner = f.assignedOfficerId;
      bump(farmsAssigned, owner);
      bump(farmsRegistered, f.registeredByOfficerId);
      if (owner && !f.isVerified) bump(unverifiedFarms, owner);
      if (f.registeredByOfficerId) {
        const filled = [
          f.centerLatitude != null,
          hasBoundary.has(f.id),
          f.photoUrls.length > 0,
          !!f.village,
          !!f.ownershipType,
          !!f.waterSource,
        ].filter(Boolean).length;
        bump(farmFilled, f.registeredByOfficerId, filled);
      }
    }

    const visitCounts = new Map<string, number>();
    const cropRecords = new Map<string, number>();
    const lastVisit = new Map<string, Date>();
    const overdue = new Map<string, number>();
    const latestByPair = new Map<string, Date>();
    for (const v of visits) {
      bump(visitCounts, v.fieldOfficerId);
      if (v.cropCycleId) bump(cropRecords, v.fieldOfficerId);
      const prev = lastVisit.get(v.fieldOfficerId);
      if (!prev || v.visitedAt > prev) lastVisit.set(v.fieldOfficerId, v.visitedAt);
      const pair = `${v.fieldOfficerId}:${v.farmerId}`;
      const p = latestByPair.get(pair);
      if (!p || v.visitedAt > p) latestByPair.set(pair, v.visitedAt);
    }
    for (const v of visits) {
      // A follow-up is overdue when its date has passed and the officer has not visited that farmer since.
      if (
        v.nextVisitDate &&
        v.nextVisitDate < now &&
        latestByPair.get(`${v.fieldOfficerId}:${v.farmerId}`)! <= v.visitedAt
      )
        bump(overdue, v.fieldOfficerId);
    }
    for (const a of activities) bump(cropRecords, a.fieldOfficerId, a._count._all);

    return officers.map((o) => {
      const regFarmers = farmersRegistered.get(o.id) ?? 0;
      const regFarms = farmsRegistered.get(o.id) ?? 0;
      const possible =
        regFarmers * FARMER_COMPLETENESS_FIELDS.length +
        regFarms * FARM_COMPLETENESS_FIELDS;
      const filled = (farmerFilled.get(o.id) ?? 0) + (farmFilled.get(o.id) ?? 0);
      const pendingFarmers = pendingVerification.get(o.id) ?? 0;
      const pendingFarms = unverifiedFarms.get(o.id) ?? 0;
      const overdueVisits = overdue.get(o.id) ?? 0;
      return {
        id: o.id,
        employeeCode: o.employeeCode,
        firstName: o.firstName,
        lastName: o.lastName,
        phone: o.user.phone,
        isActive: o.user.isActive,
        cooperative: o.mamcos?.name ?? null,
        region: o.region,
        district: o.district ?? o.mamcos?.district ?? null,
        assignedArea: o.assignedArea,
        farmersAssigned: farmersAssigned.get(o.id) ?? 0,
        farmsAssigned: farmsAssigned.get(o.id) ?? 0,
        farmersRegistered: regFarmers,
        farmsMapped: regFarms,
        visitsCompleted: visitCounts.get(o.id) ?? 0,
        lastVisitAt: lastVisit.get(o.id) ?? null,
        cropRecordsUpdated: cropRecords.get(o.id) ?? 0,
        dataCompleteness: possible ? Math.round((filled / possible) * 100) : null,
        pendingTasks: pendingFarmers + pendingFarms + overdueVisits,
        pendingBreakdown: {
          farmerVerifications: pendingFarmers,
          farmVerifications: pendingFarms,
          overdueVisits,
        },
        lastSyncAt: o.user.lastSyncAt,
        lastLoginAt: o.user.lastLoginAt,
      };
    });
  }

  private async officerOrThrow(id: string, user: RequestUser) {
    const tenantId = this.tenant(user);
    const officer = await this.prisma.mamcosStaff.findFirst({
      where: {
        id,
        role: MamcosStaffRole.FIELD_OFFICER,
        ...(tenantId ? { mamcosId: tenantId } : {}),
      },
    });
    if (!officer) throw new NotFoundException('Field officer not found');
    return officer;
  }

  async detail(id: string, user: RequestUser) {
    await this.officerOrThrow(id, user);
    const [summary] = (await this.list(user)).filter((o) => o.id === id);
    const [farmers, farms, visits] = await Promise.all([
      this.prisma.farmer.findMany({
        where: { assignedOfficerId: id },
        select: {
          id: true,
          controlNumber: true,
          firstName: true,
          lastName: true,
          village: true,
          verificationStatus: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.farm.findMany({
        where: { assignedOfficerId: id },
        select: {
          id: true,
          farmCode: true,
          name: true,
          village: true,
          socialHectares: true,
          isVerified: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.fieldOfficerVisit.findMany({
        where: { fieldOfficerId: id },
        orderBy: { visitedAt: 'desc' },
        take: 20,
        select: {
          id: true,
          visitedAt: true,
          purpose: true,
          notes: true,
          nextVisitDate: true,
          farmer: {
            select: { id: true, controlNumber: true, firstName: true, lastName: true },
          },
          farm: { select: { id: true, farmCode: true } },
        },
      }),
    ]);
    return { ...summary, farmers, farms, visits };
  }

  async update(id: string, dto: UpdateFieldOfficerDto, user: RequestUser) {
    await this.officerOrThrow(id, user);
    return this.prisma.mamcosStaff.update({
      where: { id },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        region: dto.region,
        district: dto.district,
        assignedArea: dto.assignedArea,
      },
    });
  }

  /** Assigns (or, with unassign, releases) farmers and farms for an officer. */
  async assign(id: string, dto: AssignOfficerWorkDto, user: RequestUser) {
    const officer = await this.officerOrThrow(id, user);
    const farmerIds = dto.farmerIds ?? [];
    const farmIds = dto.farmIds ?? [];
    if (!farmerIds.length && !farmIds.length)
      throw new BadRequestException('Choose at least one farmer or farm');
    const tenantId = this.tenant(user);
    if (tenantId && tenantId !== officer.mamcosId)
      throw new ForbiddenException('Officer belongs to another cooperative');
    const scope = tenantId ? { mamcosId: tenantId } : {};
    const value = dto.unassign ? null : id;

    // When releasing, only touch records currently held by this officer.
    const heldBy = dto.unassign ? { assignedOfficerId: id } : {};
    const farmersDone = farmerIds.length
      ? await this.prisma.farmer.updateMany({
          where: { id: { in: farmerIds }, ...scope, ...heldBy },
          data: { assignedOfficerId: value },
        })
      : { count: 0 };
    // A farmer's farms move with them (only farms that are free or already this officer's).
    if (farmerIds.length)
      await this.prisma.farm.updateMany({
        where: {
          farmerId: { in: farmerIds },
          ...scope,
          assignedOfficerId: dto.unassign ? id : null,
        },
        data: { assignedOfficerId: value },
      });
    const farmsDone = farmIds.length
      ? await this.prisma.farm.updateMany({
          where: { id: { in: farmIds }, ...scope, ...heldBy },
          data: { assignedOfficerId: value },
        })
      : { count: 0 };
    return { farmers: farmersDone.count, farms: farmsDone.count };
  }

  /** Unassigned farmers and farms in the user's scope, for the assignment picker. */
  async unassigned(user: RequestUser) {
    const tenantId = this.tenant(user);
    const scope = tenantId ? { mamcosId: tenantId } : {};
    const [farmers, farms] = await Promise.all([
      this.prisma.farmer.findMany({
        where: { assignedOfficerId: null, ...scope },
        select: {
          id: true,
          controlNumber: true,
          firstName: true,
          lastName: true,
          village: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 300,
      }),
      this.prisma.farm.findMany({
        where: { assignedOfficerId: null, ...scope },
        select: { id: true, farmCode: true, name: true, village: true },
        orderBy: { createdAt: 'desc' },
        take: 300,
      }),
    ]);
    return { farmers, farms };
  }

  /** The officer profile of a signed-in field officer (used to attribute registrations). */
  officerForUser(userId: string) {
    return this.prisma.mamcosStaff.findFirst({
      where: { userId, role: MamcosStaffRole.FIELD_OFFICER },
      select: { id: true },
    });
  }

  static isStaff(user: RequestUser) {
    return user.role !== UserRole.FARMER;
  }
}
