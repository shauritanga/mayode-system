import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/ownership.service';
import { normalizeMsisdn, SmsService } from '../messaging/sms.service';
import { createRoleTemplates, type RoleTemplate } from '../roles/role-templates';
import { RegisterContractorDto, UpdateContractorDto, VetContractorDto } from './dto/tenders.dto';
import { toLang, vetted } from './tenders.messages';

export const CONTRACTOR_ROLE = 'Contractor';
export const CONTRACTOR_ROLE_TEMPLATES: RoleTemplate[] = [
  { name: CONTRACTOR_ROLE, description: 'An outside contractor or member group: sees open tenders, bids, and reports progress on the contracts it wins. Nothing else.', grants: { tender_bidding: ['VIEW', 'CREATE'] } },
];

const shape = (c: Prisma.ContractorGetPayload<object>) => ({
  id: c.id, kind: c.kind, name: c.name, contactPerson: c.contactPerson, phone: c.phone, email: c.email, tin: c.tin, businessRegNo: c.businessRegNo,
  memberNumber: c.memberNumber, address: c.address, equipment: c.equipment, equipmentCount: c.equipmentCount, yearsExperience: c.yearsExperience,
  payoutMethod: c.payoutMethod, payoutAccount: c.payoutAccount, payoutName: c.payoutName,
  status: c.status, vettedAt: c.vettedAt, vettingNote: c.vettingNote, createdAt: c.createdAt,
});

/** Outside companies, people and member groups that may bid. They register themselves, then an AMCOS officer vets them. */
@Injectable()
export class ContractorsService {
  private readonly logger = new Logger(ContractorsService.name);
  constructor(private readonly prisma: PrismaService, private readonly sms: SmsService) {}

  /** Public self-registration: creates a login (phone + password) and a profile waiting to be vetted. */
  async register(dto: RegisterContractorDto) {
    const phone = normalizeMsisdn(dto.phone);
    if (dto.kind === 'COMPANY' && !dto.tin?.trim() && !dto.businessRegNo?.trim()) throw new BadRequestException('A company must give its TIN or business registration number');
    if (dto.kind === 'MEMBER_GROUP') {
      if (!dto.memberNumber?.trim()) throw new BadRequestException('A member group must give the member number of a registered member who stands behind it');
      if (!(await this.prisma.farmer.findFirst({ where: { controlNumber: { equals: dto.memberNumber.trim(), mode: 'insensitive' } }, select: { id: true } })))
        throw new BadRequestException('That member number is not registered');
    }
    if (await this.prisma.user.findFirst({ where: { OR: [{ phone }, ...(dto.email ? [{ email: dto.email.toLowerCase() }] : [])] }, select: { id: true } }))
      throw new ConflictException('An account with this phone number or email already exists');
    const passwordHash = await bcrypt.hash(dto.password, await bcrypt.genSalt(10));
    const contractor = await this.prisma.$transaction(async (tx) => {
      await createRoleTemplates(tx, null, [CONTRACTOR_ROLE], CONTRACTOR_ROLE_TEMPLATES);
      const role = await tx.role.findFirstOrThrow({ where: { name: CONTRACTOR_ROLE, mamcosId: null }, select: { id: true } });
      const user = await tx.user.create({
        data: { phone, email: dto.email?.toLowerCase() ?? null, passwordHash, role: UserRole.CUSTOM, roleId: role.id, firstName: dto.contactPerson?.trim() || dto.name.trim(), lastName: dto.kind === 'COMPANY' ? '(contractor)' : '' },
      });
      return tx.contractor.create({
        data: {
          userId: user.id, kind: dto.kind, name: dto.name.trim(), contactPerson: dto.contactPerson?.trim() || null, phone, email: dto.email?.toLowerCase() ?? null,
          tin: dto.tin?.trim() || null, businessRegNo: dto.businessRegNo?.trim() || null, memberNumber: dto.memberNumber?.trim() || null, address: dto.address?.trim() || null,
          equipment: dto.equipment?.trim() || null, equipmentCount: dto.equipmentCount ?? 0, yearsExperience: dto.yearsExperience ?? 0,
          payoutMethod: dto.payoutMethod ?? null, payoutAccount: dto.payoutAccount?.trim() || null, payoutName: dto.payoutName?.trim() || null,
        },
      });
    });
    return { id: contractor.id, status: contractor.status, message: 'Registered. An AMCOS officer will check your details; you can bid once you are approved.' };
  }

  async forUser(userId: string) {
    const c = await this.prisma.contractor.findUnique({ where: { userId } });
    if (!c) throw new ForbiddenException('This login is not a registered contractor');
    return c;
  }

  async me(actor: RequestUser) {
    const c = await this.forUser(actor.id);
    const done = await this.prisma.tender.findMany({ where: { contractorId: c.id, status: 'COMPLETED' }, select: { rating: true } });
    const rated = done.filter((d) => d.rating != null);
    return { ...shape(c), completedContracts: done.length, averageRating: rated.length ? Math.round((rated.reduce((n, d) => n + (d.rating ?? 0), 0) / rated.length) * 10) / 10 : null };
  }

  async updateMe(actor: RequestUser, dto: UpdateContractorDto) {
    const c = await this.forUser(actor.id);
    const updated = await this.prisma.contractor.update({ where: { id: c.id }, data: {
      ...(dto.contactPerson !== undefined ? { contactPerson: dto.contactPerson.trim() || null } : {}), ...(dto.address !== undefined ? { address: dto.address.trim() || null } : {}),
      ...(dto.equipment !== undefined ? { equipment: dto.equipment.trim() || null } : {}), ...(dto.equipmentCount !== undefined ? { equipmentCount: dto.equipmentCount } : {}),
      ...(dto.yearsExperience !== undefined ? { yearsExperience: dto.yearsExperience } : {}), ...(dto.payoutMethod !== undefined ? { payoutMethod: dto.payoutMethod } : {}),
      ...(dto.payoutAccount !== undefined ? { payoutAccount: dto.payoutAccount.trim() || null } : {}), ...(dto.payoutName !== undefined ? { payoutName: dto.payoutName.trim() || null } : {}),
    } });
    return shape(updated);
  }

  /** The vetting queue and the register. */
  async list(q: { status?: string }) {
    const rows = await this.prisma.contractor.findMany({ where: q.status && q.status !== 'ALL' ? { status: q.status as never } : {}, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 200 });
    const done = await this.prisma.tender.groupBy({ by: ['contractorId'], where: { contractorId: { in: rows.map((r) => r.id) }, status: 'COMPLETED' }, _count: true, _avg: { rating: true } });
    const history = new Map(done.map((d) => [d.contractorId, d]));
    return { data: rows.map((c) => ({ ...shape(c), completedContracts: history.get(c.id)?._count ?? 0, averageRating: history.get(c.id)?._avg.rating ?? null })) };
  }

  async vet(actor: RequestUser, id: string, dto: VetContractorDto) {
    if (dto.status === 'PENDING') throw new BadRequestException('Choose approve, reject or suspend');
    if (dto.status !== 'VETTED' && !dto.note?.trim()) throw new BadRequestException('Say why, so the contractor knows');
    const c = await this.prisma.contractor.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Contractor not found');
    const updated = await this.prisma.contractor.update({ where: { id }, data: { status: dto.status, vettedById: actor.id, vettedAt: new Date(), vettingNote: dto.note?.trim() || null } });
    const user = await this.prisma.user.findUnique({ where: { id: c.userId }, select: { language: true } });
    try { const m = vetted(toLang(user?.language), { status: dto.status, note: dto.note }); await this.sms.send(c.phone, m.body, 'tender'); }
    catch (e) { this.logger.warn(`Could not tell a contractor about vetting: ${e instanceof Error ? e.message : e}`); }
    return shape(updated);
  }
}
