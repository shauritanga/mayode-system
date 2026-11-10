import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { SmsService } from '../messaging/sms.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ChargesService } from '../charges/charges.service';
import { DuesService } from '../dues/dues.service';
import { CommunicationsService } from '../communications/communications.service';
import { FarmingSeasonsService } from '../farming-seasons/farming-seasons.service';
import { localDate } from '../accounting/tax';
import { CaseQueryDto, ReleaseDto, TakeOverDto } from './dto/farm-defaults.dto';
import { Msg, blockedMessage, dueTodayMessage, farmAvailableMessage, leaderBlockedMessage, leaderDueDigest, leaderMlaxMessage, noticeMessage, onMlaxMessage, reclaimedMessage, takenOverMessage, toLang } from './farm-defaults.messages';
import { leadersOfFarmer } from './leaders';

type Db = Prisma.TransactionClient | PrismaService;
const OPEN = ['UNDER_AMCOS', 'MLAX_NOTICE', 'AT_MLAX'] as const;
/** Two days from the moment the AMCOS sends the farm to M-LAX. */
export const NOTICE_HOURS = 48;
/** A season on M-LAX, in months, for listings created from overdue debt. */
const MLAX_LEASE_MONTHS = 6;
/** Penalty dues carry no due date; these prefixes mark them as part of what the farmer must clear. */
const PENALTY_PREFIX = /^(Late penalty|Overdue-debt penalty)/;

const num = (v: Prisma.Decimal | number | null | undefined) => (v == null ? 0 : Number(v));
const cents = (n: number) => Math.round(n * 100) / 100;
const dateOf = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const fullName = (f: { firstName: string; lastName: string }) => `${f.firstName} ${f.lastName}`.trim();

/**
 * A farmer whose debt passes its due date has their farms blocked from leasing and put under AMCOS administration for a grace
 * period (up to 30 days). Paying the debt in that time gives the farms back, and another farmer may pay it and farm the land
 * this season. Two days before the grace ends the farmer gets a last warning; then the farms go to M-LAX with a penalty. From
 * there the farmer gets nothing from any lease and can only get the farm back by leasing it through M-LAX like anyone else.
 */
@Injectable()
export class FarmDefaultsService {
  private readonly logger = new Logger(FarmDefaultsService.name);
  /** Cases being taken over right now; paying their dues must not close them as "reclaimed". */
  private readonly busy = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly sms: SmsService,
    private readonly notifications: NotificationsService,
    private readonly charges: ChargesService,
    private readonly dues: DuesService,
    private readonly communications: CommunicationsService,
    private readonly seasons: FarmingSeasonsService,
  ) {}

  private tenant(actor: RequestUser, requested?: string): string {
    const own = this.ownership.resolveTenantMamcosId(actor);
    const id = own ?? requested ?? null;
    if (!id) throw new BadRequestException('Choose a cooperative');
    if (own && requested && requested !== own) throw new ForbiddenException('You can only manage the farms of your own cooperative');
    return id;
  }

  // ───────────────────────── debt ─────────────────────────

  /** What the farmer must clear: debts past the grace period, plus penalty dues (which have no due date). */
  private async outstanding(db: Db, mamcosId: string, farmerId: string, lateSince?: Date) {
    const cutoff = dateOf(localDate(new Date())); // a debt is overdue the day after its due date
    const dues = await db.farmerDue.findMany({
      where: { mamcosId, farmerId, status: 'ACTIVE' },
      include: { payments: { where: { voidedAt: null }, select: { amount: true } } },
      orderBy: { issuedOn: 'asc' },
    });
    const rows: { dueId: string; description: string; balance: number; dueDate: Date | null }[] = [];
    let pastGrace = false;
    for (const d of dues) {
      const balance = cents(num(d.amount) - num(d.waivedAmount) - d.payments.reduce((t, p) => t + num(p.amount), 0));
      if (balance <= 0) continue;
      const late = !!d.dueDate && d.dueDate < cutoff;
      if (late && (!lateSince || d.dueDate! >= lateSince)) pastGrace = true;
      if (late || (!d.dueDate && PENALTY_PREFIX.test(d.description))) rows.push({ dueId: d.id, description: d.description, balance, dueDate: d.dueDate });
    }
    return { rows, total: cents(rows.reduce((t, r) => t + r.balance, 0)), pastGrace };
  }

  private async event(db: Db, caseId: string, kind: string, note: string | null, actorId: string | null) {
    await db.farmDefaultEvent.create({ data: { caseId, kind, note, actorId } });
  }

  private async tell(farmerId: string, make: (lang: ReturnType<typeof toLang>) => Msg) {
    try {
      const f = await this.prisma.farmer.findUnique({ where: { id: farmerId }, select: { user: { select: { id: true, phone: true, language: true } } } });
      if (!f?.user) return;
      const m = make(toLang(f.user.language));
      await this.notifications.create({ userId: f.user.id, type: 'farm_default', title: m.title, body: m.body }).catch(() => undefined);
      await this.sms.send(f.user.phone, m.body, 'farm_default');
    } catch (e) {
      this.logger.warn(`Could not notify farmer ${farmerId}: ${e instanceof Error ? e.message : e}`);
    }
  }

  /** Tells the farmer's block and canal leaders the same thing, in each leader's own language. Never blocks the case if a text fails. */
  private async tellLeaders(farmerId: string, make: (lang: ReturnType<typeof toLang>, blocks: string[], who: { farmer: string; member: string | null }) => Msg) {
    try {
      const [leaders, f] = await Promise.all([
        leadersOfFarmer(this.prisma, farmerId),
        this.prisma.farmer.findUnique({ where: { id: farmerId }, select: { firstName: true, lastName: true, controlNumber: true } }),
      ]);
      if (!f) return;
      const who = { farmer: fullName(f), member: f.controlNumber };
      for (const l of leaders) {
        const m = make(toLang(l.language), l.blocks, who);
        await this.notifications.create({ userId: l.userId, type: 'farm_default', title: m.title, body: m.body }).catch(() => undefined);
        await this.sms.send(l.phone, m.body, 'farm_default');
      }
    } catch (e) {
      this.logger.warn(`Could not notify the leaders of farmer ${farmerId}: ${e instanceof Error ? e.message : e}`);
    }
  }

  // ───────────────────────── 0. due-date reminders ─────────────────────────

  /**
   * On the day a payment is due: one text to the farmer, and one digest text to each of their leaders listing who is due.
   * Only for AMCOS that switched the overdue-debt handling on. Each due is reminded once (a missed run catches up for 3 days).
   */
  async remindDue(now = new Date()) {
    const today = dateOf(localDate(now));
    const from = new Date(today.getTime() - 3 * 86_400_000);
    const mamcoses = await this.prisma.amcosCharge.findMany({ where: { code: 'DEFAULT_PENALTY', isActive: true, amount: { gt: 0 } }, select: { mamcosId: true } });
    let reminded = 0;
    for (const { mamcosId } of mamcoses) {
      const due = await this.prisma.farmerDue.findMany({
        where: { mamcosId, status: 'ACTIVE', dueReminderSentAt: null, dueDate: { gte: from, lte: today } },
        include: { payments: { where: { voidedAt: null }, select: { amount: true } }, farmer: { select: { id: true, firstName: true, lastName: true } } },
      });
      const perFarmer = new Map<string, { name: string; total: number; what: string[]; ids: string[] }>();
      const settled: string[] = [];
      for (const d of due) {
        const balance = cents(num(d.amount) - num(d.waivedAmount) - d.payments.reduce((t, p) => t + num(p.amount), 0));
        if (balance <= 0 || PENALTY_PREFIX.test(d.description)) { settled.push(d.id); continue; }
        const row = perFarmer.get(d.farmerId) ?? { name: fullName(d.farmer), total: 0, what: [], ids: [] };
        row.total = cents(row.total + balance); row.what.push(d.description); row.ids.push(d.id);
        perFarmer.set(d.farmerId, row);
      }
      if (settled.length) await this.prisma.farmerDue.updateMany({ where: { id: { in: settled } }, data: { dueReminderSentAt: now } });
      const digest = new Map<string, { userId: string; phone: string; language: string | null; names: string[]; blocks: Set<string> }>();
      for (const [farmerId, row] of perFarmer) {
        const claimed = await this.prisma.farmerDue.updateMany({ where: { id: { in: row.ids }, dueReminderSentAt: null }, data: { dueReminderSentAt: now } });
        if (!claimed.count) continue;
        reminded++;
        await this.tell(farmerId, (lang) => dueTodayMessage(lang, { total: row.total, what: row.what.slice(0, 2).join(', ') + (row.what.length > 2 ? '…' : '') }));
        for (const l of await leadersOfFarmer(this.prisma, farmerId)) {
          const e = digest.get(l.farmerId) ?? { userId: l.userId, phone: l.phone, language: l.language, names: [], blocks: new Set<string>() };
          e.names.push(row.name); l.blocks.forEach((b) => e.blocks.add(b));
          digest.set(l.farmerId, e);
        }
      }
      for (const e of digest.values()) {
        try {
          const m = leaderDueDigest(toLang(e.language), { names: e.names, blocks: [...e.blocks] });
          await this.notifications.create({ userId: e.userId, type: 'farm_default', title: m.title, body: m.body }).catch(() => undefined);
          await this.sms.send(e.phone, m.body, 'farm_default');
        } catch (err) {
          this.logger.warn(`Could not send the due-today digest to a leader: ${err instanceof Error ? err.message : err}`);
        }
      }
    }
    return reminded;
  }

  // ───────────────────────── 1. detect ─────────────────────────

  /** Opens a case for every farmer in this AMCOS whose debt is past the grace period. Safe to run any number of times. */
  async runCheck(mamcosId: string, actorId: string | null = null) {
    await this.charges.ensure(mamcosId);
    const rate = await this.charges.rate(mamcosId, 'DEFAULT_PENALTY');
    if (!rate) return { enabled: false, opened: 0, farmers: [] as string[] };
    const cutoff = dateOf(localDate(new Date()));
    const late = await this.prisma.farmerDue.findMany({ where: { mamcosId, status: 'ACTIVE', dueDate: { not: null, lt: cutoff } }, select: { farmerId: true }, distinct: ['farmerId'] });
    const opened: string[] = [];
    for (const { farmerId } of late) {
      try {
        const done = await this.openCase(mamcosId, farmerId, rate, actorId);
        if (done) opened.push(farmerId);
      } catch (e: any) {
        if (e?.code !== 'P2002') this.logger.error(`Could not open an overdue-debt case for ${farmerId}: ${e instanceof Error ? e.message : e}`);
      }
    }
    return { enabled: true, opened: opened.length, farmers: opened };
  }

  private async openCase(mamcosId: string, farmerId: string, rate: { amount: number; graceDays: number }, actorId: string | null) {
    const farms = await this.prisma.farm.findMany({ where: { farmerId, mamcosId }, select: { id: true } });
    if (!farms.length) return false;
    if (await this.prisma.farmDefaultCase.findFirst({ where: { farmerId, status: { in: [...OPEN] } }, select: { id: true } })) return false;
    // A case the AMCOS released by hand is not reopened for debts that were already overdue at that moment, only for ones that go overdue afterwards.
    const released = await this.prisma.farmDefaultCase.findFirst({ where: { farmerId, mamcosId, status: 'CLOSED', resolvedOn: { not: null } }, orderBy: { resolvedOn: 'desc' }, select: { resolvedOn: true } });
    const lateSince = released?.resolvedOn ? dateOf(localDate(released.resolvedOn)) : undefined;
    const debt = await this.outstanding(this.prisma, mamcosId, farmerId, lateSince);
    if (!debt.pastGrace) return false;

    const endsOn = new Date(Date.now() + rate.graceDays * 86_400_000);
    await this.prisma.$transaction(async (tx) => {
      const c = await tx.farmDefaultCase.create({
        data: { mamcosId, farmerId, openedOn: dateOf(localDate(new Date())), graceDays: rate.graceDays, debtAtOpen: debt.total, noticeDeadline: endsOn, createdById: actorId },
      });
      await tx.farm.updateMany({ where: { farmerId, mamcosId, adminStatus: 'NORMAL' }, data: { adminStatus: 'UNDER_AMCOS', adminCaseId: c.id } });
      await this.event(tx, c.id, 'OPENED', `Debt ${debt.total} overdue; ${farms.length} farm(s) blocked; grace ${rate.graceDays} days, until ${endsOn.toISOString().slice(0, 10)}`, actorId);
    });
    await this.tell(farmerId, (lang) => blockedMessage(lang, { farms: farms.length, debt: debt.total, days: rate.graceDays, endsOn }));
    await this.tellLeaders(farmerId, (lang, blocks, who) => leaderBlockedMessage(lang, { ...who, debt: debt.total, endsOn, blocks }));
    return true;
  }

  /** The "Check now" button: the same sweep the morning job runs, for this AMCOS only. */
  async checkNow(actor: RequestUser, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const res = await this.runCheck(mamcosId, actor.id);
    if (!res.enabled) throw new ConflictException('Switch on the overdue-debt penalty in Settings first');
    return res;
  }

  // ───────────────────────── 2. reclaim ─────────────────────────

  /** Called after any change to a farmer's dues (and by a timer): gives the farms back once nothing overdue is left. */
  async afterDuesChange(mamcosId: string, farmerId: string) {
    try {
      const c = await this.prisma.farmDefaultCase.findFirst({ where: { mamcosId, farmerId, status: { in: ['UNDER_AMCOS', 'MLAX_NOTICE'] } } });
      if (!c || this.busy.has(c.id)) return;
      await this.reclaimIfPaid(c);
    } catch (e) {
      this.logger.error(`Reconcile failed for farmer ${farmerId}: ${e instanceof Error ? e.message : e}`);
    }
  }

  /** Only while the farms are still with the AMCOS: once they are on M-LAX, paying the debt no longer brings them back. */
  private async reclaimIfPaid(c: { id: string; mamcosId: string; farmerId: string; status: string }) {
    if (c.status !== 'UNDER_AMCOS' && c.status !== 'MLAX_NOTICE') return false;
    const debt = await this.outstanding(this.prisma, c.mamcosId, c.farmerId);
    if (debt.rows.length) return false;
    await this.prisma.$transaction(async (tx) => {
      await tx.farm.updateMany({ where: { adminCaseId: c.id }, data: { adminStatus: 'NORMAL', adminCaseId: null } });
      await tx.farmDefaultCase.update({ where: { id: c.id }, data: { status: 'RECLAIMED', resolvedOn: new Date(), resolvedNote: 'Debt cleared by the owner' } });
      await this.event(tx, c.id, 'RECLAIMED', 'Debt cleared; farms returned to the owner', null);
    });
    await this.tell(c.farmerId, (lang) => reclaimedMessage(lang));
    return true;
  }

  // ───────────────────────── 3. last warning, then M-LAX ─────────────────────────

  /** Run by the timer: warns farmers two days before the grace ends, and gives the farms to M-LAX when it has. */
  async advance(now = new Date()) {
    const soon = await this.prisma.farmDefaultCase.findMany({ where: { status: 'UNDER_AMCOS', noticeDeadline: { lte: new Date(now.getTime() + NOTICE_HOURS * 3600_000) } } });
    for (const c of soon) {
      try { if (!(await this.reclaimIfPaid(c))) await this.warn(c); }
      catch (e) { this.logger.error(`Could not warn case ${c.id}: ${e instanceof Error ? e.message : e}`); }
    }
    const over = await this.prisma.farmDefaultCase.findMany({ where: { status: 'MLAX_NOTICE', noticeDeadline: { lte: now } } });
    let moved = 0;
    for (const c of over) {
      try {
        if (await this.reclaimIfPaid(c)) continue;
        if (await this.moveToMlax(c)) moved++;
      } catch (e) {
        this.logger.error(`Could not move case ${c.id} to M-LAX: ${e instanceof Error ? e.message : e}`);
      }
    }
    return moved;
  }

  private async warn(c: { id: string; mamcosId: string; farmerId: string; noticeDeadline: Date | null }) {
    const claimed = await this.prisma.farmDefaultCase.updateMany({ where: { id: c.id, status: 'UNDER_AMCOS' }, data: { status: 'MLAX_NOTICE', noticeSentAt: new Date() } });
    if (!claimed.count) return;
    await this.prisma.farm.updateMany({ where: { adminCaseId: c.id }, data: { adminStatus: 'MLAX_NOTICE' } });
    // The penalty is added now, when the last two days begin, so the farmer is told the real total to pay.
    const penalty = await this.ensurePenalty(this.prisma, c);
    await this.event(this.prisma, c.id, 'MLAX_NOTICE', `Last warning sent: two days until the farms go to M-LAX${penalty ? `; penalty ${penalty} added` : ''}`, null);
    const debt = await this.outstanding(this.prisma, c.mamcosId, c.farmerId);
    await this.tell(c.farmerId, (lang) => noticeMessage(lang, { debt: debt.total, penalty, endsOn: c.noticeDeadline ?? new Date() }));
  }

  /** Charges the one-off penalty for a case (once only) and returns its amount, or 0 when the penalty is switched off. */
  private async ensurePenalty(db: Db, c: { id: string; mamcosId: string; farmerId: string }) {
    const rate = await this.charges.rate(c.mamcosId, 'DEFAULT_PENALTY', db);
    if (!rate) return 0;
    const due = await this.charges.chargeFarmer(db, { mamcosId: c.mamcosId, farmerId: c.farmerId, description: `Overdue-debt penalty · case ${c.id.slice(0, 8)}`, amount: rate.amount, createdById: null });
    if (due) await db.farmDefaultCase.update({ where: { id: c.id }, data: { penaltyDueId: due.id } });
    const existing = due ?? (await db.farmDefaultCase.findUnique({ where: { id: c.id }, select: { penaltyDueId: true } }))?.penaltyDueId;
    if (!existing) return 0;
    return num(due?.amount ?? (await db.farmerDue.findUnique({ where: { id: existing as string }, select: { amount: true } }))?.amount);
  }

  private async moveToMlax(c: { id: string; mamcosId: string; farmerId: string }) {
    const result = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.farmDefaultCase.updateMany({ where: { id: c.id, status: 'MLAX_NOTICE' }, data: { status: 'AT_MLAX', atMlaxAt: new Date() } });
      if (!claimed.count) return null;
      // Normally charged at the last warning; this covers a case that reached the notice stage before that rule.
      const penalty = await this.ensurePenalty(tx, c);
      const debt = await this.outstanding(tx, c.mamcosId, c.farmerId);
      const farms = await tx.farm.findMany({ where: { adminCaseId: c.id }, select: { id: true, isLeased: true } });
      let listed = 0;
      for (const f of farms) {
        await tx.farm.update({ where: { id: f.id }, data: { adminStatus: 'AT_MLAX', ...(f.isLeased ? {} : { isAvailableForRent: true }) } });
        if (f.isLeased) continue; // already under a lease; it can be listed once that ends
        await tx.landListing.create({
          data: {
            farmId: f.id, ownerId: c.farmerId, askingPrice: debt.total, minimumPrice: debt.total, dealType: 'STANDARD', commissionRate: 0.1,
            leaseStatus: 'DRAFT', leaseDurationMonths: MLAX_LEASE_MONTHS, defaultCaseId: c.id,
          },
        });
        listed++;
      }
      await this.event(tx, c.id, 'AT_MLAX', `${listed} farm(s) listed on M-LAX; penalty ${penalty}; minimum price ${debt.total}`, null);
      return { penalty };
    });
    if (!result) return false;
    await this.tell(c.farmerId, (lang) => onMlaxMessage(lang, { penalty: result.penalty }));
    await this.tellLeaders(c.farmerId, (lang, blocks, who) => leaderMlaxMessage(lang, { ...who, blocks }));
    try { await this.communications.sendSystem(c.mamcosId, farmAvailableMessage); } catch (e) { this.logger.warn(`Could not tell farmers about the M-LAX farm: ${e instanceof Error ? e.message : e}`); }
    return true;
  }

  // ───────────────────────── 4. another farmer pays and farms it ─────────────────────────

  async takeOver(actor: RequestUser, caseId: string, dto: TakeOverDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const c = await this.mine(mamcosId, caseId);
    if (c.status !== 'UNDER_AMCOS' && c.status !== 'MLAX_NOTICE') throw new ConflictException('A farmer can take over only farms that are still under AMCOS administration');
    const payer = await this.prisma.farmer.findFirst({ where: { id: dto.payerFarmerId, mamcosId }, select: { id: true, firstName: true, lastName: true, isBlacklisted: true } });
    if (!payer) throw new BadRequestException('Choose a registered farmer of your AMCOS');
    if (payer.id === c.farmerId) throw new BadRequestException('The owner reclaims the farm by paying the debt, not by taking it over');
    if (payer.isBlacklisted) throw new BadRequestException('This farmer is blacklisted and cannot take over a farm');
    const farmIds = [...new Set(dto.farmIds)];
    const farms = await this.prisma.farm.findMany({ where: { id: { in: farmIds }, adminCaseId: c.id }, select: { id: true } });
    if (farms.length !== farmIds.length) throw new BadRequestException('Some of the chosen farms are not part of this case');
    if (farms.length !== farmIds.length || (await this.prisma.farm.count({ where: { id: { in: farmIds }, isLeased: true } }))) throw new ConflictException('A chosen farm is already leased');
    const season = await this.seasons.findCurrent();
    if (!season) throw new ConflictException('There is no open farming season to give the farm for');

    const debt = await this.outstanding(this.prisma, mamcosId, c.farmerId);
    if (!debt.rows.length) throw new ConflictException('The debt is already cleared');
    this.busy.add(c.id);
    try {
      // The payer clears the owner's whole overdue debt, penalty included, at the AMCOS.
      for (const r of debt.rows) {
        await this.dues.recordPayment(actor, r.dueId, {
          amount: r.balance, method: dto.method, reference: dto.reference, cashAccountId: dto.cashAccountId,
          note: `Paid by ${fullName(payer)} to farm the owner's farm(s) this season`,
        } as never, mamcosId);
      }
      await this.prisma.$transaction(async (tx) => {
        for (const id of farmIds) {
          await tx.seasonalFarmAssignment.upsert({
            where: { farmId_farmingSeasonId: { farmId: id, farmingSeasonId: season.id } },
            create: { farmId: id, farmingSeasonId: season.id, activeFarmerId: payer.id, assignmentType: 'RENTED', status: 'VERIFIED' },
            update: { activeFarmerId: payer.id, assignmentType: 'RENTED', status: 'VERIFIED' },
          });
          await tx.farm.update({ where: { id }, data: { isLeased: true, leaseLockedUntil: season.endDate } });
        }
        await tx.farm.updateMany({ where: { adminCaseId: c.id }, data: { adminStatus: 'NORMAL', adminCaseId: null } });
        await tx.farmDefaultCase.update({
          where: { id: c.id },
          data: { status: 'TAKEN_OVER', resolvedOn: new Date(), resolvedNote: `Debt paid by ${fullName(payer)}`, takenByFarmerId: payer.id, takenFarmIds: farmIds },
        });
        await this.event(tx, c.id, 'TAKEN_OVER', `${fullName(payer)} paid ${debt.total} and farms ${farmIds.length} farm(s) in ${season.name}`, actor.id);
      });
    } finally {
      this.busy.delete(c.id);
    }
    await this.tell(c.farmerId, (lang) => takenOverMessage(lang, { payer: fullName(payer) }));
    return { status: 'TAKEN_OVER', paid: debt.total, season: season.name };
  }

  // ───────────────────────── 5. release by hand ─────────────────────────

  async release(actor: RequestUser, caseId: string, dto: ReleaseDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const c = await this.mine(mamcosId, caseId);
    if (!OPEN.includes(c.status as never)) throw new ConflictException('This case is already closed');
    const reason = dto.reason.trim();
    if (!reason) throw new BadRequestException('Say why the farms are being released');
    const inProgress = await this.prisma.landListing.count({ where: { defaultCaseId: c.id, leaseStatus: { in: ['PENDING_VERIFICATION', 'ACTIVE'] } } });
    if (inProgress) throw new ConflictException('An M-LAX lease is already in progress for this farm');
    await this.prisma.$transaction(async (tx) => {
      const listings = await tx.landListing.findMany({ where: { defaultCaseId: c.id, leaseStatus: 'DRAFT' }, select: { id: true, farmId: true } });
      if (listings.length) {
        await tx.landListing.updateMany({ where: { id: { in: listings.map((l) => l.id) } }, data: { leaseStatus: 'TERMINATED' } });
        await tx.farm.updateMany({ where: { id: { in: listings.map((l) => l.farmId) } }, data: { isAvailableForRent: false } });
      }
      await tx.farm.updateMany({ where: { adminCaseId: c.id }, data: { adminStatus: 'NORMAL', adminCaseId: null } });
      await tx.farmDefaultCase.update({ where: { id: c.id }, data: { status: 'CLOSED', resolvedOn: new Date(), resolvedNote: reason } });
      await this.event(tx, c.id, 'RELEASED', reason, actor.id);
    });
    return { status: 'CLOSED' };
  }

  // ───────────────────────── reading ─────────────────────────

  private async mine(mamcosId: string, id: string) {
    const c = await this.prisma.farmDefaultCase.findFirst({ where: { id, mamcosId } });
    if (!c) throw new NotFoundException('Case not found');
    return c;
  }

  private async shape(c: Prisma.FarmDefaultCaseGetPayload<{ include: { farmer: { select: { id: true; firstName: true; lastName: true; controlNumber: true; user: { select: { phone: true } } } } } }>) {
    const [farms, debt, events, listings] = await Promise.all([
      this.prisma.farm.findMany({ where: { OR: [{ adminCaseId: c.id }, { id: { in: c.takenFarmIds } }] }, select: { id: true, farmCode: true, name: true, socialHectares: true, adminStatus: true, isLeased: true } }),
      OPEN.includes(c.status as never) ? this.outstanding(this.prisma, c.mamcosId, c.farmerId) : Promise.resolve(null),
      this.prisma.farmDefaultEvent.findMany({ where: { caseId: c.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
      this.prisma.landListing.findMany({ where: { defaultCaseId: c.id }, select: { id: true, farmId: true, leaseStatus: true, askingPrice: true, minimumPrice: true } }),
    ]);
    const oldest = debt?.rows.map((r) => r.dueDate).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0];
    return {
      id: c.id, status: c.status, openedOn: c.openedOn, graceDays: c.graceDays, debtAtOpen: num(c.debtAtOpen),
      debt: debt ? debt.total : 0, debtLines: debt?.rows ?? [], daysOverdue: oldest ? Math.max(0, Math.floor((Date.now() - oldest.getTime()) / 86400000)) : null,
      noticeSentAt: c.noticeSentAt, graceEndsAt: c.noticeDeadline, noticeDeadline: c.noticeDeadline, atMlaxAt: c.atMlaxAt, resolvedOn: c.resolvedOn, resolvedNote: c.resolvedNote,
      farmer: { id: c.farmer.id, name: fullName(c.farmer), memberNumber: c.farmer.controlNumber, phone: c.farmer.user?.phone ?? null },
      farms: farms.map((f) => ({ ...f, socialHectares: Number(f.socialHectares) })), listings, events,
    };
  }

  async list(actor: RequestUser, q: CaseQueryDto) {
    const mamcosId = this.tenant(actor, q.mamcosId);
    const stage = q.stage ?? 'open';
    const status: Prisma.FarmDefaultCaseWhereInput['status'] =
      stage === 'notice' ? 'MLAX_NOTICE' : stage === 'mlax' ? 'AT_MLAX' : stage === 'resolved' ? { in: ['RECLAIMED', 'TAKEN_OVER', 'LEASED_ON_MLAX', 'CLOSED'] } : stage === 'all' ? undefined : 'UNDER_AMCOS';
    const text = q.q?.trim();
    const rows = await this.prisma.farmDefaultCase.findMany({
      where: { mamcosId, ...(status ? { status } : {}), ...(text ? { farmer: { OR: [{ firstName: { contains: text, mode: 'insensitive' } }, { lastName: { contains: text, mode: 'insensitive' } }, { controlNumber: { contains: text, mode: 'insensitive' } }] } } : {}) },
      include: { farmer: { select: { id: true, firstName: true, lastName: true, controlNumber: true, user: { select: { phone: true } } } } },
      orderBy: { createdAt: 'desc' }, take: Math.min(q.pageSize ?? 50, 50),
    });
    const counts = await this.prisma.farmDefaultCase.groupBy({ by: ['status'], where: { mamcosId }, _count: { _all: true } });
    const n = (...s: string[]) => counts.filter((c) => s.includes(c.status)).reduce((t, c) => t + c._count._all, 0);
    const enabled = !!(await this.charges.rate(mamcosId, 'DEFAULT_PENALTY'));
    return {
      data: await Promise.all(rows.map((r) => this.shape(r))),
      counts: { open: n('UNDER_AMCOS'), notice: n('MLAX_NOTICE'), mlax: n('AT_MLAX'), resolved: n('RECLAIMED', 'TAKEN_OVER', 'LEASED_ON_MLAX', 'CLOSED') },
      enabled,
    };
  }

  /** The open case of one farmer, for the banner on their profile. */
  async forFarmer(actor: RequestUser, farmerId: string, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const c = await this.prisma.farmDefaultCase.findFirst({
      where: { mamcosId, farmerId, status: { in: [...OPEN] } },
      include: { farmer: { select: { id: true, firstName: true, lastName: true, controlNumber: true, user: { select: { phone: true } } } } },
    });
    return { case: c ? await this.shape(c) : null };
  }

  /** What a signed-in farmer sees about their own farms and about farms in the AMCOS they could take this season. */
  async forMe(userId: string) {
    const me = await this.prisma.farmer.findUnique({ where: { userId }, select: { id: true, mamcosId: true } });
    if (!me?.mamcosId) return { mine: null, available: [] };
    const include = { farmer: { select: { id: true, firstName: true, lastName: true, controlNumber: true, user: { select: { phone: true } } } } } as const;
    const [mine, others] = await Promise.all([
      this.prisma.farmDefaultCase.findFirst({ where: { farmerId: me.id, status: { in: [...OPEN] } }, include }),
      this.prisma.farmDefaultCase.findMany({ where: { mamcosId: me.mamcosId, status: { in: ['UNDER_AMCOS', 'MLAX_NOTICE'] }, farmerId: { not: me.id } }, include, orderBy: { createdAt: 'desc' }, take: 50 }),
    ]);
    const available = await Promise.all(others.map(async (c) => {
      const s = await this.shape(c);
      // The amount to pay and the farms are shown; the owner's details are not.
      return { id: s.id, debt: s.debt, farms: s.farms.map((f) => ({ id: f.id, farmCode: f.farmCode, name: f.name, socialHectares: f.socialHectares })) };
    }));
    return { mine: mine ? await this.shape(mine) : null, available };
  }

  /** Registered farmers of the AMCOS who could pay a debt and take the farm. */
  async payers(actor: RequestUser, q: CaseQueryDto & { exclude?: string }) {
    const mamcosId = this.tenant(actor, q.mamcosId);
    const text = q.q?.trim();
    const rows = await this.prisma.farmer.findMany({
      where: {
        mamcosId, isBlacklisted: false, ...(q.exclude ? { id: { not: q.exclude } } : {}),
        ...(text ? { OR: [{ firstName: { contains: text, mode: 'insensitive' } }, { lastName: { contains: text, mode: 'insensitive' } }, { controlNumber: { contains: text, mode: 'insensitive' } }, { user: { phone: { contains: text } } }] } : {}),
      },
      select: { id: true, firstName: true, lastName: true, controlNumber: true, village: true, user: { select: { phone: true } } },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }], take: 20,
    });
    return { data: rows.map((f) => ({ id: f.id, name: fullName(f), memberNumber: f.controlNumber, village: f.village, phone: f.user?.phone ?? null })) };
  }

  // ───────────────────────── timers ─────────────────────────

  /** The daily sweep across every AMCOS that switched the overdue-debt penalty on. */
  async checkAll() {
    const on = await this.prisma.amcosCharge.findMany({ where: { code: 'DEFAULT_PENALTY', isActive: true }, select: { mamcosId: true } });
    let opened = 0;
    for (const { mamcosId } of on) opened += (await this.runCheck(mamcosId)).opened;
    return opened;
  }

  /** Gives farms back to anyone who paid, and moves expired notices to M-LAX. */
  async sweep() {
    const open = await this.prisma.farmDefaultCase.findMany({ where: { status: { in: [...OPEN] } } });
    for (const c of open) if (!this.busy.has(c.id)) await this.reclaimIfPaid(c).catch(() => undefined);
    return this.advance();
  }
}
