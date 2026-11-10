import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { hasGrant } from '../auth/role-access';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../common/ownership.service';
import { SmsService } from '../messaging/sms.service';
import { NotificationsService } from '../notifications/notifications.service';
import { IrrigationScopeService } from './irrigation-scope.service';
import { writeAudit } from './irrigation-audit';
import { TRANSFER_APPROVAL_RESOURCE, fullName, paged, paging, today } from './irrigation-common';

const person = { id: true, firstName: true, lastName: true, controlNumber: true, dateOfBirth: true, userId: true, user: { select: { phone: true, language: true } } } as const;
export const ADULT_AGE = 18;

const ageOn = (dob: Date, on = new Date()) => {
  let age = on.getUTCFullYear() - dob.getUTCFullYear();
  const before = on.getUTCMonth() < dob.getUTCMonth() || (on.getUTCMonth() === dob.getUTCMonth() && on.getUTCDate() < dob.getUTCDate());
  if (before) age--;
  return age;
};

/**
 * A hectare registered in a dependent's name (with a guardian) passes to the dependent as an independent adult member when they
 * come of age. The guardian (or the dependent) asks, in the app or at the office; a Manager or Accountant approves; approving ends
 * the guardianship and keeps the hectare registered to the now independent member.
 */
@Injectable()
export class EmancipationService {
  private readonly logger = new Logger(EmancipationService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: IrrigationScopeService,
    private readonly sms: SmsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Checks the request can be made and returns what it refers to. */
  private async target(allocationId: string) {
    const allocation = await this.prisma.irrigationHectareAllocation.findUnique({
      where: { id: allocationId },
      include: { hectare: { select: { id: true, code: true } }, farmer: { select: person }, guardians: { where: { endedOn: null }, include: { guardian: { select: person } } } },
    });
    if (!allocation || allocation.status !== 'ACTIVE') throw new NotFoundException('Hectare allocation not found');
    const guardianship = allocation.guardians[0];
    if (!guardianship) throw new ConflictException('This hectare has no guardian, so there is nothing to release');
    if (await this.prisma.irrigationEmancipationRequest.findFirst({ where: { allocationId, status: 'PENDING_APPROVAL' }, select: { id: true } }))
      throw new ConflictException('An emancipation request for this hectare is already waiting for approval');
    return { allocation, holder: allocation.farmer, guardian: guardianship.guardian };
  }

  /** Under 18 on record: not yet. No date of birth on record: the office decides. */
  private assertOfAge(holder: { dateOfBirth: Date | null; firstName: string; lastName: string }) {
    if (holder.dateOfBirth && ageOn(holder.dateOfBirth) < ADULT_AGE)
      throw new ConflictException(`${fullName(holder)} is not yet ${ADULT_AGE} years old on record`);
  }

  private async create(allocationId: string, requestedById: string | null, note?: string) {
    const { allocation, holder, guardian } = await this.target(allocationId);
    this.assertOfAge(holder);
    try {
      const row = await this.prisma.irrigationEmancipationRequest.create({
        data: { allocationId, hectareId: allocation.hectareId, holderId: holder.id, guardianId: guardian.id, note: note?.trim() || null, requestedById },
      });
      return { row, holder, guardian, code: allocation.hectare.code };
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('An emancipation request for this hectare is already waiting for approval');
      throw e;
    }
  }

  /** The office files the request for a guardian who came to the AMCOS. */
  async requestAtOffice(actor: RequestUser, dto: { allocationId: string; note?: string }) {
    const scope = await this.scopeService.resolve(actor);
    const a = await this.prisma.irrigationHectareAllocation.findFirst({ where: { id: dto.allocationId, hectare: this.scopeService.hectareWhere(scope) }, select: { id: true } });
    if (!a) throw new NotFoundException('Hectare allocation not found');
    const made = await this.create(dto.allocationId, actor.id, dto.note);
    return made.row;
  }

  /** The guardian, or the dependent themselves, asks from the app. */
  async requestMine(actor: RequestUser, dto: { allocationId: string; note?: string }) {
    const me = await this.prisma.farmer.findUnique({ where: { userId: actor.id }, select: { id: true } });
    if (!me) throw new ForbiddenException('Only members can ask for this');
    const { holder, guardian } = await this.target(dto.allocationId);
    if (me.id !== guardian.id && me.id !== holder.id) throw new ForbiddenException('Only the guardian or the member the hectare is registered to can ask for this');
    const made = await this.create(dto.allocationId, actor.id, dto.note);
    return made.row;
  }

  async cancelMine(actor: RequestUser, id: string) {
    const me = await this.prisma.farmer.findUnique({ where: { userId: actor.id }, select: { id: true } });
    const r = me ? await this.prisma.irrigationEmancipationRequest.findFirst({ where: { id, OR: [{ holderId: me.id }, { guardianId: me.id }] } }) : null;
    if (!r) throw new NotFoundException('Request not found');
    const claimed = await this.prisma.irrigationEmancipationRequest.updateMany({ where: { id, status: 'PENDING_APPROVAL' }, data: { status: 'CANCELLED', decidedAt: new Date(), decidedById: actor.id, decisionNote: 'Withdrawn' } });
    if (!claimed.count) throw new ConflictException('This request can no longer be withdrawn');
    return { status: 'CANCELLED' };
  }

  async list(actor: RequestUser, q: Record<string, string>) {
    const scope = await this.scopeService.resolve(actor);
    const { page, pageSize, skip, take } = paging(q as any);
    const where = { hectare: this.scopeService.hectareWhere(scope), ...(q.status ? { status: q.status as any } : {}) };
    const [total, rows] = await Promise.all([
      this.prisma.irrigationEmancipationRequest.count({ where }),
      this.prisma.irrigationEmancipationRequest.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
    ]);
    const farmers = await this.prisma.farmer.findMany({ where: { id: { in: rows.flatMap((r) => [r.holderId, r.guardianId]) } }, select: person });
    const byId = new Map(farmers.map((f) => [f.id, f]));
    const hectares = await this.prisma.irrigationHectare.findMany({ where: { id: { in: rows.map((r) => r.hectareId) } }, select: { id: true, code: true } });
    const code = new Map(hectares.map((h) => [h.id, h.code]));
    return paged(rows.map((r) => {
      const holder = byId.get(r.holderId); const guardian = byId.get(r.guardianId);
      return {
        id: r.id, status: r.status, note: r.note, decisionNote: r.decisionNote, createdAt: r.createdAt, decidedAt: r.decidedAt, hectare: { id: r.hectareId, code: code.get(r.hectareId) ?? '' },
        holder: holder ? { id: holder.id, name: fullName(holder), memberNumber: holder.controlNumber, dateOfBirth: holder.dateOfBirth, age: holder.dateOfBirth ? ageOn(holder.dateOfBirth) : null } : null,
        guardian: guardian ? { id: guardian.id, name: fullName(guardian), memberNumber: guardian.controlNumber } : null,
      };
    }), total, page, pageSize);
  }

  private async load(actor: RequestUser, id: string) {
    const scope = await this.scopeService.resolve(actor);
    const r = await this.prisma.irrigationEmancipationRequest.findFirst({ where: { id, hectare: this.scopeService.hectareWhere(scope) } });
    if (!r) throw new NotFoundException('Request not found');
    return r;
  }

  /** Manager or Accountant sign-off: the guardianship ends and the member is independent. */
  async approve(actor: RequestUser, id: string, note?: string) {
    const r = await this.load(actor, id);
    if (!hasGrant(actor, TRANSFER_APPROVAL_RESOURCE, 'EDIT')) throw new ForbiddenException('Only an AMCOS Manager or Accountant can approve an emancipation');
    if (r.status !== 'PENDING_APPROVAL') throw new ConflictException('Only a pending request can be approved');
    if (r.requestedById && r.requestedById === actor.id) throw new ConflictException('An emancipation must be approved by someone other than the person who asked for it');
    const holder = await this.prisma.farmer.findUniqueOrThrow({ where: { id: r.holderId }, select: person });
    this.assertOfAge(holder);
    const done = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM irrigation_hectares WHERE id = ${r.hectareId} FOR UPDATE`;
      const claimed = await tx.irrigationEmancipationRequest.updateMany({ where: { id, status: 'PENDING_APPROVAL' }, data: { status: 'APPROVED', decidedById: actor.id, decidedAt: new Date(), decisionNote: note?.trim() || null } });
      if (!claimed.count) throw new ConflictException('This request is no longer pending');
      const open = await tx.irrigationHectareGuardian.findFirst({ where: { allocationId: r.allocationId, endedOn: null } });
      if (!open || open.guardianId !== r.guardianId) throw new ConflictException('The guardian of this hectare has changed since the request was made');
      const on = today() < open.startedOn ? open.startedOn : today();
      await tx.irrigationHectareGuardian.update({ where: { id: open.id }, data: { endedOn: on, endReason: 'EMANCIPATED', endedById: actor.id } });
      await writeAudit(tx, actor, 'irrigation_hectare', r.hectareId, 'emancipation', { guardianId: r.guardianId, holderId: r.holderId }, { guardianId: null, holderId: r.holderId, requestId: id });
      return tx.irrigationEmancipationRequest.findUniqueOrThrow({ where: { id } });
    });
    await this.tell([r.holderId, r.guardianId], 'approved', r.hectareId, holder);
    return done;
  }

  async reject(actor: RequestUser, id: string, reason: string) {
    const r = await this.load(actor, id);
    if (!hasGrant(actor, TRANSFER_APPROVAL_RESOURCE, 'EDIT')) throw new ForbiddenException('Only an AMCOS Manager or Accountant can decide an emancipation');
    if (!reason?.trim()) throw new BadRequestException('Say why the request is rejected');
    const claimed = await this.prisma.irrigationEmancipationRequest.updateMany({ where: { id, status: 'PENDING_APPROVAL' }, data: { status: 'REJECTED', decidedById: actor.id, decidedAt: new Date(), decisionNote: reason.trim() } });
    if (!claimed.count) throw new ConflictException('Only a pending request can be rejected');
    const holder = await this.prisma.farmer.findUniqueOrThrow({ where: { id: r.holderId }, select: person });
    await this.tell([r.holderId, r.guardianId], 'rejected', r.hectareId, holder, reason.trim());
    return this.prisma.irrigationEmancipationRequest.findUniqueOrThrow({ where: { id } });
  }

  private async tell(farmerIds: string[], outcome: 'approved' | 'rejected', hectareId: string, holder: { firstName: string; lastName: string }, reason?: string) {
    try {
      const hectare = await this.prisma.irrigationHectare.findUnique({ where: { id: hectareId }, select: { code: true } });
      const farmers = await this.prisma.farmer.findMany({ where: { id: { in: farmerIds } }, select: person });
      for (const f of farmers) {
        const en = f.user?.language === 'en';
        const name = fullName(holder);
        const body = outcome === 'approved'
          ? (en ? `MAYODE: Hectare ${hectare?.code} is now registered to ${name} as an independent member. The guardianship has ended.` : `MAYODE: Hekta ${hectare?.code} sasa imesajiliwa kwa ${name} kama mwanachama huru. Ulezi umeisha.`)
          : (en ? `MAYODE: The request to release hectare ${hectare?.code} to ${name} was not approved. Reason: ${reason}` : `MAYODE: Ombi la kumwachia ${name} hekta ${hectare?.code} halikukubaliwa. Sababu: ${reason}`);
        if (f.userId) await this.notifications.create({ userId: f.userId, type: `irrigation.emancipation.${outcome}`, title: outcome === 'approved' ? 'Hectare released' : 'Request not approved', body }).catch(() => undefined);
        if (f.user?.phone) await this.sms.send(f.user.phone, body, 'irrigation_emancipation');
      }
    } catch (e) {
      this.logger.warn(`Could not tell the family about an emancipation: ${e instanceof Error ? e.message : e}`);
    }
  }
}
