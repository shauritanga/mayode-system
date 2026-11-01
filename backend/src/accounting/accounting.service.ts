import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AccountType, BudgetStatus, UserRole } from '@prisma/client';
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
  ['1310', 'Fertiliser loans receivable', AccountType.ASSET],
  ['1500', 'Property, plant and equipment', AccountType.ASSET],
  ['1590', 'Accumulated depreciation', AccountType.ASSET],
  ['2000', 'Loan repayment payable', AccountType.LIABILITY],
  ['2100', 'Supplier accounts payable', AccountType.LIABILITY],
  ['2200', 'Farmer settlement payable', AccountType.LIABILITY],
  ['2300', 'Payroll deductions payable', AccountType.LIABILITY],
  ['3000', 'Cooperative equity', AccountType.EQUITY],
  ['3100', 'Cooperative reserves', AccountType.EQUITY],
  ['3200', 'Unappropriated retained earnings', AccountType.EQUITY],
  ['4000', 'Rice sales revenue', AccountType.INCOME],
  ['4100', 'Fairtrade premium income', AccountType.INCOME],
  ['4200', 'Membership income', AccountType.INCOME],
  ['4210', 'Levies and dues income', AccountType.INCOME],
  ['4220', 'Canal maintenance fee income', AccountType.INCOME],
  ['4230', 'Fertiliser sales to members', AccountType.INCOME],
  ['4300', 'Gain or loss on disposal of assets', AccountType.INCOME],
  ['5000', 'Production input costs', AccountType.EXPENSE],
  ['5100', 'Loan repayment expense', AccountType.EXPENSE],
  ['5200', 'Farmer rice procurement', AccountType.EXPENSE],
  ['5300', 'Cost of goods sold', AccountType.EXPENSE],
  ['5400', 'Depreciation expense', AccountType.EXPENSE],
  ['5410', 'Repairs and maintenance', AccountType.EXPENSE],
  ['5500', 'Salaries and wages', AccountType.EXPENSE],
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
  private async accounts() {
    // Sequential: Prisma upsert is SELECT-then-INSERT (not atomic), so
    // concurrent upserts of the same code — from Promise.all here, or two
    // statements requests racing on a fresh DB — collide on the unique
    // `code` constraint (P2002). The chart remains small, so serial upserts
    // are negligible cost.
    for (const [code, name, type] of CHART) {
      await this.prisma.account.upsert({
        where: { code },
        create: { code, name, type },
        update: {},
      });
    }
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
  async postToLedger(
    sourceType: string,
    sourceId: string,
    entryDate: Date,
    description: string,
    lines: { code: string; debit?: number; credit?: number }[],
    /** The cooperative whose books these are; null only for platform-level postings. May be a lookup still in flight. */
    mamcosIdOrLookup: string | null | Promise<string | null>,
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
    const entryNumber = `GL-${entryDate.getFullYear()}-${sourceId.slice(0, 8)}`;
    return this.prisma.$transaction(
      lines.map((line) =>
        this.prisma.ledgerEntry.upsert({
          where: {
            sourceType_sourceId_accountId: {
              sourceType,
              sourceId,
              accountId: accounts.get(line.code)!.id,
            },
          },
          create: {
            entryNumber,
            accountId: accounts.get(line.code)!.id,
            debit: line.debit ?? 0,
            credit: line.credit ?? 0,
            entryDate,
            sourceType,
            sourceId,
            description,
            mamcosId,
          },
          update: {
            debit: line.debit ?? 0,
            credit: line.credit ?? 0,
            entryDate,
            description,
            mamcosId,
          },
        }),
      ),
    );
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
  async journalEntries(scope: LedgerScope) {
    const rows = await this.prisma.ledgerEntry.findMany({
      where: scope,
      include: { account: true },
      orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
    });
    const grouped = new Map<string, any>();
    for (const row of rows) {
      const key = `${row.sourceType}:${row.sourceId}`;
      const journal = grouped.get(key) ?? {
        id: row.sourceId,
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        entryNumber: row.entryNumber,
        entryDate: row.entryDate,
        description: row.description,
        createdAt: row.createdAt,
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
      });
      journal.totalDebit += row.debit;
      journal.totalCredit += row.credit;
      grouped.set(key, journal);
    }
    return [...grouped.values()];
  }

  async createJournalEntry(dto: CreateJournalEntryDto, scope: LedgerScope) {
    if (!dto.lines || dto.lines.length !== 2) {
      throw new BadRequestException('A journal entry must have exactly two accounts: one debit and one credit.');
    }
    const debitTotal = dto.lines.reduce((sum, line) => sum + (line.debit ?? 0), 0);
    const creditTotal = dto.lines.reduce((sum, line) => sum + (line.credit ?? 0), 0);
    if (Math.round(debitTotal * 100) !== Math.round(creditTotal * 100) || debitTotal <= 0) {
      throw new BadRequestException('Journal debits and credits must be equal and greater than zero.');
    }
    if (new Set(dto.lines.map((line) => line.accountId)).size !== dto.lines.length) {
      throw new BadRequestException('Use each account once per journal entry.');
    }
    for (const line of dto.lines) {
      const debit = line.debit ?? 0;
      const credit = line.credit ?? 0;
      if ((debit > 0) === (credit > 0)) {
        throw new BadRequestException('Each journal line must have either a debit or a credit amount.');
      }
    }
    if (dto.lines.filter((line) => (line.debit ?? 0) > 0).length !== 1 ||
        dto.lines.filter((line) => (line.credit ?? 0) > 0).length !== 1) {
      throw new BadRequestException('A journal entry must contain one debit line and one credit line.');
    }
    const accounts = await this.prisma.account.findMany({
      where: { id: { in: dto.lines.map((line) => line.accountId) }, isActive: true },
    });
    if (accounts.length !== new Set(dto.lines.map((line) => line.accountId)).size) {
      throw new BadRequestException('Choose active accounts for every journal line.');
    }
    const journalId = randomUUID();
    const entryDate = new Date(dto.entryDate);
    const entryNumber = `JE-${entryDate.getFullYear()}-${journalId.slice(0, 8).toUpperCase()}`;
    await this.prisma.$transaction(dto.lines.map((line) => this.prisma.ledgerEntry.create({
      data: {
        entryNumber,
        accountId: line.accountId,
        debit: line.debit ?? 0,
        credit: line.credit ?? 0,
        entryDate,
        sourceType: 'MANUAL_JOURNAL',
        sourceId: journalId,
        description: line.description?.trim() || dto.description.trim(),
        mamcosId: scope.mamcosId ?? null,
      },
    })));
    return this.journalEntries(scope).then((journals) => journals.find((journal) => journal.id === journalId));
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
  createInvoice(dto: CreateInvoiceDto, scope: LedgerScope) {
    return this.prisma.invoice.create({
      data: { ...dto, dueDate: new Date(dto.dueDate), mamcosId: scope.mamcosId ?? null },
    });
  }
  async createBill(dto: CreateBillDto, scope: LedgerScope) {
    let supplierName = dto.supplier;
    if (dto.supplierId) {
      const supplierRecord = await this.prisma.supplier.findUnique({
        where: { id: dto.supplierId },
        select: { name: true },
      });
      if (supplierRecord) supplierName = supplierRecord.name;
    }
    const bill = await this.prisma.bill.create({
      data: {
        ...dto,
        supplier: supplierName,
        dueDate: new Date(dto.dueDate),
        mamcosId: scope.mamcosId ?? null,
      },
    });
    await this.postToLedger(
      'Bill',
      bill.id,
      bill.createdAt,
      `Supplier bill: ${bill.supplier}`,
      [
        { code: '5000', debit: bill.amount },
        { code: '2100', credit: bill.amount },
      ],
      bill.mamcosId,
    );
    return bill;
  }
  async payBill(id: string, scope: LedgerScope) {
    const existing = await this.prisma.bill.findFirst({ where: { id, ...scope }, select: { id: true } });
    if (!existing) throw new NotFoundException('Bill not found');
    const bill = await this.prisma.bill.update({
      where: { id },
      data: { status: 'PAID', paidAt: new Date() },
    });
    await this.postToLedger(
      'BillPayment',
      bill.id,
      bill.paidAt!,
      `Supplier bill payment: ${bill.billNumber}`,
      [
        { code: '2100', debit: bill.amount },
        { code: '1000', credit: bill.amount },
      ],
      bill.mamcosId,
    );
    return bill;
  }
  async receivables(scope: LedgerScope) {
    const now = new Date();
    await this.prisma.invoice.updateMany({
      where: { status: 'OPEN', dueDate: { lt: now } },
      data: { status: 'OVERDUE' },
    });
    return this.prisma.invoice.findMany({
      where: { ...scope, status: { in: ['OPEN', 'OVERDUE'] } },
      include: { buyer: true, sale: true },
      orderBy: { dueDate: 'asc' },
    });
  }
  async payables(scope: LedgerScope) {
    const now = new Date();
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
