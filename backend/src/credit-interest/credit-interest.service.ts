import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { SmsService } from '../messaging/sms.service';
import { DuesService } from '../dues/dues.service';
import { RecordPaymentDto } from '../dues/dto/dues.dto';
import { Period, Rate, Terms, cents, describeTerms, interestOf, periodsFor, rateOn, utcDay, ymd } from './interest-schedule';
import { RateDto, SaveTermsDto } from './dto/credit-interest.dto';

const num = (v: unknown) => (v == null ? 0 : Number(v));
const today = () => utcDay(new Date(Date.now() + 3 * 3_600_000)); // the day in Tanzania (UTC+3)
const tzs = (n: number) => `TZS ${Math.round(n).toLocaleString('en-US')}`;
const DEFAULT: Terms = { enabled: false, period: 'MONTHLY', graceDays: 0, paymentOrder: 'INTEREST_FIRST' };

/**
 * Interest (riba) on inputs given on credit. Every term is the AMCOS's own: whether interest is charged at all, per month or per season,
 * the rate for each month or season, the grace days, and what a payment settles first. Interest is added to the debt as its own charge, so
 * the principal and the interest are always shown, paid and receipted separately.
 */
@Injectable()
export class CreditInterestService {
  private readonly logger = new Logger(CreditInterestService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly dues: DuesService,
    private readonly sms: SmsService,
  ) {}

  private tenant(actor: RequestUser, requested?: string): string {
    const own = this.ownership.resolveTenantMamcosId(actor);
    const id = own ?? requested ?? null;
    if (!id) throw new BadRequestException('Choose a cooperative');
    if (own && requested && requested !== own) throw new BadRequestException('You can only work with your own cooperative');
    return id;
  }

  async load(mamcosId: string): Promise<{ terms: Terms; rates: Rate[] }> {
    const [t, r] = await Promise.all([
      this.prisma.inputCreditTerms.findUnique({ where: { mamcosId } }),
      this.prisma.inputInterestRate.findMany({ where: { mamcosId }, orderBy: { validFrom: 'asc' } }),
    ]);
    return {
      terms: t ? { enabled: t.enabled, period: t.period as Terms['period'], graceDays: t.graceDays, paymentOrder: t.paymentOrder as Terms['paymentOrder'] } : DEFAULT,
      rates: r.map((x) => ({ id: x.id, label: x.label, ratePercent: num(x.ratePercent), validFrom: x.validFrom, validTo: x.validTo })),
    };
  }

  /** The words the farmer reads in the app and the officer sees when giving inputs. */
  async describe(mamcosId: string, language: 'en' | 'sw' = 'en') {
    const { terms, rates } = await this.load(mamcosId);
    return { enabled: terms.enabled, text: describeTerms(terms, rates, today(), language) };
  }

  // ───────────────────────── configuration ─────────────────────────

  async terms(actor: RequestUser, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const { terms, rates } = await this.load(mamcosId);
    const seasons = await this.prisma.farmingSeason.findMany({ where: { OR: [{ mamcosId }, { mamcosId: null }] }, select: { id: true, name: true, startDate: true, endDate: true }, orderBy: { startDate: 'desc' }, take: 12 });
    const d = today();
    return {
      terms, summary: describeTerms(terms, rates, d),
      rates: rates.map((r) => ({ id: r.id, label: r.label, ratePercent: r.ratePercent, validFrom: ymd(r.validFrom), validTo: r.validTo ? ymd(r.validTo) : null, state: r.validTo && r.validTo < d ? 'PAST' : r.validFrom > d ? 'UPCOMING' : 'CURRENT' })),
      seasons: seasons.map((s) => ({ id: s.id, name: s.name, startDate: ymd(s.startDate), endDate: ymd(s.endDate) })),
    };
  }

  async saveTerms(actor: RequestUser, dto: SaveTermsDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const data = { enabled: dto.enabled, period: dto.period, graceDays: dto.graceDays, paymentOrder: dto.paymentOrder, updatedById: actor.id };
    await this.prisma.inputCreditTerms.upsert({ where: { mamcosId }, create: { mamcosId, ...data }, update: data });
    return this.terms(actor, mamcosId);
  }

  private async checkRate(mamcosId: string, dto: RateDto, ignoreId?: string) {
    const from = utcDay(dto.validFrom); const to = dto.validTo ? utcDay(dto.validTo) : null;
    if (to && to < from) throw new BadRequestException('The end date cannot be before the start date');
    const { terms, rates } = await this.load(mamcosId);
    if (terms.period === 'SEASON' && !to) throw new BadRequestException('When interest is charged per season, give the date the season ends');
    for (const r of rates) {
      if (r.id === ignoreId) continue;
      const overlaps = from <= (r.validTo ?? new Date('9999-12-31')) && (to ?? new Date('9999-12-31')) >= r.validFrom;
      if (overlaps) throw new ConflictException(`This overlaps “${r.label}” (${ymd(r.validFrom)} to ${r.validTo ? ymd(r.validTo) : 'no end'}). Change that one first, so only one rate applies on any day`);
    }
    return { from, to };
  }

  async addRate(actor: RequestUser, dto: RateDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const { from, to } = await this.checkRate(mamcosId, dto);
    await this.prisma.inputInterestRate.create({ data: { mamcosId, label: dto.label.trim(), ratePercent: dto.ratePercent, validFrom: from, validTo: to, seasonId: dto.seasonId ?? null, createdById: actor.id } });
    return this.terms(actor, mamcosId);
  }

  async updateRate(actor: RequestUser, id: string, dto: RateDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const found = await this.prisma.inputInterestRate.findFirst({ where: { id, mamcosId } });
    if (!found) throw new NotFoundException('Rate not found');
    const { from, to } = await this.checkRate(mamcosId, dto, id);
    await this.prisma.inputInterestRate.update({ where: { id }, data: { label: dto.label.trim(), ratePercent: dto.ratePercent, validFrom: from, validTo: to, seasonId: dto.seasonId ?? null } });
    return this.terms(actor, mamcosId);
  }

  async removeRate(actor: RequestUser, id: string, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const found = await this.prisma.inputInterestRate.findFirst({ where: { id, mamcosId } });
    if (!found) throw new NotFoundException('Rate not found');
    await this.prisma.inputInterestRate.delete({ where: { id } }); // interest already charged keeps the rate it was charged at
    return this.terms(actor, mamcosId);
  }

  // ───────────────────────── what a credit will cost ─────────────────────────

  /** Shown when inputs are given: the interest this amount will earn over the periods the AMCOS has set rates for. */
  async preview(actor: RequestUser, amount: number, issuedOnParam?: string, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const { terms, rates } = await this.load(mamcosId);
    const issuedOn = issuedOnParam ? utcDay(issuedOnParam) : today();
    if (!terms.enabled) return { enabled: false, text: describeTerms(terms, rates, today()), periods: [], totalInterest: 0 };
    const horizon = new Date(Date.UTC(issuedOn.getUTCFullYear() + 1, issuedOn.getUTCMonth(), issuedOn.getUTCDate()));
    const periods = periodsFor(terms, rates, issuedOn, horizon).filter((p) => p.ratePercent != null).slice(0, 12)
      .map((p) => ({ label: p.label, on: ymd(p.end), ratePercent: p.ratePercent!, interest: interestOf(amount, p.ratePercent!) }));
    return { enabled: true, text: describeTerms(terms, rates, today()), periods, totalInterest: cents(periods.reduce((n, p) => n + p.interest, 0)), note: 'If the credit is repaid earlier, later periods are not charged.' };
  }

  // ───────────────────────── adding the interest ─────────────────────────

  private balanceOn(due: { amount: unknown; waivedAmount: unknown; payments: { amount: unknown; paidOn: Date }[] }, date: Date) {
    return cents(num(due.amount) - num(due.waivedAmount) - due.payments.filter((p) => p.paidOn <= date).reduce((n, p) => n + num(p.amount), 0));
  }

  /** Adds the interest that has fallen due on one AMCOS's fertiliser credit. Safe to run any number of times: each period is added once. */
  async accrue(mamcosId: string, asOf: Date = today()) {
    const { terms, rates } = await this.load(mamcosId);
    if (!terms.enabled) return { added: 0, amount: 0 };
    const principals = await this.prisma.farmerDue.findMany({
      where: { mamcosId, category: 'FERTILISER', status: 'ACTIVE', issuedOn: { lte: asOf } },
      include: { payments: { where: { voidedAt: null }, select: { amount: true, paidOn: true } } },
    });
    const done = await this.prisma.inputInterestAccrual.findMany({ where: { principalDueId: { in: principals.map((p) => p.id) } }, select: { principalDueId: true, periodKey: true } });
    const seen = new Set(done.map((d) => `${d.principalDueId}|${d.periodKey}`));
    let added = 0; let total = 0;
    for (const due of principals) {
      const periods = periodsFor(terms, rates, due.issuedOn, asOf);
      for (const p of periods) {
        if (p.ratePercent == null || seen.has(`${due.id}|${p.key}`)) continue;
        const base = this.balanceOn(due, p.end);
        if (base <= 0) continue; // already repaid by then
        const amount = interestOf(base, p.ratePercent);
        if (amount <= 0) continue;
        try {
          await this.prisma.$transaction(async (tx) => {
            const charge = await tx.farmerDue.create({
              data: { mamcosId, farmerId: due.farmerId, category: 'INTEREST', description: `Interest ${p.ratePercent}% on ${due.itemName ?? due.description} (${p.label})`, amount, issuedOn: p.end, dueDate: null, createdById: null,
                farmSplit: due.farmSplit ?? Prisma.JsonNull },
            });
            await tx.inputInterestAccrual.create({ data: { mamcosId, principalDueId: due.id, interestDueId: charge.id, periodKey: p.key, periodEnd: p.end, basePrincipal: base, ratePercent: p.ratePercent!, amount } });
          });
          added++; total += amount;
        } catch (e: any) { if (e?.code !== 'P2002') throw e; }
      }
    }
    return { added, amount: cents(total) };
  }

  /** Every AMCOS that charges interest (run each morning). */
  async accrueAll() {
    const on = await this.prisma.inputCreditTerms.findMany({ where: { enabled: true }, select: { mamcosId: true } });
    let added = 0;
    for (const t of on) { try { added += (await this.accrue(t.mamcosId)).added; } catch (e) { this.logger.error(`Interest for ${t.mamcosId} failed: ${e instanceof Error ? e.message : e}`); } }
    return added;
  }

  async accrueNow(actor: RequestUser, mamcosIdParam?: string) {
    return this.accrue(this.tenant(actor, mamcosIdParam));
  }

  // ───────────────────────── one credit, principal and interest ─────────────────────────

  async account(actor: RequestUser, dueId: string, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const due = await this.prisma.farmerDue.findFirst({ where: { id: dueId, mamcosId }, include: { payments: { where: { voidedAt: null }, select: { amount: true, paidOn: true } } } });
    if (!due) throw new NotFoundException('Charge not found');
    if (due.category !== 'FERTILISER') throw new BadRequestException('Interest applies to inputs given on credit');
    const { terms, rates } = await this.load(mamcosId);
    const accruals = await this.prisma.inputInterestAccrual.findMany({ where: { principalDueId: due.id }, orderBy: { periodEnd: 'asc' } });
    const charges = await this.prisma.farmerDue.findMany({ where: { id: { in: accruals.map((a) => a.interestDueId) } }, include: { payments: { where: { voidedAt: null }, select: { amount: true } } } });
    const byId = new Map(charges.map((c) => [c.id, c]));
    const interest = accruals.map((a) => {
      const c = byId.get(a.interestDueId); const paid = cents((c?.payments ?? []).reduce((n, p) => n + num(p.amount), 0));
      const balance = !c || c.status === 'CANCELLED' ? 0 : cents(num(c.amount) - num(c.waivedAmount) - paid);
      return { dueId: a.interestDueId, label: c?.description ?? '', periodEnd: ymd(a.periodEnd), ratePercent: num(a.ratePercent), base: num(a.basePrincipal), amount: num(a.amount), paid, balance };
    });
    const paidP = cents(due.payments.reduce((n, p) => n + num(p.amount), 0));
    const principalBalance = due.status === 'CANCELLED' ? 0 : cents(num(due.amount) - num(due.waivedAmount) - paidP);
    const interestBalance = cents(interest.reduce((n, i) => n + i.balance, 0));
    const next: Period | undefined = terms.enabled && principalBalance > 0 ? periodsFor(terms, rates, due.issuedOn, new Date(Date.UTC(today().getUTCFullYear() + 3, 0, 1))).find((p) => p.end > today() && p.ratePercent != null) : undefined;
    return {
      principal: { amount: num(due.amount), paid: paidP, balance: principalBalance },
      interest: { charged: cents(interest.reduce((n, i) => n + i.amount, 0)), paid: cents(interest.reduce((n, i) => n + i.paid, 0)), balance: interestBalance, items: interest },
      totalOwed: cents(principalBalance + interestBalance), paymentOrder: terms.paymentOrder, enabled: terms.enabled,
      next: next ? { on: ymd(next.end), ratePercent: next.ratePercent, estimate: interestOf(principalBalance, next.ratePercent!) } : null,
    };
  }

  /**
   * One payment against a credit: it settles the interest and the principal in the order the AMCOS chose, and each part is receipted on its own
   * (principal and interest are separate charges). The farmer gets one text with the split.
   */
  async pay(actor: RequestUser, dueId: string, dto: RecordPaymentDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const acct = await this.account(actor, dueId, mamcosId);
    if (cents(dto.amount) > acct.totalOwed) throw new BadRequestException(`Only ${acct.totalOwed.toLocaleString('en-US')} is still owed (principal and interest)`);
    const open = acct.interest.items.filter((i) => i.balance > 0);
    const parts = [
      ...(acct.paymentOrder === 'INTEREST_FIRST' ? open.map((i) => ({ id: i.dueId, balance: i.balance, kind: 'interest' as const })) : []),
      ...(acct.principal.balance > 0 ? [{ id: dueId, balance: acct.principal.balance, kind: 'principal' as const }] : []),
      ...(acct.paymentOrder === 'PRINCIPAL_FIRST' ? open.map((i) => ({ id: i.dueId, balance: i.balance, kind: 'interest' as const })) : []),
    ];
    let left = cents(dto.amount); const receipts: { receiptNo: string; kind: string; amount: number }[] = [];
    let farmerId: string | null = null;
    for (const part of parts) {
      if (left <= 0) break;
      const piece = cents(Math.min(left, part.balance));
      const p: any = await this.dues.recordPayment(actor, part.id, { ...dto, amount: piece }, mamcosId, { silent: true });
      farmerId = p.farmerId; left = cents(left - piece);
      receipts.push({ receiptNo: p.receiptNo, kind: part.kind, amount: piece });
    }
    if (farmerId) void this.text(mamcosId, farmerId, receipts, cents(acct.totalOwed - cents(dto.amount)));
    return { receipts, paid: cents(dto.amount), stillOwed: cents(acct.totalOwed - cents(dto.amount)) };
  }

  private async text(mamcosId: string, farmerId: string, receipts: { receiptNo: string; kind: string; amount: number }[], left: number) {
    try {
      const [farmer, mamcos] = await Promise.all([
        this.prisma.farmer.findUnique({ where: { id: farmerId }, select: { user: { select: { phone: true, language: true } } } }),
        this.prisma.mamcos.findUnique({ where: { id: mamcosId }, select: { name: true } }),
      ]);
      const phone = farmer?.user?.phone; if (!phone) return;
      const en = farmer?.user?.language === 'en'; const amcos = mamcos?.name ?? 'AMCOS';
      const sum = (k: string) => receipts.filter((r) => r.kind === k).reduce((n, r) => n + r.amount, 0);
      const split = [sum('principal') ? `${en ? 'inputs' : 'pembejeo'} ${tzs(sum('principal'))}` : '', sum('interest') ? `${en ? 'interest' : 'riba'} ${tzs(sum('interest'))}` : ''].filter(Boolean).join(', ');
      const refs = receipts.map((r) => r.receiptNo).join(', ');
      const body = en
        ? `Thank you. ${amcos} received ${tzs(receipts.reduce((n, r) => n + r.amount, 0))} (${split}). Receipts ${refs}.${left > 0 ? ` Balance ${tzs(left)}.` : ' Your input credit is fully paid.'}`
        : `Asante. ${amcos} imepokea ${tzs(receipts.reduce((n, r) => n + r.amount, 0))} (${split}). Stakabadhi ${refs}.${left > 0 ? ` Salio ${tzs(left)}.` : ' Deni lako la pembejeo limelipwa lote.'}`;
      await this.sms.send(phone, body, 'due_receipt');
    } catch (e) { this.logger.warn(`Could not text the receipt: ${e instanceof Error ? e.message : e}`); }
  }
}
