import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { SmsService } from '../messaging/sms.service';
import { supervisorsOfFarmer } from '../farmers/supervisors';
import { IrrigationScopeService } from '../irrigation/irrigation-scope.service';
import { farmIdDisplay, normalizeFarmId } from '../irrigation/irrigation-codes';
import { CollectionQueryDto, CreateCollectionDto, CreateCombineDto, HarvestSettingDto, UpdateCombineDto } from './dto/harvest-collections.dto';

const num = (v: unknown) => (v == null ? 0 : Number(v));
const cents = (n: number) => Math.round(n * 100) / 100;
const thousandths = (n: number) => Math.round(n * 1000) / 1000;
const todayUtc = () => new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const normReg = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
const tzs = (n: number) => `TZS ${Math.round(n).toLocaleString('en-US')}`;
const fullName = (f: { firstName: string; lastName: string }) => `${f.firstName} ${f.lastName}`.trim();
const PENALTY = /^(Late penalty|Overdue-debt penalty)/;

/**
 * Combine harvester payments: the register of combine harvesters by registration number, what each harvested hectare yielded in bags
 * (baskets converted at the AMCOS's own rate) and what was paid for it, who among the canal and block leaders collected the money and when,
 * a receipt for each, and the list of payments still waiting to be collected.
 */
@Injectable()
export class HarvestCollectionsService {
  private readonly logger = new Logger(HarvestCollectionsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly scopeService: IrrigationScopeService,
    private readonly sms: SmsService,
  ) {}

  private tenant(actor: RequestUser, requested?: string): string {
    const own = this.ownership.resolveTenantMamcosId(actor);
    const id = own ?? requested ?? null;
    if (!id) throw new BadRequestException('Choose a cooperative');
    if (own && requested && requested !== own) throw new ForbiddenException('You can only work with your own cooperative');
    return id;
  }

  // ───────────────────────── settings ─────────────────────────

  async settings(actor: RequestUser, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const s = await this.prisma.harvestSetting.findUnique({ where: { mamcosId } });
    return { basketsPerBag: s ? num(s.basketsPerBag) : 2, pricePerBag: s?.pricePerBag == null ? null : num(s.pricePerBag), configured: !!s };
  }

  async saveSettings(actor: RequestUser, dto: HarvestSettingDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    await this.prisma.harvestSetting.upsert({
      where: { mamcosId }, create: { mamcosId, basketsPerBag: dto.basketsPerBag, pricePerBag: dto.pricePerBag ?? null, updatedById: actor.id },
      update: { basketsPerBag: dto.basketsPerBag, pricePerBag: dto.pricePerBag ?? null, updatedById: actor.id },
    });
    return this.settings(actor, mamcosId);
  }

  // ───────────────────────── combine harvesters ─────────────────────────

  private shapeCombine(c: { id: string; registrationNumber: string; make: string | null; model: string | null; ownerName: string; ownerPhone: string | null; operatorName: string | null; operatorPhone: string | null; note: string | null; isActive: boolean }) {
    return { id: c.id, registrationNumber: c.registrationNumber, make: c.make, model: c.model, ownerName: c.ownerName, ownerPhone: c.ownerPhone, operatorName: c.operatorName, operatorPhone: c.operatorPhone, note: c.note, isActive: c.isActive };
  }

  async createCombine(actor: RequestUser, dto: CreateCombineDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const registrationNumber = normReg(dto.registrationNumber);
    if (registrationNumber.length < 3) throw new BadRequestException('Enter the combine harvester’s registration number');
    try {
      const c = await this.prisma.combineHarvester.create({
        data: { mamcosId, registrationNumber, make: dto.make?.trim() || null, model: dto.model?.trim() || null, ownerName: dto.ownerName.trim(), ownerPhone: dto.ownerPhone?.trim() || null, operatorName: dto.operatorName?.trim() || null, operatorPhone: dto.operatorPhone?.trim() || null, note: dto.note?.trim() || null, createdById: actor.id },
      });
      return this.shapeCombine(c);
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('A combine harvester with this registration number is already registered');
      throw e;
    }
  }

  async updateCombine(actor: RequestUser, id: string, dto: UpdateCombineDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    if (!(await this.prisma.combineHarvester.findFirst({ where: { id, mamcosId }, select: { id: true } }))) throw new NotFoundException('Combine harvester not found');
    const clean = (v?: string) => (v === undefined ? undefined : v.trim() || null);
    const c = await this.prisma.combineHarvester.update({
      where: { id },
      data: { make: clean(dto.make), model: clean(dto.model), ownerName: dto.ownerName?.trim(), ownerPhone: clean(dto.ownerPhone), operatorName: clean(dto.operatorName), operatorPhone: clean(dto.operatorPhone), note: clean(dto.note), isActive: dto.isActive },
    });
    return this.shapeCombine(c);
  }

  async listCombines(actor: RequestUser, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const rows = await this.prisma.combineHarvester.findMany({ where: { mamcosId }, orderBy: [{ isActive: 'desc' }, { registrationNumber: 'asc' }] });
    return { data: rows.map((c) => this.shapeCombine(c)) };
  }

  /** Typing a registration number brings up the machine's registered details. */
  async lookupCombine(actor: RequestUser, registration: string, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const key = normReg(registration ?? '');
    const c = key ? await this.prisma.combineHarvester.findUnique({ where: { mamcosId_registrationNumber: { mamcosId, registrationNumber: key } } }) : null;
    if (!c) throw new NotFoundException('No combine harvester is registered with this number');
    return this.shapeCombine(c);
  }

  // ───────────────────────── leaders and the hectare ─────────────────────────

  /** The block leader and canal leader of a block, current terms only. */
  private async leadersOfBlock(block: { id: string; canalId: string }) {
    const rows = await this.prisma.irrigationLeadership.findMany({
      where: { status: 'ACTIVE', AND: [{ OR: [{ termEnd: null }, { termEnd: { gte: todayUtc() } }] }, { OR: [{ position: 'BLOCK_LEADER', blockId: block.id }, { position: 'CANAL_LEADER', canalId: block.canalId }] }] },
      select: { position: true, farmer: { select: { id: true, firstName: true, lastName: true, user: { select: { phone: true, language: true } } } } },
    });
    return rows.map((r) => ({ position: r.position as string, farmerId: r.farmer.id, name: fullName(r.farmer), phone: r.farmer.user?.phone ?? null, language: r.farmer.user?.language ?? null }));
  }

  private async hectareByFarmId(actor: RequestUser, mamcosId: string, farmId: string) {
    const code = normalizeFarmId(farmId);
    if (!/^\d+\.\d+[LR]\d+$/i.test(code)) throw new BadRequestException('Enter the full Farm ID, for example 1:1R-1');
    const scope = await this.scopeService.resolve(actor);
    const h = await this.prisma.irrigationHectare.findFirst({
      where: { AND: [this.scopeService.hectareWhere(scope), { code: { equals: code, mode: 'insensitive' } }, { block: { canal: { scheme: { mamcosId } } } }] },
      include: { block: { select: { id: true, code: true, canalId: true } } },
    });
    if (!h) throw new NotFoundException('No hectare with this Farm ID in your area');
    return { hectare: h, scope };
  }

  private async cultivatorOf(hectareId: string) {
    const a = await this.prisma.irrigationHectareAllocation.findFirst({
      where: { hectareId, status: 'ACTIVE' }, select: { farmer: { select: { id: true, firstName: true, lastName: true, controlNumber: true, user: { select: { phone: true, language: true } } } } },
    });
    return a?.farmer ?? null;
  }

  /** The Farm ID typed in: who farms it, and who the leaders are, before anything is recorded. */
  async context(actor: RequestUser, farmId: string, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const { hectare } = await this.hectareByFarmId(actor, mamcosId, farmId);
    const [farmer, leaders] = await Promise.all([this.cultivatorOf(hectare.id), this.leadersOfBlock(hectare.block)]);
    return {
      hectareId: hectare.id, farmId: farmIdDisplay(hectare.code), farmer: farmer ? { id: farmer.id, name: fullName(farmer), memberNumber: farmer.controlNumber } : null,
      leaders: leaders.map((l) => ({ farmerId: l.farmerId, name: l.name, position: l.position })),
    };
  }

  // ───────────────────────── recording ─────────────────────────

  private async receiptNo(mamcosId: string, attempt: number) {
    const year = new Date().getUTCFullYear();
    const n = await this.prisma.harvestCollection.count({ where: { mamcosId, receiptNo: { startsWith: `HC-${year}-` } } });
    return `HC-${year}-${String(n + 1 + attempt).padStart(4, '0')}`;
  }

  async create(actor: RequestUser, dto: CreateCollectionDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const { hectare, scope } = await this.hectareByFarmId(actor, mamcosId, dto.farmId);
    const combine = await this.prisma.combineHarvester.findUnique({ where: { mamcosId_registrationNumber: { mamcosId, registrationNumber: normReg(dto.registrationNumber) } } });
    if (!combine) throw new NotFoundException('No combine harvester is registered with this number');
    if (!combine.isActive) throw new BadRequestException('This combine harvester is no longer active');
    const harvestedOn = dto.harvestedOn ? new Date(`${dto.harvestedOn.slice(0, 10)}T00:00:00.000Z`) : todayUtc();
    if (harvestedOn > todayUtc()) throw new BadRequestException('The harvest date cannot be in the future');
    const bags = dto.bags ?? 0; const baskets = dto.baskets ?? 0;
    if (!bags && !baskets && !dto.quantityKg) throw new BadRequestException('Record how much was harvested: bags, baskets or kilograms');
    const settings = await this.settings(actor, mamcosId);
    const totalBags = thousandths(bags + baskets / settings.basketsPerBag);
    const collected = dto.collected !== false;

    const leaders = await this.leadersOfBlock(hectare.block);
    let collector: (typeof leaders)[number] | undefined;
    if (collected) {
      const wanted = dto.collectorFarmerId ?? scope.farmerId ?? undefined;
      collector = leaders.find((l) => l.farmerId === wanted);
      if (!collector) throw new BadRequestException(dto.collectorFarmerId ? 'The person who collected the money must be the canal leader or block leader of this block' : 'Choose the canal or block leader who received the money');
    }
    const farmer = await this.cultivatorOf(hectare.id);

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const row = await this.prisma.harvestCollection.create({
          data: {
            mamcosId, receiptNo: await this.receiptNo(mamcosId, attempt), hectareId: hectare.id, blockId: hectare.block.id, farmerId: farmer?.id ?? null, combineId: combine.id, harvestedOn,
            quantityKg: dto.quantityKg ?? null, bagsCounted: bags, basketsCounted: baskets, basketsPerBag: settings.basketsPerBag, totalBags, pricePerBag: settings.pricePerBag, amount: dto.amount,
            status: collected ? 'COLLECTED' : 'PENDING', collectedAt: collected ? new Date() : null, collectedByFarmerId: collector?.farmerId ?? null, collectedByName: collector?.name ?? null, collectedByPosition: collector?.position ?? null,
            note: dto.note?.trim() || null, recordedById: actor.id,
          },
        });
        if (collected) await this.notify(mamcosId, row.id).catch((e) => this.logger.warn(`Could not send harvest payment texts: ${e instanceof Error ? e.message : e}`));
        return this.receipt(actor, row.id, mamcosId);
      } catch (e: any) { if (e?.code !== 'P2002') throw e; }
    }
    throw new ConflictException('Could not number the receipt. Try again');
  }

  /** A pending payment has been received by a canal or block leader. */
  async collect(actor: RequestUser, id: string, collectorFarmerId: string | undefined, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const row = await this.loadScoped(actor, mamcosId, id);
    if (row.voidedAt) throw new ConflictException('This payment was voided');
    if (row.status === 'COLLECTED') throw new ConflictException('This payment is already recorded as collected');
    const block = await this.prisma.irrigationBlock.findUniqueOrThrow({ where: { id: row.blockId }, select: { id: true, canalId: true } });
    const leaders = await this.leadersOfBlock(block);
    const scope = await this.scopeService.resolve(actor);
    const collector = leaders.find((l) => l.farmerId === (collectorFarmerId ?? scope.farmerId));
    if (!collector) throw new BadRequestException(collectorFarmerId ? 'The person who collected the money must be the canal leader or block leader of this block' : 'Choose the canal or block leader who received the money');
    const claimed = await this.prisma.harvestCollection.updateMany({ where: { id, status: 'PENDING', voidedAt: null }, data: { status: 'COLLECTED', collectedAt: new Date(), collectedByFarmerId: collector.farmerId, collectedByName: collector.name, collectedByPosition: collector.position } });
    if (!claimed.count) throw new ConflictException('This payment has just been updated. Reload and try again');
    await this.notify(mamcosId, id).catch((e) => this.logger.warn(`Could not send harvest payment texts: ${e instanceof Error ? e.message : e}`));
    return this.receipt(actor, id, mamcosId);
  }

  async voidIt(actor: RequestUser, id: string, reason: string, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const row = await this.loadScoped(actor, mamcosId, id);
    if (row.voidedAt) throw new ConflictException('This payment is already voided');
    if (reason.trim().length < 3) throw new BadRequestException('Say why this payment is voided');
    await this.prisma.harvestCollection.update({ where: { id }, data: { voidedAt: new Date(), voidReason: reason.trim(), voidedById: actor.id } });
    return this.receipt(actor, id, mamcosId);
  }

  private async loadScoped(actor: RequestUser, mamcosId: string, id: string) {
    const row = await this.prisma.harvestCollection.findFirst({ where: { id, mamcosId } });
    if (!row) throw new NotFoundException('Payment not found');
    await this.scopeService.assertBlock(await this.scopeService.resolve(actor), row.blockId); // a leader reaches only their own block
    return row;
  }

  // ───────────────────────── texts ─────────────────────────

  private async notify(mamcosId: string, id: string) {
    const row = await this.prisma.harvestCollection.findUniqueOrThrow({ where: { id }, include: { combine: true } });
    const [mamcos, hectare, farmer] = await Promise.all([
      this.prisma.mamcos.findUnique({ where: { id: mamcosId }, select: { name: true } }),
      this.prisma.irrigationHectare.findUniqueOrThrow({ where: { id: row.hectareId }, select: { code: true, block: { select: { id: true, canalId: true } } } }),
      this.cultivatorOf(row.hectareId),
    ]);
    const farm = farmIdDisplay(hectare.code); const amcos = mamcos?.name ?? 'AMCOS'; const reg = row.combine.registrationNumber; const bags = thousandths(num(row.totalBags));
    const send = async (phone: string | null | undefined, body: string) => { if (phone) await this.sms.send(phone, body, 'harvest_collection').catch(() => undefined); };
    if (farmer) {
      const en = farmer.user?.language === 'en';
      const text = en
        ? `Thank you. ${amcos} has received the combine harvesting payment for Farm ID ${farm} (combine ${reg}, ${bags} bags), ${tzs(num(row.amount))}. Receipt ${row.receiptNo}. We appreciate your cooperation.`
        : `Asante. ${amcos} imepokea malipo ya uvunaji wa kombaini kwa Shamba ${farm} (kombaini ${reg}, mifuko ${bags}), ${tzs(num(row.amount))}. Stakabadhi ${row.receiptNo}. Tunathamini ushirikiano wako.`;
      if (farmer.user?.phone) await send(farmer.user.phone, text);
      for (const sv of await supervisorsOfFarmer(this.prisma, farmer.id)) if (sv.phone !== farmer.user?.phone) await send(sv.phone, text);
    }
    for (const l of await this.leadersOfBlock(hectare.block)) {
      const en = l.language === 'en';
      await send(l.phone, en
        ? `${amcos} ${row.receiptNo}: combine ${reg} harvested Farm ID ${farm}${farmer ? ` (${fullName(farmer)})` : ''}, ${bags} bags, ${tzs(num(row.amount))} collected by ${row.collectedByName}.`
        : `${amcos} ${row.receiptNo}: kombaini ${reg} imevuna Shamba ${farm}${farmer ? ` (${fullName(farmer)})` : ''}, mifuko ${bags}, ${tzs(num(row.amount))} imekusanywa na ${row.collectedByName}.`);
    }
  }

  // ───────────────────────── reading ─────────────────────────

  private async shapeMany(rows: Prisma.HarvestCollectionGetPayload<{ include: { combine: true } }>[]) {
    const hect = await this.prisma.irrigationHectare.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.hectareId))] } }, select: { id: true, code: true } });
    const farmers = await this.prisma.farmer.findMany({ where: { id: { in: [...new Set(rows.flatMap((r) => (r.farmerId ? [r.farmerId] : [])))] } }, select: { id: true, firstName: true, lastName: true, controlNumber: true } });
    const h = new Map(hect.map((x) => [x.id, x.code])); const f = new Map(farmers.map((x) => [x.id, x]));
    return rows.map((r) => ({
      id: r.id, receiptNo: r.receiptNo, farmId: farmIdDisplay(h.get(r.hectareId)), hectareId: r.hectareId, farmer: r.farmerId && f.get(r.farmerId) ? { id: r.farmerId, name: fullName(f.get(r.farmerId)!), memberNumber: f.get(r.farmerId)!.controlNumber } : null,
      combine: { id: r.combine.id, registrationNumber: r.combine.registrationNumber, make: r.combine.make, model: r.combine.model, ownerName: r.combine.ownerName, operatorName: r.combine.operatorName },
      harvestedOn: ymd(r.harvestedOn), quantityKg: r.quantityKg == null ? null : num(r.quantityKg), bagsCounted: r.bagsCounted, basketsCounted: num(r.basketsCounted), basketsPerBag: num(r.basketsPerBag), totalBags: num(r.totalBags),
      income: r.pricePerBag == null ? null : cents(num(r.totalBags) * num(r.pricePerBag)), amount: num(r.amount), status: r.status, collectedAt: r.collectedAt, collectedByName: r.collectedByName, collectedByPosition: r.collectedByPosition,
      note: r.note, createdAt: r.createdAt, voidedAt: r.voidedAt, voidReason: r.voidReason,
      daysWaiting: r.status === 'PENDING' && !r.voidedAt ? Math.floor((Date.now() - +r.createdAt) / 86_400_000) : null,
    }));
  }

  async receipt(actor: RequestUser, id: string, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const row = await this.prisma.harvestCollection.findFirst({ where: { id, mamcosId }, include: { combine: true } });
    if (!row) throw new NotFoundException('Payment not found');
    await this.scopeService.assertBlock(await this.scopeService.resolve(actor), row.blockId);
    const mamcos = await this.prisma.mamcos.findUnique({ where: { id: mamcosId }, select: { name: true } });
    return { ...(await this.shapeMany([row]))[0], amcos: mamcos?.name ?? '' };
  }

  private async where(actor: RequestUser, mamcosId: string, q: CollectionQueryDto): Promise<Prisma.HarvestCollectionWhereInput> {
    const scope = await this.scopeService.resolve(actor);
    const blocks = await this.prisma.irrigationBlock.findMany({ where: { AND: [this.scopeService.blockWhere(scope), { canal: { scheme: { mamcosId } } }] }, select: { id: true } });
    return {
      mamcosId, blockId: q.blockId ? (blocks.some((b) => b.id === q.blockId) ? q.blockId : '-') : { in: blocks.map((b) => b.id) }, voidedAt: null,
      ...(q.status && q.status !== 'ALL' ? { status: q.status as 'PENDING' | 'COLLECTED' } : {}), ...(q.combineId ? { combineId: q.combineId } : {}), ...(q.hectareId ? { hectareId: q.hectareId } : {}),
      ...(q.from || q.to ? { harvestedOn: { ...(q.from ? { gte: new Date(`${q.from.slice(0, 10)}T00:00:00.000Z`) } : {}), ...(q.to ? { lte: new Date(`${q.to.slice(0, 10)}T00:00:00.000Z`) } : {}) } } : {}),
    };
  }

  async list(actor: RequestUser, q: CollectionQueryDto) {
    const mamcosId = this.tenant(actor, q.mamcosId);
    const rows = await this.prisma.harvestCollection.findMany({ where: await this.where(actor, mamcosId, q), orderBy: { createdAt: 'desc' }, take: 200, include: { combine: true } });
    return { data: await this.shapeMany(rows) };
  }

  /** What each combine harvester has brought in and what is still to be collected. */
  async byCombine(actor: RequestUser, q: CollectionQueryDto) {
    const mamcosId = this.tenant(actor, q.mamcosId);
    const rows = await this.prisma.harvestCollection.findMany({ where: await this.where(actor, mamcosId, { ...q, status: 'ALL' }), include: { combine: true } });
    const by = new Map<string, { combine: { id: string; registrationNumber: string; ownerName: string }; hectares: Set<string>; bags: number; collected: number; pending: number; payments: number }>();
    for (const r of rows) {
      const e = by.get(r.combineId) ?? { combine: { id: r.combine.id, registrationNumber: r.combine.registrationNumber, ownerName: r.combine.ownerName }, hectares: new Set<string>(), bags: 0, collected: 0, pending: 0, payments: 0 };
      e.hectares.add(r.hectareId); e.bags = thousandths(e.bags + num(r.totalBags)); e.payments++;
      if (r.status === 'COLLECTED') e.collected = cents(e.collected + num(r.amount)); else e.pending = cents(e.pending + num(r.amount));
      by.set(r.combineId, e);
    }
    const data = [...by.values()].map((e) => ({ combine: e.combine, hectares: e.hectares.size, payments: e.payments, bags: e.bags, collected: e.collected, pending: e.pending })).sort((a, b) => b.collected - a.collected);
    return { data, totals: { collected: cents(data.reduce((n, d) => n + d.collected, 0)), pending: cents(data.reduce((n, d) => n + d.pending, 0)), bags: thousandths(data.reduce((n, d) => n + d.bags, 0)) } };
  }

  /** One hectare's harvest and money history: bags, income, what was paid, who collected it and when. */
  async hectareHistory(actor: RequestUser, hectareId: string, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    await this.scopeService.assertHectare(await this.scopeService.resolve(actor), hectareId);
    return this.hectareSummary(mamcosId, hectareId, 50);
  }

  async hectareSummary(mamcosId: string, hectareId: string, take = 10) {
    const rows = await this.prisma.harvestCollection.findMany({ where: { mamcosId, hectareId, voidedAt: null }, orderBy: { harvestedOn: 'desc' }, include: { combine: true } });
    const incomeRows = rows.filter((r) => r.pricePerBag != null);
    const totals = {
      harvests: rows.length, bags: thousandths(rows.reduce((n, r) => n + num(r.totalBags), 0)), kg: cents(rows.reduce((n, r) => n + num(r.quantityKg), 0)),
      income: incomeRows.length ? cents(incomeRows.reduce((n, r) => n + num(r.totalBags) * num(r.pricePerBag), 0)) : null,
      collected: cents(rows.filter((r) => r.status === 'COLLECTED').reduce((n, r) => n + num(r.amount), 0)), pending: cents(rows.filter((r) => r.status === 'PENDING').reduce((n, r) => n + num(r.amount), 0)),
    };
    return { totals, data: await this.shapeMany(rows.slice(0, take)) };
  }

  /**
   * Payments that are waiting but are not overdue debt: combine harvest payments not yet collected, and every other charge or contribution
   * that is still unpaid (harvest fees, contributions). Only the annual farm levy follows the overdue-debt procedure, so none of these go to M-LAX.
   */
  async pendingPayments(actor: RequestUser, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const scope = await this.scopeService.resolve(actor);
    const [collections, dues] = await Promise.all([
      this.prisma.harvestCollection.findMany({ where: await this.where(actor, mamcosId, { status: 'PENDING' }), orderBy: { createdAt: 'asc' }, take: 200, include: { combine: true } }),
      scope.restricted ? Promise.resolve([]) : this.prisma.farmerDue.findMany({
        where: { mamcosId, status: 'ACTIVE', category: { not: 'LEVY' } }, orderBy: { issuedOn: 'asc' }, take: 400,
        include: { payments: { where: { voidedAt: null }, select: { amount: true } }, farmer: { select: { id: true, firstName: true, lastName: true, controlNumber: true } } },
      }),
    ]);
    const shaped = await this.shapeMany(collections);
    const blockOf = new Map(collections.map((c) => [c.id, c.blockId]));
    const blocks = await this.prisma.irrigationBlock.findMany({ where: { id: { in: [...new Set(blockOf.values())] } }, select: { id: true, canalId: true } });
    const leadersByBlock = new Map<string, string[]>();
    for (const b of blocks) leadersByBlock.set(b.id, (await this.leadersOfBlock(b)).map((l) => l.name));
    const dueRows = dues.map((d) => ({ d, balance: cents(num(d.amount) - num(d.waivedAmount) - d.payments.reduce((n, p) => n + num(p.amount), 0)) })).filter((x) => x.balance > 0 && !PENALTY.test(x.d.description));
    const farmerIds = [...new Set(dueRows.map((x) => x.d.farmerId))];
    const held = await this.prisma.irrigationHectareAllocation.findMany({ where: { farmerId: { in: farmerIds }, status: 'ACTIVE' }, select: { farmerId: true, hectare: { select: { code: true } } } });
    const farmIds = new Map<string, string[]>();
    for (const h of held) farmIds.set(h.farmerId, [...(farmIds.get(h.farmerId) ?? []), farmIdDisplay(h.hectare.code)]);
    const rows = [
      ...shaped.map((c) => ({
        kind: 'HARVEST_PAYMENT' as const, id: c.id, what: `Combine harvest payment ${c.receiptNo}`, who: c.farmer?.name ?? '', farmIds: [c.farmId], amount: c.amount, since: c.createdAt, daysWaiting: c.daysWaiting ?? 0,
        detail: `Combine ${c.combine.registrationNumber}. Waiting for ${(leadersByBlock.get(blockOf.get(c.id) ?? '') ?? []).join(' or ') || 'the canal or block leader'} to record the money.`,
      })),
      ...dueRows.map(({ d, balance }) => ({
        kind: 'CHARGE' as const, id: d.id, what: d.description, who: fullName(d.farmer), farmIds: farmIds.get(d.farmerId) ?? [], amount: balance, since: d.issuedOn, daysWaiting: Math.floor((Date.now() - +d.issuedOn) / 86_400_000),
        detail: d.category === 'HARVEST_FEE' ? 'Harvest fee not yet paid' : 'Contribution not yet paid',
      })),
    ].sort((a, b) => b.daysWaiting - a.daysWaiting);
    return { data: rows, totals: { harvestPayments: shaped.length, charges: dueRows.length, amount: cents(rows.reduce((n, r) => n + r.amount, 0)) } };
  }
}
