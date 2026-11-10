import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { hasGrant } from '../auth/role-access';
import { IrrigationScopeService } from '../irrigation/irrigation-scope.service';
import { writeAudit } from '../irrigation/irrigation-audit';
import { DecideRateDto, OpenHarvestDto, ProposeRateDto } from './dto/harvest-fees.dto';

export const HARVEST_APPROVAL_RESOURCE = 'harvest_fee_approval';
const num = (v: unknown) => (v == null ? 0 : Number(v));
const cents = (n: number) => Math.round(n * 100) / 100;
const day = (value: string | Date) => new Date(`${(typeof value === 'string' ? value : value.toISOString()).slice(0, 10)}T00:00:00.000Z`);
const typeName = (season: string, blockCode: string) => `Harvest fee ${season} · ${blockCode}`;

export type ClearanceStatus = 'GREEN' | 'YELLOW' | 'RED' | 'NOT_CHARGED' | 'UNALLOCATED' | 'HELD';

/** What decides a hectare's colour. Clearance is granted only for GREEN. */
export function clearanceFor(p: { holder: boolean; charged: boolean; balance: number; activeLoan: boolean; held?: boolean }): ClearanceStatus {
  if (!p.holder) return 'UNALLOCATED';
  if (p.held) return 'HELD';
  if (!p.charged) return 'NOT_CHARGED';
  if (p.balance > 0) return 'RED';
  return p.activeLoan ? 'YELLOW' : 'GREEN';
}

type RateRow = { id: string; scope: string; canalId: string | null; blockId: string | null; ratePerHectare: Prisma.Decimal | number; status: string };

/** The rate that applies to a block: its own, else its canal's, else the AMCOS-wide one. Only approved (ACTIVE) rates count. */
export function effectiveRate(rates: RateRow[], block: { id: string; canalId: string }): { rate: number; scope: string; id: string } | null {
  const active = rates.filter((r) => r.status === 'ACTIVE');
  const pick = active.find((r) => r.scope === 'BLOCK' && r.blockId === block.id)
    ?? active.find((r) => r.scope === 'CANAL' && r.canalId === block.canalId)
    ?? active.find((r) => r.scope === 'AMCOS');
  return pick ? { rate: num(pick.ratePerHectare), scope: pick.scope, id: pick.id } : null;
}

/** What each holder of hectares in a block owes: hectares held in that block x rate, to the cent. */
export function planFees(allocations: { farmerId: string; areaHectares: unknown }[], rate: number) {
  const byFarmer = new Map<string, number>();
  for (const a of allocations) byFarmer.set(a.farmerId, cents((byFarmer.get(a.farmerId) ?? 0) + num(a.areaHectares)));
  return [...byFarmer].map(([farmerId, hectares]) => ({ farmerId, hectares, amount: cents(hectares * rate) }));
}

const balanceOf = (d: { amount: unknown; waivedAmount: unknown; payments: { amount: unknown }[] }) =>
  cents(num(d.amount) - num(d.waivedAmount) - d.payments.reduce((n, p) => n + num(p.amount), 0));

/** Harvest fees: per-hectare rates (approved by someone other than the proposer), the fee charged to each holder, and the block clearance list. */
@Injectable()
export class HarvestFeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly scopeService: IrrigationScopeService,
  ) {}

  private tenant(actor: RequestUser, requested?: string): string {
    const own = this.ownership.resolveTenantMamcosId(actor);
    const id = own ?? requested ?? null;
    if (!id) throw new BadRequestException('Choose a cooperative');
    if (own && requested && requested !== own) throw new ForbiddenException('You can only work with your own cooperative');
    return id;
  }

  /** The canals, blocks and seasons the harvest screens offer, limited to what this person may see. Needs no irrigation permission, so a cashier can pick a block. */
  async structure(actor: RequestUser, mamcosIdParam?: string) {
    const scope = await this.scopeService.resolve(actor);
    const mamcosId = this.ownership.resolveTenantMamcosId(actor) ?? mamcosIdParam ?? null;
    const [canals, blocks, seasons] = await Promise.all([
      this.prisma.irrigationCanal.findMany({ where: { ...this.scopeService.canalWhere(scope), archivedAt: null }, orderBy: { canalNumber: 'asc' }, select: { id: true, code: true, name: true } }),
      this.prisma.irrigationBlock.findMany({ where: { ...this.scopeService.blockWhere(scope), archivedAt: null }, orderBy: [{ canal: { canalNumber: 'asc' } }, { blockNumber: 'asc' }], select: { id: true, code: true, name: true, canalId: true } }),
      this.prisma.farmingSeason.findMany({ where: mamcosId ? { OR: [{ mamcosId }, { mamcosId: null }] } : {}, orderBy: { startDate: 'desc' }, take: 20, select: { id: true, name: true, status: true } }),
    ]);
    return { canals, blocks, seasons };
  }

  // ── Rates ──────────────────────────────────────────────────────────────

  async listRates(actor: RequestUser, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const rows = await this.prisma.harvestFeeRate.findMany({
      where: { mamcosId },
      include: { canal: { select: { code: true, name: true } }, block: { select: { code: true } } },
      orderBy: { createdAt: 'desc' }, take: 200,
    });
    const ids = [...new Set(rows.flatMap((r) => [r.requestedById, r.decidedById]).filter(Boolean) as string[])];
    const users = ids.length
      ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true, phone: true } })
      : [];
    const who = (id?: string | null) => { const u = users.find((x) => x.id === id); return u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.phone : null; };
    return rows.map((r) => ({
      id: r.id, scope: r.scope, status: r.status, ratePerHectare: num(r.ratePerHectare), note: r.note, decisionNote: r.decisionNote,
      target: r.scope === 'BLOCK' ? `Block ${r.block?.code}` : r.scope === 'CANAL' ? `Canal ${r.canal?.code}` : 'Whole AMCOS',
      canalId: r.canalId, blockId: r.blockId,
      requestedBy: who(r.requestedById), requestedById: r.requestedById, decidedBy: who(r.decidedById), decidedAt: r.decidedAt, createdAt: r.createdAt,
    }));
  }

  async proposeRate(dto: ProposeRateDto, actor: RequestUser, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    if (dto.scope === 'CANAL' && !dto.canalId) throw new BadRequestException('Choose the canal');
    if (dto.scope === 'BLOCK' && !dto.blockId) throw new BadRequestException('Choose the block');
    if (dto.scope === 'AMCOS' && (dto.canalId || dto.blockId)) throw new BadRequestException('A whole-AMCOS rate has no canal or block');
    if (dto.scope === 'CANAL') {
      const canal = await this.prisma.irrigationCanal.findFirst({ where: { id: dto.canalId, scheme: { mamcosId } }, select: { id: true } });
      if (!canal) throw new NotFoundException('Canal not found');
    }
    if (dto.scope === 'BLOCK') {
      const block = await this.prisma.irrigationBlock.findFirst({ where: { id: dto.blockId, canal: { scheme: { mamcosId } } }, select: { id: true } });
      if (!block) throw new NotFoundException('Block not found');
    }
    const target = { mamcosId, scope: dto.scope, canalId: dto.scope === 'CANAL' ? dto.canalId : null, blockId: dto.scope === 'BLOCK' ? dto.blockId : null };
    if (await this.prisma.harvestFeeRate.findFirst({ where: { ...target, status: 'PENDING_APPROVAL' }, select: { id: true } })) {
      throw new ConflictException('A rate for this is already waiting for approval');
    }
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.harvestFeeRate.create({ data: { ...target, ratePerHectare: dto.ratePerHectare, note: dto.note?.trim() || null, requestedById: actor.id } });
      await writeAudit(tx, actor, 'harvest_fee_rate', row.id, 'propose', null, { scope: row.scope, ratePerHectare: dto.ratePerHectare });
      return { id: row.id, status: row.status };
    });
  }

  /** Approve or reject. Needs the approval permission and must be someone other than the proposer. Approving replaces the active rate of the same scope. */
  async decideRate(id: string, dto: DecideRateDto, actor: RequestUser, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    if (!hasGrant(actor, HARVEST_APPROVAL_RESOURCE, 'EDIT')) throw new ForbiddenException('Only an AMCOS Manager can approve harvest fee rates');
    const rate = await this.prisma.harvestFeeRate.findFirst({ where: { id, mamcosId } });
    if (!rate) throw new NotFoundException('Rate not found');
    if (rate.status !== 'PENDING_APPROVAL') throw new ConflictException('Only a rate waiting for approval can be decided');
    if (rate.requestedById === actor.id) throw new ConflictException('A rate must be approved by someone other than the person who proposed it');
    return this.prisma.$transaction(async (tx) => {
      if (dto.approve) {
        await tx.harvestFeeRate.updateMany({
          where: { mamcosId, scope: rate.scope, canalId: rate.canalId, blockId: rate.blockId, status: 'ACTIVE' },
          data: { status: 'SUPERSEDED' },
        });
      }
      const status = dto.approve ? 'ACTIVE' : 'REJECTED';
      await tx.harvestFeeRate.update({ where: { id }, data: { status, decidedById: actor.id, decidedAt: new Date(), decisionNote: dto.note?.trim() || null } });
      await writeAudit(tx, actor, 'harvest_fee_rate', id, dto.approve ? 'approve' : 'reject', { status: rate.status }, { status });
      return { id, status };
    });
  }

  /** The rate that applies to a block right now, or null when none has been approved. */
  async rateForBlock(mamcosId: string, block: { id: string; canalId: string }) {
    const rates = await this.prisma.harvestFeeRate.findMany({ where: { mamcosId, status: 'ACTIVE' } });
    return effectiveRate(rates, block);
  }

  // ── Opening a harvest: the fee for every holder in a block ─────────────

  async openHarvest(dto: OpenHarvestDto, actor: RequestUser, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const scope = await this.scopeService.resolve(actor);
    this.scopeService.assertUnrestricted(scope, 'open a harvest');
    const block = await this.scopeService.assertBlock(scope, dto.blockId);
    if (block.canal.scheme.mamcosId !== mamcosId) throw new NotFoundException('Block not found');
    const season = await this.prisma.farmingSeason.findFirst({ where: { id: dto.seasonId, OR: [{ mamcosId }, { mamcosId: null }] }, select: { id: true, name: true } });
    if (!season) throw new NotFoundException('Season not found');
    const applicable = await this.rateForBlock(mamcosId, { id: block.id, canalId: block.canalId });
    if (!applicable) throw new BadRequestException('No harvest fee rate has been approved yet. Propose one and ask a Manager to approve it.');

    const allocations = await this.prisma.irrigationHectareAllocation.findMany({
      where: { status: 'ACTIVE', hectare: { blockId: block.id, isActive: true } },
      select: { farmerId: true, hectare: { select: { areaHectares: true } } },
    });
    const name = typeName(season.name, block.code);
    const existing = await this.prisma.farmerDueType.findUnique({ where: { mamcosId_name: { mamcosId, name } }, select: { id: true, rate: true } });
    // A harvest that is already open keeps the rate it was opened with, so every farmer of the block is charged the same.
    const rate = existing ? num(existing.rate) : applicable.rate;
    const plan = planFees(allocations.map((a) => ({ farmerId: a.farmerId, areaHectares: a.hectare.areaHectares })), rate);
    const already = existing
      ? new Set((await this.prisma.farmerDue.findMany({ where: { typeId: existing.id, farmerId: { in: plan.map((p) => p.farmerId) } }, select: { farmerId: true } })).map((d) => d.farmerId))
      : new Set<string>();
    const fresh = plan.filter((p) => !already.has(p.farmerId));
    const summary = {
      block: block.code, season: season.name, ratePerHectare: rate, rateScope: applicable.scope, alreadyOpen: !!existing,
      farmers: plan.length, newCharges: fresh.length, alreadyCharged: plan.length - fresh.length,
      totalNew: cents(fresh.reduce((n, p) => n + p.amount, 0)),
    };
    if (dto.dryRun) return { ...summary, dryRun: true };
    if (!plan.length) throw new BadRequestException('Nobody holds a hectare in this block yet');

    return this.prisma.$transaction(async (tx) => {
      const type = existing ?? await tx.farmerDueType.create({
        data: { mamcosId, name, category: 'HARVEST_FEE', basis: 'PER_HECTARE', rate, season: season.name, dueDate: dto.dueDate ? day(dto.dueDate) : null, notes: `Opened for block ${block.code}`, createdById: actor.id },
        select: { id: true, rate: true },
      });
      const issuedOn = day(new Date());
      const created = await tx.farmerDue.createMany({
        data: fresh.map((p) => ({
          mamcosId, typeId: type.id, farmerId: p.farmerId, category: 'HARVEST_FEE' as const, description: name,
          hectares: p.hectares, amount: p.amount, issuedOn, dueDate: dto.dueDate ? day(dto.dueDate) : null, createdById: actor.id,
        })),
        skipDuplicates: true,
      });
      await writeAudit(tx, actor, 'harvest_fee', type.id, existing ? 'extend' : 'open', null, { block: block.code, season: season.name, rate, charged: created.count });
      return { ...summary, dryRun: false, typeId: type.id, created: created.count };
    });
  }

  // ── Clearance ──────────────────────────────────────────────────────────

  private async harvestsOf(mamcosId: string, blockCode: string) {
    return this.prisma.farmerDueType.findMany({
      where: { mamcosId, category: 'HARVEST_FEE', name: { endsWith: ` · ${blockCode}` } },
      select: { id: true, season: true, rate: true, createdAt: true }, orderBy: { createdAt: 'desc' },
    });
  }

  /** Every hectare of a block with its colour: the list a Block Chairman checks before a combine harvester starts. */
  async clearance(blockId: string, actor: RequestUser, typeId?: string) {
    const scope = await this.scopeService.resolve(actor);
    const block = await this.scopeService.assertBlock(scope, blockId);
    return this.clearanceOfBlock(block, typeId);
  }

  /** The same list for a block already loaded and checked by the caller. */
  async clearanceOfBlock(block: { id: string; code: string; name: string | null; canal: { scheme: { mamcosId: string | null } } }, typeId?: string) {
    const blockId = block.id;
    const mamcosId = block.canal.scheme.mamcosId;
    if (!mamcosId) throw new NotFoundException('Block not found');
    const harvests = await this.harvestsOf(mamcosId, block.code);
    const harvest = typeId ? harvests.find((h) => h.id === typeId) : harvests[0];
    if (typeId && !harvest) throw new NotFoundException('Harvest not found');

    const hectares = await this.prisma.irrigationHectare.findMany({
      where: { blockId, isActive: true },
      orderBy: { hectareNumber: 'asc' },
      select: {
        id: true, code: true, hectareNumber: true, areaHectares: true,
        allocations: {
          where: { status: 'ACTIVE' }, take: 1,
          select: { farmer: { select: { id: true, firstName: true, lastName: true, controlNumber: true } }, guardians: { where: { endedOn: null }, take: 1, select: { guardian: { select: { id: true, firstName: true, lastName: true } } } } },
        },
      },
    });
    const farmerIds = [...new Set(hectares.map((h) => h.allocations[0]?.farmer.id).filter(Boolean) as string[])];
    const dues = harvest && farmerIds.length
      ? await this.prisma.farmerDue.findMany({
        where: { typeId: harvest.id, farmerId: { in: farmerIds }, status: 'ACTIVE' },
        select: { farmerId: true, amount: true, waivedAmount: true, payments: { where: { voidedAt: null }, select: { amount: true } } },
      }) : [];
    const loans = farmerIds.length
      ? await this.prisma.loanRecord.groupBy({ by: ['farmerId'], where: { farmerId: { in: farmerIds }, isActive: true, amountOwed: { gt: 0 } }, _count: true })
      : [];
    const passes = harvest
      ? await this.prisma.harvestPass.findMany({ where: { typeId: harvest.id, blockId }, select: { hectareId: true, code: true, status: true } })
      : [];
    const passOf = new Map(passes.map((p) => [p.hectareId, p]));
    const dueOf = new Map(dues.map((d) => [d.farmerId, d]));
    const loanSet = new Set(loans.map((l) => l.farmerId));
    const rate = harvest ? num(harvest.rate) : 0;
    const name = (f?: { firstName: string; lastName: string } | null) => (f ? `${f.firstName} ${f.lastName}`.trim() : null);

    const rows = hectares.map((h) => {
      const alloc = h.allocations[0];
      const farmer = alloc?.farmer;
      const due = farmer ? dueOf.get(farmer.id) : undefined;
      const balance = due ? balanceOf(due) : 0;
      const pass = passOf.get(h.id) ?? null;
      const status = clearanceFor({ holder: !!farmer, charged: !!due, balance, activeLoan: !!farmer && loanSet.has(farmer.id), held: pass?.status === 'VOID' });
      const g = alloc?.guardians[0]?.guardian;
      return {
        hectareId: h.id, code: h.code, areaHectares: num(h.areaHectares),
        farmer: farmer ? { id: farmer.id, name: name(farmer), memberNumber: farmer.controlNumber } : null,
        guardian: g ? { id: g.id, name: name(g) } : null,
        fee: cents(num(h.areaHectares) * rate), farmerBalance: balance, hasLoan: !!farmer && loanSet.has(farmer.id),
        status, cleared: status === 'GREEN', pass: pass ? { code: pass.code, status: pass.status } : null, harvested: pass?.status === 'USED',
      };
    });
    const count = (s: ClearanceStatus) => rows.filter((r) => r.status === s).length;
    return {
      block: { id: block.id, code: block.code, name: block.name },
      harvest: harvest ? { typeId: harvest.id, season: harvest.season, ratePerHectare: rate } : null,
      harvests: harvests.map((h) => ({ typeId: h.id, season: h.season })),
      summary: { total: rows.length, green: count('GREEN'), yellow: count('YELLOW'), red: count('RED'), notCharged: count('NOT_CHARGED'), unallocated: count('UNALLOCATED'), held: count('HELD'), harvested: rows.filter((r) => r.harvested).length },
      hectares: rows,
    };
  }

  /** Collection per block of a canal, for the canal chairman and the accountant. */
  async canalSummary(canalId: string, actor: RequestUser) {
    const scope = await this.scopeService.resolve(actor);
    const canal = await this.scopeService.assertCanal(scope, canalId);
    const mamcosId = canal.scheme.mamcosId;
    if (!mamcosId) throw new NotFoundException('Canal not found');
    const blocks = await this.prisma.irrigationBlock.findMany({ where: { canalId, ...this.scopeService.blockWhere(scope) }, orderBy: { blockNumber: 'asc' }, select: { id: true, code: true } });
    const out: { blockId: string; code: string; season: string | null; farmers: number; cleared: number; charged: number; paid: number; outstanding: number }[] = [];
    for (const b of blocks) {
      const [latest] = await this.harvestsOf(mamcosId, b.code);
      if (!latest) { out.push({ blockId: b.id, code: b.code, season: null, farmers: 0, cleared: 0, charged: 0, paid: 0, outstanding: 0 }); continue; }
      const dues = await this.prisma.farmerDue.findMany({
        where: { typeId: latest.id, status: 'ACTIVE' },
        select: { amount: true, waivedAmount: true, payments: { where: { voidedAt: null }, select: { amount: true } } },
      });
      const charged = cents(dues.reduce((n, d) => n + num(d.amount) - num(d.waivedAmount), 0));
      const outstanding = cents(dues.reduce((n, d) => n + Math.max(0, balanceOf(d)), 0));
      out.push({ blockId: b.id, code: b.code, season: latest.season, farmers: dues.length, cleared: dues.filter((d) => balanceOf(d) <= 0).length, charged, paid: cents(charged - outstanding), outstanding });
    }
    const sum = (k: 'charged' | 'paid' | 'outstanding') => cents(out.reduce((n, r) => n + r[k], 0));
    return { canal: { id: canal.id, code: canal.code, name: canal.name }, blocks: out, totals: { charged: sum('charged'), paid: sum('paid'), outstanding: sum('outstanding') } };
  }
}
