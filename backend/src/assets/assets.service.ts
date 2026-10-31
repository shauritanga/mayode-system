import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { AccountingService } from '../accounting/accounting.service';
import {
  AssetListQueryDto, CreateAssetDto, CreateMaintenanceDto, DisposeAssetDto, ReassignCustodyDto, UpdateAssetDto,
} from './dto/assets.dto';

const num = (v: unknown) => (v == null ? 0 : Number(v));
const cents = (n: number) => Math.round(n * 100) / 100;
const day = (value: string | Date) => new Date(`${(typeof value === 'string' ? value : value.toISOString()).slice(0, 10)}T00:00:00.000Z`);
const today = () => day(new Date());
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const periodOf = (d: Date) => d.toISOString().slice(0, 7);
const periodEnd = (period: string) => { const [y, m] = period.split('-').map(Number); return new Date(Date.UTC(y, m, 0)); };

/** How long each kind of asset usually lasts, in years, when the AMCOS does not say. */
export const DEFAULT_LIFE_YEARS: Record<string, number> = {
  MACHINERY_VEHICLE: 8, BUILDING_WAREHOUSE: 40, MILL_PROCESSING: 12, IRRIGATION_STRUCTURE: 25,
  SOLAR_POWER: 15, MEASURING_EQUIPMENT: 5, TOOLS: 4, OFFICE_IT: 4, FURNITURE: 8, OTHER: 5,
};

const DUE_SOON_DAYS = 30;

/** What the AMCOS owns: register, upkeep, custody, depreciation (posted to its own ledger) and disposal. */
@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly accounting: AccountingService,
  ) {}

  private tenant(actor: RequestUser, requested?: string): string {
    const own = this.ownership.resolveTenantMamcosId(actor);
    const id = own ?? requested ?? null;
    if (!id) throw new BadRequestException('Choose a cooperative');
    if (own && requested && requested !== own) throw new ForbiddenException('You can only manage assets for your own cooperative');
    return id;
  }

  private async find(mamcosId: string, id: string) {
    const asset = await this.prisma.asset.findFirst({ where: { id, mamcosId } });
    if (!asset) throw new NotFoundException('Asset not found');
    return asset;
  }

  private async accumulated(assetIds: string[]) {
    if (!assetIds.length) return new Map<string, number>();
    const rows = await this.prisma.assetDepreciationLine.groupBy({ by: ['assetId'], where: { assetId: { in: assetIds } }, _sum: { amount: true } });
    return new Map(rows.map((r) => [r.assetId, num(r._sum.amount)]));
  }

  private shape<T extends { id: string; cost: Prisma.Decimal; salvageValue: Prisma.Decimal }>(a: T, acc: Map<string, number>) {
    const accumulated = acc.get(a.id) ?? 0;
    return { ...a, cost: num(a.cost), salvageValue: num(a.salvageValue), accumulatedDepreciation: accumulated, bookValue: cents(num(a.cost) - accumulated) };
  }

  // ───────────────────────── register ─────────────────────────

  async list(actor: RequestUser, q: AssetListQueryDto) {
    const mamcosId = this.tenant(actor, q.mamcosId);
    const where: Prisma.AssetWhereInput = {
      mamcosId, archivedAt: null,
      ...(q.category ? { category: q.category } : {}), ...(q.status ? { status: q.status } : {}), ...(q.condition ? { condition: q.condition } : {}),
      ...(q.custodian ? { custodianName: { contains: q.custodian, mode: 'insensitive' } } : {}),
      ...(q.q?.trim() ? { OR: [
        { name: { contains: q.q.trim(), mode: 'insensitive' } }, { tag: { contains: q.q.trim(), mode: 'insensitive' } },
        { serialNo: { contains: q.q.trim(), mode: 'insensitive' } }, { location: { contains: q.q.trim(), mode: 'insensitive' } },
      ] } : {}),
    };
    const page = q.page ?? 1, pageSize = q.pageSize ?? 25;
    const [items, count, cost, accumulated] = await Promise.all([
      this.prisma.asset.findMany({ where, orderBy: [{ tag: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.asset.count({ where }),
      this.prisma.asset.aggregate({ where, _sum: { cost: true } }),
      this.prisma.assetDepreciationLine.aggregate({ where: { asset: where }, _sum: { amount: true } }),
    ]);
    const acc = await this.accumulated(items.map((i) => i.id));
    const totalCost = num(cost._sum.cost), totalAcc = num(accumulated._sum.amount);
    return {
      items: items.map((i) => this.shape(i, acc)), total: count, page, pageSize,
      totals: { count, cost: totalCost, accumulatedDepreciation: totalAcc, bookValue: cents(totalCost - totalAcc) },
    };
  }

  async get(actor: RequestUser, id: string, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const asset = await this.prisma.asset.findFirst({
      where: { id, mamcosId },
      include: {
        maintenance: { orderBy: { doneOn: 'desc' } }, custodyLog: { orderBy: [{ assignedOn: 'desc' }, { createdAt: 'desc' }] },
        disposal: true, depreciation: { include: { run: { select: { period: true } } }, orderBy: { run: { period: 'asc' } } },
        equipment: { select: { id: true, name: true } },
      },
    });
    if (!asset) throw new NotFoundException('Asset not found');
    const { maintenance, custodyLog, disposal, depreciation, equipment, ...rest } = asset;
    const accumulated = depreciation.reduce((n, l) => n + num(l.amount), 0);
    let usage: { jobs: number; hectares: number; feesEarned: number } | null = null;
    if (asset.equipmentId) {
      const u = await this.prisma.machineryActivity.aggregate({
        where: { equipmentId: asset.equipmentId, status: 'COMPLETED' }, _sum: { hectares: true, feeAmount: true }, _count: { _all: true },
      });
      usage = { jobs: u._count._all, hectares: num(u._sum.hectares), feesEarned: num(u._sum.feeAmount) };
    }
    const upkeep = maintenance.reduce((n, m) => n + num(m.cost), 0);
    return {
      ...rest, cost: num(asset.cost), salvageValue: num(asset.salvageValue), accumulatedDepreciation: accumulated,
      bookValue: cents(num(asset.cost) - accumulated), equipment, usage, upkeepCost: upkeep,
      costPerHectare: usage && usage.hectares > 0 ? cents(upkeep / usage.hectares) : null,
      maintenance: maintenance.map((m) => ({ ...m, cost: num(m.cost) })),
      custodyLog, disposal: disposal ? { ...disposal, proceeds: num(disposal.proceeds), bookValue: num(disposal.bookValue), gainLoss: num(disposal.gainLoss) } : null,
      schedule: depreciation.map((l) => ({ period: l.run.period, amount: num(l.amount) })),
    };
  }

  private async nextTag(mamcosId: string) {
    const last = await this.prisma.asset.findFirst({ where: { mamcosId, tag: { startsWith: 'AST-' } }, orderBy: { tag: 'desc' }, select: { tag: true } });
    const n = last ? parseInt(last.tag.slice(4), 10) || 0 : 0;
    return `AST-${String(n + 1).padStart(4, '0')}`;
  }

  async create(actor: RequestUser, dto: CreateAssetDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const purchaseDate = day(dto.purchaseDate);
    if (purchaseDate > today()) throw new BadRequestException('The purchase date cannot be in the future');
    const salvage = dto.salvageValue ?? 0;
    if (salvage > dto.cost) throw new BadRequestException('Salvage value cannot be more than the cost');
    const depreciationStart = dto.depreciationStart ? day(dto.depreciationStart) : purchaseDate;
    if (depreciationStart < purchaseDate) throw new BadRequestException('Depreciation cannot start before the purchase date');
    if (dto.equipmentId) {
      const machine = await this.prisma.amcosEquipment.findFirst({ where: { id: dto.equipmentId, mamcosId }, include: { asset: { select: { id: true } } } });
      if (!machine) throw new NotFoundException('Machine not found');
      if (machine.asset) throw new ConflictException('That machine is already linked to an asset');
    }
    if (dto.postToLedger && dto.cost > 0 && dto.fundingSource && dto.fundingSource !== 'AMCOS_FUNDS') {
      throw new BadRequestException('Only purchases paid from AMCOS funds are posted as cash');
    }
    const data = {
      mamcosId, name: dto.name.trim(), category: dto.category, make: dto.make?.trim() || null, model: dto.model?.trim() || null,
      serialNo: dto.serialNo?.trim() || null, purchaseDate, cost: dto.cost, fundingSource: dto.fundingSource ?? 'AMCOS_FUNDS',
      supplier: dto.supplier?.trim() || null, location: dto.location?.trim() || null, condition: dto.condition ?? 'GOOD',
      usefulLifeYears: dto.usefulLifeYears ?? DEFAULT_LIFE_YEARS[dto.category], salvageValue: salvage, depreciationStart,
      custodianName: dto.custodianName?.trim() || null, custodianUserId: dto.custodianUserId ?? null,
      warrantyExpiresOn: dto.warrantyExpiresOn ? day(dto.warrantyExpiresOn) : null,
      insuranceExpiresOn: dto.insuranceExpiresOn ? day(dto.insuranceExpiresOn) : null,
      serviceIntervalDays: dto.serviceIntervalDays ?? null,
      nextServiceDue: dto.serviceIntervalDays ? addDays(purchaseDate, dto.serviceIntervalDays) : null,
      equipmentId: dto.equipmentId ?? null, notes: dto.notes?.trim() || null, createdById: actor.id,
    };
    let asset;
    for (let attempt = 0; ; attempt++) {
      try {
        asset = await this.prisma.$transaction(async (tx) => {
          const created = await tx.asset.create({ data: { ...data, tag: await this.nextTag(mamcosId) } });
          if (created.custodianName) {
            await tx.assetCustodyLog.create({ data: { assetId: created.id, toName: created.custodianName, toUserId: created.custodianUserId, assignedOn: purchaseDate, assignedBy: actor.id, note: 'Recorded with the asset' } });
          }
          return created;
        });
        break;
      } catch (e: any) {
        if (e?.code === 'P2002' && e.meta?.target?.toString().includes('equipment_id')) throw new ConflictException('That machine is already linked to an asset');
        if (e?.code === 'P2002' && attempt < 3) continue; // two people registering at once took the same tag
        if (e?.code === 'P2002') throw new ConflictException('Could not allocate an asset tag, try again');
        throw e;
      }
    }
    if (dto.postToLedger && dto.cost > 0) {
      await this.accounting.postToLedger('AssetPurchase', asset.id, purchaseDate, `Purchase of ${asset.name} (${asset.tag})`,
        [{ code: '1500', debit: dto.cost }, { code: '1000', credit: dto.cost }], mamcosId);
      await this.prisma.asset.update({ where: { id: asset.id }, data: { postedPurchase: true } });
    }
    return this.get(actor, asset.id, mamcosId);
  }

  async update(actor: RequestUser, id: string, dto: UpdateAssetDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const current = await this.find(mamcosId, id);
    if (current.status === 'DISPOSED') throw new BadRequestException('A disposed asset can no longer be changed');
    if (dto.status === 'DISPOSED') throw new BadRequestException('Use Dispose to take an asset off the books');
    const text = (v?: string) => (v === undefined ? {} : { value: v.trim() || null });
    await this.prisma.asset.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.make !== undefined ? { make: text(dto.make).value } : {}), ...(dto.model !== undefined ? { model: text(dto.model).value } : {}),
        ...(dto.serialNo !== undefined ? { serialNo: text(dto.serialNo).value } : {}), ...(dto.supplier !== undefined ? { supplier: text(dto.supplier).value } : {}),
        ...(dto.location !== undefined ? { location: text(dto.location).value } : {}), ...(dto.notes !== undefined ? { notes: text(dto.notes).value } : {}),
        ...(dto.condition !== undefined ? { condition: dto.condition } : {}), ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.warrantyExpiresOn !== undefined ? { warrantyExpiresOn: day(dto.warrantyExpiresOn) } : {}),
        ...(dto.insuranceExpiresOn !== undefined ? { insuranceExpiresOn: day(dto.insuranceExpiresOn) } : {}),
        ...(dto.serviceIntervalDays !== undefined ? { serviceIntervalDays: dto.serviceIntervalDays } : {}),
      },
    });
    return this.get(actor, id, mamcosId);
  }

  /** Hide an asset from the register. Only disposed assets can be archived: a live asset must stay on the books. */
  async archive(actor: RequestUser, id: string, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const asset = await this.find(mamcosId, id);
    if (asset.status !== 'DISPOSED') throw new BadRequestException('Dispose of the asset before archiving it');
    await this.prisma.asset.update({ where: { id }, data: { archivedAt: new Date() } });
    return { archived: true };
  }

  // ───────────────────────── maintenance ─────────────────────────

  async addMaintenance(actor: RequestUser, id: string, dto: CreateMaintenanceDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const asset = await this.find(mamcosId, id);
    if (asset.status === 'DISPOSED') throw new BadRequestException('A disposed asset cannot be maintained');
    const doneOn = day(dto.doneOn);
    if (doneOn > today()) throw new BadRequestException('Work that is not done yet cannot be recorded; set a next due date instead');
    if (doneOn < asset.purchaseDate) throw new BadRequestException('Work cannot be dated before the asset was bought');
    const cost = dto.cost ?? 0;
    const nextDueOn = dto.nextDueOn ? day(dto.nextDueOn) : null;
    if (nextDueOn && nextDueOn <= doneOn) throw new BadRequestException('The next due date must be after the work date');
    const record = await this.prisma.$transaction(async (tx) => {
      const m = await tx.assetMaintenance.create({
        data: { assetId: id, kind: dto.kind, doneOn, cost, performedBy: dto.performedBy?.trim() || null, notes: dto.notes?.trim() || null, nextDueOn, createdById: actor.id },
      });
      const next = nextDueOn ?? (dto.kind === 'SERVICE' && asset.serviceIntervalDays ? addDays(doneOn, asset.serviceIntervalDays) : null);
      if (next) await tx.asset.update({ where: { id }, data: { nextServiceDue: next } });
      return m;
    });
    if (dto.postToLedger && cost > 0) {
      await this.accounting.postToLedger('AssetMaintenance', record.id, doneOn, `${dto.kind.toLowerCase()} of ${asset.name} (${asset.tag})`,
        [{ code: '5410', debit: cost }, { code: '1000', credit: cost }], mamcosId);
      await this.prisma.assetMaintenance.update({ where: { id: record.id }, data: { posted: true } });
    }
    return this.get(actor, id, mamcosId);
  }

  /** What needs attention: overdue or coming-up services, expiring warranties and insurance. Most urgent first. */
  async due(actor: RequestUser, q: { mamcosId?: string; days?: string }) {
    const mamcosId = this.tenant(actor, q.mamcosId);
    const horizonDays = Math.min(Math.max(Number(q.days) || DUE_SOON_DAYS, 1), 365);
    const t = today(), horizon = addDays(t, horizonDays);
    const rows = await this.prisma.asset.findMany({
      where: {
        mamcosId, archivedAt: null, status: { not: 'DISPOSED' },
        OR: [{ nextServiceDue: { lte: horizon } }, { warrantyExpiresOn: { gte: t, lte: horizon } }, { insuranceExpiresOn: { lte: horizon } }],
      },
      select: { id: true, tag: true, name: true, category: true, custodianName: true, nextServiceDue: true, warrantyExpiresOn: true, insuranceExpiresOn: true },
    });
    const items: { assetId: string; tag: string; name: string; custodianName: string | null; kind: 'SERVICE' | 'WARRANTY' | 'INSURANCE'; dueOn: Date; overdue: boolean; daysLeft: number }[] = [];
    const push = (a: (typeof rows)[number], kind: 'SERVICE' | 'WARRANTY' | 'INSURANCE', dueOn: Date | null, lapses: boolean) => {
      if (!dueOn || dueOn > horizon || (!lapses && dueOn < t)) return;
      items.push({ assetId: a.id, tag: a.tag, name: a.name, custodianName: a.custodianName, kind, dueOn, overdue: dueOn < t, daysLeft: Math.round((dueOn.getTime() - t.getTime()) / 86_400_000) });
    };
    for (const a of rows) {
      push(a, 'SERVICE', a.nextServiceDue, true); // an unserviced machine stays on the list until someone services it
      push(a, 'WARRANTY', a.warrantyExpiresOn, false); // an expired warranty is not an alert
      push(a, 'INSURANCE', a.insuranceExpiresOn, true); // lapsed insurance is
    }
    items.sort((x, y) => x.dueOn.getTime() - y.dueOn.getTime());
    return { horizonDays, overdue: items.filter((i) => i.overdue).length, items };
  }

  // ───────────────────────── custody ─────────────────────────

  async reassign(actor: RequestUser, id: string, dto: ReassignCustodyDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const asset = await this.find(mamcosId, id);
    if (asset.status === 'DISPOSED') throw new BadRequestException('A disposed asset cannot be reassigned');
    const toName = dto.toName.trim();
    if (asset.custodianName?.toLowerCase() === toName.toLowerCase()) throw new BadRequestException(`${asset.custodianName} already holds this asset`);
    const assignedOn = dto.assignedOn ? day(dto.assignedOn) : today();
    if (assignedOn > today()) throw new BadRequestException('The handover date cannot be in the future');
    await this.prisma.$transaction([
      this.prisma.assetCustodyLog.create({ data: { assetId: id, fromName: asset.custodianName, toName, toUserId: dto.toUserId ?? null, assignedOn, assignedBy: actor.id, note: dto.note?.trim() || null } }),
      this.prisma.asset.update({ where: { id }, data: { custodianName: toName, custodianUserId: dto.toUserId ?? null } }),
    ]);
    return this.get(actor, id, mamcosId);
  }

  // ───────────────────────── disposal ─────────────────────────

  async dispose(actor: RequestUser, id: string, dto: DisposeAssetDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const asset = await this.find(mamcosId, id);
    if (asset.status === 'DISPOSED') throw new ConflictException('This asset has already been disposed of');
    const disposedOn = day(dto.disposedOn);
    if (disposedOn > today()) throw new BadRequestException('The disposal date cannot be in the future');
    if (disposedOn < asset.purchaseDate) throw new BadRequestException('An asset cannot be disposed of before it was bought');
    const proceeds = dto.proceeds ?? 0;
    if ((dto.method === 'SCRAPPED' || dto.method === 'LOST_STOLEN' || dto.method === 'DONATED') && proceeds > 0) {
      throw new BadRequestException('Only a sale brings in proceeds');
    }
    const accumulated = (await this.accumulated([id])).get(id) ?? 0;
    const cost = num(asset.cost);
    const bookValue = cents(cost - accumulated);
    const gainLoss = cents(proceeds - bookValue);
    try {
      await this.prisma.$transaction([
        this.prisma.assetDisposal.create({
          data: { assetId: id, disposedOn, method: dto.method, proceeds, reason: dto.reason?.trim() || null, bookValue, gainLoss, approvedById: actor.id },
        }),
        this.prisma.asset.update({ where: { id }, data: { status: 'DISPOSED' } }),
      ]);
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('This asset has already been disposed of');
      throw e;
    }
    if (dto.postToLedger) {
      const lines = [
        { code: '1000', debit: proceeds }, { code: '1590', debit: accumulated }, { code: '1500', credit: cost },
        { code: '4300', ...(gainLoss >= 0 ? { credit: gainLoss } : { debit: -gainLoss }) },
      ].filter((l) => ((l as any).debit ?? 0) !== 0 || ((l as any).credit ?? 0) !== 0);
      await this.accounting.postToLedger('AssetDisposal', id, disposedOn, `Disposal of ${asset.name} (${asset.tag})`, lines, mamcosId);
      await this.prisma.assetDisposal.update({ where: { assetId: id }, data: { posted: true } });
    }
    return this.get(actor, id, mamcosId);
  }

  async listDisposals(actor: RequestUser, q: { mamcosId?: string }) {
    const mamcosId = this.tenant(actor, q.mamcosId);
    const rows = await this.prisma.assetDisposal.findMany({
      where: { asset: { mamcosId } }, orderBy: { disposedOn: 'desc' },
      include: { asset: { select: { id: true, tag: true, name: true, cost: true } } },
    });
    return rows.map((d) => ({ ...d, proceeds: num(d.proceeds), bookValue: num(d.bookValue), gainLoss: num(d.gainLoss), asset: { ...d.asset, cost: num(d.asset.cost) } }));
  }

  // ───────────────────────── depreciation ─────────────────────────

  /** Straight-line: (cost − salvage) spread evenly over the useful life in months, never taking book value below salvage. */
  private monthly(a: { cost: Prisma.Decimal; salvageValue: Prisma.Decimal; usefulLifeYears: number }) {
    return cents((num(a.cost) - num(a.salvageValue)) / (a.usefulLifeYears * 12));
  }

  private async plan(mamcosId: string, period: string) {
    const end = periodEnd(period);
    const assets = await this.prisma.asset.findMany({
      where: {
        mamcosId, depreciationStart: { lte: end },
        OR: [{ disposal: null }, { disposal: { disposedOn: { gt: end } } }],
      },
      orderBy: { tag: 'asc' },
    });
    const acc = await this.accumulated(assets.map((a) => a.id));
    const lines: { assetId: string; tag: string; name: string; amount: number; accumulatedAfter: number; bookValueAfter: number }[] = [];
    for (const a of assets) {
      const done = acc.get(a.id) ?? 0;
      const room = cents(num(a.cost) - num(a.salvageValue) - done);
      const amount = Math.min(this.monthly(a), room);
      if (amount <= 0) continue;
      lines.push({ assetId: a.id, tag: a.tag, name: a.name, amount, accumulatedAfter: cents(done + amount), bookValueAfter: cents(num(a.cost) - done - amount) });
    }
    return { end, lines, total: cents(lines.reduce((n, l) => n + l.amount, 0)) };
  }

  private checkPeriod(period: string) {
    if (period > periodOf(today())) throw new BadRequestException('Depreciation cannot be posted for a month that has not started');
  }

  async depreciationPreview(actor: RequestUser, q: { mamcosId?: string; period: string }) {
    const mamcosId = this.tenant(actor, q.mamcosId);
    this.checkPeriod(q.period);
    const posted = await this.prisma.assetDepreciationRun.findUnique({ where: { mamcosId_period: { mamcosId, period: q.period } } });
    const plan = await this.plan(mamcosId, q.period);
    return { period: q.period, alreadyPosted: !!posted, total: plan.total, lines: plan.lines };
  }

  async depreciationRuns(actor: RequestUser, q: { mamcosId?: string }) {
    const mamcosId = this.tenant(actor, q.mamcosId);
    const runs = await this.prisma.assetDepreciationRun.findMany({ where: { mamcosId }, orderBy: { period: 'desc' }, include: { _count: { select: { lines: true } } } });
    return runs.map(({ _count, ...r }) => ({ ...r, total: num(r.total), assets: _count.lines }));
  }

  async runDepreciation(actor: RequestUser, period: string, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    this.checkPeriod(period);
    const plan = await this.plan(mamcosId, period);
    if (!plan.lines.length) throw new BadRequestException('Nothing to depreciate for that month');
    const runId = randomUUID();
    try {
      await this.prisma.assetDepreciationRun.create({
        data: {
          id: runId, mamcosId, period, total: plan.total, postedBy: actor.id,
          lines: { create: plan.lines.map((l) => ({ assetId: l.assetId, amount: l.amount })) },
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException(`Depreciation for ${period} has already been posted`);
      throw e;
    }
    try {
      await this.accounting.postToLedger('AssetDepreciation', runId, plan.end, `Depreciation for ${period}`,
        [{ code: '5400', debit: plan.total }, { code: '1590', credit: plan.total }], mamcosId);
    } catch (e) {
      // keep the register and the ledger in step: no run without its entries
      await this.prisma.assetDepreciationLine.deleteMany({ where: { runId } });
      await this.prisma.assetDepreciationRun.delete({ where: { id: runId } });
      throw e;
    }
    return { runId, period, total: plan.total, assets: plan.lines.length };
  }
}
