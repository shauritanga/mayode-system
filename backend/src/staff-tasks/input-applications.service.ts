import { createHash, randomInt } from 'crypto';
import { assertFarmUsable } from '../irrigation/farm-debt';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { SmsService } from '../messaging/sms.service';
import { farmIdDisplay } from '../irrigation/irrigation-codes';
import { CreditInterestService } from '../credit-interest/credit-interest.service';
import { InputStockService } from '../input-stock/input-stock.service';
import { InputWarehouseService } from './input-warehouse.service';
import { InputDistributionService } from './input-distribution.service';
import { ApplyForInputsDto } from './dto/staff-tasks.dto';
import { cents, num, tenantOf, today, tzs } from './common';
import { loadTerms, loanSummary, quoteLoan } from '../credit-interest/loan-quote';

export const TERMS_VERSION = 'v1';
const TERMS = {
  en: [
    'I am applying for the inputs listed for the hectares I have chosen, and I confirm they are the hectares I farm.',
    'The inputs are given on credit. Their cost, at the price on the day they are given, is charged to my account with the AMCOS and I must pay it by the due date the AMCOS sets.',
    'The AMCOS may approve, change or decline my application, depending on the stock it has. An application is not a promise that inputs will be given.',
    'I will use the inputs only on my own hectares, and I will collect them at the AMCOS and confirm receiving them with the code sent to my phone.',
    'If I do not pay what I owe, the AMCOS may follow its normal rules for unpaid member debts.',
  ],
  sw: [
    'Naomba pembejeo zilizoorodheshwa kwa hekta nilizozichagua, na nathibitisha ni hekta ninazolima.',
    'Pembejeo hutolewa kwa mkopo. Gharama yake, kwa bei ya siku zinapotolewa, itaandikwa kwenye akaunti yangu ya AMCOS nami nitalipa kabla ya tarehe AMCOS itakayoweka.',
    'AMCOS inaweza kukubali, kubadilisha au kukataa ombi langu kulingana na akiba iliyopo. Ombi si ahadi kwamba pembejeo zitatolewa.',
    'Nitatumia pembejeo kwenye hekta zangu tu, nitazichukua AMCOS na kuthibitisha kuzipokea kwa namba itakayotumwa kwenye simu yangu.',
    'Nisipolipa deni langu, AMCOS inaweza kutumia taratibu zake za kawaida za madeni ya wanachama.',
  ],
};
const termsFor = (language?: string | null) => (language === 'en' ? TERMS.en : TERMS.sw);

/**
 * Farmers apply for inputs in the mobile app; the office reviews and approves. Approving gives the inputs out through the normal
 * Input Distribution flow, so the stock, the charge to the farmer and the confirmation code work exactly as they do at the office.
 */
@Injectable()
export class InputApplicationsService {
  private readonly logger = new Logger(InputApplicationsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly sms: SmsService,
    private readonly distribution: InputDistributionService,
    private readonly interest: CreditInterestService,
    private readonly stock: InputStockService,
    private readonly warehouses: InputWarehouseService,
  ) {}

  /** The fixed terms, plus the AMCOS's own interest terms when it charges interest, so the farmer consents to them too. */
  private async termsLines(mamcosId: string, language?: string | null) {
    const lang = language === 'en' ? 'en' : 'sw';
    const lines = [...termsFor(language)];
    const i = await this.interest.describe(mamcosId, lang);
    if (i.enabled) lines.splice(2, 0, i.text);
    return lines;
  }

  // ───────────────────────── the farmer's side ─────────────────────────

  private async me(actor: RequestUser) {
    if (actor.role !== UserRole.FARMER) throw new ForbiddenException('Only a farmer can apply for inputs here');
    const f = await this.prisma.farmer.findUnique({ where: { userId: actor.id }, select: { id: true, mamcosId: true, isBlacklisted: true, user: { select: { language: true } } } });
    if (!f || !f.mamcosId) throw new ForbiddenException('Your account is not linked to an AMCOS yet');
    return { ...f, mamcosId: f.mamcosId };
  }

  private async hectaresOf(farmerId: string) {
    const held = await this.prisma.irrigationHectareAllocation.findMany({ where: { farmerId, status: 'ACTIVE' }, select: { hectare: { select: { code: true, areaHectares: true } } }, orderBy: { hectare: { code: 'asc' } } });
    return held.map((h) => ({ farmId: farmIdDisplay(h.hectare.code), areaHectares: num(h.hectare.areaHectares) }));
  }

  /** What the application form needs: the farmer's hectares, the inputs the AMCOS has, and the terms to accept. */
  async options(actor: RequestUser) {
    const f = await this.me(actor);
    const [hectares, items] = await Promise.all([this.hectaresOf(f.id), this.availableItems(f.mamcosId)]);
    return { hectares, items, terms: { version: TERMS_VERSION, lines: await this.termsLines(f.mamcosId, f.user?.language) }, blocked: f.isBlacklisted ? 'You cannot apply for inputs on credit right now. Please visit the AMCOS office.' : null };
  }

  private async availableItems(mamcosId: string) {
    const items = await this.prisma.farmInputItem.findMany({ where: { mamcosId, isActive: true, stockClass: 'INPUT' }, include: { inputType: { select: { name: true } } }, orderBy: [{ type: 'asc' }, { name: 'asc' }] });
    const sums = await this.prisma.farmInputMovement.groupBy({ by: ['itemId'], where: { itemId: { in: items.map((i) => i.id) } }, _sum: { quantity: true } });
    return items
      .map((i) => ({ id: i.id, name: i.name, typeName: i.inputType?.name ?? i.type.charAt(0) + i.type.slice(1).toLowerCase(), unit: i.unit, unitPrice: i.unitCost ?? 0, inStock: Math.round((sums.find((s) => s.itemId === i.id)?._sum.quantity ?? 0) * 1000) / 1000 }))
      .filter((i) => i.unitPrice > 0 && i.inStock > 0);
  }

  private async nextReference(mamcosId: string) {
    const year = new Date().getUTCFullYear();
    const count = await this.prisma.inputApplication.count({ where: { mamcosId, reference: { startsWith: `APP-${year}-` } } });
    return `APP-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  async apply(actor: RequestUser, dto: ApplyForInputsDto) {
    const f = await this.me(actor);
    if (f.isBlacklisted) throw new BadRequestException('You cannot apply for inputs on credit right now. Please visit the AMCOS office.');
    if (!dto.acceptTerms) throw new BadRequestException('You must accept the terms and conditions to apply');
    if (dto.termsVersion !== TERMS_VERSION) throw new BadRequestException('The terms have changed. Please read and accept them again');
    const hectares = await this.hectaresOf(f.id);
    const mine = new Set(hectares.map((h) => h.farmId));
    const farmIds = [...new Set(dto.farmIds)];
    if (farmIds.some((id) => !mine.has(id))) throw new BadRequestException('Choose only hectares that you farm');
    // A farm bought with dues still owing from before the sale cannot get inputs until the new owner has cleared them.
    const heldNow = await this.prisma.irrigationHectareAllocation.findMany({ where: { farmerId: f.id, status: 'ACTIVE' }, select: { hectareId: true, hectare: { select: { code: true } } } });
    for (const a of heldNow) if (farmIds.includes(farmIdDisplay(a.hectare.code))) await assertFarmUsable(this.prisma, a.hectareId);
    const merged = new Map<string, number>();
    for (const l of dto.lines) merged.set(l.itemId, (merged.get(l.itemId) ?? 0) + l.quantity);
    const items = await this.availableItems(f.mamcosId);
    const lines = [...merged].map(([itemId, quantity]) => {
      const it = items.find((i) => i.id === itemId);
      if (!it) throw new BadRequestException('One of the inputs you chose is not available now');
      return { itemId, itemName: it.name, unit: it.unit, quantity: Math.round(quantity * 1000) / 1000, unitPrice: it.unitPrice };
    });
    const open = await this.prisma.inputApplication.count({ where: { farmerId: f.id, status: { in: ['SUBMITTED', 'READY', 'PARTLY_ISSUED'] } } });
    if (open >= 3) throw new ConflictException('You already have applications waiting. Wait for the AMCOS to answer them first');
    const text = (await this.termsLines(f.mamcosId, f.user?.language)).map((t, i) => `${i + 1}. ${t}`).join('\n');
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const row = await this.prisma.inputApplication.create({
          data: { mamcosId: f.mamcosId, reference: await this.nextReference(f.mamcosId), farmerId: f.id, farmIds, note: dto.note?.trim() || null, termsVersion: TERMS_VERSION, termsText: text, consentAt: new Date(), lines: { create: lines } },
          include: { lines: true },
        });
        return this.shape(row, true);
      } catch (e: any) { if (e?.code !== 'P2002') throw e; }
    }
    throw new ConflictException('Could not number the application. Try again');
  }

  async mine(actor: RequestUser) {
    const f = await this.me(actor);
    const rows = await this.prisma.inputApplication.findMany({ where: { farmerId: f.id }, include: { lines: true }, orderBy: { submittedAt: 'desc' }, take: 50 });
    const whs = await this.warehouseNames(rows.map((r) => r.warehouseId));
    return { data: rows.map((r) => ({ ...this.shape(r, false), warehouse: whs.get(r.warehouseId ?? '') ?? null })) };
  }

  private async warehouseNames(ids: (string | null)[]) {
    const list = await this.prisma.warehouse.findMany({ where: { id: { in: ids.filter((x): x is string => !!x) } }, select: { id: true, name: true, location: true } });
    return new Map(list.map((w) => [w.id, { id: w.id, name: w.name, location: w.location }]));
  }

  async withdraw(actor: RequestUser, id: string) {
    const f = await this.me(actor);
    const claimed = await this.prisma.inputApplication.updateMany({ where: { id, farmerId: f.id, status: 'SUBMITTED' }, data: { status: 'WITHDRAWN', decidedAt: new Date() } });
    if (!claimed.count) {
      const exists = await this.prisma.inputApplication.findFirst({ where: { id, farmerId: f.id }, select: { status: true } });
      if (!exists) throw new NotFoundException('Application not found');
      throw new ConflictException('This application is already being handled and cannot be withdrawn');
    }
    return { id, status: 'WITHDRAWN' };
  }

  // ───────────────────────── the office's side ─────────────────────────

  async list(actor: RequestUser, q: { status?: string }, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    const rows = await this.prisma.inputApplication.findMany({
      where: { mamcosId, ...(q.status && q.status !== 'ALL' ? { status: q.status === 'OPEN' ? { in: ['SUBMITTED', 'PARTLY_ISSUED'] } : q.status } : {}) },
      include: { lines: true }, orderBy: { submittedAt: 'desc' }, take: 200,
    });
    const farmers = await this.prisma.farmer.findMany({ where: { id: { in: rows.map((r) => r.farmerId) } }, select: { id: true, firstName: true, lastName: true, controlNumber: true, user: { select: { phone: true } } } });
    const by = new Map(farmers.map((x) => [x.id, x]));
    const whs = await this.warehouseNames(rows.map((r) => r.warehouseId));
    return { data: rows.map((r) => { const fa = by.get(r.farmerId); return { ...this.shape(r, true), warehouse: whs.get(r.warehouseId ?? '') ?? null, codeHint: r.collectCodeHint, collectedAt: r.collectedAt, farmer: fa ? { id: fa.id, name: `${fa.firstName} ${fa.lastName}`, memberNumber: fa.controlNumber, phone: fa.user?.phone ?? null } : null }; }) };
  }

  /** The counts for the badge on the tab. */
  async openCount(actor: RequestUser, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    return { open: await this.prisma.inputApplication.count({ where: { mamcosId, status: { in: ['SUBMITTED', 'PARTLY_ISSUED'] } } }) };
  }

  // ───────────────────────── approving, and collecting at the warehouse ─────────────────────────

  private newCode() {
    return String(randomInt(0, 1_000_000)).padStart(6, '0'); // 6 digits: easy to read out and type
  }
  private norm(code: string) { return code.replace(/[^A-Za-z0-9]/g, '').toUpperCase(); }
  private hashOf(mamcosId: string, code: string) { return createHash('sha256').update(`${mamcosId}:${this.norm(code)}`).digest('hex'); }
  private pretty(code: string) { return code; }

  /** What the warehouse holds, less what is already promised to other approved farmers, for each requested input. */
  private async shortages(mamcosId: string, warehouseId: string, lines: { itemId: string; itemName: string; unit: string; quantity: number }[], exceptAppId?: string) {
    const promised = await this.prisma.inputApplicationLine.findMany({ where: { issueId: null, application: { mamcosId, warehouseId, status: { in: ['READY', 'PARTLY_ISSUED', 'PROCESSING'] }, ...(exceptAppId ? { id: { not: exceptAppId } } : {}) } }, select: { itemId: true, quantity: true } });
    const out: string[] = [];
    for (const l of lines) {
      const have = await this.stock.availableIn(l.itemId, mamcosId, warehouseId);
      const held = promised.filter((x) => x.itemId === l.itemId).reduce((n, x) => n + x.quantity, 0);
      const free = Math.round((have - held) * 1000) / 1000;
      if (l.quantity > free + 1e-6) out.push(`${l.itemName}: ${l.quantity} ${l.unit} needed, ${Math.max(0, free)} ${l.unit} free${held ? ` (${held} already promised to other farmers)` : ''}`);
    }
    return out;
  }

  private async pickWarehouse(mamcosId: string, lines: { itemId: string; itemName: string; unit: string; quantity: number }[], wanted?: string) {
    if (wanted) {
      const w = await this.prisma.warehouse.findFirst({ where: { id: wanted, mamcosId, isActive: true }, select: { id: true, name: true, location: true } });
      if (!w) throw new BadRequestException('Choose one of your own active warehouses');
      return w;
    }
    const all = await this.prisma.warehouse.findMany({ where: { mamcosId, isActive: true }, select: { id: true, name: true, location: true }, orderBy: { name: 'asc' } });
    const fit: typeof all = [];
    for (const w of all) if (!(await this.shortages(mamcosId, w.id, lines)).length) fit.push(w);
    if (fit.length === 1) return fit[0];
    throw new BadRequestException(fit.length ? 'More than one warehouse can supply this. Choose where the farmer should collect' : 'No single warehouse holds all of these inputs. Choose a warehouse, or ask for fewer inputs');
  }

  private async tellFarmerReady(app: { reference: string; farmerId: string; farmIds: string[] }, code: string, warehouse: { name: string; location: string | null }, lines: { itemName: string; quantity: number; unit: string; unitPrice?: unknown }[], mamcosId: string, resent = false) {
    const farmer = await this.prisma.farmer.findUnique({ where: { id: app.farmerId }, select: { user: { select: { phone: true, language: true } } } });
    const phone = farmer?.user?.phone; if (!phone) return false;
    const mamcos = await this.prisma.mamcos.findUnique({ where: { id: mamcosId }, select: { name: true } });
    const en = farmer?.user?.language === 'en';
    const items = lines.map((l) => `${l.itemName} ${l.quantity} ${l.unit}`).join(', ');
    const where = `${warehouse.name}${warehouse.location ? ` (${warehouse.location})` : ''}`;
    const plots = app.farmIds.length ? ` Farm ID ${app.farmIds.slice(0, 3).join(', ')}${app.farmIds.length > 3 ? '…' : ''}.` : '';
    // The first message (approval) tells the farmer exactly what the credit will cost; a re-sent code does not repeat it.
    let loan = '';
    if (!resent) {
      try {
        const principal = cents(lines.reduce((n, l) => n + num(l.quantity) * num(l.unitPrice), 0));
        if (principal > 0) {
          const { terms, rates } = await loadTerms(this.prisma, mamcosId);
          loan = ` ${loanSummary(quoteLoan(terms, rates, principal, today(), null), farmer?.user?.language)}${en ? ' (based on today\'s prices)' : ' (kwa bei za leo)'}`;
        }
      } catch (e) { this.logger.warn(`Could not work out the loan terms for the approval text: ${e instanceof Error ? e.message : e}`); }
    }
    const body = en
      ? `${mamcos?.name ?? 'AMCOS'} ${app.reference}: ${resent ? 'new code. ' : 'approved. '}Fertiliser: ${items}.${loan}${plots} Collect at: ${where}. Collection code: ${this.pretty(code)}. Show this code to the warehouse keeper. Do not share it with anyone else.`
      : `${mamcos?.name ?? 'AMCOS'} ${app.reference}: ${resent ? 'namba mpya. ' : 'imekubaliwa. '}Mbolea: ${items}.${loan}${plots} Chukua: ${where}. Namba ya kuchukulia: ${this.pretty(code)}. Mwonyeshe mtunza ghala namba hii. Usimpe mtu mwingine.`;
    try { await this.sms.send(phone, body, 'input_application'); return true; } catch (e) { this.logger.warn(`Could not text the collection code: ${e instanceof Error ? e.message : e}`); return false; }
  }

  /**
   * Approve: the farmer is told which warehouse to collect from and gets an authorization code. Nothing leaves the warehouse yet:
   * stock is deducted only when the keeper confirms the collection. The quantities are set aside so they are not promised twice.
   */
  async approve(actor: RequestUser, id: string, warehouseId: string | undefined, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    const app = await this.prisma.inputApplication.findFirst({ where: { id, mamcosId }, include: { lines: true } });
    if (!app) throw new NotFoundException('Application not found');
    if (app.status !== 'SUBMITTED') throw new ConflictException('This application has already been dealt with');
    const lines = app.lines.map((l) => ({ itemId: l.itemId, itemName: l.itemName, unit: l.unit, quantity: l.quantity }));
    const wh = await this.pickWarehouse(mamcosId, lines, warehouseId);
    const short = await this.shortages(mamcosId, wh.id, lines);
    if (short.length) throw new ConflictException(`${wh.name} does not have enough: ${short.join('; ')}`);
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = this.newCode();
      try {
        const claimed = await this.prisma.inputApplication.updateMany({ where: { id, status: 'SUBMITTED' }, data: { status: 'READY', warehouseId: wh.id, collectCodeHash: this.hashOf(mamcosId, code), collectCodeHint: code.slice(-2), readyAt: new Date(), decidedById: actor.id, decidedAt: new Date() } });
        if (!claimed.count) throw new ConflictException('This application has already been dealt with');
        const texted = await this.tellFarmerReady(app, code, wh, app.lines, mamcosId);
        return { id, status: 'READY', warehouse: wh.name, codeSent: texted };
      } catch (e: any) { if (e?.code !== 'P2002') throw e; }
    }
    throw new ConflictException('Could not make a code. Try again');
  }

  /** A new code (and, if nothing has been collected yet, optionally another warehouse), when the farmer lost it. The old code stops working. */
  async resend(actor: RequestUser, id: string, warehouseId: string | undefined, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    const app = await this.prisma.inputApplication.findFirst({ where: { id, mamcosId }, include: { lines: true } });
    if (!app) throw new NotFoundException('Application not found');
    if (!['READY', 'PARTLY_ISSUED'].includes(app.status)) throw new ConflictException('This application is not waiting for collection');
    const left = app.lines.filter((l) => !l.issueId);
    const lines = left.map((l) => ({ itemId: l.itemId, itemName: l.itemName, unit: l.unit, quantity: l.quantity }));
    let wh = (await this.prisma.warehouse.findFirst({ where: { id: app.warehouseId ?? '' }, select: { id: true, name: true, location: true } }))!;
    if (warehouseId && warehouseId !== app.warehouseId) {
      if (app.status !== 'READY') throw new ConflictException('Part of this has already been collected, so the warehouse cannot change');
      wh = await this.pickWarehouse(mamcosId, lines, warehouseId);
      const short = await this.shortages(mamcosId, wh.id, lines, app.id);
      if (short.length) throw new ConflictException(`${wh.name} does not have enough: ${short.join('; ')}`);
    }
    let code = this.newCode();
    for (let attempt = 0; ; attempt++) {
      try { await this.prisma.inputApplication.update({ where: { id }, data: { collectCodeHash: this.hashOf(mamcosId, code), collectCodeHint: code.slice(-2), warehouseId: wh.id } }); break; }
      catch (e: any) { if (e?.code !== 'P2002' || attempt >= 4) throw e; code = this.newCode(); }
    }
    return { id, warehouse: wh.name, codeSent: await this.tellFarmerReady(app, code, wh, left, mamcosId, true) };
  }

  async reject(actor: RequestUser, id: string, reason: string, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    const app = await this.prisma.inputApplication.findFirst({ where: { id, mamcosId } });
    if (!app) throw new NotFoundException('Application not found');
    const claimed = await this.prisma.inputApplication.updateMany({ where: { id, status: { in: ['SUBMITTED', 'READY'] } }, data: { status: 'REJECTED', rejectReason: reason.trim(), decidedById: actor.id, decidedAt: new Date(), collectCodeHash: null } });
    if (!claimed.count) throw new ConflictException('This application has already been dealt with');
    const farmer = await this.prisma.farmer.findUnique({ where: { id: app.farmerId }, select: { user: { select: { phone: true, language: true } } } });
    if (farmer?.user?.phone) {
      const en = farmer.user.language === 'en';
      const body = en ? `MAYODE ${app.reference}: your input application was not approved. Reason: ${reason.trim()}. Please visit the AMCOS office.` : `MAYODE ${app.reference}: ombi lako la pembejeo halijakubaliwa. Sababu: ${reason.trim()}. Tafadhali tembelea ofisi ya AMCOS.`;
      await this.sms.send(farmer.user.phone, body, 'input_application').catch((e) => this.logger.warn(`Could not text a rejection: ${e instanceof Error ? e.message : e}`));
    }
    return { id, status: 'REJECTED' };
  }

  /** The warehouse keeper types the code the farmer shows. Only the keeper of that warehouse (or someone with full rights) may use it. */
  private async byCode(actor: RequestUser, rawCode: string, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    if (!/^\d{6}$/.test(this.norm(rawCode))) throw new BadRequestException('A collection code has 6 digits');
    const app = await this.prisma.inputApplication.findFirst({ where: { mamcosId, collectCodeHash: this.hashOf(mamcosId, rawCode), status: { in: ['READY', 'PARTLY_ISSUED'] } }, include: { lines: true } });
    if (!app) throw new NotFoundException('That code is not valid. It may be wrong, already used, or replaced by a newer code');
    const kept = (await this.prisma.warehouseKeeper.findMany({ where: { userId: actor.id }, select: { warehouseId: true } })).map((k) => k.warehouseId);
    if (kept.length && !kept.includes(app.warehouseId ?? '')) {
      const w = await this.prisma.warehouse.findUnique({ where: { id: app.warehouseId ?? '' }, select: { name: true } });
      throw new ForbiddenException(`This code is for ${w?.name ?? 'another warehouse'}. The farmer must collect there`);
    }
    return { app, mamcosId };
  }

  /** Check the code and show what is to be handed over, before anything moves. */
  async lookup(actor: RequestUser, code: string, mamcosIdParam?: string) {
    const { app, mamcosId } = await this.byCode(actor, code, mamcosIdParam);
    const [farmer, wh] = await Promise.all([
      this.prisma.farmer.findUnique({ where: { id: app.farmerId }, select: { id: true, firstName: true, lastName: true, controlNumber: true, user: { select: { phone: true } } } }),
      this.prisma.warehouse.findUnique({ where: { id: app.warehouseId ?? '' }, select: { id: true, name: true, location: true } }),
    ]);
    const lines: any[] = [];
    for (const l of app.lines) lines.push({ id: l.id, item: l.itemName, unit: l.unit, quantity: l.quantity, given: !!l.issueId, inStock: await this.stock.availableIn(l.itemId, mamcosId, app.warehouseId ?? '') });
    return { id: app.id, reference: app.reference, status: app.status, farmIds: app.farmIds, note: app.note, warehouse: wh, farmer: farmer ? { id: farmer.id, name: `${farmer.firstName} ${farmer.lastName}`, memberNumber: farmer.controlNumber, phone: farmer.user?.phone ?? null } : null, lines };
  }

  /** The keeper confirms: the stock comes out of this warehouse, the cost is charged to the farmer, the code is spent. */
  async collect(actor: RequestUser, code: string, quantities: { lineId: string; quantity: number }[] | undefined, mamcosIdParam?: string) {
    const { app, mamcosId } = await this.byCode(actor, code, mamcosIdParam);
    const claimed = await this.prisma.inputApplication.updateMany({ where: { id: app.id, status: { in: ['READY', 'PARTLY_ISSUED'] } }, data: { status: 'PROCESSING' } });
    if (!claimed.count) throw new ConflictException('This code is being used or has been used already');
    const restore = app.status;
    try {
      // the keeper may hand over less than approved (never more)
      for (const q of quantities ?? []) {
        const line = app.lines.find((l) => l.id === q.lineId);
        if (!line || line.issueId) continue;
        if (!(q.quantity >= 0) || q.quantity > line.quantity + 1e-9) throw new BadRequestException(`${line.itemName}: at most ${line.quantity} ${line.unit} was approved`);
        if (q.quantity === 0) { await this.prisma.inputApplicationLine.delete({ where: { id: line.id } }); line.quantity = 0; }
        else if (q.quantity !== line.quantity) { await this.prisma.inputApplicationLine.update({ where: { id: line.id }, data: { quantity: q.quantity } }); line.quantity = q.quantity; }
      }
      const todo = app.lines.filter((l) => !l.issueId && l.quantity > 0);
      if (!todo.length && !app.lines.some((l) => l.issueId)) throw new BadRequestException('Nothing is being handed over');
      const short = await this.shortages(mamcosId, app.warehouseId!, todo.map((l) => ({ itemId: l.itemId, itemName: l.itemName, unit: l.unit, quantity: l.quantity })), app.id);
      if (short.length) throw new ConflictException(`Not enough in this warehouse: ${short.join('; ')}`);
      const given: { name: string; qty: number; unit: string; ref: string }[] = [];
      let failure: string | null = null;
      for (const line of todo) {
        try {
          const r = await this.distribution.issue(actor, { farmerId: app.farmerId, itemId: line.itemId, quantity: line.quantity, warehouseId: app.warehouseId!, note: `Collected against ${app.reference}, code ending ${app.collectCodeHint}` } as any, mamcosId, { collected: true, applicationId: app.id });
          await this.prisma.inputApplicationLine.update({ where: { id: line.id }, data: { issueId: r.id } });
          given.push({ name: line.itemName, qty: line.quantity, unit: line.unit, ref: r.reference });
        } catch (e: any) { failure = `${line.itemName}: ${e?.response?.message ?? e?.message ?? 'could not be given'}`; break; }
      }
      const left = await this.prisma.inputApplicationLine.count({ where: { applicationId: app.id, issueId: null } });
      if (left === 0) await this.prisma.inputApplication.update({ where: { id: app.id }, data: { status: 'COLLECTED', collectCodeHash: null, collectedAt: new Date(), collectedById: actor.id } });
      else await this.prisma.inputApplication.update({ where: { id: app.id }, data: { status: given.length || restore === 'PARTLY_ISSUED' ? 'PARTLY_ISSUED' : 'READY' } });
      if (given.length) void this.afterCollection(mamcosId, app, given, actor.id);
      if (failure) throw new ConflictException(`${given.length ? 'Some was handed over. ' : 'Nothing was handed over. '}${failure}. The code still works for the rest`);
      return { id: app.id, status: 'COLLECTED', given };
    } catch (e) {
      const now = await this.prisma.inputApplication.findUnique({ where: { id: app.id }, select: { status: true } });
      if (now?.status === 'PROCESSING') await this.prisma.inputApplication.update({ where: { id: app.id }, data: { status: restore } });
      throw e;
    }
  }

  private async afterCollection(mamcosId: string, app: { id: string; reference: string; farmerId: string; warehouseId: string | null; lines: { itemId: string }[] }, given: { name: string; qty: number; unit: string; ref: string }[], keeperId: string) {
    try {
      const farmer = await this.prisma.farmer.findUnique({ where: { id: app.farmerId }, select: { user: { select: { phone: true, language: true } } } });
      const wh = await this.prisma.warehouse.findUnique({ where: { id: app.warehouseId ?? '' }, select: { name: true } });
      if (farmer?.user?.phone) {
        const en = farmer.user.language === 'en'; const list = given.map((g) => `${g.name} ${g.qty} ${g.unit}`).join(', ');
        await this.sms.send(farmer.user.phone, en ? `MAYODE ${app.reference}: you collected ${list} at ${wh?.name ?? 'the warehouse'}. The cost is on your account. Thank you.` : `MAYODE ${app.reference}: umechukua ${list} ${wh?.name ?? 'ghalani'}. Gharama imeandikwa kwenye akaunti yako. Asante.`, 'input_application').catch(() => undefined);
      }
      if (app.warehouseId) await this.warehouses.checkLow(mamcosId, app.warehouseId, app.lines.map((l) => l.itemId));
    } catch (e) { this.logger.warn(`After-collection steps failed: ${e instanceof Error ? e.message : e}`); }
    void keeperId;
  }

  private shape(r: { id: string; reference: string; status: string; farmIds: string[]; note: string | null; submittedAt: Date; decidedAt: Date | null; rejectReason: string | null; consentAt: Date; termsVersion: string; lines: { id: string; itemId: string; itemName: string; unit: string; quantity: number; unitPrice: unknown; issueId: string | null }[] }, _office: boolean) {
    const lines = r.lines.map((l) => ({ id: l.id, itemId: l.itemId, item: l.itemName, unit: l.unit, quantity: l.quantity, unitPrice: num(l.unitPrice), amount: cents(l.quantity * num(l.unitPrice)), given: !!l.issueId }));
    return { id: r.id, reference: r.reference, status: r.status, channel: 'APP', farmIds: r.farmIds, note: r.note, submittedAt: r.submittedAt, decidedAt: r.decidedAt, rejectReason: r.rejectReason, consentAt: r.consentAt, termsVersion: r.termsVersion, lines, estimatedTotal: cents(lines.reduce((s, l) => s + l.amount, 0)), estimatedTotalText: tzs(lines.reduce((s, l) => s + l.amount, 0)) };
  }
}
