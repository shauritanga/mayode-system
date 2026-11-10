import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { HarvestIncidentStatus, Prisma } from '@prisma/client';
import { randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { hasGrant } from '../auth/role-access';
import { SmsService } from '../messaging/sms.service';
import { NotificationsService } from '../notifications/notifications.service';
import { localDate } from '../accounting/tax';
import { IrrigationScopeService } from '../irrigation/irrigation-scope.service';
import { writeAudit } from '../irrigation/irrigation-audit';
import { farmIdDisplay } from '../irrigation/irrigation-codes';
import { HarvestFeesService } from './harvest-fees.service';
import { arrivalForLeader, arrivalForOperator, incidentForCanalLeader, passesForWatcher, passForFarmer, toLang, type Msg } from './harvest-gate.messages';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
const newCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
const num = (v: unknown) => (v == null ? 0 : Number(v));
const cents = (n: number) => Math.round(n * 100) / 100;
const dayOf = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const balanceOf = (d: { amount: unknown; waivedAmount: unknown; payments: { amount: unknown }[] }) =>
  cents(num(d.amount) - num(d.waivedAmount) - d.payments.reduce((n, p) => n + num(p.amount), 0));
const person = { id: true, firstName: true, lastName: true, controlNumber: true, user: { select: { id: true, phone: true, language: true } } } as const;
const fullName = (f: { firstName: string; lastName: string }) => `${f.firstName} ${f.lastName}`.trim();

export type GateReason = 'NOT_CHARGED' | 'UNPAID' | 'LOAN' | 'HELD' | 'USED' | 'NO_HOLDER';
const REASON_TEXT: Record<GateReason, string> = {
  NOT_CHARGED: 'the harvest fee has not been charged yet', UNPAID: 'the harvest fee is not fully paid', LOAN: 'the farmer has an unpaid loan',
  HELD: 'the AMCOS has put this plot on hold', USED: 'this pass was already used', NO_HOLDER: 'nobody holds this hectare',
};

/**
 * The harvest gate: a digital pass for every plot whose fee is paid, the combine harvester arrival log, the block leader's
 * sign-off, incidents when someone tries to harvest an uncleared plot, and the Accountant's daily reconciliation of what was collected.
 */
@Injectable()
export class HarvestGateService {
  private readonly logger = new Logger(HarvestGateService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly scopeService: IrrigationScopeService,
    private readonly fees: HarvestFeesService,
    private readonly sms: SmsService,
    private readonly notifications: NotificationsService,
  ) {}

  private tenant(actor: RequestUser, requested?: string): string {
    const own = this.ownership.resolveTenantMamcosId(actor);
    const id = own ?? requested ?? null;
    if (!id) throw new BadRequestException('Choose a cooperative');
    if (own && requested && requested !== own) throw new ForbiddenException('You can only work with your own cooperative');
    return id;
  }

  private async send(phone: string | null | undefined, userId: string | null | undefined, msg: Msg) {
    try {
      if (userId) await this.notifications.create({ userId, type: 'harvest_gate', title: msg.title, body: msg.body }).catch(() => undefined);
      if (phone) await this.sms.send(phone, msg.body, 'harvest_gate');
    } catch (e) { this.logger.warn(`Could not send a harvest message: ${e instanceof Error ? e.message : e}`); }
  }

  /** The block leader and the canal leader of a block (current terms only). */
  private async leadersOfBlock(block: { id: string; canalId: string }) {
    const startOfToday = dayOf(localDate(new Date()));
    const rows = await this.prisma.irrigationLeadership.findMany({
      where: {
        status: 'ACTIVE', AND: [{ OR: [{ termEnd: null }, { termEnd: { gte: startOfToday } }] },
          { OR: [{ position: 'BLOCK_LEADER', blockId: block.id }, { position: 'CANAL_LEADER', canalId: block.canalId }] }],
      },
      select: { position: true, farmer: { select: { id: true, user: { select: { id: true, phone: true, language: true } } } } },
    });
    return rows.map((r) => ({ position: r.position, farmerId: r.farmer.id, user: r.farmer.user }));
  }

  /** The block a harvest belongs to: the fee type is named "Harvest fee <season> · <block code>". */
  private async blockOfType(mamcosId: string, name: string) {
    const code = name.split(' · ').pop()?.trim();
    if (!code) return null;
    return this.prisma.irrigationBlock.findFirst({ where: { code, canal: { scheme: { mamcosId } } }, select: { id: true, code: true, canalId: true } });
  }

  private async loanFarmers(farmerIds: string[]) {
    if (!farmerIds.length) return new Set<string>();
    const rows = await this.prisma.loanRecord.groupBy({ by: ['farmerId'], where: { farmerId: { in: farmerIds }, isActive: true, amountOwed: { gt: 0 } }, _count: true });
    return new Set(rows.map((r) => r.farmerId));
  }

  // ───────────────────────── passes ─────────────────────────

  /**
   * Gives every hectare whose holder has paid this harvest's fee (and owes no loan) its pass, and texts the farmer, the block and
   * canal leaders and any combine operator on site. Safe to run any number of times.
   */
  async issueForType(typeId: string, onlyFarmerId?: string): Promise<number> {
    const type = await this.prisma.farmerDueType.findUnique({ where: { id: typeId }, select: { id: true, mamcosId: true, name: true, category: true } });
    if (!type || type.category !== 'HARVEST_FEE') return 0;
    const block = await this.blockOfType(type.mamcosId, type.name);
    if (!block) return 0;
    const dues = await this.prisma.farmerDue.findMany({
      where: { typeId, status: 'ACTIVE', ...(onlyFarmerId ? { farmerId: onlyFarmerId } : {}) },
      select: { farmerId: true, amount: true, waivedAmount: true, payments: { where: { voidedAt: null }, select: { amount: true } } },
    });
    const paid = dues.filter((d) => balanceOf(d) <= 0).map((d) => d.farmerId);
    if (!paid.length) return 0;
    const loans = await this.loanFarmers(paid);
    const eligible = paid.filter((f) => !loans.has(f));
    if (!eligible.length) return 0;
    const holdings = await this.prisma.irrigationHectareAllocation.findMany({
      where: { status: 'ACTIVE', farmerId: { in: eligible }, hectare: { blockId: block.id, isActive: true } },
      select: { farmerId: true, hectare: { select: { id: true, code: true } } },
    });
    const have = new Set((await this.prisma.harvestPass.findMany({ where: { typeId, hectareId: { in: holdings.map((h) => h.hectare.id) } }, select: { hectareId: true } })).map((p) => p.hectareId));
    const made: { farmerId: string; plot: string; code: string }[] = [];
    for (const h of holdings.filter((x) => !have.has(x.hectare.id))) {
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const row = await this.prisma.harvestPass.create({ data: { mamcosId: type.mamcosId, typeId, blockId: block.id, hectareId: h.hectare.id, farmerId: h.farmerId, code: newCode() } });
          made.push({ farmerId: h.farmerId, plot: farmIdDisplay(h.hectare.code), code: row.code });
          break;
        } catch (e: any) {
          if (e?.code !== 'P2002') throw e;
          if (await this.prisma.harvestPass.findUnique({ where: { typeId_hectareId: { typeId, hectareId: h.hectare.id } } })) break; // another run issued it
        }
      }
    }
    if (made.length) await this.notifyIssued(type.mamcosId, block, made);
    return made.length;
  }

  private async notifyIssued(mamcosId: string, block: { id: string; canalId: string; code: string }, made: { farmerId: string; plot: string; code: string }[]) {
    const farmers = await this.prisma.farmer.findMany({ where: { id: { in: [...new Set(made.map((m) => m.farmerId))] } }, select: person });
    const byId = new Map(farmers.map((f) => [f.id, f]));
    for (const m of made) {
      const f = byId.get(m.farmerId);
      await this.send(f?.user?.phone, f?.user?.id, passForFarmer(toLang(f?.user?.language), { plot: m.plot, code: m.code }));
    }
    const items = made.map((m) => ({ plot: m.plot, code: m.code }));
    const blockCode = farmIdDisplay(block.code);
    for (const l of await this.leadersOfBlock(block)) {
      if (l.position !== 'BLOCK_LEADER' || !l.user) continue; // the canal leader gets arrivals and incidents, not every pass
      await this.send(l.user.phone, l.user.id, passesForWatcher(toLang(l.user.language), { block: blockCode, items }));
    }
    const operators = await this.prisma.harvestArrival.findMany({ where: { mamcosId, blockId: block.id, departedAt: null, operatorPhone: { not: null } }, select: { operatorPhone: true } });
    for (const phone of new Set(operators.map((o) => o.operatorPhone))) await this.send(phone, null, passesForWatcher('sw', { block: blockCode, items }));
  }

  /** Called whenever a farmer's dues change (a payment is recorded). */
  async afterDuesChange(mamcosId: string, farmerId: string) {
    try {
      const dues = await this.prisma.farmerDue.findMany({ where: { mamcosId, farmerId, category: 'HARVEST_FEE', status: 'ACTIVE', typeId: { not: null } }, select: { typeId: true } });
      for (const typeId of new Set(dues.map((d) => d.typeId as string))) await this.issueForType(typeId, farmerId);
    } catch (e) { this.logger.error(`Harvest pass check failed for farmer ${farmerId}: ${e instanceof Error ? e.message : e}`); }
  }

  /** Every 10 minutes: catches passes that became due without a payment (a loan repaid, a payment re-dated). */
  @Cron(process.env.HARVEST_PASS_CRON || '*/10 * * * *', { name: 'harvest-pass-sweep' })
  async sweep() {
    try {
      const since = new Date(Date.now() - 120 * 86_400_000);
      const types = await this.prisma.farmerDueType.findMany({ where: { category: 'HARVEST_FEE', createdAt: { gte: since } }, select: { id: true } });
      let n = 0;
      for (const t of types) n += await this.issueForType(t.id);
      if (n) this.logger.log(`Issued ${n} harvest pass(es)`);
      return n;
    } catch (e) { this.logger.error(`Harvest pass sweep failed: ${e instanceof Error ? e.message : e}`); return 0; }
  }

  /** What a pass is worth right now: re-checked every time it is looked at or used, so a voided payment or new loan locks the plot again. */
  private async standing(pass: { typeId: string; farmerId: string; status: string }): Promise<{ ok: boolean; reason?: GateReason }> {
    if (pass.status === 'VOID') return { ok: false, reason: 'HELD' };
    if (pass.status === 'USED') return { ok: false, reason: 'USED' };
    const due = await this.prisma.farmerDue.findFirst({ where: { typeId: pass.typeId, farmerId: pass.farmerId, status: 'ACTIVE' }, select: { amount: true, waivedAmount: true, payments: { where: { voidedAt: null }, select: { amount: true } } } });
    if (!due) return { ok: false, reason: 'NOT_CHARGED' };
    if (balanceOf(due) > 0) return { ok: false, reason: 'UNPAID' };
    if ((await this.loanFarmers([pass.farmerId])).has(pass.farmerId)) return { ok: false, reason: 'LOAN' };
    return { ok: true };
  }

  private async view(pass: Prisma.HarvestPassGetPayload<object>) {
    const [hectare, farmer, block] = await Promise.all([
      this.prisma.irrigationHectare.findUnique({ where: { id: pass.hectareId }, select: { code: true, areaHectares: true } }),
      this.prisma.farmer.findUnique({ where: { id: pass.farmerId }, select: person }),
      this.prisma.irrigationBlock.findUnique({ where: { id: pass.blockId }, select: { id: true, code: true } }),
    ]);
    const s = await this.standing(pass);
    return {
      id: pass.id, code: pass.code, status: pass.status, cleared: s.ok, reason: s.reason ?? null, reasonText: s.reason ? REASON_TEXT[s.reason] : null,
      issuedAt: pass.issuedAt, usedAt: pass.usedAt, usedVia: pass.usedVia, voidReason: pass.voidReason,
      plot: farmIdDisplay(hectare?.code), areaHectares: num(hectare?.areaHectares), block: block ? { id: block.id, code: farmIdDisplay(block.code) } : null,
      farmer: farmer ? { id: farmer.id, name: fullName(farmer), memberNumber: farmer.controlNumber } : null,
    };
  }

  private async loadByCode(actor: RequestUser, code: string) {
    const mamcosId = this.tenant(actor);
    const pass = await this.prisma.harvestPass.findUnique({ where: { code: code.trim().toUpperCase() } });
    if (!pass || pass.mamcosId !== mamcosId) throw new NotFoundException('No harvest pass has that code');
    await this.scopeService.assertBlock(await this.scopeService.resolve(actor), pass.blockId); // a leader sees only their own block's passes
    return pass;
  }

  /** Is this code good? Read-only: nothing is marked used. */
  async lookup(actor: RequestUser, code: string) {
    return this.view(await this.loadByCode(actor, code));
  }

  /**
   * Marks a plot as being harvested. Either the combine operator gives the pass code, or the block leader signs the plot off by
   * its hectare. A plot that is not cleared is refused and logged as an incident for the canal leader.
   */
  async usePass(actor: RequestUser, dto: { code?: string; hectareId?: string; typeId?: string; arrivalId?: string }) {
    const mamcosId = this.tenant(actor);
    const scope = await this.scopeService.resolve(actor);
    let pass: Prisma.HarvestPassGetPayload<object> | null = null;
    let via: 'CODE' | 'CHAIRMAN' = 'CODE';
    if (dto.code) {
      pass = await this.loadByCode(actor, dto.code);
    } else if (dto.hectareId) {
      // the chairman's sign-off belongs to the block leaders and the office, not to a harvester's operator
      if (!hasGrant(actor, 'irrigation_allocations', 'VIEW')) throw new ForbiddenException('Only a block leader or the office can sign a plot off. Give the pass code instead');
      via = 'CHAIRMAN';
      const hectare = await this.scopeService.assertHectare(scope, dto.hectareId);
      if (hectare.block.canal.scheme.mamcosId !== mamcosId) throw new NotFoundException('Hectare not found');
      let typeId = dto.typeId;
      if (!typeId) {
        const types = await this.prisma.farmerDueType.findMany({ where: { mamcosId, category: 'HARVEST_FEE', name: { endsWith: ` · ${hectare.block.code}` } }, orderBy: { createdAt: 'desc' }, take: 1, select: { id: true } });
        typeId = types[0]?.id;
      }
      if (!typeId) throw new ConflictException('No harvest has been opened for this block yet');
      await this.issueForType(typeId); // the plot may be paid but its pass not yet issued
      pass = await this.prisma.harvestPass.findUnique({ where: { typeId_hectareId: { typeId, hectareId: hectare.id } } });
      if (!pass) {
        const holder = await this.prisma.irrigationHectareAllocation.findFirst({ where: { hectareId: hectare.id, status: 'ACTIVE' }, select: { farmerId: true } });
        const reason: GateReason = !holder ? 'NO_HOLDER' : (await this.prisma.farmerDue.count({ where: { typeId, farmerId: holder.farmerId, status: 'ACTIVE' } })) === 0 ? 'NOT_CHARGED'
          : (await this.loanFarmers([holder.farmerId])).has(holder.farmerId) ? 'LOAN' : 'UNPAID';
        await this.blocked(mamcosId, hectare.blockId, hectare.id, farmIdDisplay(hectare.code), REASON_TEXT[reason], actor.id);
        throw new ConflictException(`This plot is not cleared: ${REASON_TEXT[reason]}`);
      }
    } else throw new BadRequestException('Give the pass code or choose the plot');

    const s = await this.standing(pass);
    if (!s.ok) {
      const hectare = await this.prisma.irrigationHectare.findUnique({ where: { id: pass.hectareId }, select: { code: true } });
      await this.blocked(mamcosId, pass.blockId, pass.hectareId, farmIdDisplay(hectare?.code), REASON_TEXT[s.reason!], actor.id);
      throw new ConflictException(s.reason === 'USED' ? `This pass was already used${pass.usedAt ? ` on ${pass.usedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC` : ''}` : `This plot is not cleared: ${REASON_TEXT[s.reason!]}`);
    }
    const claimed = await this.prisma.harvestPass.updateMany({ where: { id: pass.id, status: 'ISSUED' }, data: { status: 'USED', usedAt: new Date(), usedById: actor.id, usedVia: via, arrivalId: dto.arrivalId ?? null } });
    if (!claimed.count) throw new ConflictException('This pass was already used');
    return this.view((await this.prisma.harvestPass.findUniqueOrThrow({ where: { id: pass.id } })));
  }

  /** The Accountant or Cashier puts a plot on hold (lock for non-payment of something else, or a mistake); a reason is kept. */
  async hold(actor: RequestUser, id: string, reason: string) {
    const mamcosId = this.tenant(actor);
    if (!reason?.trim()) throw new BadRequestException('Say why the plot is put on hold');
    const pass = await this.prisma.harvestPass.findFirst({ where: { id, mamcosId } });
    if (!pass) throw new NotFoundException('Pass not found');
    const claimed = await this.prisma.harvestPass.updateMany({ where: { id, status: 'ISSUED' }, data: { status: 'VOID', voidedAt: new Date(), voidedById: actor.id, voidReason: reason.trim() } });
    if (!claimed.count) throw new ConflictException('Only a pass that has not been used can be put on hold');
    await writeAudit(this.prisma, actor, 'harvest_fee', pass.typeId, 'hold-pass', { pass: pass.code }, { reason: reason.trim() });
    return this.view(await this.prisma.harvestPass.findUniqueOrThrow({ where: { id } }));
  }

  async release(actor: RequestUser, id: string) {
    const mamcosId = this.tenant(actor);
    const pass = await this.prisma.harvestPass.findFirst({ where: { id, mamcosId } });
    if (!pass) throw new NotFoundException('Pass not found');
    const claimed = await this.prisma.harvestPass.updateMany({ where: { id, status: 'VOID' }, data: { status: 'ISSUED', voidedAt: null, voidedById: null, voidReason: null } });
    if (!claimed.count) throw new ConflictException('This pass is not on hold');
    await writeAudit(this.prisma, actor, 'harvest_fee', pass.typeId, 'release-pass', { pass: pass.code }, null);
    return this.view(await this.prisma.harvestPass.findUniqueOrThrow({ where: { id } }));
  }

  // ───────────────────────── arrivals ─────────────────────────

  private async countsFor(block: Parameters<HarvestFeesService['clearanceOfBlock']>[0]) {
    const c = await this.fees.clearanceOfBlock(block);
    return { cleared: c.summary.green, locked: c.summary.red + c.summary.yellow + c.summary.held + c.summary.notCharged, rate: c.harvest?.ratePerHectare ?? null };
  }

  async logArrival(actor: RequestUser, dto: { blockId: string; operatorName: string; operatorPhone?: string; machine?: string; note?: string }) {
    const mamcosId = this.tenant(actor);
    const scope = await this.scopeService.resolve(actor);
    const block = await this.scopeService.assertBlock(scope, dto.blockId);
    if (block.canal.scheme.mamcosId !== mamcosId) throw new NotFoundException('Block not found');
    if (!dto.operatorName?.trim()) throw new BadRequestException('Enter the operator’s name');
    const open = await this.prisma.harvestArrival.findFirst({ where: { mamcosId, blockId: block.id, departedAt: null, operatorName: dto.operatorName.trim() } });
    if (open) throw new ConflictException('This operator is already logged in to this block');
    const row = await this.prisma.harvestArrival.create({
      data: { mamcosId, blockId: block.id, operatorName: dto.operatorName.trim(), operatorPhone: dto.operatorPhone?.trim() || null, machine: dto.machine?.trim() || null, note: dto.note?.trim() || null, loggedById: actor.id },
    });
    const counts = await this.countsFor(block).catch(() => ({ cleared: 0, locked: 0, rate: null as number | null }));
    const blockCode = farmIdDisplay(block.code);
    for (const l of await this.leadersOfBlock(block)) {
      if (l.user) await this.send(l.user.phone, l.user.id, arrivalForLeader(toLang(l.user.language), { block: blockCode, operator: row.operatorName, machine: row.machine, cleared: counts.cleared, locked: counts.locked }));
    }
    if (row.operatorPhone) await this.send(row.operatorPhone, null, arrivalForOperator('sw', { block: blockCode, rate: counts.rate, cleared: counts.cleared, locked: counts.locked }));
    return row;
  }

  async depart(actor: RequestUser, id: string) {
    const mamcosId = this.tenant(actor);
    const a = await this.prisma.harvestArrival.findFirst({ where: { id, mamcosId } });
    if (!a) throw new NotFoundException('Arrival not found');
    await this.scopeService.assertBlock(await this.scopeService.resolve(actor), a.blockId);
    const claimed = await this.prisma.harvestArrival.updateMany({ where: { id, departedAt: null }, data: { departedAt: new Date(), departedById: actor.id } });
    if (!claimed.count) throw new ConflictException('This harvester has already left the block');
    const usedWhileThere = await this.prisma.harvestPass.count({ where: { arrivalId: id, status: 'USED' } });
    return { id, departed: true, plotsHarvested: usedWhileThere };
  }

  async listArrivals(actor: RequestUser, q: { blockId?: string; onSite?: string }) {
    const mamcosId = this.tenant(actor);
    const scope = await this.scopeService.resolve(actor);
    const blocks = await this.prisma.irrigationBlock.findMany({ where: { AND: [this.scopeService.blockWhere(scope), q.blockId ? { id: q.blockId } : {}], canal: { scheme: { mamcosId } } }, select: { id: true, code: true } });
    const rows = await this.prisma.harvestArrival.findMany({ where: { mamcosId, blockId: { in: blocks.map((b) => b.id) }, ...(q.onSite === 'true' ? { departedAt: null } : {}) }, orderBy: { arrivedAt: 'desc' }, take: 50 });
    const code = new Map(blocks.map((b) => [b.id, farmIdDisplay(b.code)]));
    const harvested = await this.prisma.harvestPass.groupBy({ by: ['arrivalId'], where: { arrivalId: { in: rows.map((r) => r.id) }, status: 'USED' }, _count: true });
    const counts = new Map(harvested.map((h) => [h.arrivalId, h._count]));
    return { data: rows.map((r) => ({ id: r.id, block: { id: r.blockId, code: code.get(r.blockId) ?? '' }, operatorName: r.operatorName, operatorPhone: r.operatorPhone, machine: r.machine, note: r.note, arrivedAt: r.arrivedAt, departedAt: r.departedAt, plotsHarvested: counts.get(r.id) ?? 0 })) };
  }

  // ───────────────────────── incidents ─────────────────────────

  /** An uncleared plot was presented for harvest: record it once (not again within the hour) and tell the canal leader. */
  private async blocked(mamcosId: string, blockId: string, hectareId: string | null, plot: string, reasonText: string, raisedById: string) {
    try {
      const recent = await this.prisma.harvestIncident.findFirst({ where: { mamcosId, blockId, hectareId, kind: 'BLOCKED', status: 'OPEN', createdAt: { gte: new Date(Date.now() - 3_600_000) } }, select: { id: true } });
      if (recent) return;
      await this.prisma.harvestIncident.create({ data: { mamcosId, blockId, hectareId, kind: 'BLOCKED', description: `Harvest refused at ${plot}: ${reasonText}`, raisedById } });
      const block = await this.prisma.irrigationBlock.findUnique({ where: { id: blockId }, select: { id: true, code: true, canalId: true } });
      if (!block) return;
      for (const l of await this.leadersOfBlock(block)) {
        if (l.position === 'CANAL_LEADER' && l.user) await this.send(l.user.phone, l.user.id, incidentForCanalLeader(toLang(l.user.language), { block: farmIdDisplay(block.code), plot, text: reasonText }));
      }
    } catch (e) { this.logger.warn(`Could not record a harvest incident: ${e instanceof Error ? e.message : e}`); }
  }

  async reportIncident(actor: RequestUser, dto: { blockId: string; hectareId?: string; description: string }) {
    const mamcosId = this.tenant(actor);
    const scope = await this.scopeService.resolve(actor);
    const block = await this.scopeService.assertBlock(scope, dto.blockId);
    if (block.canal.scheme.mamcosId !== mamcosId) throw new NotFoundException('Block not found');
    if (dto.hectareId && !(await this.prisma.irrigationHectare.findFirst({ where: { id: dto.hectareId, blockId: block.id }, select: { id: true } }))) throw new BadRequestException('That plot is not in this block');
    if (!dto.description?.trim()) throw new BadRequestException('Describe what happened');
    return this.prisma.harvestIncident.create({ data: { mamcosId, blockId: block.id, hectareId: dto.hectareId ?? null, kind: 'DISPUTE', description: dto.description.trim(), raisedById: actor.id } });
  }

  async listIncidents(actor: RequestUser, q: { status?: string; blockId?: string }) {
    const mamcosId = this.tenant(actor);
    const scope = await this.scopeService.resolve(actor);
    const blocks = await this.prisma.irrigationBlock.findMany({ where: { AND: [this.scopeService.blockWhere(scope), q.blockId ? { id: q.blockId } : {}], canal: { scheme: { mamcosId } } }, select: { id: true, code: true, canalId: true } });
    const status = q.status === 'RESOLVED' ? HarvestIncidentStatus.RESOLVED : q.status === 'ALL' ? undefined : HarvestIncidentStatus.OPEN;
    const rows = await this.prisma.harvestIncident.findMany({ where: { mamcosId, blockId: { in: blocks.map((b) => b.id) }, ...(status ? { status } : {}) }, orderBy: { createdAt: 'desc' }, take: 100 });
    const code = new Map(blocks.map((b) => [b.id, farmIdDisplay(b.code)]));
    const hectares = await this.prisma.irrigationHectare.findMany({ where: { id: { in: rows.flatMap((r) => (r.hectareId ? [r.hectareId] : [])) } }, select: { id: true, code: true } });
    const plot = new Map(hectares.map((h) => [h.id, farmIdDisplay(h.code)]));
    return { data: rows.map((r) => ({ id: r.id, kind: r.kind, description: r.description, status: r.status, createdAt: r.createdAt, resolvedAt: r.resolvedAt, resolution: r.resolution, block: { id: r.blockId, code: code.get(r.blockId) ?? '' }, plot: r.hectareId ? plot.get(r.hectareId) ?? null : null })) };
  }

  /** The canal leader (or the office) closes an incident with what was decided. It never clears an unpaid plot. */
  async resolveIncident(actor: RequestUser, id: string, resolution: string) {
    const mamcosId = this.tenant(actor);
    const scope = await this.scopeService.resolve(actor);
    const row = await this.prisma.harvestIncident.findFirst({ where: { id, mamcosId } });
    if (!row) throw new NotFoundException('Incident not found');
    const block = await this.scopeService.assertBlock(scope, row.blockId);
    // a block leader raises and sees incidents; settling them is for the canal leader or the office
    if (scope.restricted && !scope.canalIds.includes(block.canalId)) throw new ForbiddenException('Only the canal leader or the office can resolve this');
    if (!resolution?.trim()) throw new BadRequestException('Write what was decided');
    const claimed = await this.prisma.harvestIncident.updateMany({ where: { id, status: 'OPEN' }, data: { status: 'RESOLVED', resolvedById: actor.id, resolvedAt: new Date(), resolution: resolution.trim() } });
    if (!claimed.count) throw new ConflictException('This incident is already resolved');
    return this.prisma.harvestIncident.findUniqueOrThrow({ where: { id } });
  }

  // ───────────────────────── ring-fencing and the daily reconciliation ─────────────────────────

  async getSplit(actor: RequestUser, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const row = await this.prisma.harvestFundSplit.findUnique({ where: { mamcosId } });
    return { maintenancePercent: row?.maintenancePercent ?? null, operatingPercent: row ? 100 - row.maintenancePercent : null };
  }

  async setSplit(actor: RequestUser, maintenancePercent: number, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    if (!hasGrant(actor, 'harvest_fee_approval', 'EDIT')) throw new ForbiddenException('Only an AMCOS Manager can set how harvest fees are divided');
    if (!Number.isInteger(maintenancePercent) || maintenancePercent < 0 || maintenancePercent > 100) throw new BadRequestException('The maintenance share must be a whole number from 0 to 100');
    await this.prisma.harvestFundSplit.upsert({ where: { mamcosId }, create: { mamcosId, maintenancePercent, updatedById: actor.id }, update: { maintenancePercent, updatedById: actor.id } });
    return this.getSplit(actor, mamcosIdParam);
  }

  /** What was collected on a day from harvest fees and how it divides; with the days still waiting for the Accountant. */
  async reconciliation(actor: RequestUser, dayParam?: string, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const ymd = dayParam ?? localDate(new Date());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw new BadRequestException('Choose a valid day');
    const day = dayOf(ymd);
    const payments = await this.prisma.duePayment.findMany({ where: { mamcosId, voidedAt: null, paidOn: day, due: { category: 'HARVEST_FEE' } }, select: { amount: true, method: true } });
    const total = cents(payments.reduce((n, p) => n + num(p.amount), 0));
    const byMethod: Record<string, number> = {};
    for (const p of payments) byMethod[p.method] = cents((byMethod[p.method] ?? 0) + num(p.amount));
    const split = await this.prisma.harvestFundSplit.findUnique({ where: { mamcosId } });
    const maintenance = split ? cents((total * split.maintenancePercent) / 100) : null;
    const done = await this.prisma.harvestReconciliation.findUnique({ where: { mamcosId_day: { mamcosId, day } } });
    const since = new Date(day.getTime() - 30 * 86_400_000);
    const days = await this.prisma.duePayment.groupBy({ by: ['paidOn'], where: { mamcosId, voidedAt: null, paidOn: { gte: since, lte: day }, due: { category: 'HARVEST_FEE' } } });
    const signed = new Set((await this.prisma.harvestReconciliation.findMany({ where: { mamcosId, day: { gte: since, lte: day } }, select: { day: true } })).map((r) => r.day.toISOString().slice(0, 10)));
    return {
      day: ymd, payments: payments.length, collected: total, byMethod,
      maintenancePercent: split?.maintenancePercent ?? null, maintenance, operating: maintenance == null ? null : cents(total - maintenance),
      reconciled: done ? { at: done.reconciledAt, by: done.reconciledById, note: done.note, collected: num(done.collected), operating: num(done.operating), maintenance: num(done.maintenance) } : null,
      waiting: days.map((d) => d.paidOn.toISOString().slice(0, 10)).filter((d) => !signed.has(d)).sort().reverse(),
    };
  }

  async reconcile(actor: RequestUser, dayParam: string, note?: string, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const view = await this.reconciliation(actor, dayParam, mamcosIdParam);
    if (dayOf(view.day) > dayOf(localDate(new Date()))) throw new BadRequestException('A day that has not happened cannot be reconciled');
    if (view.maintenancePercent == null) throw new ConflictException('Ask the Manager to set how harvest fees are divided first');
    if (view.reconciled) throw new ConflictException('This day has already been reconciled');
    try {
      await this.prisma.harvestReconciliation.create({
        data: { mamcosId, day: dayOf(view.day), paymentsCount: view.payments, collected: view.collected, operating: view.operating!, maintenance: view.maintenance!, maintenancePercent: view.maintenancePercent, note: note?.trim() || null, reconciledById: actor.id },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('This day has already been reconciled');
      throw e;
    }
    return this.reconciliation(actor, dayParam, mamcosIdParam);
  }
}
