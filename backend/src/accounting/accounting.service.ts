import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { resolveCashAccount } from './cash-resolve';
import { computeTax, localDate, nextOpenInstant, round2, bookingMoment } from './tax';
import { AccountType, BudgetStatus, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import {
  CreateBillDto,
  CreateBudgetDto,
  CreateMemberContributionDto,
  CreateReserveAllocationDto,
  CreateInvoiceDto,
  CreateJournalEntryDto,
} from './dto/accounting.dto';
import { calculateFinancialRatios } from './ratios';

const CHART = [
  ['1000', 'Cash and mobile money', AccountType.ASSET],
  ['1100', 'Accounts receivable', AccountType.ASSET],
  ['1200', 'Paddy inventory', AccountType.ASSET],
  ['1210', 'Finished rice inventory', AccountType.ASSET],
  ['1220', 'By-products inventory', AccountType.ASSET],
  ['1300', 'Farmer loans receivable', AccountType.ASSET],
  ['1400', 'VAT input recoverable', AccountType.ASSET],
  ['1410', 'Withholding tax credit', AccountType.ASSET],
  ['1310', 'Fertiliser loans receivable', AccountType.ASSET],
  ['1500', 'Property, plant and equipment', AccountType.ASSET],
  ['1590', 'Accumulated depreciation', AccountType.ASSET],
  ['2000', 'Loan repayment payable', AccountType.LIABILITY],
  ['2100', 'Supplier accounts payable', AccountType.LIABILITY],
  ['2200', 'Farmer settlement payable', AccountType.LIABILITY],
  ['2300', 'Payroll deductions payable', AccountType.LIABILITY],
  ['2400', 'VAT output payable', AccountType.LIABILITY],
  ['2410', 'Withholding tax payable', AccountType.LIABILITY],
  ['3000', 'Cooperative equity', AccountType.EQUITY],
  ['3100', 'Cooperative reserves', AccountType.EQUITY],
  ['3200', 'Unappropriated retained earnings', AccountType.EQUITY],
  ['4000', 'Rice sales revenue', AccountType.INCOME],
  ['4100', 'Fairtrade premium income', AccountType.INCOME],
  ['4200', 'Membership income', AccountType.INCOME],
  ['4210', 'Levies and dues income', AccountType.INCOME],
  ['4220', 'Canal maintenance fee income', AccountType.INCOME],
  ['4230', 'Fertiliser sales to members', AccountType.INCOME],
  ['4240', 'Tool registration fees', AccountType.INCOME],
  ['4250', 'Tool contribution income', AccountType.INCOME],
  ['4300', 'Gain or loss on disposal of assets', AccountType.INCOME],
  ['4400', 'Grants and donations', AccountType.INCOME],
  ['4410', 'Service and hire income', AccountType.INCOME],
  ['4490', 'Other income', AccountType.INCOME],
  ['5000', 'Production input costs', AccountType.EXPENSE],
  ['5100', 'Loan repayment expense', AccountType.EXPENSE],
  ['5200', 'Farmer rice procurement', AccountType.EXPENSE],
  ['5300', 'Cost of goods sold', AccountType.EXPENSE],
  ['5310', 'Stock losses and shrinkage', AccountType.EXPENSE],
  ['5400', 'Depreciation expense', AccountType.EXPENSE],
  ['5410', 'Repairs and maintenance', AccountType.EXPENSE],
  ['5420', 'Infrastructure maintenance contracts', AccountType.EXPENSE],
  ['5500', 'Salaries and wages', AccountType.EXPENSE],
  ['5600', 'Fuel and transport', AccountType.EXPENSE],
  ['5610', 'Utilities and communication', AccountType.EXPENSE],
  ['5620', 'Office and administration', AccountType.EXPENSE],
  ['5630', 'Meetings and allowances', AccountType.EXPENSE],
  ['5640', 'Bank charges', AccountType.EXPENSE],
  ['5690', 'Other expenses', AccountType.EXPENSE],
] as const;

/**
 * Whose books a request may read. `{}` = every cooperative and the platform (Super Admin, no filter chosen);
 * `{ mamcosId: id }` = one cooperative; `{ mamcosId: null }` = platform-level rows only.
 */
export type LedgerScope = { mamcosId?: string | null };

@Injectable()
export class AccountingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
  ) {}
  /**
   * The books this user may read. A cooperative's staff see only their own cooperative; Super Admin sees everything,
   * or one cooperative when `requested` is given; a platform account with no cooperative sees only platform-level rows.
   */
  scopeFor(user: RequestUser, requested?: string): LedgerScope {
    const own = this.ownership.resolveTenantMamcosId(user);
    if (own) {
      if (requested && requested !== own) throw new ForbiddenException('You can only see your own cooperative’s accounts');
      return { mamcosId: own };
    }
    if (user.role === UserRole.SUPER_ADMIN) return requested ? { mamcosId: requested } : {};
    return { mamcosId: null };
  }
  private chartEnsured: Promise<void> | null = null;
  private async accounts() {
    // Sequential: Prisma upsert is SELECT-then-INSERT (not atomic), so concurrent upserts of the same code — from
    // Promise.all, or two requests racing on a fresh DB — collide on the unique `code` constraint (P2002). The chart is
    // ensured once per process; after that a posting only reads it.
    if (!this.chartEnsured) {
      this.chartEnsured = (async () => {
        for (const [code, name, type] of CHART) {
          await this.prisma.account.upsert({ where: { code }, create: { code, name, type }, update: {} });
        }
      })().catch((e) => { this.chartEnsured = null; throw e; });
    }
    await this.chartEnsured;
    return this.prisma.account.findMany();
  }
  // ───── Which cooperative's books a posting belongs to: resolved from the record that caused it (same rules as the ledger backfill migration) ─────
  async mamcosOfFarmer(farmerId: string): Promise<string | null> {
    return (await this.prisma.farmer.findUnique({ where: { id: farmerId }, select: { mamcosId: true } }))?.mamcosId ?? null;
  }
  async mamcosOfLoan(loanId: string): Promise<string | null> {
    const loan = await this.prisma.loanRecord.findUnique({ where: { id: loanId }, select: { farmerId: true } });
    return loan ? this.mamcosOfFarmer(loan.farmerId) : null;
  }
  async mamcosOfLoanDeduction(deductionId: string): Promise<string | null> {
    const d = await this.prisma.loanDeduction.findUnique({ where: { id: deductionId }, select: { loanRecordId: true } });
    return d ? this.mamcosOfLoan(d.loanRecordId) : null;
  }
  async mamcosOfPayment(paymentId: string): Promise<string | null> {
    const p = await this.prisma.payment.findUnique({ where: { id: paymentId }, select: { farmerId: true } });
    return p ? this.mamcosOfFarmer(p.farmerId) : null;
  }
  async mamcosOfSale(saleId: string): Promise<string | null> {
    return (await this.prisma.sale.findUnique({ where: { id: saleId }, select: { mamcosId: true } }))?.mamcosId ?? null;
  }
  async mamcosOfInventoryRecord(recordId: string): Promise<string | null> {
    return (await this.prisma.inventoryRecord.findUnique({ where: { id: recordId }, select: { mamcosId: true } }))?.mamcosId ?? null;
  }
  async mamcosOfCropCycle(cropCycleId: string): Promise<string | null> {
    const c = await this.prisma.cropCycle.findUnique({ where: { id: cropCycleId }, select: { farm: { select: { mamcosId: true } } } });
    return c?.farm.mamcosId ?? null;
  }
  /**
   * The next gap-free document number for a cooperative, kind and year (e.g. GL-2026-000123). Runs inside the posting's
   * transaction, so a rolled-back posting never burns a number.
   */
  async nextNumber(tx: Prisma.TransactionClient, mamcosId: string | null, on: Date, prefix: string, kind = ''): Promise<string> {
    const year = Number(localDate(on).slice(0, 4));
    const key = `${mamcosId ?? 'platform'}${kind ? `:${kind}` : ''}`;
    const rows = await tx.$queryRaw<{ last_value: number }[]>`
      INSERT INTO ledger_counters (scope_key, year, last_value) VALUES (${key}, ${year}, 1)
      ON CONFLICT (scope_key, year) DO UPDATE SET last_value = ledger_counters.last_value + 1
      RETURNING last_value`;
    return `${prefix}-${year}-${String(rows[0].last_value).padStart(6, '0')}`;
  }
  /** The date the books are closed through for a cooperative (YYYY-MM-DD), or null while nothing is closed. */
  async closedThrough(mamcosId: string | null, tx: Prisma.TransactionClient | PrismaService = this.prisma): Promise<string | null> {
    const lock = await tx.accountingLock.findUnique({ where: { scopeKey: mamcosId ?? 'platform' } });
    return lock ? lock.closedThrough.toISOString().slice(0, 10) : null;
  }
  /**
   * Posts a balanced journal for a business event, once. Posting the same source again is safe: only the *difference* from what
   * the ledger already holds for that source is booked, as a new adjustment journal (revision 2, 3 …), and nothing at all when
   * nothing changed. Posted rows are never edited. Passing no lines cancels the source (what a void does).
   * If the day is in a closed period the journal is dated the first open day instead, with a note.
   */
  async postToLedger(
    sourceType: string,
    sourceId: string,
    entryDate: Date,
    description: string,
    /** `cashAccountId` marks which of the cooperative's money accounts a cash line (code 1000) moved through; leave out for "not assigned". */
    lines: { code: string; debit?: number; credit?: number; cashAccountId?: string | null }[],
    /** The cooperative whose books these are; null only for platform-level postings. May be a lookup still in flight. */
    mamcosIdOrLookup: string | null | Promise<string | null>,
    postedById?: string | null,
    /** Run inside the caller's transaction so a record and its journal commit (or roll back) together. */
    outer?: Prisma.TransactionClient,
  ) {
    const mamcosId = await mamcosIdOrLookup;
    const cents = (n: number) => Math.round(n * 100);
    if (
      lines.reduce((n, l) => n + cents(l.debit ?? 0), 0) !==
      lines.reduce((n, l) => n + cents(l.credit ?? 0), 0)
    )
      throw new Error('Ledger postings must balance');
    const accounts = new Map(
      (await this.accounts()).map((account) => [account.code, account]),
    );
    // A line is identified by its ledger account and, for cash, the money account it moved through.
    const keyOf = (accountId: string, cashAccountId?: string | null) => `${accountId}|${cashAccountId ?? ''}`;
    const desired = new Map<string, number>();
    for (const line of lines) {
      const account = accounts.get(line.code);
      if (!account) throw new BadRequestException(`Unknown ledger account ${line.code}`);
      if (line.cashAccountId && line.code !== '1000') throw new BadRequestException('Only cash lines can name a money account');
      const key = keyOf(account.id, line.cashAccountId);
      desired.set(key, (desired.get(key) ?? 0) + cents(line.debit ?? 0) - cents(line.credit ?? 0));
    }
    const work = async (tx: Prisma.TransactionClient) => {
      // One posting per source at a time, so two requests cannot both book the same revision.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ledger:${sourceType}:${sourceId}`}))`;
      const existing = await tx.ledgerEntry.findMany({ where: { sourceType, sourceId }, select: { accountId: true, cashAccountId: true, debit: true, credit: true, revision: true } });
      const current = new Map<string, number>();
      for (const row of existing) {
        const key = keyOf(row.accountId, row.cashAccountId);
        current.set(key, (current.get(key) ?? 0) + cents(row.debit) - cents(row.credit));
      }
      const delta: [string, number][] = [];
      for (const id of new Set([...desired.keys(), ...current.keys()])) {
        const d = (desired.get(id) ?? 0) - (current.get(id) ?? 0);
        if (d !== 0) delta.push([id, d]);
      }
      if (!delta.length) return [];
      const revision = existing.reduce((m, r) => Math.max(m, r.revision), 0) + 1;
      let when = entryDate;
      let note = '';
      const closed = await this.closedThrough(mamcosId, tx);
      if (closed && localDate(entryDate) <= closed) {
        when = nextOpenInstant(closed);
        note = ` (dated ${localDate(entryDate)}; that period is closed)`;
      }
      const entryNumber = await this.nextNumber(tx, mamcosId, when, 'GL');
      const journalId = randomUUID();
      const text = `${revision > 1 ? 'Adjustment: ' : ''}${description}${note}`;
      const created: Prisma.LedgerEntryGetPayload<object>[] = [];
      for (const [key, d] of delta) {
        const [accountId, cashAccountId] = key.split('|');
        created.push(await tx.ledgerEntry.create({
          data: {
            entryNumber, journalId, revision, accountId, cashAccountId: cashAccountId || null,
            debit: d > 0 ? d / 100 : 0, credit: d < 0 ? -d / 100 : 0,
            entryDate: when, sourceType, sourceId, description: text, mamcosId, postedById: postedById ?? null,
          },
        }));
      }
      return created;
    };
    return outer ? work(outer) : this.prisma.$transaction(work);
  }
  async profitAndLoss(scope: LedgerScope, from?: string, to?: string) {
    await this.accounts();
    const entries = await this.prisma.ledgerEntry.findMany({
      where: {
        ...scope,
        entryDate: {
          ...(from ? { gte: new Date(from) } : {}),
          ...(to ? { lte: new Date(to) } : {}),
        },
      },
      include: { account: true },
    });
    const incomeLines = this.linesByType(entries, AccountType.INCOME);
    const expenseLines = this.linesByType(entries, AccountType.EXPENSE);
    const income = incomeLines.reduce((n, e) => n + e.balance, 0);
    const expenses = expenseLines.reduce((n, e) => n + e.balance, 0);
    return {
      period: { from: from ?? null, to: to ?? null },
      income,
      expenses,
      grossSurplus: income - expenses,
      netProfit: income - expenses,
      incomeLines,
      expenseLines,
    };
  }
  async balanceSheet(scope: LedgerScope, to?: string) {
    await this.accounts();
    const asOf = to ? new Date(to) : undefined;
    const entries = await this.prisma.ledgerEntry.findMany({
      where: { ...scope, ...(asOf ? { entryDate: { lte: asOf } } : {}) },
      include: { account: true },
    });
    const assetLines = this.linesByType(entries, AccountType.ASSET);
    const liabilityLines = this.linesByType(entries, AccountType.LIABILITY);
    const equityLines = this.linesByType(entries, AccountType.EQUITY);
    const incomeLines = this.linesByType(entries, AccountType.INCOME);
    const expenseLines = this.linesByType(entries, AccountType.EXPENSE);
    const assets = assetLines.reduce((n, e) => n + e.balance, 0);
    const liabilities = liabilityLines.reduce((n, e) => n + e.balance, 0);
    const equity = equityLines.reduce((n, e) => n + e.balance, 0);
    const income = incomeLines.reduce((n, e) => n + e.balance, 0);
    const expenses = expenseLines.reduce((n, e) => n + e.balance, 0);
    const retainedEarnings = income - expenses;
    const totalEquity = equity + retainedEarnings;
    const balanceCheck = assets - liabilities - totalEquity;
    return {
      asOf: to ?? new Date().toISOString(),
      assets,
      liabilities,
      equity,
      retainedEarnings,
      totalEquity,
      assetLines,
      liabilityLines,
      equityLines,
      incomeLines,
      expenseLines,
      balanceCheck,
    };
  }
  async cashFlow(scope: LedgerScope, from?: string, to?: string) {
    const entries = await this.prisma.ledgerEntry.findMany({
      where: {
        ...scope,
        entryDate: {
          ...(to ? { lte: new Date(to) } : {}),
        },
      },
      include: { account: true },
      orderBy: { entryDate: 'asc' },
    });
    const allCashEntries = entries.filter(
      (entry) => entry.account.code === '1000',
    );
    const startDate = from ? new Date(from) : undefined;
    const cashEntries = allCashEntries.filter((entry) =>
      !startDate || entry.entryDate >= startDate,
    );
    const openingCashBalance = startDate
      ? allCashEntries
          .filter((entry) => entry.entryDate < startDate)
          .reduce((sum, entry) => sum + entry.debit - entry.credit, 0)
      : 0;
    const netCashFlow = cashEntries.reduce(
      (sum, entry) => sum + entry.debit - entry.credit,
      0,
    );
    const investingSources = new Set([
      'AssetPurchase',
      'AssetDisposal',
      'EquipmentPurchase',
      'EquipmentSale',
      'CapitalExpenditure',
    ]);
    const financingSources = new Set([
      'LoanDisbursement',
      'LenderRemittance',
      'CapitalContribution',
      'MemberContribution',
    ]);
    const activityFor = (sourceType: string) =>
      investingSources.has(sourceType)
        ? 'investing'
        : financingSources.has(sourceType)
          ? 'financing'
          : 'operating';
    const lines = cashEntries.map((entry) => ({
      ...entry,
      activity: activityFor(entry.sourceType),
      inflow: entry.debit,
      outflow: entry.credit,
      net: entry.debit - entry.credit,
    }));
    const section = (activity: 'operating' | 'investing' | 'financing') => {
      const activityLines = lines.filter((line) => line.activity === activity);
      const inflows = activityLines.reduce((sum, line) => sum + line.inflow, 0);
      const outflows = activityLines.reduce((sum, line) => sum + line.outflow, 0);
      return {
        inflows,
        outflows,
        netCashFlow: inflows - outflows,
        lines: activityLines,
      };
    };
    return {
      period: { from: from ?? null, to: to ?? null },
      netCashFlow,
      inflows: cashEntries.reduce((sum, entry) => sum + entry.debit, 0),
      outflows: cashEntries.reduce((sum, entry) => sum + entry.credit, 0),
      openingCashBalance,
      closingCashBalance: openingCashBalance + netCashFlow,
      operating: section('operating'),
      investing: section('investing'),
      financing: section('financing'),
      lines,
    };
  }
  /** Journals (grouped ledger lines), newest first. Filters are optional; the list is capped (default 1000). */
  async journalEntries(scope: LedgerScope, filter: { from?: string; to?: string; sourceType?: string; q?: string; limit?: number } = {}) {
    const where: Prisma.LedgerEntryWhereInput = { ...scope };
    if (filter.from || filter.to) {
      where.entryDate = {
        ...(filter.from ? { gte: new Date(`${filter.from}T00:00:00+03:00`) } : {}),
        ...(filter.to ? { lte: new Date(`${filter.to}T23:59:59.999+03:00`) } : {}),
      };
    }
    if (filter.sourceType) where.sourceType = filter.sourceType;
    if (filter.q?.trim()) {
      const q = filter.q.trim();
      where.OR = [{ entryNumber: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }];
    }
    const rows = await this.prisma.ledgerEntry.findMany({
      where,
      include: { account: true, cashAccount: { select: { id: true, name: true } } },
      orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }, { entryNumber: 'desc' }],
      take: Math.min(Math.max(filter.limit ?? 1000, 1), 5000) * 4, // a journal has several lines
    });
    const reversedIds = new Set(
      (await this.prisma.ledgerEntry.findMany({
        where: { ...scope, reversesJournalId: { in: [...new Set(rows.map((r) => r.journalId))] } },
        select: { reversesJournalId: true },
      })).map((r) => r.reversesJournalId),
    );
    const grouped = new Map<string, any>();
    for (const row of rows) {
      const journal = grouped.get(row.journalId) ?? {
        id: row.journalId,
        journalId: row.journalId,
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        revision: row.revision,
        entryNumber: row.entryNumber,
        entryDate: row.entryDate,
        description: row.description,
        createdAt: row.createdAt,
        postedById: row.postedById,
        reversesJournalId: row.reversesJournalId,
        reversed: reversedIds.has(row.journalId),
        lines: [],
        totalDebit: 0,
        totalCredit: 0,
      };
      journal.lines.push({
        accountId: row.accountId,
        account: row.account,
        debit: row.debit,
        credit: row.credit,
        description: row.description,
        cashAccount: row.cashAccount,
      });
      journal.totalDebit = round2(journal.totalDebit + row.debit);
      journal.totalCredit = round2(journal.totalCredit + row.credit);
      grouped.set(row.journalId, journal);
    }
    return [...grouped.values()].slice(0, Math.min(Math.max(filter.limit ?? 1000, 1), 5000));
  }

  /** A manual journal: two or more lines, each a debit or a credit, balanced. Dated inside an open period only. */
  async createJournalEntry(dto: CreateJournalEntryDto, scope: LedgerScope, actorId?: string | null) {
    if (!dto.lines || dto.lines.length < 2) {
      throw new BadRequestException('A journal entry needs at least two lines: a debit and a credit.');
    }
    const cents = (n: number) => Math.round(n * 100);
    for (const line of dto.lines) {
      const debit = line.debit ?? 0;
      const credit = line.credit ?? 0;
      if ((debit > 0) === (credit > 0)) {
        throw new BadRequestException('Each journal line must have either a debit or a credit amount.');
      }
    }
    const debitTotal = dto.lines.reduce((sum, line) => sum + cents(line.debit ?? 0), 0);
    const creditTotal = dto.lines.reduce((sum, line) => sum + cents(line.credit ?? 0), 0);
    if (debitTotal !== creditTotal || debitTotal <= 0) {
      throw new BadRequestException('Journal debits and credits must be equal and greater than zero.');
    }
    if (new Set(dto.lines.map((line) => line.accountId)).size !== dto.lines.length) {
      throw new BadRequestException('Use each account once per journal entry.');
    }
    const accounts = await this.prisma.account.findMany({
      where: { id: { in: dto.lines.map((line) => line.accountId) }, isActive: true },
    });
    if (accounts.length !== new Set(dto.lines.map((line) => line.accountId)).size) {
      throw new BadRequestException('Choose active accounts for every journal line.');
    }
    // Contract payments are booked only by the tender module, after a chairman's sign-off and a Manager's approval.
    if (accounts.some((a) => a.code === '5420')) throw new BadRequestException('Infrastructure maintenance contracts are booked only through a tender, not by a manual journal.');
    const mamcosId = scope.mamcosId ?? null;
    const cashIds = [...new Set(dto.lines.map((l) => l.cashAccountId).filter((x): x is string => !!x))];
    if (cashIds.length) {
      const cashAccount = accounts.find((a) => a.code === '1000');
      if (dto.lines.some((l) => l.cashAccountId && l.accountId !== cashAccount?.id)) throw new BadRequestException('Only a line on the cash account can name a money account.');
      const found = mamcosId ? await this.prisma.cashAccount.count({ where: { id: { in: cashIds }, mamcosId, isActive: true } }) : 0;
      if (found !== cashIds.length) throw new BadRequestException('Choose one of your own active money accounts.');
    }
    const entryDate = /^\d{4}-\d{2}-\d{2}$/.test(dto.entryDate) ? bookingMoment(dto.entryDate) : new Date(dto.entryDate);
    const journalId = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      const closed = await this.closedThrough(mamcosId, tx);
      if (closed && localDate(entryDate) <= closed) {
        throw new BadRequestException(`The books are closed through ${closed}. Date this entry after that day.`);
      }
      const entryNumber = await this.nextNumber(tx, mamcosId, entryDate, 'JE');
      for (const line of dto.lines) {
        await tx.ledgerEntry.create({
          data: {
            entryNumber, journalId, revision: 1,
            accountId: line.accountId,
            cashAccountId: line.cashAccountId || null,
            debit: line.debit ?? 0,
            credit: line.credit ?? 0,
            entryDate,
            sourceType: 'MANUAL_JOURNAL',
            sourceId: journalId,
            description: line.description?.trim() || dto.description.trim(),
            mamcosId,
            postedById: actorId ?? null,
          },
        });
      }
    });
    return this.journalEntries(scope, { limit: 5000 }).then((journals) => journals.find((journal) => journal.id === journalId));
  }

  /**
   * Cancels a manual journal by posting its mirror image, dated `date` (default today). The original stays on the books.
   * System-made journals (sales, loans, payroll …) are corrected at their source record instead, so the two never disagree.
   */
  async reverseJournal(journalId: string, dto: { reason: string; date?: string }, scope: LedgerScope, actorId?: string | null) {
    const rows = await this.prisma.ledgerEntry.findMany({ where: { ...scope, journalId }, include: { account: true } });
    if (!rows.length) throw new NotFoundException('Journal not found');
    const head = rows[0];
    if (head.sourceType !== 'MANUAL_JOURNAL') {
      throw new BadRequestException('Only manual journals can be reversed here. Correct system entries from the record that created them.');
    }
    if (await this.prisma.ledgerEntry.findFirst({ where: { reversesJournalId: journalId }, select: { id: true } })) {
      throw new ConflictException('This journal has already been reversed');
    }
    const reason = dto.reason?.trim();
    if (!reason || reason.length < 5) throw new BadRequestException('Say why the journal is being reversed (at least a few words).');
    const entryDate = dto.date ? bookingMoment(dto.date) : new Date();
    const newId = randomUUID();
    const mamcosId = head.mamcosId;
    try {
      await this.prisma.$transaction(async (tx) => {
        const closed = await this.closedThrough(mamcosId, tx);
        if (closed && localDate(entryDate) <= closed) {
          throw new BadRequestException(`The books are closed through ${closed}. Date the reversal after that day.`);
        }
        const entryNumber = await this.nextNumber(tx, mamcosId, entryDate, 'JE');
        for (const r of rows) {
          await tx.ledgerEntry.create({
            data: {
              entryNumber, journalId: newId, revision: 1, accountId: r.accountId, cashAccountId: r.cashAccountId,
              debit: r.credit, credit: r.debit, entryDate,
              sourceType: 'REVERSAL', sourceId: newId, reversesJournalId: journalId,
              description: `Reversal of ${head.entryNumber}: ${reason}`, mamcosId, postedById: actorId ?? null,
            },
          });
        }
      });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('This journal has already been reversed');
      throw e;
    }
    return this.journalEntries(scope, { limit: 5000 }).then((journals) => journals.find((journal) => journal.id === newId));
  }

  async trialBalance(scope: LedgerScope, from?: string, to?: string) {
    await this.accounts();
    const asOf = to
      ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(to) ? `${to}T23:59:59.999+03:00` : to)
      : new Date();
    const accounts = await this.prisma.account.findMany({ orderBy: { code: 'asc' } });
    const entries = await this.prisma.ledgerEntry.findMany({
      where: { ...scope, entryDate: { lte: asOf } },
      include: { account: true },
    });
    const byAccount = new Map(accounts.map((account) => [account.id, {
      code: account.code,
      name: account.name,
      type: account.type,
      debitActivity: 0,
      creditActivity: 0,
    }]));
    for (const entry of entries) {
      const row = byAccount.get(entry.accountId);
      if (!row) continue;
      row.debitActivity += entry.debit;
      row.creditActivity += entry.credit;
      byAccount.set(entry.accountId, row);
    }
    const lines = [...byAccount.values()].map((row) => {
      const balance = row.debitActivity - row.creditActivity;
      return {
        code: row.code,
        name: row.name,
        type: row.type,
        debitActivity: row.debitActivity,
        creditActivity: row.creditActivity,
        debitBalance: balance > 0 ? balance : 0,
        creditBalance: balance < 0 ? -balance : 0,
      };
    }).sort((a, b) => a.code.localeCompare(b.code));
    const totalDebit = lines.reduce((sum, line) => sum + line.debitBalance, 0);
    const totalCredit = lines.reduce((sum, line) => sum + line.creditBalance, 0);
    return {
      asOf: to ?? asOf.toISOString(),
      totalDebit,
      totalCredit,
      difference: totalDebit - totalCredit,
      balanced: Math.abs(totalDebit - totalCredit) < 0.01,
      lines,
    };
  }

  async accountBalances(scope: LedgerScope, to?: string) {
    await this.accounts();
    const asOf = to
      ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(to) ? `${to}T23:59:59.999+03:00` : to)
      : new Date();
    const accounts = await this.prisma.account.findMany({ orderBy: { code: 'asc' } });
    const entries = await this.prisma.ledgerEntry.findMany({
      where: { ...scope, entryDate: { lte: asOf } },
      select: { accountId: true, debit: true, credit: true },
    });
    const totals = new Map<string, { debits: number; credits: number }>();
    for (const entry of entries) {
      const row = totals.get(entry.accountId) ?? { debits: 0, credits: 0 };
      row.debits += entry.debit;
      row.credits += entry.credit;
      totals.set(entry.accountId, row);
    }
    const balances = accounts.map((account) => {
      const activity = totals.get(account.id) ?? { debits: 0, credits: 0 };
      const balance = activity.debits - activity.credits;
      return {
        id: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
        debitActivity: activity.debits,
        creditActivity: activity.credits,
        balance: Math.abs(balance),
        balanceSide: balance > 0 ? 'DEBIT' : balance < 0 ? 'CREDIT' : 'ZERO',
      };
    });
    return { asOf: to ?? asOf.toISOString(), accountCount: balances.length, balances };
  }

  async ratios(scope: LedgerScope, from?: string, to?: string) {
    const [balance, pnl, cashFlow] = await Promise.all([
      this.balanceSheet(scope, to),
      this.profitAndLoss(scope, from, to),
      this.cashFlow(scope, undefined, to),
    ]);
    return {
      period: { from: from ?? null, to: to ?? null },
      ...calculateFinancialRatios({
        assets: balance.assets,
        liabilities: balance.liabilities,
        cash: cashFlow.netCashFlow,
        income: pnl.income,
        netProfit: pnl.netProfit,
      }),
    };
  }
  async statements(scope: LedgerScope, from?: string, to?: string) {
    const [
      profitAndLoss,
      balanceSheet,
      cashFlow,
      trialBalance,
      ratios,
      receivables,
      payables,
    ] = await Promise.all([
      this.profitAndLoss(scope, from, to),
      this.balanceSheet(scope, to),
      this.cashFlow(scope, from, to),
      this.trialBalance(scope, from, to),
      this.ratios(scope, from, to),
      this.receivables(scope),
      this.payables(scope),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      period: { from: from ?? null, to: to ?? null },
      profitAndLoss,
      balanceSheet,
      cashFlow,
      trialBalance,
      ratios,
      workingCapital: balanceSheet.assets - balanceSheet.liabilities,
      receivablesTotal: receivables.reduce((sum, item) => sum + item.amount, 0),
      payablesTotal: payables.reduce((sum, item) => sum + item.amount, 0),
    };
  }
  /** Tax settings of the cooperative whose books these are (a platform-level document is never VAT-registered). */
  private async taxSettings(mamcosId: string | null) {
    const m = mamcosId
      ? await this.prisma.mamcos.findUnique({ where: { id: mamcosId }, select: { vatRegistered: true, vatRate: true } })
      : null;
    return { vatRegistered: m?.vatRegistered ?? false, vatRate: Number(m?.vatRate ?? 18) };
  }
  private async revenueOrExpenseAccount(code: string | undefined, types: AccountType[], fallback: string) {
    const chosen = code ?? fallback;
    const account = (await this.accounts()).find((a) => a.code === chosen);
    if (!account || !account.isActive || !types.includes(account.type)) {
      throw new BadRequestException(`Account ${chosen} cannot be used here`);
    }
    return account.code;
  }
  private async documentNumber(supplied: string | undefined, mamcosId: string | null, prefix: string, kind: string) {
    if (supplied?.trim()) return supplied.trim();
    return this.prisma.$transaction((tx) => this.nextNumber(tx, mamcosId, new Date(), prefix, kind));
  }

  /** Records a customer invoice and books it: receivable, revenue and output VAT. */
  async createInvoice(dto: CreateInvoiceDto, scope: LedgerScope, actorId?: string | null) {
    const mamcosId = scope.mamcosId ?? null;
    const tax = computeTax({ net: dto.amount, ...(await this.taxSettings(mamcosId)), vatApplies: dto.vatApplies, withholdingPercent: dto.withholdingPercent });
    const revenue = await this.revenueOrExpenseAccount(dto.revenueAccountCode, [AccountType.INCOME], '4000');
    const invoiceNumber = await this.documentNumber(dto.invoiceNumber, mamcosId, 'INV', 'INV');
    let invoice;
    try {
      invoice = await this.prisma.invoice.create({
        data: {
          invoiceNumber, saleId: dto.saleId, buyerId: dto.buyerId, description: dto.description?.trim() || null,
          amount: tax.total, subtotal: tax.subtotal, vatAmount: tax.vatAmount, withholdingAmount: tax.withholdingAmount,
          dueDate: new Date(dto.dueDate), mamcosId,
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException(`Invoice number ${invoiceNumber} is already used`);
      throw e;
    }
    await this.postToLedger('Invoice', invoice.id, invoice.createdAt, `Invoice ${invoice.invoiceNumber}`, [
      { code: '1100', debit: tax.total },
      { code: revenue, credit: tax.subtotal },
      ...(tax.vatAmount ? [{ code: '2400', credit: tax.vatAmount }] : []),
    ], mamcosId, actorId);
    return invoice;
  }
  /** The customer pays: cash in (less any tax they withheld), receivable cleared. */
  async payInvoice(id: string, scope: LedgerScope, actorId?: string | null, cashAccountId?: string | null) {
    const existing = await this.prisma.invoice.findFirst({ where: { id, ...scope } });
    if (!existing) throw new NotFoundException('Invoice not found');
    if (existing.status === 'PAID') throw new ConflictException('This invoice is already paid');
    if (existing.status === 'VOID') throw new BadRequestException('A void invoice cannot be paid');
    const wallet = await resolveCashAccount(this.prisma, existing.mamcosId, { cashAccountId });
    const invoice = await this.prisma.invoice.update({ where: { id }, data: { status: 'PAID', paidAt: new Date(), cashAccountId: wallet } });
    if (invoice.postedToLedger) {
      await this.postToLedger('InvoicePayment', invoice.id, invoice.paidAt!, `Payment of invoice ${invoice.invoiceNumber}`, [
        { code: '1000', debit: round2(invoice.amount - invoice.withholdingAmount), cashAccountId: wallet },
        ...(invoice.withholdingAmount ? [{ code: '1410', debit: invoice.withholdingAmount }] : []),
        { code: '1100', credit: invoice.amount },
      ], invoice.mamcosId, actorId);
    }
    return invoice;
  }
  /** Cancels an unpaid invoice and its ledger postings (the postings are offset, not deleted). */
  async voidInvoice(id: string, scope: LedgerScope, actorId?: string | null) {
    const existing = await this.prisma.invoice.findFirst({ where: { id, ...scope } });
    if (!existing) throw new NotFoundException('Invoice not found');
    if (existing.status === 'PAID') throw new BadRequestException('A paid invoice cannot be voided');
    if (existing.status === 'VOID') return existing;
    const invoice = await this.prisma.invoice.update({ where: { id }, data: { status: 'VOID' } });
    if (invoice.postedToLedger) await this.postToLedger('Invoice', invoice.id, new Date(), `Void invoice ${invoice.invoiceNumber}`, [], invoice.mamcosId, actorId);
    return invoice;
  }

  /** Records a supplier bill and books it: cost, input VAT (when recoverable) and what we owe the supplier. */
  async createBill(dto: CreateBillDto, scope: LedgerScope, actorId?: string | null) {
    const mamcosId = scope.mamcosId ?? null;
    let supplierName = dto.supplier;
    if (dto.supplierId) {
      const supplierRecord = await this.prisma.supplier.findUnique({
        where: { id: dto.supplierId },
        select: { name: true, mamcosId: true },
      });
      // A bill can be linked to the cooperative's own suppliers or to a shared one, never to another cooperative's.
      if (supplierRecord && supplierRecord.mamcosId != null && supplierRecord.mamcosId !== mamcosId) throw new BadRequestException('Choose one of your own suppliers.');
      if (supplierRecord) supplierName = supplierRecord.name;
    }
    const tax = computeTax({ net: dto.amount, ...(await this.taxSettings(mamcosId)), vatApplies: dto.vatApplies, withholdingPercent: dto.withholdingPercent });
    const expense = await this.revenueOrExpenseAccount(dto.expenseAccountCode, [AccountType.EXPENSE, AccountType.ASSET], '5000');
    const billNumber = await this.documentNumber(dto.billNumber, mamcosId, 'BILL', 'BILL');
    let bill;
    try {
      bill = await this.prisma.bill.create({
        data: {
          billNumber, supplier: supplierName, supplierId: dto.supplierId, description: dto.description,
          amount: tax.total, subtotal: tax.subtotal, vatAmount: tax.vatAmount, withholdingAmount: tax.withholdingAmount,
          expenseAccountCode: expense, dueDate: new Date(dto.dueDate), mamcosId,
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException(`Bill number ${billNumber} is already used`);
      throw e;
    }
    await this.postToLedger('Bill', bill.id, bill.createdAt, `Supplier bill: ${bill.supplier}`, [
      { code: expense, debit: tax.subtotal },
      ...(tax.vatAmount ? [{ code: '1400', debit: tax.vatAmount }] : []),
      { code: '2100', credit: tax.payable },
      ...(tax.withholdingAmount ? [{ code: '2410', credit: tax.withholdingAmount }] : []),
    ], mamcosId, actorId);
    return bill;
  }
  async payBill(id: string, scope: LedgerScope, actorId?: string | null, cashAccountId?: string | null) {
    const existing = await this.prisma.bill.findFirst({ where: { id, ...scope } });
    if (!existing) throw new NotFoundException('Bill not found');
    if (existing.status === 'PAID') throw new ConflictException('This bill is already paid');
    if (existing.status === 'VOID') throw new BadRequestException('A void bill cannot be paid');
    const wallet = await resolveCashAccount(this.prisma, existing.mamcosId, { cashAccountId });
    const bill = await this.prisma.bill.update({
      where: { id },
      data: { status: 'PAID', paidAt: new Date(), cashAccountId: wallet },
    });
    const payable = round2(bill.amount - bill.withholdingAmount);
    await this.postToLedger('BillPayment', bill.id, bill.paidAt!, `Supplier bill payment: ${bill.billNumber}`, [
      { code: '2100', debit: payable },
      { code: '1000', credit: payable, cashAccountId: wallet },
    ], bill.mamcosId, actorId);
    return bill;
  }
  async voidBill(id: string, scope: LedgerScope, actorId?: string | null) {
    const existing = await this.prisma.bill.findFirst({ where: { id, ...scope } });
    if (!existing) throw new NotFoundException('Bill not found');
    if (existing.status === 'PAID') throw new BadRequestException('A paid bill cannot be voided');
    if (existing.status === 'VOID') return existing;
    const bill = await this.prisma.bill.update({ where: { id }, data: { status: 'VOID' } });
    await this.postToLedger('Bill', bill.id, new Date(), `Void supplier bill: ${bill.supplier}`, [], bill.mamcosId, actorId);
    return bill;
  }
  async receivables(scope: LedgerScope) {
    // Due today is not overdue until today is over (Tanzania time).
    const now = new Date(`${localDate(new Date())}T00:00:00+03:00`);
    await this.prisma.invoice.updateMany({
      where: { status: 'OPEN', dueDate: { lt: now } },
      data: { status: 'OVERDUE' },
    });
    const [invoices, orderInvoices] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { ...scope, status: { in: ['OPEN', 'OVERDUE'] } },
        include: { buyer: true, sale: true },
        orderBy: { dueDate: 'asc' },
      }),
      // Invoices raised in Orders & Sales are receivables too; they are listed here so this report matches the receivables in the books,
      // but they are paid and followed up in Orders & Sales (control numbers, mobile money), so they carry no actions here.
      this.prisma.opsInvoice.findMany({
        where: { ...scope, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } },
        orderBy: { dueDate: 'asc' },
      }),
    ]);
    const fromOrders = orderInvoices
      .map((i) => ({
        id: `orders-${i.id}`,
        source: 'ORDERS' as const,
        invoiceNumber: i.invoiceNumber,
        buyer: { name: i.customerName },
        dueDate: i.dueDate,
        amount: Math.round((i.total - i.amountPaid) * 100) / 100,
        total: i.total,
        amountPaid: i.amountPaid,
        vatAmount: null,
        withholdingAmount: null,
        status: i.dueDate && i.dueDate < now ? 'OVERDUE' : 'OPEN',
      }))
      .filter((i) => i.amount > 0);
    const time = (d: Date | null) => (d ? d.getTime() : Number.MAX_SAFE_INTEGER);
    return [...invoices.map((i) => ({ ...i, source: 'ACCOUNTING' as const })), ...fromOrders].sort((a, b) => time(a.dueDate) - time(b.dueDate));
  }
  async payables(scope: LedgerScope) {
    const now = new Date(`${localDate(new Date())}T00:00:00+03:00`);
    await this.prisma.bill.updateMany({
      where: { status: 'OPEN', dueDate: { lt: now } },
      data: { status: 'OVERDUE' },
    });
    return this.prisma.bill.findMany({
      where: { ...scope, status: { in: ['OPEN', 'OVERDUE'] } },
      include: { supplierRef: true },
      orderBy: { dueDate: 'asc' },
    });
  }
  async listAccounts() {
    return this.accounts();
  }
  private budgetScope(user: RequestUser) {
    const mamcosId = this.ownership.resolveTenantMamcosId(user);
    return mamcosId ? { mamcosId } : {};
  }
  async memberContributions(user: RequestUser) {
    const mamcosId = this.ownership.resolveTenantMamcosId(user);
    const [contributions, members] = await Promise.all([
      this.prisma.memberContribution.findMany({
        where: mamcosId ? { mamcosId } : undefined,
        include: {
          farmer: { select: { id: true, firstName: true, lastName: true, controlNumber: true } },
        },
        orderBy: [{ contributionDate: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.farmer.findMany({
        where: mamcosId ? { mamcosId } : undefined,
        select: { id: true, firstName: true, lastName: true, controlNumber: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
    ]);
    return {
      totalContributions: contributions.reduce((sum, contribution) => sum + contribution.amount, 0),
      memberCount: new Set(contributions.map((contribution) => contribution.farmerId)).size,
      paymentCount: contributions.length,
      contributions,
      members,
    };
  }
  async createMemberContribution(dto: CreateMemberContributionDto, user: RequestUser) {
    const tenantId = this.ownership.resolveTenantMamcosId(user);
    const farmer = await this.prisma.farmer.findFirst({
      where: { id: dto.farmerId, ...(tenantId ? { mamcosId: tenantId } : {}) },
      select: { id: true, mamcosId: true },
    });
    if (!farmer) throw new NotFoundException('Farmer not found in your cooperative.');
    if (!farmer.mamcosId) throw new BadRequestException('Member contributions require a cooperative member.');
    const contributionDate = new Date(dto.contributionDate);
    const contribution = await this.prisma.memberContribution.create({
      data: {
        mamcosId: farmer.mamcosId,
        farmerId: farmer.id,
        amount: dto.amount,
        contributionDate,
        paymentMethod: dto.paymentMethod,
        reference: dto.reference,
        description: dto.description,
      },
      include: {
        farmer: { select: { firstName: true, lastName: true, controlNumber: true } },
      },
    });
    await this.postToLedger(
      'MemberContribution',
      contribution.id,
      contributionDate,
      contribution.description || 'Member contribution',
      [
        { code: '1000', debit: contribution.amount },
        { code: '3000', credit: contribution.amount },
      ],
      contribution.mamcosId,
    );
    return contribution;
  }
  async reserveAllocations(user: RequestUser) {
    const mamcosId = this.ownership.resolveTenantMamcosId(user);
    const allocations = await this.prisma.reserveAllocation.findMany({
      where: mamcosId ? { mamcosId } : undefined,
      include: { mamcos: { select: { name: true } } },
      orderBy: [{ allocationDate: 'desc' }, { createdAt: 'desc' }],
    });
    return {
      totalAllocated: allocations.reduce((sum, allocation) => sum + allocation.amount, 0),
      allocationCount: allocations.length,
      allocations,
    };
  }
  async createReserveAllocation(dto: CreateReserveAllocationDto, user: RequestUser) {
    const tenantId = this.ownership.resolveTenantMamcosId(user);
    const mamcosId = tenantId ?? dto.mamcosId;
    if (!mamcosId) throw new BadRequestException('Select a cooperative for this reserve allocation.');
    if (dto.mamcosId && tenantId && dto.mamcosId !== tenantId) {
      throw new NotFoundException('Cooperative not found in your scope.');
    }
    const cooperative = await this.prisma.mamcos.findUnique({ where: { id: mamcosId }, select: { id: true } });
    if (!cooperative) throw new NotFoundException('Cooperative not found.');
    const allocationDate = new Date(dto.allocationDate);
    const allocation = await this.prisma.reserveAllocation.create({
      data: {
        mamcosId,
        amount: dto.amount,
        allocationDate,
        description: dto.description,
      },
      include: { mamcos: { select: { name: true } } },
    });
    await this.postToLedger(
      'ReserveAllocation',
      allocation.id,
      allocationDate,
      dto.description || `Reserve allocation · ${allocation.mamcos.name}`,
      [
        { code: '3200', debit: allocation.amount },
        { code: '3100', credit: allocation.amount },
      ],
      allocation.mamcosId,
    );
    return allocation;
  }
  async farmerLiabilities(user: RequestUser) {
    const mamcosId = this.ownership.resolveTenantMamcosId(user);
    const farmerWhere = mamcosId ? { mamcosId } : undefined;
    const [loans, deliveries] = await Promise.all([
      this.prisma.loanRecord.findMany({
        where: farmerWhere ? { farmer: farmerWhere } : undefined,
        include: {
          farmer: {
            select: { id: true, firstName: true, lastName: true, controlNumber: true },
          },
          lender: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.inventoryRecord.findMany({
        where: {
          ...(mamcosId ? { mamcosId } : {}),
          totalValue: { not: null },
          farmerPaymentStatus: { not: 'PAID' },
        },
        include: {
          farmer: {
            select: { id: true, firstName: true, lastName: true, controlNumber: true },
          },
        },
        orderBy: { receivedDate: 'desc' },
      }),
    ]);
    const loanObligations = loans
      .filter((loan) => loan.amountOwed > 0)
      .map((loan) => ({
        id: loan.id,
        farmer: loan.farmer,
        lender: loan.lender?.name ?? loan.lenderName,
        originalAmount: loan.originalAmount,
        amountOwed: loan.amountOwed,
        repaid: Math.max(0, loan.originalAmount - loan.amountOwed),
        status: loan.isActive ? 'ACTIVE' : 'CLOSED',
      }));
    const procurementPayables = deliveries
      .map((delivery) => ({
        id: delivery.id,
        farmer: delivery.farmer,
        trackingCode: delivery.trackingCode,
        receivedDate: delivery.receivedDate,
        weightKg: delivery.weightKg,
        totalValue: delivery.totalValue ?? 0,
        amountPaid: delivery.amountPaid,
        amountOwed: Math.max(0, (delivery.totalValue ?? 0) - delivery.amountPaid),
      }))
      .filter((delivery) => delivery.amountOwed > 0);
    return {
      generatedAt: new Date().toISOString(),
      summary: {
        farmerLoanBalances: loanObligations.reduce((sum, loan) => sum + loan.amountOwed, 0),
        cooperativeProcurementPayables: procurementPayables.reduce((sum, delivery) => sum + delivery.amountOwed, 0),
        farmersWithLoanBalances: new Set(loanObligations.map((loan) => loan.farmer.id)).size,
        unpaidDeliveries: procurementPayables.length,
      },
      loanObligations,
      procurementPayables,
    };
  }
  findAllBudgets(user: RequestUser) {
    return this.prisma.budget.findMany({
      where: this.budgetScope(user),
      include: { lines: true },
      orderBy: { startDate: 'desc' },
    });
  }
  findBudget(id: string, user: RequestUser) {
    return this.prisma.budget.findFirstOrThrow({
      where: { id, ...this.budgetScope(user) },
      include: { lines: { include: { account: true } } },
    });
  }
  async approveBudget(id: string, user: RequestUser) {
    const budget = await this.prisma.budget.findFirstOrThrow({
      where: { id, ...this.budgetScope(user) },
      select: { id: true, status: true },
    });
    if (budget.status !== BudgetStatus.DRAFT) {
      throw new ConflictException('Only draft budgets can be approved.');
    }
    return this.prisma.budget.update({
      where: { id: budget.id },
      data: {
        status: BudgetStatus.APPROVED,
        approvedAt: new Date(),
        approvedByUserId: user.id,
      },
      include: { lines: { include: { account: true } } },
    });
  }
  async approvedAllocations(user: RequestUser) {
    const budgets = await this.prisma.budget.findMany({
      where: { ...this.budgetScope(user), status: BudgetStatus.APPROVED },
      include: {
        mamcos: { select: { name: true } },
        lines: { include: { account: true } },
      },
      orderBy: [{ fiscalYear: 'desc' }, { startDate: 'desc' }],
    });
    const allocations = budgets.flatMap((budget) => budget.lines.map((line) => ({
      id: line.id,
      budgetId: budget.id,
      budgetName: budget.name,
      fiscalYear: budget.fiscalYear,
      periodStart: budget.startDate,
      periodEnd: budget.endDate,
      cooperative: budget.mamcos?.name ?? null,
      approvedAt: budget.approvedAt,
      account: line.account,
      amount: line.amount,
    })));
    return {
      totalApproved: allocations.reduce((sum, allocation) => sum + allocation.amount, 0),
      budgetCount: budgets.length,
      allocationCount: allocations.length,
      allocations,
    };
  }
  async createBudget(dto: CreateBudgetDto, user: RequestUser) {
    const tenantMamcosId = this.ownership.resolveTenantMamcosId(user);
    const mamcosId = tenantMamcosId ?? dto.mamcosId;
    if (!mamcosId) {
      throw new BadRequestException('Select a cooperative for this budget.');
    }
    const cooperative = await this.prisma.mamcos.findUnique({ where: { id: mamcosId }, select: { id: true } });
    if (!cooperative) throw new BadRequestException('Selected cooperative was not found.');
    return this.prisma.budget.create({
      data: {
        mamcosId,
        name: dto.name,
        fiscalYear: dto.fiscalYear,
        seasonLabel: dto.seasonLabel,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        lines: { create: dto.lines },
      },
      include: { lines: { include: { account: true } } },
    });
  }
  async budgetActual(id: string, user: RequestUser) {
    const budget = await this.prisma.budget.findFirstOrThrow({
      where: { id, ...this.budgetScope(user) },
      include: { lines: { include: { account: true } } },
    });
    const entries = await this.prisma.ledgerEntry.findMany({
      where: { entryDate: { gte: budget.startDate, lte: budget.endDate } },
    });
    return {
      ...budget,
      lines: budget.lines.map((line) => ({
        ...line,
        actual: entries
          .filter((e) => e.accountId === line.accountId)
          .reduce((sum, e) => sum + e.debit - e.credit, 0),
        variance:
          line.amount -
          entries
            .filter((e) => e.accountId === line.accountId)
            .reduce((sum, e) => sum + e.debit - e.credit, 0),
      })),
    };
  }

  private linesByType(
    entries: {
      accountId: string;
      debit: number;
      credit: number;
      account: { code: string; name: string; type: AccountType };
    }[],
    type: AccountType,
  ) {
    const naturalDebit =
      type === AccountType.ASSET || type === AccountType.EXPENSE;
    const rows = new Map<
      string,
      {
        code: string;
        name: string;
        type: AccountType;
        debit: number;
        credit: number;
        balance: number;
      }
    >();
    for (const entry of entries.filter((item) => item.account.type === type)) {
      const row = rows.get(entry.accountId) ?? {
        code: entry.account.code,
        name: entry.account.name,
        type,
        debit: 0,
        credit: 0,
        balance: 0,
      };
      row.debit += entry.debit;
      row.credit += entry.credit;
      row.balance = naturalDebit
        ? row.debit - row.credit
        : row.credit - row.debit;
      rows.set(entry.accountId, row);
    }
    return [...rows.values()].sort((a, b) => a.code.localeCompare(b.code));
  }
}
