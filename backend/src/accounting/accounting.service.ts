import { Injectable } from '@nestjs/common';
import { AccountType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateBillDto,
  CreateBudgetDto,
  CreateInvoiceDto,
} from './dto/accounting.dto';
import { calculateFinancialRatios } from './ratios';

const CHART = [
  ['1000', 'Cash and mobile money', AccountType.ASSET],
  ['1100', 'Accounts receivable', AccountType.ASSET],
  ['2000', 'Loan repayment payable', AccountType.LIABILITY],
  ['2100', 'Supplier accounts payable', AccountType.LIABILITY],
  ['2200', 'Farmer settlement payable', AccountType.LIABILITY],
  ['3000', 'Cooperative equity', AccountType.EQUITY],
  ['4000', 'Rice sales revenue', AccountType.INCOME],
  ['4100', 'Fairtrade premium income', AccountType.INCOME],
  ['4200', 'Membership income', AccountType.INCOME],
  ['5000', 'Production input costs', AccountType.EXPENSE],
  ['5100', 'Loan repayment expense', AccountType.EXPENSE],
  ['5200', 'Farmer rice procurement', AccountType.EXPENSE],
] as const;

@Injectable()
export class AccountingService {
  constructor(private readonly prisma: PrismaService) {}
  private async accounts() {
    await Promise.all(
      CHART.map(([code, name, type]) =>
        this.prisma.account.upsert({
          where: { code },
          create: { code, name, type },
          update: {},
        }),
      ),
    );
    return this.prisma.account.findMany();
  }
  async postToLedger(
    sourceType: string,
    sourceId: string,
    entryDate: Date,
    description: string,
    lines: { code: string; debit?: number; credit?: number }[],
  ) {
    if (
      lines.reduce((n, l) => n + (l.debit ?? 0), 0) !==
      lines.reduce((n, l) => n + (l.credit ?? 0), 0)
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
          },
          update: {
            debit: line.debit ?? 0,
            credit: line.credit ?? 0,
            entryDate,
            description,
          },
        }),
      ),
    );
  }
  async profitAndLoss(from?: string, to?: string) {
    await this.accounts();
    const entries = await this.prisma.ledgerEntry.findMany({
      where: {
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
  async balanceSheet(to?: string) {
    await this.accounts();
    const asOf = to ? new Date(to) : undefined;
    const entries = await this.prisma.ledgerEntry.findMany({
      where: asOf ? { entryDate: { lte: asOf } } : undefined,
      include: { account: true },
    });
    const assetLines = this.linesByType(entries, AccountType.ASSET);
    const liabilityLines = this.linesByType(entries, AccountType.LIABILITY);
    const equityLines = this.linesByType(entries, AccountType.EQUITY);
    const assets = assetLines.reduce((n, e) => n + e.balance, 0),
      liabilities = liabilityLines.reduce((n, e) => n + e.balance, 0),
      equity = equityLines.reduce((n, e) => n + e.balance, 0);
    return {
      asOf: to ?? new Date().toISOString(),
      assets,
      liabilities,
      equity,
      retainedEarnings: assets - liabilities - equity,
      assetLines,
      liabilityLines,
      equityLines,
      balanceCheck: assets - liabilities - equity,
    };
  }
  async cashFlow(from?: string, to?: string) {
    const entries = await this.prisma.ledgerEntry.findMany({
      where: {
        entryDate: {
          ...(from ? { gte: new Date(from) } : {}),
          ...(to ? { lte: new Date(to) } : {}),
        },
      },
      include: { account: true },
      orderBy: { entryDate: 'asc' },
    });
    const cashEntries = entries.filter(
      (entry) => entry.account.code === '1000',
    );
    const netCashFlow = cashEntries.reduce(
      (sum, entry) => sum + entry.debit - entry.credit,
      0,
    );
    return {
      period: { from: from ?? null, to: to ?? null },
      netCashFlow,
      inflows: cashEntries.reduce((sum, entry) => sum + entry.debit, 0),
      outflows: cashEntries.reduce((sum, entry) => sum + entry.credit, 0),
      lines: cashEntries,
    };
  }
  async trialBalance(from?: string, to?: string) {
    await this.accounts();
    const entries = await this.prisma.ledgerEntry.findMany({
      where: {
        entryDate: {
          ...(from ? { gte: new Date(from) } : {}),
          ...(to ? { lte: new Date(to) } : {}),
        },
      },
      include: { account: true },
    });
    const byAccount = new Map<
      string,
      {
        code: string;
        name: string;
        type: AccountType;
        debit: number;
        credit: number;
      }
    >();
    for (const entry of entries) {
      const row = byAccount.get(entry.accountId) ?? {
        code: entry.account.code,
        name: entry.account.name,
        type: entry.account.type,
        debit: 0,
        credit: 0,
      };
      row.debit += entry.debit;
      row.credit += entry.credit;
      byAccount.set(entry.accountId, row);
    }
    const lines = [...byAccount.values()].sort((a, b) =>
      a.code.localeCompare(b.code),
    );
    return {
      period: { from: from ?? null, to: to ?? null },
      totalDebit: lines.reduce((sum, line) => sum + line.debit, 0),
      totalCredit: lines.reduce((sum, line) => sum + line.credit, 0),
      balanced:
        Math.abs(
          lines.reduce((sum, line) => sum + line.debit - line.credit, 0),
        ) < 0.01,
      lines,
    };
  }
  async ratios(from?: string, to?: string) {
    const [balance, pnl] = await Promise.all([
      this.balanceSheet(to),
      this.profitAndLoss(from, to),
    ]);
    return {
      period: { from: from ?? null, to: to ?? null },
      ...calculateFinancialRatios({
        assets: balance.assets,
        liabilities: balance.liabilities,
        income: pnl.income,
        netProfit: pnl.netProfit,
      }),
    };
  }
  async statements(from?: string, to?: string) {
    const [
      profitAndLoss,
      balanceSheet,
      cashFlow,
      trialBalance,
      ratios,
      receivables,
      payables,
    ] = await Promise.all([
      this.profitAndLoss(from, to),
      this.balanceSheet(to),
      this.cashFlow(from, to),
      this.trialBalance(from, to),
      this.ratios(from, to),
      this.receivables(),
      this.payables(),
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
  createInvoice(dto: CreateInvoiceDto) {
    return this.prisma.invoice.create({
      data: { ...dto, dueDate: new Date(dto.dueDate) },
    });
  }
  async createBill(dto: CreateBillDto) {
    const bill = await this.prisma.bill.create({
      data: { ...dto, dueDate: new Date(dto.dueDate) },
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
    );
    return bill;
  }
  async payBill(id: string) {
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
    );
    return bill;
  }
  async receivables() {
    const now = new Date();
    await this.prisma.invoice.updateMany({
      where: { status: 'OPEN', dueDate: { lt: now } },
      data: { status: 'OVERDUE' },
    });
    return this.prisma.invoice.findMany({
      where: { status: { in: ['OPEN', 'OVERDUE'] } },
      include: { buyer: true, sale: true },
      orderBy: { dueDate: 'asc' },
    });
  }
  async payables() {
    const now = new Date();
    await this.prisma.bill.updateMany({
      where: { status: 'OPEN', dueDate: { lt: now } },
      data: { status: 'OVERDUE' },
    });
    return this.prisma.bill.findMany({
      where: { status: { in: ['OPEN', 'OVERDUE'] } },
      orderBy: { dueDate: 'asc' },
    });
  }
  createBudget(dto: CreateBudgetDto) {
    return this.prisma.budget.create({
      data: {
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
  async budgetActual(id: string) {
    const budget = await this.prisma.budget.findUniqueOrThrow({
      where: { id },
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
