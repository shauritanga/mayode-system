import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import {
  DocumentType,
  MamcosStaffRole,
  FarmerIdType,
  Prisma,
  UserRole,
  VerificationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceService } from '../finance/finance.service';
import { MembershipsService } from '../memberships/memberships.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DocumentsService } from '../uploads/documents.service';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { writeAudit } from '../irrigation/irrigation-audit';
import { deriveRegistrationTier } from './farmer-tier';
import { idTypeFromDocument, normalizeIdentity, type FarmerIdentity } from './farmer-identity';
import { CreateFarmerDto } from './dto/create-farmer.dto';
import { UpdateFarmerDto } from './dto/update-farmer.dto';
import { QueryFarmersDto } from './dto/query-farmers.dto';
import {
  AssignOfficerDto,
  VerifyFarmerDto,
  RejectFarmerDto,
  SuspendFarmerDto,
  RemoveFromMamcosDto,
  UpsertHouseholdDto,
  LinkDocumentDto,
  SubmitIdentityDto,
  RecordLocalVerificationDto,
  RevokeLocalVerificationDto,
} from './dto/farmer-actions.dto';
import {
  CaptureConsentDto,
  CreateQuestionnaireDto,
} from './dto/trust-layer.dto';

@Injectable()
export class FarmersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly finance: FinanceService,
    private readonly notifications: NotificationsService,
    private readonly documents: DocumentsService,
    private readonly ownership: OwnershipService,
    private readonly memberships: MembershipsService,
  ) {}

  // --------------------------------------------------------------------------
  // Creation
  // --------------------------------------------------------------------------

  private async generateControlNumber(): Promise<string> {
    const prefix = this.config.get<string>('CONTROL_NUMBER_PREFIX') || 'MYD';
    const last = await this.prisma.farmer.findFirst({
      where: { controlNumber: { startsWith: prefix } },
      orderBy: { controlNumber: 'desc' },
    });
    if (!last) return `${prefix}-00001`;
    const n = parseInt(last.controlNumber.replace(`${prefix}-`, ''), 10) + 1;
    return `${prefix}-${n.toString().padStart(5, '0')}`;
  }

  /** Provision a login User + Farmer profile (admin / field-officer flow). */
  /**
   * Works out which ID (if any) a request carries and makes sure no other farmer already uses it. NIDA is optional:
   * a voter ID or driver's license works instead. A bare legacy `nationalId` is treated as a NIDA number as given.
   */
  private async resolveIdentity(
    input: { idType?: FarmerIdType; idNumber?: string; nationalId?: string },
    excludeFarmerId?: string,
  ): Promise<FarmerIdentity | null> {
    let identity: FarmerIdentity | null = null;
    if (input.idType) {
      identity = normalizeIdentity(input.idType, input.idNumber ?? '');
    } else if (input.idNumber?.trim()) {
      throw new BadRequestException('Choose the ID type (NIDA, voter ID or driver\'s license) for this number');
    } else if (input.nationalId?.trim()) {
      const legacy = input.nationalId.trim();
      identity = { idType: FarmerIdType.NIDA, idNumber: legacy, nationalId: legacy };
    }
    if (!identity) return null;
    const clash = await this.prisma.farmer.findFirst({
      where: {
        ...(excludeFarmerId ? { id: { not: excludeFarmerId } } : {}),
        OR: [
          { idType: identity.idType, idNumber: identity.idNumber },
          ...(identity.nationalId ? [{ nationalId: identity.nationalId }] : []),
        ],
      },
      select: { id: true },
    });
    if (clash) throw new ConflictException('This ID number is already registered to another farmer');
    return identity;
  }

  private identityData(identity: FarmerIdentity | null) {
    return identity
      ? { idType: identity.idType, idNumber: identity.idNumber, ...(identity.nationalId ? { nationalId: identity.nationalId } : {}) }
      : {};
  }

  async create(dto: CreateFarmerDto & { password: string }, actor?: RequestUser, options: { mustChangePassword?: boolean } = {}) {
    const tenantId = actor ? this.ownership.resolveTenantMamcosId(actor) : null;
    if (tenantId) dto = { ...dto, mamcosId: tenantId };
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ phone: dto.phone }, { email: dto.email || undefined }] },
    });
    if (existing) {
      throw new ConflictException(
        'A user with this phone number or email already exists',
      );
    }

    const identity = await this.resolveIdentity(dto);

    // An AMCOS farmer is registered on the hectare they already hold, and that hectare's code is their ID.
    const hectare = dto.hectareId ? await this.hectareForRegistration(dto.hectareId, tenantId) : null;
    if (dto.guardianId && !hectare) throw new BadRequestException('Choose a hectare before naming a guardian');
    const guardian = dto.guardianId ? await this.guardianForRegistration(dto.guardianId, tenantId) : null;
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const controlNumber = hectare ? hectare.code : await this.generateControlNumber();
    // A farmer registered by a field officer is credited to, and assigned to, that officer.
    const registeringOfficer =
      actor?.role === UserRole.FIELD_OFFICER
        ? await this.prisma.mamcosStaff.findFirst({
            where: { userId: actor.id, role: MamcosStaffRole.FIELD_OFFICER },
            select: { id: true },
          })
        : null;

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          phone: dto.phone,
          email: dto.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: UserRole.FARMER,
          mustChangePassword: options.mustChangePassword ?? false,
        },
      });

      const created = await tx.farmer.create({
        data: {
          userId: user.id,
          controlNumber,
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          gender: dto.gender,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
          ...this.identityData(identity),
          mamcosId: dto.mamcosId,
          village: dto.village,
          ward: dto.ward,
          district: dto.district,
          region: dto.region,
          residenceLatitude: dto.residenceLatitude,
          residenceLongitude: dto.residenceLongitude,
          educationLevel: dto.educationLevel,
          farmingExperienceYears: dto.farmingExperienceYears,
          familySize: dto.familySize,
          dependents: dto.dependents,
          dataShareConsent: dto.dataShareConsent ?? false,
          consentedAt: dto.dataShareConsent ? new Date() : null,
          registeredByOfficerId: registeringOfficer?.id,
          assignedOfficerId: registeringOfficer?.id,
          // The AMCOS's own admin vouches for a farmer they register, so there is nothing left to review.
          ...(tenantId ? { verificationStatus: VerificationStatus.VERIFIED, verifiedAt: new Date() } : {}),
        },
        include: { user: { select: { phone: true, email: true } } },
      });
      if (hectare && actor) {
        const allocation = await tx.irrigationHectareAllocation.create({
          data: { hectareId: hectare.id, farmerId: created.id, status: 'ACTIVE', allocatedOn: new Date(), requestedById: actor.id, approvedById: actor.id, approvedAt: new Date(), notes: 'Registered on this hectare' },
        });
        await writeAudit(tx, actor, 'irrigation_hectare', hectare.id, 'allocate', null, { ...allocation, registeredWithFarmer: true } as any);
        // The hectare is registered in the new farmer's name, but really belongs to the guardian (a relative or other member).
        if (guardian) {
          await tx.irrigationHectareGuardian.create({
            data: { allocationId: allocation.id, guardianId: guardian.id, startedOn: allocation.allocatedOn, note: 'Named when the farmer was registered', createdById: actor.id },
          });
          await writeAudit(tx, actor, 'irrigation_hectare', hectare.id, 'set-guardian', { guardianId: null }, { guardianId: guardian.id, allocationId: allocation.id, registeredWithFarmer: true } as any);
        }
      }
      return created;
    }).catch((error) => {
      if (hectare && error?.code === 'P2002') throw new ConflictException('This hectare was just taken or its ID is already in use');
      throw error;
    });
  }

  /** The guardian named at registration must be an existing member of the same AMCOS who is not blacklisted. */
  private async guardianForRegistration(guardianId: string, tenantId: string | null) {
    const guardian = await this.prisma.farmer.findUnique({ where: { id: guardianId }, select: { id: true, firstName: true, lastName: true, mamcosId: true, isBlacklisted: true } });
    if (!guardian) throw new NotFoundException('Guardian not found');
    if (tenantId && guardian.mamcosId !== tenantId) throw new BadRequestException(`${guardian.firstName} ${guardian.lastName} is not a member of your AMCOS`);
    if (guardian.isBlacklisted) throw new BadRequestException(`${guardian.firstName} ${guardian.lastName} is blacklisted and cannot be a guardian`);
    return guardian;
  }

  /** The free hectare of the caller's AMCOS that a new farmer is being registered on. */
  private async hectareForRegistration(hectareId: string, tenantId: string | null) {
    if (!tenantId) throw new BadRequestException('A hectare can only be chosen when registering a farmer for an AMCOS');
    const hectare = await this.prisma.irrigationHectare.findFirst({
      where: { id: hectareId, block: { canal: { scheme: { mamcosId: tenantId } } } },
      select: { id: true, code: true, isActive: true, allocations: { where: { status: { in: ['ACTIVE', 'PENDING_APPROVAL'] } }, select: { id: true }, take: 1 } },
    });
    if (!hectare) throw new NotFoundException('That hectare was not found in your AMCOS');
    if (!hectare.isActive) throw new BadRequestException('That hectare is not in use');
    if (hectare.allocations.length) throw new ConflictException('That hectare already belongs to a farmer');
    if (await this.prisma.farmer.findUnique({ where: { controlNumber: hectare.code }, select: { id: true } })) {
      throw new ConflictException(`A farmer with the ID ${hectare.code} already exists`);
    }
    return hectare;
  }

  // --------------------------------------------------------------------------
  // Reads
  // --------------------------------------------------------------------------

  async findAll(query: QueryFarmersDto, user?: RequestUser) {
    const {
      search,
      region,
      district,
      ward,
      village,
      mamcosId,
      verificationStatus,
    } = query;
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? query.pageSize : 20;

    // Cooperative staff (any role, legacy or custom) are confined to their
    // own AMCOS regardless of what mamcosId the client asks for; SUPER_ADMIN
    // /ADMIN (and roles with no cooperative attached) stay unscoped and keep
    // using the client-supplied filter as before.
    const tenantId = user ? this.ownership.resolveTenantMamcosId(user) : null;
    const scopedMamcosId = tenantId ?? mamcosId;

    const where: Prisma.FarmerWhereInput = {
      ...(region ? { region } : {}),
      ...(district ? { district } : {}),
      ...(ward ? { ward } : {}),
      ...(village ? { village } : {}),
      ...(scopedMamcosId ? { mamcosId: scopedMamcosId } : {}),
      ...(verificationStatus ? { verificationStatus } : {}),
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { controlNumber: { contains: search, mode: 'insensitive' } },
              { idNumber: { contains: search.trim(), mode: 'insensitive' } },
              { user: { phone: { contains: search } } },
            ],
          }
        : {}),
    };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.farmer.count({ where }),
      this.prisma.farmer.findMany({
        where,
        include: {
          user: { select: { phone: true, email: true, isActive: true } },
          mamcos: { select: { name: true } },
          farms: { select: { socialHectares: true } },
          _count: { select: { farms: true, cropCycles: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      data: data.map(({ farms, ...farmer }) => ({
        ...farmer,
        farmSizeHa: farms.reduce((sum, f) => sum + (f.socialHectares ?? 0), 0),
      })),
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * Unpaginated, minimal-field farmer list for admin dashboard aggregation
   * (gender/age/district/officer-attribution charts). `findAll()` above is
   * paginated (max 100/page) for the searchable UI table — dashboards that
   * need every farmer must use this instead, not loop pages against `findAll`.
   */
  findAllUnpaginated(user?: RequestUser) {
    const tenantId = user ? this.ownership.resolveTenantMamcosId(user) : null;
    return this.prisma.farmer.findMany({
      where: tenantId ? { mamcosId: tenantId } : {},
      select: {
        id: true,
        gender: true,
        dateOfBirth: true,
        district: true,
        region: true,
        verificationStatus: true,
        verifiedById: true,
        assignedOfficerId: true,
        mamcosId: true,
      },
    });
  }

  async findOne(id: string, user?: RequestUser) {
    // A farmer sees only their own record; staff are limited by cooperative below.
    if (user?.role === UserRole.FARMER) await this.ownership.assertFarmerAccess(user, id);
    const farmer = await this.prisma.farmer.findUnique({
      where: { id },
      include: {
        user: {
          select: { phone: true, email: true, isActive: true, language: true },
        },
        mamcos: true,
        household: true,
        documents: { orderBy: { createdAt: 'desc' } },
        verifications: {
          include: {
            fieldOfficer: {
              select: { employeeCode: true, firstName: true, lastName: true },
            },
          },
          orderBy: { verifiedAt: 'desc' },
        },
        farms: {
          include: { _count: { select: { plots: true, cropCycles: true } } },
        },
        loanRecords: true,
      },
    });
    if (!farmer) throw new NotFoundException(`Farmer with ID ${id} not found`);
    // A scoped cooperative user reaching for another AMCOS's farmer gets the
    // same 404 as a nonexistent id — no leak of cross-tenant existence.
    const tenantId = user ? this.ownership.resolveTenantMamcosId(user) : null;
    if (tenantId && farmer.mamcosId !== tenantId) {
      throw new NotFoundException(`Farmer with ID ${id} not found`);
    }
    return { ...farmer, ...(await this.registrationInfo(farmer)) };
  }

  /** Tier, the identifier in use, and the (un-revoked) local verifications for one farmer. */
  private async registrationInfo(farmer: { id: string; idType: FarmerIdType | null }) {
    const [heldThroughGuardian, localVerifications] = await Promise.all([
      this.prisma.irrigationHectareGuardian.count({
        where: { endedOn: null, allocation: { farmerId: farmer.id, status: 'ACTIVE' } },
      }),
      this.prisma.farmerLocalVerification.findMany({
        where: { farmerId: farmer.id },
        orderBy: { createdAt: 'desc' },
        include: { guarantor: { select: { id: true, firstName: true, lastName: true, controlNumber: true } } },
      }),
    ]);
    const { tier, identifierUsed } = deriveRegistrationTier({
      idType: farmer.idType,
      heldThroughGuardian: heldThroughGuardian > 0,
      hasLocalVerification: localVerifications.some((v) => !v.revokedAt),
    });
    return { registrationTier: tier, identifierUsed, localVerifications };
  }

  /**
   * Tier 3: record how a farmer with no national ID was vouched for locally. A chairman guarantor must be a current
   * Block or Canal Chairman of the farmer's own AMCOS.
   */
  async recordLocalVerification(farmerId: string, dto: RecordLocalVerificationDto, user: RequestUser) {
    await this.ownership.assertFarmerAccess(user, farmerId);
    const farmer = await this.findOne(farmerId, user);
    const reference = dto.reference?.trim() || null;
    const letterDocumentUrl = dto.letterDocumentUrl?.trim() || null;
    let guarantor: { farmerId: string; position: 'BLOCK_LEADER' | 'CANAL_LEADER'; leadershipId: string } | null = null;

    if (dto.method === 'VILLAGE_LETTER' && !letterDocumentUrl)
      throw new BadRequestException('Attach a photo of the village or street government letter');
    if (dto.method === 'LOCAL_VOTER_ID' && !reference) throw new BadRequestException('Enter the local voter ID number');
    if (dto.method === 'GUARANTOR') {
      if (!dto.guarantorFarmerId) throw new BadRequestException('Choose the Block or Canal Chairman who vouches for this farmer');
      if (dto.guarantorFarmerId === farmerId) throw new BadRequestException('A farmer cannot vouch for themselves');
      if (!farmer.mamcosId) throw new BadRequestException('A guarantor can only be used for a farmer who belongs to an AMCOS');
      const now = new Date();
      const lead = await this.prisma.irrigationLeadership.findFirst({
        where: {
          farmerId: dto.guarantorFarmerId, status: 'ACTIVE', OR: [{ termEnd: null }, { termEnd: { gte: now } }],
          canal: { scheme: { mamcosId: farmer.mamcosId } },
        },
        orderBy: { appointedOn: 'desc' },
        select: { id: true, position: true },
      });
      if (!lead) throw new BadRequestException('The guarantor must currently be a Block or Canal Chairman of this AMCOS');
      guarantor = { farmerId: dto.guarantorFarmerId, position: lead.position, leadershipId: lead.id };
    }

    return this.prisma.farmerLocalVerification.create({
      data: {
        farmerId, method: dto.method, reference, letterDocumentUrl, notes: dto.notes?.trim() || null, recordedById: user.id,
        ...(guarantor ? { guarantorFarmerId: guarantor.farmerId, guarantorPosition: guarantor.position, guarantorLeadershipId: guarantor.leadershipId } : {}),
      },
    });
  }

  async revokeLocalVerification(farmerId: string, verificationId: string, dto: RevokeLocalVerificationDto, user: RequestUser) {
    await this.ownership.assertFarmerAccess(user, farmerId);
    await this.findOne(farmerId, user);
    const existing = await this.prisma.farmerLocalVerification.findFirst({ where: { id: verificationId, farmerId } });
    if (!existing) throw new NotFoundException('Verification not found');
    if (existing.revokedAt) throw new ConflictException('This verification was already revoked');
    return this.prisma.farmerLocalVerification.update({
      where: { id: verificationId },
      data: { revokedAt: new Date(), revokedById: user.id, revokedReason: dto.reason.trim() },
    });
  }

  async findMe(userId: string) {
    const farmer = await this.prisma.farmer.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!farmer) {
      throw new NotFoundException('No farmer profile is linked to this user');
    }
    return this.findOne(farmer.id);
  }

  async findByControlNumber(controlNumber: string) {
    const farmer = await this.prisma.farmer.findUnique({
      where: { controlNumber },
      include: {
        user: { select: { phone: true, email: true, isActive: true } },
        mamcos: true,
        farms: true,
      },
    });
    if (!farmer) {
      throw new NotFoundException(
        `Farmer with Control Number ${controlNumber} not found`,
      );
    }
    return farmer;
  }

  // --------------------------------------------------------------------------
  // Update
  // --------------------------------------------------------------------------

  async update(id: string, dto: UpdateFarmerDto, user: RequestUser) {
    await this.ownership.assertFarmerAccess(user, id);
    await this.findOne(id);
    const { dateOfBirth, dataShareConsent, idType, idNumber, nationalId, ...rest } = dto;
    const identity = await this.resolveIdentity({ idType, idNumber, nationalId }, id);
    return this.prisma.farmer.update({
      where: { id },
      data: {
        ...rest,
        ...this.identityData(identity),
        ...(dateOfBirth ? { dateOfBirth: new Date(dateOfBirth) } : {}),
        ...(dataShareConsent !== undefined
          ? {
              dataShareConsent,
              consentedAt: dataShareConsent ? new Date() : null,
            }
          : {}),
      },
      include: { user: { select: { phone: true, email: true } } },
    });
  }

  /**
   * Takes a farmer out of an AMCOS without erasing anything: the open hectare allocation is ended (so the hectare is free
   * again), the farmer is detached from the AMCOS and gets a platform control number (their old one is the hectare code,
   * which the next member of that hectare needs). Blocked while they owe the AMCOS or hold an active loan unless forced.
   */
  async removeFromMamcos(id: string, dto: RemoveFromMamcosDto, user: RequestUser) {
    await this.ownership.assertFarmerAccess(user, id);
    const farmer = await this.findOne(id, user);
    if (!farmer.mamcosId) throw new BadRequestException('This farmer does not belong to an AMCOS');
    const mamcosId = farmer.mamcosId;
    const reason = dto.reason.trim();
    if (!reason) throw new BadRequestException('A reason is required');

    const dues = await this.prisma.farmerDue.findMany({
      where: { mamcosId, farmerId: id, status: 'ACTIVE' },
      include: { payments: { where: { voidedAt: null }, select: { amount: true } } },
    });
    const owed = Math.round(
      dues.reduce((n, d) => n + Number(d.amount) - Number(d.waivedAmount) - d.payments.reduce((m, p) => m + Number(p.amount), 0), 0) * 100,
    ) / 100;
    const activeLoans = farmer.loanRecords.filter((l) => l.isActive && l.amountOwed > 0).length;
    if (!dto.force && (owed > 0 || activeLoans > 0)) {
      const parts = [
        owed > 0 ? `owes the AMCOS ${owed.toLocaleString('en-US')} TZS` : '',
        activeLoans > 0 ? `has ${activeLoans} active loan(s)` : '',
      ].filter(Boolean);
      throw new ConflictException(`This farmer ${parts.join(' and ')}. Settle it first, or remove anyway to keep the record as is.`);
    }

    const newControlNumber = await this.generateControlNumber();
    return this.prisma.$transaction(async (tx) => {
      const today = new Date(new Date().toISOString().slice(0, 10));
      const open = await tx.irrigationHectareAllocation.findMany({
        where: { farmerId: id, status: { in: ['ACTIVE', 'PENDING_APPROVAL'] } },
      });
      for (const a of open) {
        await tx.$executeRaw`SELECT id FROM irrigation_hectares WHERE id = ${a.hectareId} FOR UPDATE`;
        const pending = await tx.irrigationAllocationTransfer.count({ where: { hectareId: a.hectareId, status: { in: ['AWAITING_RECIPIENT', 'PENDING_APPROVAL'] } } });
        if (pending) throw new ConflictException('A transfer is awaiting approval for this farmer\'s hectare. Resolve it first.');
        const endedOn = a.allocatedOn > today ? a.allocatedOn : today;
        if (a.status === 'ACTIVE') {
          await tx.irrigationHectareAllocation.update({
            where: { id: a.id }, data: { status: 'ENDED', endedOn, endReason: `REMOVED FROM AMCOS: ${reason}`, endedById: user.id },
          });
        } else {
          await tx.irrigationHectareAllocation.update({
            where: { id: a.id }, data: { status: 'REJECTED', rejectedReason: `Farmer removed from AMCOS: ${reason}` },
          });
        }
        const guardian = await tx.irrigationHectareGuardian.findFirst({ where: { allocationId: a.id, endedOn: null } });
        if (guardian) {
          await tx.irrigationHectareGuardian.update({
            where: { id: guardian.id },
            data: { endedOn: endedOn < guardian.startedOn ? guardian.startedOn : endedOn, endReason: 'RELEASED', endedById: user.id },
          });
        }
        await writeAudit(tx, user, 'irrigation_hectare', a.hectareId, 'release', { status: a.status, farmerId: id }, { status: 'ENDED', reason: `Removed from AMCOS: ${reason}` });
      }
      // Guardianships this farmer holds over other members' hectares end too.
      await tx.irrigationHectareGuardian.updateMany({
        where: { guardianId: id, endedOn: null },
        data: { endedOn: today, endReason: 'GUARDIAN REMOVED FROM AMCOS', endedById: user.id },
      });
      const updated = await tx.farmer.update({
        where: { id }, data: { mamcosId: null, controlNumber: newControlNumber },
      });
      await writeAudit(
        tx, user, 'farmer', id, 'remove_from_amcos',
        { mamcosId, controlNumber: farmer.controlNumber },
        { mamcosId: null, controlNumber: newControlNumber, reason, forced: !!dto.force, owed, activeLoans },
      );
      return { id: updated.id, controlNumber: updated.controlNumber, releasedHectares: open.length };
    });
  }

  // --------------------------------------------------------------------------
  // Verification workflow
  // --------------------------------------------------------------------------

  private async fieldOfficerFor(userId: string) {
    const officer = await this.prisma.mamcosStaff.findFirst({
      where: { userId, role: MamcosStaffRole.FIELD_OFFICER },
    });
    if (!officer) {
      throw new NotFoundException(
        `Field Officer profile for user ID ${userId} not found`,
      );
    }
    return officer;
  }

  /** Staff assigns a field officer as responsible for a farmer's follow-up (pending-tasks tracking). */
  async assignOfficer(farmerId: string, dto: AssignOfficerDto) {
    await this.findOne(farmerId);
    const officer = await this.prisma.mamcosStaff.findUnique({
      where: { id: dto.officerId },
      select: { id: true, role: true },
    });
    if (!officer) {
      throw new NotFoundException(
        `Field officer with ID ${dto.officerId} not found`,
      );
    }
    if (officer.role !== MamcosStaffRole.FIELD_OFFICER) {
      throw new ConflictException('Assignee must be a field officer');
    }
    // The farmer's farms that have no officer yet follow them.
    await this.prisma.farm.updateMany({
      where: { farmerId, assignedOfficerId: null },
      data: { assignedOfficerId: dto.officerId },
    });
    return this.prisma.farmer.update({
      where: { id: farmerId },
      data: { assignedOfficerId: dto.officerId },
    });
  }

  async verifyFarmer(
    officerUserId: string,
    farmerId: string,
    dto: VerifyFarmerDto,
  ) {
    const officer = await this.fieldOfficerFor(officerUserId);
    const farmer = await this.findOne(farmerId);

    const result = await this.prisma.$transaction(async (tx) => {
      const verification = await tx.farmerVerification.create({
        data: {
          farmerId,
          fieldOfficerId: officer.id,
          status: VerificationStatus.VERIFIED,
          gpsVerified: dto.gpsVerified ?? false,
          documentsReviewed: dto.documentsReviewed ?? false,
          gpsLatitude: dto.gpsLatitude,
          gpsLongitude: dto.gpsLongitude,
          notes: dto.notes,
        },
      });
      await tx.farmer.update({
        where: { id: farmerId },
        data: {
          verificationStatus: VerificationStatus.VERIFIED,
          verifiedById: officer.id,
          verifiedAt: new Date(),
        },
      });
      return verification;
    });

    await this.notifications.create({
      userId: farmer.userId,
      type: 'farmer.verified',
      title: 'Profile verified',
      body: 'Your farmer profile has been verified. You now have full access.',
      data: { farmerId },
    });

    return result;
  }

  async rejectFarmer(
    officerUserId: string,
    farmerId: string,
    dto: RejectFarmerDto,
  ) {
    const officer = await this.fieldOfficerFor(officerUserId);
    const farmer = await this.findOne(farmerId);

    const result = await this.prisma.$transaction(async (tx) => {
      const verification = await tx.farmerVerification.create({
        data: {
          farmerId,
          fieldOfficerId: officer.id,
          status: VerificationStatus.REJECTED,
          rejectionReason: dto.rejectionReason,
          notes: dto.notes,
        },
      });
      await tx.farmer.update({
        where: { id: farmerId },
        data: { verificationStatus: VerificationStatus.REJECTED },
      });
      return verification;
    });

    await this.notifications.create({
      userId: farmer.userId,
      type: 'farmer.rejected',
      title: 'Profile needs attention',
      body: `Your registration was rejected: ${dto.rejectionReason}`,
      data: { farmerId },
    });

    return result;
  }

  async suspendFarmer(
    officerUserId: string,
    farmerId: string,
    dto: SuspendFarmerDto,
  ) {
    const officer = await this.fieldOfficerFor(officerUserId);
    const farmer = await this.findOne(farmerId);

    const result = await this.prisma.$transaction(async (tx) => {
      const verification = await tx.farmerVerification.create({
        data: {
          farmerId,
          fieldOfficerId: officer.id,
          status: VerificationStatus.SUSPENDED,
          rejectionReason: dto.reason,
        },
      });
      await tx.farmer.update({
        where: { id: farmerId },
        data: { verificationStatus: VerificationStatus.SUSPENDED },
      });
      return verification;
    });

    await this.notifications.create({
      userId: farmer.userId,
      type: 'farmer.suspended',
      title: 'Profile suspended',
      body: `Your profile has been suspended: ${dto.reason}`,
      data: { farmerId },
    });

    return result;
  }

  // --------------------------------------------------------------------------
  // Household & documents
  // --------------------------------------------------------------------------

  async upsertHousehold(
    farmerId: string,
    dto: UpsertHouseholdDto,
    user: RequestUser,
  ) {
    await this.ownership.assertFarmerAccess(user, farmerId);
    await this.findOne(farmerId);
    return this.prisma.household.upsert({
      where: { farmerId },
      create: { farmerId, ...dto },
      update: { ...dto },
    });
  }

  async addDocument(farmerId: string, dto: LinkDocumentDto, user: RequestUser) {
    await this.ownership.assertFarmerAccess(user, farmerId);
    return this.documents.createForFarmer(farmerId, {
      ...dto,
      uploadedById: user.id,
    });
  }

  /**
   * Final-stage identity verification (owner comment §2.1): the farmer submits
   * an ID document, its number, and a recent photo / guided face-capture. We
   * store the evidence, set the national ID and photo, move the profile to
   * PENDING, and queue an officer to review (officer verify/reject is the final
   * approval until automated facial matching is added).
   */
  async submitIdentity(
    farmerId: string,
    dto: SubmitIdentityDto,
    user: RequestUser,
  ) {
    await this.ownership.assertFarmerAccess(user, farmerId);
    const farmer = await this.findOne(farmerId);
    const identity = await this.resolveIdentity(
      { idType: idTypeFromDocument(dto.idType), idNumber: dto.idNumber },
      farmerId,
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.document.createMany({
        data: [
          {
            farmerId,
            type: dto.idType,
            fileUrl: dto.idDocumentUrl,
            fileName: `${dto.idType}-${identity!.idNumber}`,
            uploadedById: user.id,
          },
          {
            farmerId,
            type: DocumentType.FACE_CAPTURE,
            fileUrl: dto.faceCaptureUrl,
            fileName: 'face-capture',
            uploadedById: user.id,
          },
          ...(dto.profilePhotoUrl
            ? [
                {
                  farmerId,
                  type: DocumentType.PROFILE_PHOTO,
                  fileUrl: dto.profilePhotoUrl,
                  fileName: 'profile-photo',
                  uploadedById: user.id,
                },
              ]
            : []),
        ],
      });

      return tx.farmer.update({
        where: { id: farmerId },
        data: {
          ...this.identityData(identity),
          photoUrl: dto.profilePhotoUrl ?? dto.faceCaptureUrl,
          // Re-submitting resets a prior rejection back to review.
          verificationStatus: VerificationStatus.PENDING,
        },
        select: { id: true, verificationStatus: true, nationalId: true, idType: true, idNumber: true },
      });
    });

    // Queue officers/admins to review the submission.
    await this.notifications.createForRoles(
      [UserRole.FIELD_OFFICER, UserRole.ADMIN, UserRole.SUPER_ADMIN],
      {
        type: 'identity.submitted',
        title: 'Identity verification submitted',
        body: `${farmer.firstName} ${farmer.lastName} (${farmer.controlNumber}) submitted identity documents for review.`,
        data: { farmerId },
      },
    );

    return updated;
  }

  async listDocuments(farmerId: string, user?: RequestUser) {
    await this.findOne(farmerId, user);
    return this.documents.listForFarmer(farmerId);
  }

  async removeDocument(documentId: string, user?: RequestUser) {
    // A farmer may only delete documents attached to their own profile or their own farms.
    if (user?.role === UserRole.FARMER) {
      const doc = await this.prisma.document.findUnique({
        where: { id: documentId },
        select: { farmerId: true, farmId: true },
      });
      if (!doc) throw new NotFoundException(`Document with ID ${documentId} not found`);
      if (doc.farmerId) await this.ownership.assertFarmerAccess(user, doc.farmerId);
      else if (doc.farmId) await this.ownership.assertFarmAccess(user, doc.farmId);
      else throw new ForbiddenException('You can only delete your own documents');
    }
    return this.documents.remove(documentId);
  }

  // --------------------------------------------------------------------------
  // Analytics: production, financial, credit-readiness
  // --------------------------------------------------------------------------

  async getProductionSummary(farmerId: string, user: RequestUser) {
    await this.ownership.assertFarmerAccess(user, farmerId);
    const farmer = await this.prisma.farmer.findUnique({
      where: { id: farmerId },
      include: {
        cropCycles: {
          include: { farm: { select: { farmCode: true } }, costs: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!farmer)
      throw new NotFoundException(`Farmer with ID ${farmerId} not found`);

    const cycles = farmer.cropCycles;
    const harvested = cycles.filter((c) => (c.actualYieldKg ?? 0) > 0);
    const totalActualYieldKg = harvested.reduce(
      (s, c) => s + (c.actualYieldKg ?? 0),
      0,
    );
    const totalEstimatedYieldKg = cycles.reduce(
      (s, c) => s + (c.estimatedYieldKg ?? 0),
      0,
    );
    const avgYieldKg = harvested.length
      ? totalActualYieldKg / harvested.length
      : 0;

    return {
      farmerId,
      controlNumber: farmer.controlNumber,
      totalCropCycles: cycles.length,
      harvestedCycles: harvested.length,
      totalActualYieldKg,
      totalCostsTzs: cycles.reduce((sum, cycle) => sum + cycle.costs.reduce((total, cost) => total + cost.totalCost, 0), 0),
      totalEstimatedYieldKg,
      avgYieldKgPerCycle: Math.round(avgYieldKg),
      yieldAccuracy:
        totalEstimatedYieldKg > 0
          ? Number((totalActualYieldKg / totalEstimatedYieldKg).toFixed(2))
          : null,
      cycles: cycles.map((c) => ({
        id: c.id,
        season: c.season,
        riceVariety: c.riceVariety,
        farmCode: c.farm?.farmCode,
        status: c.status,
        estimatedYieldKg: c.estimatedYieldKg,
        actualYieldKg: c.actualYieldKg,
        harvestDate: c.harvestDate,
        totalCostsTzs: c.costs.reduce((sum, cost) => sum + cost.totalCost, 0),
      })),
    };
  }

  async getFinancialSummary(farmerId: string, user: RequestUser) {
    // Premium gate: financial analytics require an active membership (staff bypass).
    if (!(await this.memberships.hasPremiumAccess(user))) {
      return {
        locked: true,
        code: 'MEMBERSHIP_REQUIRED',
        farmerId,
        message:
          'Activate your MAYOData membership to view the full financial analysis.',
      };
    }
    return this.finance.getFarmerFinancialSummary(farmerId, user);
  }

  async captureConsent(
    farmerId: string,
    dto: CaptureConsentDto,
    user: RequestUser,
  ) {
    await this.ownership.assertFarmerAccess(user, farmerId);
    const farmer = await this.prisma.farmer.findUnique({
      where: { id: farmerId },
      select: { id: true },
    });
    if (!farmer)
      throw new NotFoundException(`Farmer with ID ${farmerId} not found`);

    const granted = dto.granted ?? true;
    const capturedAt = dto.capturedAt ? new Date(dto.capturedAt) : new Date();
    const consent = await this.prisma.consentRecord.create({
      data: {
        farmerId,
        scope: dto.scope,
        granted,
        formVersion: dto.formVersion ?? 'MAYODATA_CONSENT_2026_07',
        language: dto.language ?? 'sw',
        explanationReadByUserId: user.id,
        signatureUrl: dto.signatureUrl,
        thumbprintUrl: dto.thumbprintUrl,
        witnessName: dto.witnessName,
        notes: dto.notes,
        capturedAt,
        revokedAt: granted ? undefined : capturedAt,
      },
    });

    const financialScopes = new Set([
      'FINANCIAL_PROVIDERS',
      'FINANCIAL_PROVIDER',
      'FINANCIAL_DATA_SHARING',
      'CREDIT_PROFILE',
    ]);
    if (financialScopes.has(dto.scope)) {
      await this.prisma.farmer.update({
        where: { id: farmerId },
        data: {
          dataShareConsent: granted,
          consentedAt: granted ? capturedAt : null,
        },
      });
    }

    return consent;
  }

  async listConsents(farmerId: string, user: RequestUser) {
    await this.ownership.assertFarmerAccess(user, farmerId);
    return this.prisma.consentRecord.findMany({
      where: { farmerId },
      orderBy: { capturedAt: 'desc' },
    });
  }

  async createQuestionnaire(
    farmerId: string,
    dto: CreateQuestionnaireDto,
    user: RequestUser,
  ) {
    await this.ownership.assertFarmerAccess(user, farmerId);
    const farmer = await this.prisma.farmer.findUnique({
      where: { id: farmerId },
      select: { id: true },
    });
    if (!farmer)
      throw new NotFoundException(`Farmer with ID ${farmerId} not found`);
    if (dto.farmId) {
      const farm = await this.prisma.farm.findUnique({
        where: { id: dto.farmId },
        select: { id: true },
      });
      if (!farm)
        throw new NotFoundException(`Farm with ID ${dto.farmId} not found`);
    }

    return this.prisma.farmerQuestionnaire.create({
      data: {
        farmerId,
        farmId: dto.farmId,
        fieldOfficerUserId: user.id,
        formVersion: dto.formVersion ?? 'MAYODATA_FIELD_QUESTIONNAIRE_2026_07',
        language: dto.language ?? 'sw',
        officialUse: (dto.officialUse ?? {}) as Prisma.InputJsonValue,
        farmerSnapshot: (dto.farmerSnapshot ?? {}) as Prisma.InputJsonValue,
        farmRegistration: (dto.farmRegistration ?? {}) as Prisma.InputJsonValue,
        plantingInputs: (dto.plantingInputs ?? {}) as Prisma.InputJsonValue,
        midSeasonCosts: (dto.midSeasonCosts ?? {}) as Prisma.InputJsonValue,
        harvestSales: (dto.harvestSales ?? {}) as Prisma.InputJsonValue,
        consentAcknowledged: dto.consentAcknowledged ?? false,
        signatureUrl: dto.signatureUrl,
        photoUrls: dto.photoUrls ?? [],
        gpsLatitude: dto.gpsLatitude,
        gpsLongitude: dto.gpsLongitude,
        capturedAt: dto.capturedAt ? new Date(dto.capturedAt) : new Date(),
      },
      include: { farm: { select: { id: true, farmCode: true, name: true } } },
    });
  }

  async listQuestionnaires(farmerId: string, user: RequestUser) {
    await this.ownership.assertFarmerAccess(user, farmerId);
    return this.prisma.farmerQuestionnaire.findMany({
      where: { farmerId },
      include: { farm: { select: { id: true, farmCode: true, name: true } } },
      orderBy: { capturedAt: 'desc' },
    });
  }

  async getMyStatement(user: RequestUser) {
    const farmer = await this.prisma.farmer.findUnique({
      where: { userId: user.id },
      select: { id: true, mamcosId: true, controlNumber: true, firstName: true, lastName: true },
    });
    if (!farmer) throw new NotFoundException('No farmer profile is linked to this account');
    const [cycles, payments, loans, contributions] = await Promise.all([
      this.prisma.cropCycle.findMany({
        where: { farmerId: farmer.id },
        include: { costs: true, revenues: true, farm: { select: { farmCode: true, socialHectares: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.payment.findMany({ where: { farmerId: farmer.id }, orderBy: { createdAt: 'desc' } }),
      this.prisma.loanRecord.findMany({ where: { farmerId: farmer.id }, include: { deductions: true }, orderBy: { createdAt: 'desc' } }),
      this.prisma.saleApportionment.findMany({
        where: { farmerId: farmer.id },
        include: { sale: { select: { invoiceNumber: true, saleDate: true, paymentReceived: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const production = cycles.map((cycle) => {
      const totalCosts = cycle.costs.reduce((sum, row) => sum + row.totalCost, 0);
      const salesRevenue = cycle.revenues.reduce((sum, row) => sum + row.totalRevenue, 0);
      const premium = cycle.revenues.reduce((sum, row) => sum + (row.fairtradePremium ?? 0), 0);
      const totalRevenue = salesRevenue + premium;
      const netProfit = totalRevenue - totalCosts;
      return { id: cycle.id, farmId: cycle.farmId, farmCode: cycle.farm.farmCode, season: cycle.season,
        riceVariety: cycle.riceVariety, status: cycle.status, plantingDate: cycle.plantingDate,
        harvestDate: cycle.harvestDate, actualYieldKg: cycle.actualYieldKg, totalCosts, salesRevenue,
        premium, totalRevenue, netProfit, profitMargin: totalRevenue > 0 ? netProfit / totalRevenue * 100 : null,
        profitPerHectare: cycle.farm.socialHectares > 0 ? netProfit / cycle.farm.socialHectares : null };
    });
    const ricePayments = payments.filter((row) => row.paymentType === 'RICE_PURCHASE');
    return {
      farmer,
      production: { cycles: production, totalYieldKg: production.reduce((sum, row) => sum + (row.actualYieldKg ?? 0), 0), harvestedCycles: production.filter((row) => (row.actualYieldKg ?? 0) > 0).length },
      finance: {
        totalCosts: production.reduce((sum, row) => sum + row.totalCosts, 0),
        totalRevenue: production.reduce((sum, row) => sum + row.totalRevenue, 0),
        netProfit: production.reduce((sum, row) => sum + row.netProfit, 0),
        totalLoanOutstanding: loans.reduce((sum, row) => sum + row.amountOwed, 0),
        activeLoanCount: loans.filter((row) => row.isActive).length,
        outstandingPayments: ricePayments.filter((row) => ['PENDING', 'FAILED'].includes(row.status)).reduce((sum, row) => sum + (row.netAmount ?? row.amount), 0),
        paidAmount: ricePayments.filter((row) => ['CLEARED', 'RELEASED'].includes(row.status)).reduce((sum, row) => sum + (row.netAmount ?? row.amount), 0),
        premiumContribution: contributions.reduce((sum, row) => sum + row.fairtradePremium, 0),
      },
      recentPayments: payments, loans, contributions,
    };
  }

  async getFormalFinancialProfile(farmerId: string, user: RequestUser) {
    if (user.role !== UserRole.FINANCIAL_PROVIDER) {
      await this.ownership.assertFarmerAccess(user, farmerId);
    }
    const farmer = await this.prisma.farmer.findUnique({
      where: { id: farmerId },
      include: {
        user: { select: { phone: true, email: true } },
        mamcos: { select: { id: true, name: true } },
        consentRecords: {
          orderBy: { capturedAt: 'desc' },
          take: 10,
        },
        farms: {
          select: {
            id: true,
            farmCode: true,
            name: true,
            socialHectares: true,
            actualAcres: true,
            isVerified: true,
          },
        },
        cropCycles: {
          include: {
            costs: true,
            revenues: true,
            farm: { select: { farmCode: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        loanRecords: { include: { deductions: true } },
        payments: { orderBy: { createdAt: 'desc' }, take: 20 },
        memberships: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });
    if (!farmer)
      throw new NotFoundException(`Farmer with ID ${farmerId} not found`);
    if (user.role === UserRole.FINANCIAL_PROVIDER && !farmer.dataShareConsent) {
      throw new ForbiddenException(
        'This farmer has not consented to financial-provider data sharing',
      );
    }

    const totalCosts = farmer.cropCycles.reduce(
      (sum, cycle) => sum + cycle.costs.reduce((s, c) => s + c.totalCost, 0),
      0,
    );
    const totalRevenue = farmer.cropCycles.reduce(
      (sum, cycle) =>
        sum +
        cycle.revenues.reduce(
          (s, r) => s + r.totalRevenue + (r.fairtradePremium ?? 0),
          0,
        ),
      0,
    );
    const harvestedCycles = farmer.cropCycles.filter(
      (cycle) => (cycle.actualYieldKg ?? 0) > 0,
    );
    const totalLoanOriginal = farmer.loanRecords.reduce(
      (sum, loan) => sum + loan.originalAmount,
      0,
    );
    const totalLoanOutstanding = farmer.loanRecords.reduce(
      (sum, loan) => sum + loan.amountOwed,
      0,
    );
    const activeLoanCount = farmer.loanRecords.filter(
      (loan) => loan.isActive,
    ).length;

    const readiness = await this.getCreditReadiness(farmerId, user);
    const latestFinancialConsent = farmer.consentRecords.find((record) =>
      [
        'FINANCIAL_PROVIDERS',
        'FINANCIAL_PROVIDER',
        'FINANCIAL_DATA_SHARING',
        'CREDIT_PROFILE',
      ].includes(record.scope),
    );

    return {
      farmer: {
        id: farmer.id,
        controlNumber: farmer.controlNumber,
        name: `${farmer.firstName} ${farmer.lastName}`,
        phone: farmer.user.phone,
        email: farmer.user.email,
        village: farmer.village,
        ward: farmer.ward,
        district: farmer.district,
        region: farmer.region,
        cooperative: farmer.mamcos,
        verificationStatus: farmer.verificationStatus,
        farmingExperienceYears: farmer.farmingExperienceYears,
      },
      consent: {
        financialProviderSharing: farmer.dataShareConsent,
        consentedAt: farmer.consentedAt,
        latestRecord: latestFinancialConsent ?? null,
      },
      credit: readiness,
      production: {
        totalCropCycles: farmer.cropCycles.length,
        harvestedCycles: harvestedCycles.length,
        totalYieldKg: harvestedCycles.reduce(
          (sum, cycle) => sum + (cycle.actualYieldKg ?? 0),
          0,
        ),
        cycles: farmer.cropCycles.map((cycle) => ({
          id: cycle.id,
          season: cycle.season,
          farmCode: cycle.farm.farmCode,
          status: cycle.status,
          riceVariety: cycle.riceVariety,
          actualYieldKg: cycle.actualYieldKg,
          estimatedYieldKg: cycle.estimatedYieldKg,
          harvestDate: cycle.harvestDate,
        })),
      },
      finance: {
        totalCosts,
        totalRevenue,
        netProfit: totalRevenue - totalCosts,
        activeLoanCount,
        totalLoanOriginal,
        totalLoanOutstanding,
        repaymentRatio: totalLoanOriginal
          ? Number(
              (
                (totalLoanOriginal - totalLoanOutstanding) /
                totalLoanOriginal
              ).toFixed(2),
            )
          : null,
      },
      farms: farmer.farms,
      recentPayments: farmer.payments.map((payment) => ({
        id: payment.id,
        amount: payment.amount,
        netAmount: payment.netAmount,
        loanDeduction: payment.loanDeduction,
        status: payment.status,
        paidAt: payment.paidAt,
        createdAt: payment.createdAt,
        description: payment.description,
      })),
      conditions: {
        canShareWithFinancialProvider:
          farmer.dataShareConsent && !farmer.isBlacklisted,
        hasVerifiedIdentity:
          farmer.verificationStatus === VerificationStatus.VERIFIED,
        hasProductionHistory: harvestedCycles.length > 0,
        hasPositiveNetFarmIncome: totalRevenue - totalCosts > 0,
        isBlacklisted: farmer.isBlacklisted,
      },
    };
  }

  /**
   * Compute a real credit-readiness score (0-100) from verification, production,
   * profitability, loan repayment, cooperative membership, experience, farm size and
   * insurance status. The resulting score is persisted onto Farmer.creditScore.
   */
  async getCreditReadiness(farmerId: string, user: RequestUser) {
    if (user.role !== UserRole.FINANCIAL_PROVIDER) {
      await this.ownership.assertFarmerAccess(user, farmerId);
    }
    const farmer = await this.prisma.farmer.findUnique({
      where: { id: farmerId },
      include: {
        cropCycles: { include: { costs: true, revenues: true } },
        loanRecords: true,
        farms: { select: { socialHectares: true } },
        insurancePolicies: { select: { status: true } },
      },
    });
    if (!farmer)
      throw new NotFoundException(`Farmer with ID ${farmerId} not found`);
    if (user.role === UserRole.FINANCIAL_PROVIDER && !farmer.dataShareConsent) {
      throw new ForbiddenException(
        'This farmer has not consented to sharing credit-readiness data',
      );
    }

    // 1. Verification (max 20)
    const verificationScore =
      farmer.verificationStatus === VerificationStatus.VERIFIED ? 20 : 0;

    // 2. Production history (max 15) — reward harvested cycles
    const harvestedCycles = farmer.cropCycles.filter(
      (c) => (c.actualYieldKg ?? 0) > 0,
    ).length;
    const productionScore = Math.min(15, harvestedCycles * 5);

    // 3. Profitability (max 20)
    let overallCosts = 0;
    let overallRevenues = 0;
    let overallPremium = 0;
    for (const cycle of farmer.cropCycles) {
      overallCosts += cycle.costs.reduce((s, c) => s + c.totalCost, 0);
      overallRevenues += cycle.revenues.reduce((s, r) => s + r.totalRevenue, 0);
      overallPremium += cycle.revenues.reduce(
        (s, r) => s + (r.fairtradePremium || 0),
        0,
      );
    }
    const netProfit = overallRevenues + overallPremium - overallCosts;
    let profitabilityScore = 0;
    if (farmer.cropCycles.length > 0) {
      profitabilityScore = netProfit > 0 ? 15 : 4;
    }

    // 4. Loan repayment history (max 15)
    let loanScore = 9; // neutral: no debt, but no track record
    if (farmer.loanRecords.length > 0) {
      const ratios = farmer.loanRecords.map((l) => {
        if (!l.originalAmount || l.originalAmount <= 0) return 1;
        const repaid = 1 - l.amountOwed / l.originalAmount;
        return Math.max(0, Math.min(1, repaid));
      });
      const avgRepaid = ratios.reduce((s, r) => s + r, 0) / ratios.length;
      loanScore = Math.round(15 * avgRepaid);
    }

    // 5. Cooperative membership (max 10)
    const cooperativeScore = farmer.mamcosId ? 10 : 0;

    // 6. Experience (max 5)
    const years = farmer.farmingExperienceYears ?? 0;
    const experienceScore = years >= 5 ? 5 : years >= 2 ? 3 : 0;

    // 7. Farm size (max 10) — total registered hectares across this farmer's farms
    const totalHectares = farmer.farms.reduce(
      (sum, farm) => sum + (farm.socialHectares ?? 0),
      0,
    );
    const farmSizeScore =
      totalHectares >= 2
        ? 10
        : totalHectares >= 1
          ? 6
          : totalHectares > 0
            ? 3
            : 0;

    // 8. Insurance status (max 10) — an active policy demonstrates managed production risk
    const hasActiveInsurance = farmer.insurancePolicies.some(
      (policy) => policy.status === 'ACTIVE',
    );
    const insuranceScore = hasActiveInsurance ? 10 : 0;

    let score =
      verificationScore +
      productionScore +
      profitabilityScore +
      loanScore +
      cooperativeScore +
      experienceScore +
      farmSizeScore +
      insuranceScore;
    if (farmer.isBlacklisted) score = Math.min(score, 20);

    const creditReady =
      !farmer.isBlacklisted &&
      farmer.verificationStatus === VerificationStatus.VERIFIED &&
      score >= 60;

    // Persist the computed score.
    await this.prisma.farmer.update({
      where: { id: farmerId },
      data: { creditScore: score },
    });

    return {
      farmerId,
      controlNumber: farmer.controlNumber,
      creditScore: score,
      creditReady,
      isBlacklisted: farmer.isBlacklisted,
      blacklistReason: farmer.blacklistReason,
      factors: {
        verification: {
          score: verificationScore,
          max: 20,
          status: farmer.verificationStatus,
        },
        production: { score: productionScore, max: 15, harvestedCycles },
        profitability: { score: profitabilityScore, max: 15, netProfit },
        loanRepayment: {
          score: loanScore,
          max: 15,
          activeLoans: farmer.loanRecords.length,
        },
        cooperativeMembership: {
          score: cooperativeScore,
          max: 10,
          isMember: !!farmer.mamcosId,
        },
        experience: { score: experienceScore, max: 5, years },
        farmSize: { score: farmSizeScore, max: 10, totalHectares },
        insurance: {
          score: insuranceScore,
          max: 10,
          hasActiveInsurance,
        },
      },
    };
  }

  /** Lightweight read of the stored credit score + blacklist status. */
  async getCreditScore(id: string, user?: RequestUser) {
    if (user?.role === UserRole.FARMER) await this.ownership.assertFarmerAccess(user, id);
    const farmer = await this.prisma.farmer.findUnique({
      where: { id },
      select: {
        id: true,
        controlNumber: true,
        creditScore: true,
        isBlacklisted: true,
        blacklistReason: true,
      },
    });
    if (!farmer) throw new NotFoundException(`Farmer with ID ${id} not found`);
    return farmer;
  }

  // --------------------------------------------------------------------------
  // Dashboard aggregates
  // --------------------------------------------------------------------------

  async getOverview(user?: RequestUser) {
    // A cooperative sees its own farmers' figures only; platform accounts see everything.
    const tenantId = user ? this.ownership.resolveTenantMamcosId(user) : null;
    const where: Prisma.FarmerWhereInput = tenantId ? { mamcosId: tenantId } : {};
    const [total, byStatus, byRegion] = await Promise.all([
      this.prisma.farmer.count({ where }),
      this.prisma.farmer.groupBy({ by: ['verificationStatus'], where, _count: true }),
      this.prisma.farmer.groupBy({ by: ['region'], where, _count: true }),
    ]);

    return {
      total,
      byVerificationStatus: byStatus.map((s) => ({
        status: s.verificationStatus,
        count: s._count,
      })),
      byRegion: byRegion.map((r) => ({
        region: r.region ?? 'Unknown',
        count: r._count,
      })),
    };
  }
}
