import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hasGrant } from '../auth/role-access';
import { deriveRegistrationTier } from '../farmers/farmer-tier';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../common/ownership.service';
import { IrrigationScope, IrrigationScopeService } from './irrigation-scope.service';
import { writeAudit } from './irrigation-audit';
import {
  TRANSFER_APPROVAL_RESOURCE, fullName, lockMember, num, paged, paging, rethrowIntegrity, toDate, today, userNames, type Db,
} from './irrigation-common';
import { StructureService } from './structure.service';
import { SmsService } from '../messaging/sms.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AllocateHectareDto, CreateTransferDto, SetGuardianDto } from './dto/irrigation.dto';

const OPEN = ['ACTIVE', 'PENDING_APPROVAL'] as const;
const farmerSelect = { id: true, firstName: true, lastName: true, controlNumber: true } as const;

const OPEN_HECTARE_MSG = 'This hectare already has an active or pending allocation';

@Injectable()
export class AllocationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: IrrigationScopeService,
    private readonly structure: StructureService,
    private readonly sms: SmsService,
    private readonly notifications: NotificationsService,
  ) {}

  // ───────────────────────── eligibility ─────────────────────────

  /** Existing AMCOS member of the scheme's cooperative; no new farmer records are ever created here. */
  async requireMember(db: Db, farmerId: string, scheme: { mamcosId: string | null; name: string }) {
    const farmer = await db.farmer.findUnique({ where: { id: farmerId }, select: { ...farmerSelect, mamcosId: true, isBlacklisted: true } });
    if (!farmer) throw new NotFoundException('Member not found');
    if (scheme.mamcosId && farmer.mamcosId !== scheme.mamcosId)
      throw new BadRequestException(`${fullName(farmer)} is not a member of the AMCOS that runs ${scheme.name}`);
    if (farmer.isBlacklisted) throw new BadRequestException(`${fullName(farmer)} is blacklisted and cannot receive an allocation`);
    return farmer;
  }

  private async assertWithinMemberLimit(tx: Prisma.TransactionClient, farmerId: string, scheme: { id: string; maxHectaresPerFarmer: number | null }, adding = 1) {
    if (scheme.maxHectaresPerFarmer == null) return;
    const held = await tx.irrigationHectareAllocation.count({
      where: { farmerId, status: { in: [...OPEN] }, hectare: { block: { canal: { schemeId: scheme.id } } } },
    });
    if (held + adding > scheme.maxHectaresPerFarmer)
      throw new ConflictException(`Scheme policy allows at most ${scheme.maxHectaresPerFarmer} hectare(s) per member; this member holds ${held}`);
  }

  /**
   * A hectare cannot change hands while the outgoing holder still owes the AMCOS (input, fertilizer or harvest fees)
   * or has an active loan. Checked when the transfer is requested and again when it executes, since approval may come later.
   */
  private async assertNoOutstandingLiabilities(db: Db, farmerId: string, mamcosId: string | null) {
    const dues = mamcosId
      ? await db.farmerDue.findMany({
          where: { mamcosId, farmerId, status: 'ACTIVE' },
          include: { payments: { where: { voidedAt: null }, select: { amount: true } } },
        })
      : [];
    const owed = Math.round(
      dues.reduce((n, d) => n + Number(d.amount) - Number(d.waivedAmount) - d.payments.reduce((m, p) => m + Number(p.amount), 0), 0) * 100,
    ) / 100;
    const activeLoans = await db.loanRecord.count({ where: { farmerId, isActive: true, amountOwed: { gt: 0 } } });
    if (owed > 0 || activeLoans > 0) {
      const parts = [
        owed > 0 ? `owes the AMCOS ${owed.toLocaleString('en-US')} TZS in fees` : '',
        activeLoans > 0 ? `has ${activeLoans} active loan(s)` : '',
      ].filter(Boolean);
      throw new ConflictException(`This hectare cannot be transferred because the current holder ${parts.join(' and ')}. Settle these first.`);
    }
  }

  private assertAllocatable(h: any) {
    const { block } = h;
    if (!h.isActive) throw new BadRequestException('This hectare is not in use');
    if (block.archivedAt || block.canal.archivedAt) throw new BadRequestException('This block is archived');
    if (block.status === 'INACTIVE') throw new BadRequestException('This block is inactive');
    if (block.canal.scheme.status === 'INACTIVE') throw new BadRequestException('This scheme is inactive');
  }

  // ───────────────────────── guardians ─────────────────────────

  /** The guardian must be another member of the same AMCOS; one member may guard any number of hectares. */
  private async requireGuardian(db: Db, guardianId: string, holderId: string, scheme: { mamcosId: string | null; name: string }) {
    if (guardianId === holderId) throw new BadRequestException('The guardian must be a different member than the one the hectare is registered to');
    const guardian = await db.farmer.findUnique({ where: { id: guardianId }, select: { ...farmerSelect, mamcosId: true, isBlacklisted: true } });
    if (!guardian) throw new NotFoundException('Guardian not found');
    if (scheme.mamcosId && guardian.mamcosId !== scheme.mamcosId)
      throw new BadRequestException(`${fullName(guardian)} is not a member of the AMCOS that runs ${scheme.name}`);
    if (guardian.isBlacklisted) throw new BadRequestException(`${fullName(guardian)} is blacklisted and cannot be a guardian`);
    return guardian;
  }

  /** Closes the current guardianship, if any. Used when the hectare is released, rejected or handed over completely. */
  private async closeGuardian(tx: Prisma.TransactionClient, allocationId: string, on: Date, reason: string, endedById: string | null) {
    const open = await tx.irrigationHectareGuardian.findFirst({ where: { allocationId, endedOn: null } });
    if (!open) return null;
    await tx.irrigationHectareGuardian.update({
      where: { id: open.id }, data: { endedOn: on < open.startedOn ? open.startedOn : on, endReason: reason, endedById },
    });
    return open;
  }

  async setGuardian(actor: RequestUser, id: string, dto: SetGuardianDto) {
    const scope = await this.scopeService.resolve(actor);
    const allocation = await this.loadAllocation(scope, id);
    if (allocation.status !== 'ACTIVE' && allocation.status !== 'PENDING_APPROVAL') throw new ConflictException('Only a current allocation can have a guardian');
    const scheme = allocation.hectare.block.canal.scheme;
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM irrigation_hectares WHERE id = ${allocation.hectareId} FOR UPDATE`;
      const guardian = await this.requireGuardian(tx, dto.guardianId, allocation.farmerId, scheme);
      const open = await tx.irrigationHectareGuardian.findFirst({ where: { allocationId: id, endedOn: null } });
      if (open?.guardianId === guardian.id) throw new ConflictException(`${fullName(guardian)} is already the guardian of this hectare`);
      const on = today() < allocation.allocatedOn ? allocation.allocatedOn : today();
      if (open) await this.closeGuardian(tx, id, on, 'REPLACED', actor.id);
      const created = await tx.irrigationHectareGuardian.create({
        data: { allocationId: id, guardianId: guardian.id, startedOn: on, note: dto.note?.trim() || null, createdById: actor.id },
      });
      await writeAudit(tx, actor, 'irrigation_hectare', allocation.hectareId, 'set-guardian', { guardianId: open?.guardianId ?? null }, { guardianId: guardian.id, allocationId: id });
      return created;
    });
  }

  async endGuardian(actor: RequestUser, id: string, reason: string) {
    const scope = await this.scopeService.resolve(actor);
    const allocation = await this.loadAllocation(scope, id);
    return this.prisma.$transaction(async (tx) => {
      const closed = await this.closeGuardian(tx, id, today(), `ENDED: ${reason.trim()}`, actor.id);
      if (!closed) throw new NotFoundException('This hectare has no guardian');
      await writeAudit(tx, actor, 'irrigation_hectare', allocation.hectareId, 'end-guardian', { guardianId: closed.guardianId }, { reason, allocationId: id });
      return { ended: true };
    });
  }

  // ───────────────────────── allocations ─────────────────────────

  async allocate(actor: RequestUser, dto: AllocateHectareDto) {
    const scope = await this.scopeService.resolve(actor);
    const hectare = await this.scopeService.assertHectare(scope, dto.hectareId);
    this.assertAllocatable(hectare);
    const scheme = hectare.block.canal.scheme;
    const allocatedOn = dto.allocatedOn ? toDate(dto.allocatedOn, 'allocation date') : today();
    if (allocatedOn > today()) throw new BadRequestException('Allocation date cannot be in the future');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const farmer = await this.requireMember(tx, dto.farmerId, scheme);
        await lockMember(tx, farmer.id);
        await this.assertWithinMemberLimit(tx, farmer.id, scheme);
        const direct = !scheme.requireAllocationApproval;
        // The partial unique index is the authority; this check only gives a friendlier message first.
        const taken = await tx.irrigationHectareAllocation.findFirst({ where: { hectareId: hectare.id, status: { in: [...OPEN] } } });
        if (taken) throw new ConflictException(OPEN_HECTARE_MSG);
        const created = await tx.irrigationHectareAllocation.create({
          data: {
            hectareId: hectare.id, farmerId: farmer.id, status: direct ? 'ACTIVE' : 'PENDING_APPROVAL', allocatedOn,
            notes: dto.notes?.trim() || null, requestedById: actor.id,
            ...(direct ? { approvedById: actor.id, approvedAt: new Date() } : {}),
          },
        });
        if (dto.guardianId) {
          const guardian = await this.requireGuardian(tx, dto.guardianId, farmer.id, scheme);
          await tx.irrigationHectareGuardian.create({ data: { allocationId: created.id, guardianId: guardian.id, startedOn: allocatedOn, createdById: actor.id } });
        }
        await writeAudit(tx, actor, 'irrigation_hectare', hectare.id, direct ? 'allocate' : 'request-allocation', null, { ...created, guardianId: dto.guardianId ?? null } as any);
        return created;
      });
    } catch (error) {
      rethrowIntegrity(error, { irrigation_hectare_allocations_one_open_per_hectare: OPEN_HECTARE_MSG, 'Unique constraint failed': OPEN_HECTARE_MSG });
    }
  }

  private async loadAllocation(scope: IrrigationScope, id: string) {
    const allocation = await this.prisma.irrigationHectareAllocation.findFirst({
      where: { id, hectare: this.scopeService.hectareWhere(scope) },
      include: { hectare: { include: { block: { include: { canal: { include: { scheme: true } } } } } } },
    });
    if (!allocation) throw new NotFoundException('Allocation not found');
    return allocation;
  }

  async approve(actor: RequestUser, id: string) {
    const scope = await this.scopeService.resolve(actor);
    const allocation = await this.loadAllocation(scope, id);
    if (allocation.status !== 'PENDING_APPROVAL') throw new ConflictException('Only pending allocations can be approved');
    if (allocation.requestedById && allocation.requestedById === actor.id)
      throw new ConflictException('An allocation must be approved by someone other than the person who requested it');
    const scheme = allocation.hectare.block.canal.scheme;
    return this.prisma.$transaction(async (tx) => {
      await lockMember(tx, allocation.farmerId);
      // The member must still fit the policy; the pending row itself counts once, so allow for it.
      await this.assertWithinMemberLimit(tx, allocation.farmerId, scheme, 0);
      const updated = await tx.irrigationHectareAllocation.update({
        where: { id }, data: { status: 'ACTIVE', approvedById: actor.id, approvedAt: new Date() },
      });
      await writeAudit(tx, actor, 'irrigation_hectare', allocation.hectareId, 'approve-allocation', { status: allocation.status }, { status: 'ACTIVE', allocationId: id });
      return updated;
    });
  }

  async reject(actor: RequestUser, id: string, reason: string) {
    const scope = await this.scopeService.resolve(actor);
    const allocation = await this.loadAllocation(scope, id);
    if (allocation.status !== 'PENDING_APPROVAL') throw new ConflictException('Only pending allocations can be rejected');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.irrigationHectareAllocation.update({
        where: { id }, data: { status: 'REJECTED', rejectedReason: reason.trim(), approvedById: actor.id, approvedAt: new Date() },
      });
      await this.closeGuardian(tx, id, today(), 'ALLOCATION_REJECTED', actor.id);
      await writeAudit(tx, actor, 'irrigation_hectare', allocation.hectareId, 'reject-allocation', { status: allocation.status }, { status: 'REJECTED', reason });
      return updated;
    });
  }

  /** Ends the member's hold without a replacement; the hectare becomes available again. */
  async release(actor: RequestUser, id: string, reason: string, effectiveDate?: string) {
    const scope = await this.scopeService.resolve(actor);
    const allocation = await this.loadAllocation(scope, id);
    if (allocation.status !== 'ACTIVE') throw new ConflictException('Only an active allocation can be released');
    const endedOn = effectiveDate ? toDate(effectiveDate, 'effective date') : today();
    if (endedOn > today()) throw new BadRequestException('Effective date cannot be in the future');
    if (endedOn < allocation.allocatedOn) throw new BadRequestException('Effective date is before the allocation started');
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM irrigation_hectares WHERE id = ${allocation.hectareId} FOR UPDATE`;
      const pending = await tx.irrigationAllocationTransfer.count({ where: { hectareId: allocation.hectareId, status: { in: ['AWAITING_RECIPIENT', 'PENDING_APPROVAL'] } } });
      if (pending) throw new ConflictException('A transfer is awaiting approval for this hectare. Resolve it first.');
      const updated = await tx.irrigationHectareAllocation.update({
        where: { id }, data: { status: 'ENDED', endedOn, endReason: `RELEASED: ${reason.trim()}`, endedById: actor.id },
      });
      await this.closeGuardian(tx, id, endedOn, 'RELEASED', actor.id);
      await writeAudit(tx, actor, 'irrigation_hectare', allocation.hectareId, 'release', { status: 'ACTIVE', farmerId: allocation.farmerId }, { status: 'ENDED', reason });
      return updated;
    });
  }

  async listAllocations(actor: RequestUser, q: Record<string, string>) {
    const scope = await this.scopeService.resolve(actor);
    const { page, pageSize, skip, take } = paging(q as any);
    const where: Prisma.IrrigationHectareAllocationWhereInput = {
      AND: [
        { hectare: this.scopeService.hectareWhere(scope) },
        q.status ? { status: q.status as any } : {},
        q.hectareId ? { hectareId: q.hectareId } : {},
        q.farmerId ? { farmerId: q.farmerId } : {},
        q.blockId ? { hectare: { blockId: q.blockId } } : {},
        q.canalId ? { hectare: { block: { canalId: q.canalId } } } : {},
        q.schemeId ? { hectare: { block: { canal: { schemeId: q.schemeId } } } } : {},
        q.q ? { farmer: { OR: [
          { firstName: { contains: q.q, mode: 'insensitive' } },
          { lastName: { contains: q.q, mode: 'insensitive' } },
          { controlNumber: { contains: q.q, mode: 'insensitive' } },
        ] } } : {},
      ],
    };
    const [total, rows] = await Promise.all([
      this.prisma.irrigationHectareAllocation.count({ where }),
      this.prisma.irrigationHectareAllocation.findMany({
        where, skip, take, orderBy: { createdAt: 'desc' },
        include: {
          farmer: { select: farmerSelect },
          guardians: { where: { endedOn: null }, include: { guardian: { select: farmerSelect } } },
          hectare: { select: { id: true, code: true, hectareNumber: true, block: { select: { id: true, code: true, canal: { select: { id: true, code: true } } } } } },
        },
      }),
    ]);
    const names = await userNames(this.prisma, rows.flatMap((r) => [r.requestedById, r.approvedById]));
    return paged(rows.map((r) => ({
      id: r.id, status: r.status, allocatedOn: r.allocatedOn, endedOn: r.endedOn, endReason: r.endReason, notes: r.notes,
      hectare: r.hectare, farmer: { id: r.farmer.id, name: fullName(r.farmer), memberNumber: r.farmer.controlNumber },
      guardian: r.guardians[0] ? { id: r.guardians[0].guardian.id, name: fullName(r.guardians[0].guardian), memberNumber: r.guardians[0].guardian.controlNumber } : null,
      requestedBy: names.get(r.requestedById ?? '') ?? null, approvedBy: names.get(r.approvedById ?? '') ?? null,
    })), total, page, pageSize);
  }

  // ───────────────────────── transfers ─────────────────────────

  async createTransfer(actor: RequestUser, dto: CreateTransferDto) {
    const scope = await this.scopeService.resolve(actor);
    const hectare = await this.scopeService.assertHectare(scope, dto.hectareId);
    const scheme = hectare.block.canal.scheme;
    const current = await this.prisma.irrigationHectareAllocation.findFirst({ where: { hectareId: hectare.id, status: 'ACTIVE' } });
    if (!current) throw new ConflictException('This hectare has no active allocation to transfer');
    if (current.farmerId === dto.toFarmerId) throw new BadRequestException('The new member already holds this hectare');
    const transferDate = dto.transferDate ? toDate(dto.transferDate, 'transfer date') : today();
    const effectiveDate = dto.effectiveDate ? toDate(dto.effectiveDate, 'effective date') : transferDate;
    if (effectiveDate > today()) throw new BadRequestException('Effective date cannot be in the future');
    if (effectiveDate < current.allocatedOn) throw new BadRequestException('Effective date is before the current allocation started');
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT id FROM irrigation_hectares WHERE id = ${hectare.id} FOR UPDATE`;
        await this.requireMember(tx, dto.toFarmerId, scheme);
        await this.assertNoOutstandingLiabilities(tx, current.farmerId, scheme.mamcosId);
        const transfer = await tx.irrigationAllocationTransfer.create({
          data: {
            hectareId: hectare.id, fromAllocationId: current.id, fromFarmerId: current.farmerId, toFarmerId: dto.toFarmerId,
            transferDate, effectiveDate, reason: dto.reason.trim(), requestedById: actor.id,
            status: scheme.requireRecipientAcceptance ? 'AWAITING_RECIPIENT' : 'PENDING_APPROVAL',
          },
        });
        // A transfer never completes on its own: the receiving member (when required) and then a Manager or Accountant must sign off.
        return transfer;
      });
      if (result.status === 'AWAITING_RECIPIENT') await this.notifyRecipient(result.id);
      return result;
    } catch (error) {
      rethrowIntegrity(error, {
        irrigation_transfers_one_pending_per_hectare: 'A transfer is already awaiting approval for this hectare',
        irrigation_hectare_allocations_one_open_per_hectare: OPEN_HECTARE_MSG,
        // Prisma reports partial-index violations by column, without the index name.
        'Unique constraint failed': 'A transfer is already awaiting approval for this hectare',
      });
    }
  }

  /** Closes the previous allocation and opens the new one; either both happen or neither does. */
  private async execute(tx: Prisma.TransactionClient, actor: RequestUser, transferId: string, approvedById: string | null) {
    const transfer = await tx.irrigationAllocationTransfer.findUniqueOrThrow({
      where: { id: transferId },
      include: { hectare: { include: { block: { include: { canal: { include: { scheme: true } } } } } } },
    });
    await tx.$executeRaw`SELECT id FROM irrigation_hectares WHERE id = ${transfer.hectareId} FOR UPDATE`;
    await lockMember(tx, transfer.toFarmerId);
    const from = await tx.irrigationHectareAllocation.findUniqueOrThrow({ where: { id: transfer.fromAllocationId } });
    if (from.status !== 'ACTIVE' || from.farmerId !== transfer.fromFarmerId)
      throw new ConflictException('The allocation being transferred has changed since this request was made');
    await this.assertWithinMemberLimit(tx, transfer.toFarmerId, transfer.hectare.block.canal.scheme);
    await this.assertNoOutstandingLiabilities(tx, transfer.fromFarmerId, transfer.hectare.block.canal.scheme.mamcosId);
    await tx.irrigationHectareAllocation.update({
      where: { id: from.id },
      data: { status: 'ENDED', endedOn: transfer.effectiveDate, endReason: 'TRANSFERRED', endedById: actor.id },
    });
    // handing the hectare over completely also ends the guardian's part in it
    await this.closeGuardian(tx, from.id, transfer.effectiveDate, 'OWNERSHIP_TRANSFERRED', actor.id);
    const next = await tx.irrigationHectareAllocation.create({
      data: {
        hectareId: transfer.hectareId, farmerId: transfer.toFarmerId, status: 'ACTIVE', allocatedOn: transfer.effectiveDate,
        notes: `Transferred from previous holder: ${transfer.reason}`, requestedById: transfer.requestedById,
        approvedById: approvedById ?? actor.id, approvedAt: new Date(),
      },
    });
    const done = await tx.irrigationAllocationTransfer.update({
      where: { id: transferId },
      data: {
        status: 'COMPLETED', toAllocationId: next.id, processedById: actor.id, processedAt: new Date(),
        ...(approvedById ? { approvedById, approvedAt: new Date() } : {}),
      },
    });
    await writeAudit(tx, actor, 'irrigation_hectare', transfer.hectareId, 'transfer',
      { farmerId: transfer.fromFarmerId, allocationId: from.id }, { farmerId: transfer.toFarmerId, allocationId: next.id, transferId });
    return done;
  }

  private async loadTransfer(scope: IrrigationScope, id: string) {
    const transfer = await this.prisma.irrigationAllocationTransfer.findFirst({
      where: { id, hectare: this.scopeService.hectareWhere(scope) },
    });
    if (!transfer) throw new NotFoundException('Transfer not found');
    return transfer;
  }

  async approveTransfer(actor: RequestUser, id: string) {
    const scope = await this.scopeService.resolve(actor);
    const transfer = await this.loadTransfer(scope, id);
    if (!hasGrant(actor, TRANSFER_APPROVAL_RESOURCE, 'EDIT'))
      throw new ForbiddenException('Only an AMCOS Manager or Accountant can give the final sign-off on a plot transfer');
    if (transfer.status === 'AWAITING_RECIPIENT') throw new ConflictException('The receiving member has not accepted this transfer yet');
    if (transfer.status !== 'PENDING_APPROVAL') throw new ConflictException('Only pending transfers can be approved');
    if (transfer.requestedById && transfer.requestedById === actor.id)
      throw new ConflictException('A transfer must be approved by someone other than the person who requested it');
    try {
      return await this.prisma.$transaction((tx) => this.execute(tx, actor, id, actor.id));
    } catch (error) {
      rethrowIntegrity(error, { irrigation_hectare_allocations_one_open_per_hectare: OPEN_HECTARE_MSG, 'Unique constraint failed': OPEN_HECTARE_MSG });
    }
  }

  // ───────────────── recipient acceptance ─────────────────

  /** Best-effort SMS + app notification to the receiving member; a failed message never fails the transfer. */
  private async notifyRecipient(transferId: string) {
    try {
      const t = await this.prisma.irrigationAllocationTransfer.findUniqueOrThrow({
        where: { id: transferId },
        include: {
          hectare: { select: { code: true } },
          fromFarmer: { select: { firstName: true, lastName: true } },
          toFarmer: { select: { userId: true, user: { select: { phone: true } } } },
        },
      });
      const body = `${fullName(t.fromFarmer)} wants to transfer hectare ${t.hectare.code} to you. Open the MAYODE app to accept or decline.`;
      if (t.toFarmer.userId) {
        await this.notifications.create({
          userId: t.toFarmer.userId, type: 'irrigation.transfer.incoming', title: 'Plot transfer waiting for you', body, data: { transferId },
        });
      }
      if (t.toFarmer.user?.phone) await this.sms.send(t.toFarmer.user.phone, `MAYOData: ${body}`, 'irrigation_transfer');
    } catch {
      /* best-effort */
    }
  }

  /** Transfers waiting for the signed-in member to accept or decline. */
  async incomingTransfers(actor: RequestUser) {
    const rows = await this.prisma.irrigationAllocationTransfer.findMany({
      where: { status: 'AWAITING_RECIPIENT', toFarmer: { userId: actor.id } },
      orderBy: { createdAt: 'desc' },
      include: { hectare: { select: { id: true, code: true } }, fromFarmer: { select: farmerSelect } },
    });
    return rows.map((r) => ({
      id: r.id, hectare: r.hectare, from: { id: r.fromFarmer.id, name: fullName(r.fromFarmer), memberNumber: r.fromFarmer.controlNumber },
      reason: r.reason, effectiveDate: r.effectiveDate, createdAt: r.createdAt,
    }));
  }

  /** The receiving member accepts (moving the transfer on to approval, or completing it) or declines it. */
  async respondToTransfer(actor: RequestUser, id: string, accept: boolean, reason?: string) {
    const transfer = await this.prisma.irrigationAllocationTransfer.findUnique({
      where: { id },
      include: { toFarmer: { select: { userId: true } }, hectare: { include: { block: { include: { canal: { include: { scheme: true } } } } } } },
    });
    if (!transfer || !transfer.toFarmer.userId || transfer.toFarmer.userId !== actor.id) throw new NotFoundException('Transfer not found');
    if (transfer.status !== 'AWAITING_RECIPIENT') throw new ConflictException('This transfer is no longer waiting for your response');
    if (!accept && !reason?.trim()) throw new BadRequestException('Please give a reason for declining');
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT id FROM irrigation_hectares WHERE id = ${transfer.hectareId} FOR UPDATE`;
        const claimed = await tx.irrigationAllocationTransfer.updateMany({
          where: { id, status: 'AWAITING_RECIPIENT' },
          data: accept
            ? { status: 'PENDING_APPROVAL', recipientRespondedAt: new Date() }
            : { status: 'REJECTED', recipientRespondedAt: new Date(), rejectedReason: `Declined by the receiving member: ${reason!.trim()}`, processedById: actor.id, processedAt: new Date() },
        });
        if (claimed.count !== 1) throw new ConflictException('This transfer is no longer waiting for your response');
        await writeAudit(tx, actor, 'irrigation_hectare', transfer.hectareId, accept ? 'transfer-accepted' : 'transfer-declined',
          { status: 'AWAITING_RECIPIENT' }, { status: accept ? 'PENDING_APPROVAL' : 'REJECTED', ...(accept ? {} : { reason }) });
        return tx.irrigationAllocationTransfer.findUniqueOrThrow({ where: { id } });
      });
      await this.notifyRequesterOfResponse(id, accept);
      return result;
    } catch (error) {
      rethrowIntegrity(error, { irrigation_hectare_allocations_one_open_per_hectare: OPEN_HECTARE_MSG, 'Unique constraint failed': OPEN_HECTARE_MSG });
    }
  }

  private async notifyRequesterOfResponse(transferId: string, accepted: boolean) {
    try {
      const t = await this.prisma.irrigationAllocationTransfer.findUniqueOrThrow({
        where: { id: transferId },
        include: {
          hectare: { select: { code: true } },
          toFarmer: { select: { firstName: true, lastName: true } },
          fromFarmer: { select: { userId: true, user: { select: { phone: true } } } },
        },
      });
      const outcome = accepted ? 'accepted' : 'declined';
      const body = `${fullName(t.toFarmer)} has ${outcome} the transfer of hectare ${t.hectare.code}.`;
      if (t.requestedById) await this.notifications.create({ userId: t.requestedById, type: `irrigation.transfer.${outcome}`, title: `Plot transfer ${outcome}`, body, data: { transferId } });
      if (t.fromFarmer.user?.phone) await this.sms.send(t.fromFarmer.user.phone, `MAYOData: ${body}`, 'irrigation_transfer');
    } catch {
      /* best-effort */
    }
  }

  async closeTransfer(actor: RequestUser, id: string, status: 'REJECTED' | 'CANCELLED', reason: string) {
    const scope = await this.scopeService.resolve(actor);
    const transfer = await this.loadTransfer(scope, id);
    if (transfer.status !== 'PENDING_APPROVAL' && transfer.status !== 'AWAITING_RECIPIENT') throw new ConflictException('Only pending transfers can be closed');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.irrigationAllocationTransfer.update({
        where: { id }, data: { status, rejectedReason: reason.trim(), processedById: actor.id, processedAt: new Date() },
      });
      await writeAudit(tx, actor, 'irrigation_hectare', transfer.hectareId, `transfer-${status.toLowerCase()}`, { status: transfer.status }, { status, reason });
      return updated;
    });
  }

  async listTransfers(actor: RequestUser, q: Record<string, string>) {
    const scope = await this.scopeService.resolve(actor);
    const { page, pageSize, skip, take } = paging(q as any);
    const where: Prisma.IrrigationAllocationTransferWhereInput = {
      AND: [
        { hectare: this.scopeService.hectareWhere(scope) },
        q.status ? { status: q.status as any } : {},
        q.hectareId ? { hectareId: q.hectareId } : {},
        q.blockId ? { hectare: { blockId: q.blockId } } : {},
        q.canalId ? { hectare: { block: { canalId: q.canalId } } } : {},
        q.schemeId ? { hectare: { block: { canal: { schemeId: q.schemeId } } } } : {},
        q.farmerId ? { OR: [{ fromFarmerId: q.farmerId }, { toFarmerId: q.farmerId }] } : {},
        q.from || q.to ? { effectiveDate: { ...(q.from ? { gte: toDate(q.from) } : {}), ...(q.to ? { lte: toDate(q.to) } : {}) } } : {},
        q.q ? { OR: [
          { fromFarmer: { OR: [{ firstName: { contains: q.q, mode: 'insensitive' } }, { lastName: { contains: q.q, mode: 'insensitive' } }, { controlNumber: { contains: q.q, mode: 'insensitive' } }] } },
          { toFarmer: { OR: [{ firstName: { contains: q.q, mode: 'insensitive' } }, { lastName: { contains: q.q, mode: 'insensitive' } }, { controlNumber: { contains: q.q, mode: 'insensitive' } }] } },
        ] } : {},
      ],
    };
    const [total, rows] = await Promise.all([
      this.prisma.irrigationAllocationTransfer.count({ where }),
      this.prisma.irrigationAllocationTransfer.findMany({
        where, skip, take, orderBy: { createdAt: 'desc' },
        include: {
          fromFarmer: { select: farmerSelect }, toFarmer: { select: farmerSelect },
          hectare: { select: { id: true, code: true, block: { select: { id: true, code: true, canal: { select: { id: true, code: true } } } } } },
          documents: { where: { archivedAt: null }, select: { id: true, title: true, fileUrl: true, fileName: true } },
        },
      }),
    ]);
    const names = await userNames(this.prisma, rows.flatMap((r) => [r.requestedById, r.approvedById, r.processedById]));
    return paged(rows.map((r) => ({
      id: r.id, status: r.status, hectare: r.hectare,
      previousFarmer: { id: r.fromFarmer.id, name: fullName(r.fromFarmer), memberNumber: r.fromFarmer.controlNumber },
      newFarmer: { id: r.toFarmer.id, name: fullName(r.toFarmer), memberNumber: r.toFarmer.controlNumber },
      transferDate: r.transferDate, effectiveDate: r.effectiveDate, reason: r.reason, rejectedReason: r.rejectedReason,
      requestedBy: names.get(r.requestedById ?? '') ?? null, approvedBy: names.get(r.approvedById ?? '') ?? null,
      processedBy: names.get(r.processedById ?? '') ?? null, processedAt: r.processedAt, documents: r.documents,
    })), total, page, pageSize);
  }

  // ───────────────────────── members ─────────────────────────

  /** Typeahead over the existing member registry of the scheme's AMCOS. */
  async searchMembers(actor: RequestUser, q: { schemeId?: string; q?: string }) {
    const scope = await this.scopeService.resolve(actor);
    const scheme = q.schemeId
      ? await this.scopeService.assertScheme(scope, q.schemeId)
      : null;
    const text = (q.q ?? '').trim();
    if (text.length < 2) return [];
    const mamcosId = scheme?.mamcosId ?? (scope.tenant.mamcosId ?? undefined);
    const farmers = await this.prisma.farmer.findMany({
      where: {
        isBlacklisted: false,
        ...(mamcosId ? { mamcosId } : {}),
        OR: [
          { firstName: { contains: text, mode: 'insensitive' } },
          { lastName: { contains: text, mode: 'insensitive' } },
          { controlNumber: { contains: text, mode: 'insensitive' } },
          { idNumber: { contains: text, mode: 'insensitive' } },
          { user: { phone: { contains: text } } },
        ],
      },
      select: { ...farmerSelect, village: true, user: { select: { phone: true } } },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: 20,
    });
    const held = scheme
      ? await this.prisma.irrigationHectareAllocation.groupBy({
          by: ['farmerId'], _count: { _all: true },
          where: { farmerId: { in: farmers.map((f) => f.id) }, status: { in: [...OPEN] }, hectare: { block: { canal: { schemeId: scheme.id } } } },
        })
      : [];
    const heldBy = new Map(held.map((h) => [h.farmerId, h._count._all]));
    return farmers.map((f) => ({
      id: f.id, name: fullName(f), memberNumber: f.controlNumber, village: f.village, phone: f.user?.phone ?? null,
      hectaresHeld: heldBy.get(f.id) ?? 0,
    }));
  }

  // ───────────────────────── farmer / hectare detail ─────────────────────────

  async farmerDetail(actor: RequestUser, farmerId: string) {
    const scope = await this.scopeService.resolve(actor);
    const farmer = await this.prisma.farmer.findUnique({
      where: { id: farmerId },
      include: {
        user: { select: { phone: true, email: true } }, mamcos: { select: { id: true, name: true } },
        localVerifications: { where: { revokedAt: null }, select: { id: true } },
      },
    });
    if (!farmer) throw new NotFoundException('Member not found');
    const hectareScope = { hectare: this.scopeService.hectareWhere(scope) };
    const [allocations, transfers, leaderships, guided] = await Promise.all([
      this.prisma.irrigationHectareAllocation.findMany({
        where: { farmerId, ...hectareScope }, orderBy: [{ status: 'asc' }, { allocatedOn: 'desc' }],
        include: { guardians: { where: { endedOn: null }, include: { guardian: { select: farmerSelect } } }, hectare: { include: { block: { include: { canal: { include: { scheme: { select: { id: true, name: true, code: true } } } } } } } } },
      }),
      this.prisma.irrigationAllocationTransfer.findMany({
        where: { OR: [{ fromFarmerId: farmerId }, { toFarmerId: farmerId }], ...hectareScope }, orderBy: { createdAt: 'desc' },
        include: { hectare: { select: { id: true, code: true } }, fromFarmer: { select: farmerSelect }, toFarmer: { select: farmerSelect } },
      }),
      this.prisma.irrigationLeadership.findMany({
        where: { farmerId, canal: this.scopeService.canalWhere(scope) }, orderBy: { appointedOn: 'desc' },
        include: { canal: { select: { id: true, code: true } }, block: { select: { id: true, code: true } } },
      }),
      // hectares this member really owns although they are registered in a relative's name
      this.prisma.irrigationHectareGuardian.findMany({
        where: { guardianId: farmerId, allocation: hectareScope }, orderBy: [{ startedOn: 'desc' }],
        include: { allocation: { include: { farmer: { select: farmerSelect }, hectare: { select: { id: true, code: true, areaHectares: true, block: { select: { id: true, code: true, canal: { select: { id: true, code: true } } } } } } } } },
      }),
    ]);
    if (scope.restricted && !allocations.length && !transfers.length && !leaderships.length && !guided.length)
      throw new NotFoundException('Member not found');
    const [farms, cycles] = await Promise.all([
      this.prisma.farm.findMany({
        where: { farmerId },
        select: { id: true, farmCode: true, name: true, canal: true, blockNumber: true, plotNumber: true, socialHectares: true },
        take: 20,
      }),
      this.prisma.cropCycle.findMany({
        where: { farmerId }, orderBy: { createdAt: 'desc' }, take: 10,
        select: { id: true, season: true, riceVariety: true, status: true, plantingDate: true, farm: { select: { id: true, name: true, farmCode: true } } },
      }),
    ]);
    const names = await userNames(this.prisma, allocations.flatMap((a) => [a.requestedById, a.approvedById]));
    const rows = allocations.map((a) => ({
      id: a.id, status: a.status, allocatedOn: a.allocatedOn, endedOn: a.endedOn, endReason: a.endReason,
      hectare: { id: a.hectare.id, code: a.hectare.code, hectareNumber: a.hectare.hectareNumber, areaHectares: num(a.hectare.areaHectares) },
      block: { id: a.hectare.block.id, code: a.hectare.block.code },
      canal: { id: a.hectare.block.canal.id, code: a.hectare.block.canal.code },
      scheme: a.hectare.block.canal.scheme,
      guardian: a.guardians[0] ? { id: a.guardians[0].guardian.id, name: fullName(a.guardians[0].guardian), memberNumber: a.guardians[0].guardian.controlNumber } : null,
      requestedBy: names.get(a.requestedById ?? '') ?? null, approvedBy: names.get(a.approvedById ?? '') ?? null,
    }));
    const guidedRows = guided.map((g) => ({
      id: g.id, allocationId: g.allocationId, startedOn: g.startedOn, endedOn: g.endedOn, endReason: g.endReason,
      holder: { id: g.allocation.farmer.id, name: fullName(g.allocation.farmer), memberNumber: g.allocation.farmer.controlNumber },
      hectare: { id: g.allocation.hectare.id, code: g.allocation.hectare.code, areaHectares: num(g.allocation.hectare.areaHectares) },
      block: g.allocation.hectare.block, canal: g.allocation.hectare.block.canal,
    }));
    return {
      guided: { current: guidedRows.filter((g) => !g.endedOn), history: guidedRows.filter((g) => g.endedOn) },
      farmer: {
        id: farmer.id, name: fullName(farmer), memberNumber: farmer.controlNumber, phone: farmer.user?.phone ?? null,
        email: farmer.user?.email ?? farmer.email ?? null, gender: farmer.gender, village: farmer.village, ward: farmer.ward,
        district: farmer.district, region: farmer.region, mamcos: farmer.mamcos, verificationStatus: farmer.verificationStatus,
        memberSince: farmer.membershipDate,
        ...(() => {
          const t = deriveRegistrationTier({
            idType: farmer.idType, heldThroughGuardian: rows.some((r) => r.status === 'ACTIVE' && r.guardian),
            hasLocalVerification: farmer.localVerifications.length > 0,
          });
          return { registrationTier: t.tier, identifierUsed: t.identifierUsed };
        })(),
      },
      current: rows.filter((r) => r.status === 'ACTIVE'),
      pending: rows.filter((r) => r.status === 'PENDING_APPROVAL'),
      history: rows.filter((r) => r.status === 'ENDED' || r.status === 'REJECTED'),
      totalActiveHectares: rows.filter((r) => r.status === 'ACTIVE').reduce((sum, r) => sum + r.hectare.areaHectares, 0),
      transfers: transfers.map((t) => ({
        id: t.id, status: t.status, hectare: t.hectare, effectiveDate: t.effectiveDate, reason: t.reason,
        direction: t.fromFarmerId === farmerId ? 'OUT' : 'IN',
        otherParty: fullName(t.fromFarmerId === farmerId ? t.toFarmer : t.fromFarmer),
      })),
      leadership: leaderships.map((l) => ({
        id: l.id, position: l.position, status: l.status, canal: l.canal, block: l.block, termStart: l.termStart, termEnd: l.termEnd,
      })),
      farms,
      cropCycles: cycles,
    };
  }
}
