import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { AuthService } from '../auth/auth.service';
import { SmsService } from '../messaging/sms.service';
import { assertWithinCeiling, grantsOfRole, type DelegatingActor } from '../auth/delegation';
import { isLegacyFarmerRole, NOT_LEGACY_FARMER_ROLE, STAFF_ACCOUNT } from '../auth/farmer-role';
import { createRoleTemplates, FIELD_OFFICER_ROLE } from '../roles/role-templates';
import { LEADER_ROLE_NAMES } from '../irrigation/irrigation-roles';
import { generateTemporaryPassword, redactPassword, staffAccessSms, welcomeSms } from '../field-officers/officer-credentials';
import { CreateStaffDto } from './dto/staff.dto';

export type StaffKind = 'ADMIN' | 'SECRETARY' | 'FIELD_OFFICER' | 'CANAL_LEADER' | 'BLOCK_LEADER' | 'STAFF';

const today = () => new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');

/** The cooperative's people: administrators, secretary, field officers, canal/block leaders and other role-based staff. */
@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly auth: AuthService,
    private readonly sms: SmsService,
    private readonly config: ConfigService,
  ) {}

  private tenant(actor: RequestUser, requested?: string): string {
    const own = this.ownership.resolveTenantMamcosId(actor);
    const id = own ?? requested ?? null;
    if (!id) throw new BadRequestException('Choose a cooperative');
    if (own && requested && requested !== own) throw new ForbiddenException('You can only manage staff in your own cooperative');
    return id;
  }

  async list(actor: RequestUser, q: { mamcosId?: string; q?: string; kind?: string; status?: string }) {
    const mamcosId = this.tenant(actor, q.mamcosId);
    const users = await this.prisma.user.findMany({
      where: {
        AND: [STAFF_ACCOUNT],
        OR: [{ mamcosId }, { mamcosStaff: { mamcosId } }],
      },
      include: {
        customRole: { select: { id: true, name: true } },
        mamcosStaff: { select: { role: true, employeeCode: true, assignedArea: true } },
        farmer: {
          select: {
            controlNumber: true, firstName: true, lastName: true,
            irrigationLeaderships: {
              where: { status: 'ACTIVE' },
              select: { position: true, termEnd: true, canal: { select: { code: true } }, block: { select: { code: true } } },
            },
          },
        },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    const now = today();
    const rows = users.map((u) => {
      const offices = (u.farmer?.irrigationLeaderships ?? []).map((l) => ({
        position: l.position,
        place: l.block?.code ?? l.canal.code,
        termEnd: l.termEnd,
        lapsed: !!l.termEnd && l.termEnd < now,
      }));
      const live = offices.filter((o) => !o.lapsed);
      const kind: StaffKind = live.some((o) => o.position === 'CANAL_LEADER') ? 'CANAL_LEADER'
        : live.some((o) => o.position === 'BLOCK_LEADER') ? 'BLOCK_LEADER'
        : u.mamcosStaff?.role === 'SECRETARY' ? 'SECRETARY'
        : u.mamcosStaff?.role === 'FIELD_OFFICER' ? 'FIELD_OFFICER'
        : /admin/i.test(u.customRole?.name ?? '') ? 'ADMIN'
        : 'STAFF';
      const assignment = offices.length
        ? offices.map((o) => `${o.position === 'CANAL_LEADER' ? 'Canal' : 'Block'} ${o.place}${o.lapsed ? ' (term expired)' : ''}`)
        : u.mamcosStaff?.assignedArea ? [u.mamcosStaff.assignedArea] : [];
      return {
        id: u.id,
        // A member upgraded to leader keeps their name on the member record, not on the login.
        name: `${u.firstName ?? u.farmer?.firstName ?? ''} ${u.lastName ?? u.farmer?.lastName ?? ''}`.trim() || u.phone,
        phone: u.phone,
        email: u.email,
        kind,
        roleName: u.customRole?.name ?? null,
        employeeCode: u.mamcosStaff?.employeeCode ?? null,
        memberNumber: u.farmer?.controlNumber ?? null,
        assignment,
        isActive: u.isActive,
        mustChangePassword: u.mustChangePassword,
        lastLoginAt: u.lastLoginAt,
        createdAt: u.createdAt,
        alsoFarmer: u.role === UserRole.FARMER,
        isYou: u.id === actor.id,
      };
    });
    const text = (q.q ?? '').trim().toLowerCase();
    const filtered = rows.filter((r) =>
      (!q.kind || r.kind === q.kind) &&
      (!q.status || (q.status === 'ACTIVE' ? r.isActive : !r.isActive)) &&
      (!text || [r.name, r.phone, r.email, r.employeeCode, r.memberNumber, r.roleName, ...r.assignment].some((v) => v?.toLowerCase().includes(text))));
    const count = (k: StaffKind) => rows.filter((r) => r.kind === k).length;
    return {
      data: filtered,
      summary: {
        total: rows.length, active: rows.filter((r) => r.isActive).length,
        fieldOfficers: count('FIELD_OFFICER'), canalLeaders: count('CANAL_LEADER'), blockLeaders: count('BLOCK_LEADER'),
        neverSignedIn: rows.filter((r) => !r.lastLoginAt).length,
      },
    };
  }

  /** Roles this administrator may give to new staff: the cooperative's own, within their own permissions. Leader roles are automatic. */
  async roleOptions(actor: RequestUser, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const roles = await this.prisma.role.findMany({
      where: { mamcosId, isActive: true, isSystem: false, name: { notIn: LEADER_ROLE_NAMES } },
      include: { permissions: { include: { resource: true } } },
      orderBy: { name: 'asc' },
    });
    return roles
      .filter((r) => !isLegacyFarmerRole(r))
      .filter((r) => {
        try { assertWithinCeiling(actor as never, grantsOfRole(r)); return true; } catch { return false; }
      })
      .map((r) => ({ id: r.id, name: r.name, description: r.description }));
  }

  private async send(phone: string, firstName: string, language: string | null | undefined, password: string, reissued: boolean) {
    const text = welcomeSms({
      firstName, phone, password, language, account: 'staff', reissued,
      portalUrl: this.config.get<string>('PORTAL_URL') || undefined,
      appUrl: this.config.get<string>('MOBILE_APP_URL') || undefined,
    });
    return this.sms.sendTransactional(phone, text, 'staff_credentials', redactPassword(text, password));
  }

  /** Creates the login with a generated temporary password and texts it; if the SMS fails the password is returned once. */
  async create(dto: CreateStaffDto, actor: RequestUser, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    if (dto.farmerId) return this.createFromFarmer(dto, actor, mamcosId);
    if (!dto.firstName || !dto.lastName || !dto.phone) throw new BadRequestException('Enter the name and phone number');
    const fieldOfficer = dto.staffType === 'FIELD_OFFICER';
    let roleId = dto.roleId;
    if (!roleId) {
      if (!fieldOfficer) throw new BadRequestException('Choose a role for this staff member');
      let role = await this.prisma.role.findFirst({ where: { name: FIELD_OFFICER_ROLE, mamcosId }, select: { id: true } });
      if (!role) {
        await this.prisma.$transaction((tx) => createRoleTemplates(tx, mamcosId, [FIELD_OFFICER_ROLE]));
        role = await this.prisma.role.findFirst({ where: { name: FIELD_OFFICER_ROLE, mamcosId }, select: { id: true } });
      }
      if (!role) throw new BadRequestException('Could not prepare the Field Officer role');
      roleId = role.id;
    }
    const role = await this.prisma.role.findUnique({ where: { id: roleId }, select: { name: true } });
    if (role && LEADER_ROLE_NAMES.includes(role.name)) {
      throw new BadRequestException('Canal and block leaders become staff automatically when they are appointed in Scheme Management');
    }
    const password = generateTemporaryPassword();
    const language = dto.language ?? 'sw';
    const user = await this.auth.createStaffAccount(
      {
        firstName: dto.firstName!.trim(), lastName: dto.lastName!.trim(), phone: dto.phone!, email: dto.email || undefined,
        password, roleId, language,
        ...(fieldOfficer ? { staffType: UserRole.FIELD_OFFICER, assignedArea: dto.assignedArea?.trim() || undefined } : {}),
      },
      actor as unknown as DelegatingActor,
      { mustChangePassword: true, ...(this.ownership.resolveTenantMamcosId(actor) ? {} : { onBehalfOfMamcosId: mamcosId }) },
    );
    const sent = await this.send(user.phone, dto.firstName!.trim(), language, password, false);
    return { id: user.id, credentialsSms: sent ? 'sent' : 'failed', ...(sent ? {} : { temporaryPassword: password }) };
  }

  /** Registered farmers of this cooperative who are not staff yet (a farmer who already holds a cooperative role is left out). */
  async farmerCandidates(actor: RequestUser, q?: string, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const text = (q ?? '').trim();
    const farmers = await this.prisma.farmer.findMany({
      where: {
        mamcosId, isBlacklisted: false,
        user: { role: UserRole.FARMER, isActive: true, OR: [{ roleId: null }, { customRole: { mamcosId: null, name: { equals: 'Farmer', mode: 'insensitive' } } }] },
        ...(text ? { OR: [
          { firstName: { contains: text, mode: 'insensitive' } }, { lastName: { contains: text, mode: 'insensitive' } },
          { controlNumber: { contains: text, mode: 'insensitive' } }, { user: { phone: { contains: text.replace(/\s/g, '') } } },
        ] } : {}),
      },
      select: { id: true, firstName: true, lastName: true, controlNumber: true, village: true, user: { select: { phone: true } } },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }], take: 20,
    });
    return farmers.map((f) => ({ farmerId: f.id, name: `${f.firstName} ${f.lastName}`.trim(), memberNumber: f.controlNumber, phone: f.user.phone, village: f.village }));
  }

  /** Makes a registered farmer staff on their own login: same phone and password, still a farmer. Nothing is reset; they are told by SMS. */
  private async createFromFarmer(dto: CreateStaffDto, actor: RequestUser, mamcosId: string) {
    if (dto.staffType === 'FIELD_OFFICER') throw new BadRequestException('Field officers are added as new people, not from farmers');
    if (!dto.roleId) throw new BadRequestException('Choose a role for this staff member');
    const farmer = await this.prisma.farmer.findFirst({
      where: { id: dto.farmerId, mamcosId },
      select: { firstName: true, lastName: true, user: { select: { id: true, phone: true, role: true, roleId: true, isActive: true, firstName: true, lastName: true, language: true, customRole: { select: { name: true, mamcosId: true } } } } },
    });
    if (!farmer) throw new NotFoundException('That farmer is not registered in your cooperative');
    const user = farmer.user;
    if (!user.isActive) throw new BadRequestException('This farmer’s login is switched off');
    if (user.role !== UserRole.FARMER || (user.roleId && !(user.customRole && isLegacyFarmerRole(user.customRole)))) {
      throw new BadRequestException('This person is already on the staff');
    }
    const role = await this.prisma.role.findUnique({ where: { id: dto.roleId }, include: { permissions: { include: { resource: true } } } });
    if (!role || role.mamcosId !== mamcosId || !role.isActive || role.isSystem || isLegacyFarmerRole(role)) {
      throw new BadRequestException('Choose a role from your cooperative');
    }
    if (LEADER_ROLE_NAMES.includes(role.name)) {
      throw new BadRequestException('Canal and block leaders become staff automatically when they are appointed in Scheme Management');
    }
    assertWithinCeiling(actor as never, grantsOfRole(role));
    await this.prisma.user.update({
      where: { id: user.id },
      data: { roleId: role.id, mamcosId, firstName: user.firstName ?? farmer.firstName, lastName: user.lastName ?? farmer.lastName },
    });
    const text = staffAccessSms({ firstName: farmer.firstName, language: user.language, portalUrl: this.config.get<string>('PORTAL_URL') || undefined });
    const sent = await this.sms.sendTransactional(user.phone, text, 'staff_access', text);
    return { id: user.id, credentialsSms: sent ? 'sent' : 'failed', existingLogin: true };
  }

  /** Takes the staff role away from a farmer who is also staff. The farmer login, farms and records are untouched. */
  async removeAccess(id: string, actor: RequestUser, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    if (id === actor.id) throw new BadRequestException('You cannot remove your own staff access');
    const target = await this.prisma.user.findFirst({
      where: { id, role: UserRole.FARMER, mamcosId, roleId: { not: null }, customRole: NOT_LEGACY_FARMER_ROLE, farmer: { isNot: null } },
      select: { id: true, customRole: { select: { name: true } } },
    });
    if (!target) throw new NotFoundException('This person is not a farmer with staff access');
    if (target.customRole && LEADER_ROLE_NAMES.includes(target.customRole.name)) {
      throw new BadRequestException('Leader access ends when the appointment ends in Scheme Management');
    }
    await this.prisma.user.update({ where: { id }, data: { roleId: null, mamcosId: null } });
    return { removed: true };
  }

  /** New temporary password, signs the person out everywhere, texts it. */
  async resetCredentials(id: string, actor: RequestUser, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    if (id === actor.id) throw new BadRequestException('Change your own password from your profile');
    const target = await this.prisma.user.findFirst({
      where: { id, AND: [STAFF_ACCOUNT], OR: [{ mamcosId }, { mamcosStaff: { mamcosId } }] },
      select: { id: true, phone: true, firstName: true, language: true },
    });
    if (!target) throw new NotFoundException('Staff member not found');
    const password = generateTemporaryPassword();
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true } }),
      this.prisma.refreshToken.deleteMany({ where: { userId: id } }),
    ]);
    const sent = await this.send(target.phone, target.firstName ?? '', target.language, password, true);
    return { credentialsSms: sent ? 'sent' : 'failed', ...(sent ? {} : { temporaryPassword: password }) };
  }
}
