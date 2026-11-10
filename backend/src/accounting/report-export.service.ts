import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService, type LedgerScope } from './accounting.service';
import type { RequestUser } from '../common/ownership.service';
import { GenerateReportDto } from './dto/report-export.dto';
import { money, type ReportDocument } from './exports/report-document';
import { changesInEquity, cashFlows, financialPosition, generalLedger, incomeStatement, trialBalance, type EquityRow } from './exports/report-builders';
import { AS_AT_REPORTS, fileSlug, periodLine, reportHeading, resolvePeriod, REPORT_NAMES, type ReportKind } from './exports/report-titles';
import { FORMAT_INFO, render, type ExportFormat } from './exports/writers';

const startOf = (d: string) => new Date(`${d}T00:00:00+03:00`);
const endOf = (d: string) => new Date(`${d}T23:59:59.999+03:00`);
const stamp = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Dar_es_Salaam', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()) + ' EAT';

@Injectable()
export class ReportExportService {
  constructor(private readonly prisma: PrismaService, private readonly accounting: AccountingService) {}

  /** Works out the dates to report on. "As at" statements only need the closing date. */
  period(kind: ReportKind, dto: Pick<GenerateReportDto, 'from' | 'to' | 'year' | 'month'>) {
    try {
      if (AS_AT_REPORTS.includes(kind) && dto.to && !dto.year) return { from: dto.to, to: dto.to };
      const p = resolvePeriod(dto);
      return AS_AT_REPORTS.includes(kind) ? { from: p.to, to: p.to } : p;
    } catch (e: any) {
      throw new BadRequestException(e.message);
    }
  }

  /** Builds the statement's data for the period (what every format is drawn from). */
  async build(kind: ReportKind, scope: LedgerScope, from: string, to: string, meta: { preparedBy: string; approvedBy: string | null }): Promise<ReportDocument> {
    const fromIso = startOf(from).toISOString();
    const toIso = endOf(to).toISOString();
    const mamcos = scope.mamcosId ? await this.prisma.mamcos.findUnique({ where: { id: scope.mamcosId }, select: { name: true } }) : null;
    let body;
    if (kind === 'COMPREHENSIVE_INCOME' || kind === 'INCOME_EXPENDITURE') {
      body = incomeStatement(kind, await this.accounting.profitAndLoss(scope, fromIso, toIso));
    } else if (kind === 'FINANCIAL_POSITION') {
      body = financialPosition(await this.accounting.balanceSheet(scope, toIso));
    } else if (kind === 'TRIAL_BALANCE') {
      body = trialBalance(await this.accounting.trialBalance(scope, undefined, toIso));
    } else if (kind === 'CASH_FLOWS') {
      body = cashFlows(await this.accounting.cashFlow(scope, fromIso, toIso));
    } else if (kind === 'CHANGES_IN_EQUITY') {
      body = await this.equity(scope, from, to);
    } else {
      const entries = await this.prisma.ledgerEntry.findMany({
        where: { ...scope, entryDate: { lte: endOf(to) } },
        select: { accountId: true, entryDate: true, entryNumber: true, description: true, debit: true, credit: true },
        orderBy: [{ entryDate: 'asc' }, { entryNumber: 'asc' }],
      });
      const accounts = await this.prisma.account.findMany({ orderBy: { code: 'asc' }, select: { id: true, code: true, name: true, type: true } });
      body = generalLedger(accounts, entries, startOf(from));
    }
    return {
      amcosName: mamcos?.name ?? (scope.mamcosId === undefined ? 'All cooperatives' : 'Mayode platform'),
      heading: reportHeading(kind, from, to),
      kind: REPORT_NAMES[kind],
      periodLine: periodLine(kind, from, to),
      currency: 'Tanzanian Shillings (TZS)',
      tables: body.tables,
      notes: body.notes,
      preparedBy: meta.preparedBy,
      approvedBy: meta.approvedBy,
      generatedAt: stamp(),
    };
  }

  private async equity(scope: LedgerScope, from: string, to: string) {
    const entries = await this.prisma.ledgerEntry.findMany({
      where: { ...scope, entryDate: { lte: endOf(to) } },
      select: { accountId: true, entryDate: true, debit: true, credit: true, account: { select: { code: true, name: true, type: true } } },
    });
    const start = startOf(from);
    const equity = new Map<string, EquityRow>();
    let openingSurplus = 0, periodSurplus = 0;
    for (const e of entries) {
      const before = e.entryDate < start;
      const credit = e.credit - e.debit;
      if (e.account.type === AccountType.EQUITY) {
        const row = equity.get(e.accountId) ?? { code: e.account.code, name: e.account.name, opening: 0, movement: 0, closing: 0 };
        if (before) row.opening += credit; else row.movement += credit;
        equity.set(e.accountId, row);
      } else if (e.account.type === AccountType.INCOME || e.account.type === AccountType.EXPENSE) {
        const surplus = credit; // income is credit-natural and expenses are debits, so credit − debit is the surplus effect of every line
        if (before) openingSurplus += surplus; else periodSurplus += surplus;
      }
    }
    const rows = [...equity.values()].sort((a, b) => a.code.localeCompare(b.code)).map((r) => ({ ...r, opening: money(r.opening), movement: money(r.movement), closing: money(r.opening + r.movement) }));
    return changesInEquity(rows, openingSurplus, periodSurplus);
  }

  async generate(scope: LedgerScope, user: RequestUser, dto: GenerateReportDto) {
    const kind = dto.report as ReportKind;
    const format = dto.format as ExportFormat;
    const { from, to } = this.period(kind, dto);
    const me = await this.prisma.user.findUnique({ where: { id: user.id }, select: { firstName: true, lastName: true, phone: true } });
    const preparedBy = [me?.firstName, me?.lastName].filter(Boolean).join(' ') || me?.phone || 'Accountant';
    const approvedBy = dto.approvedBy?.trim() || null;
    const doc = await this.build(kind, scope, from, to, { preparedBy, approvedBy });
    const content = await render(format, doc);
    const info = FORMAT_INFO[format];
    const fileName = `${fileSlug(kind, from, to)}.${info.ext}`;
    const row = await this.prisma.accountingReportArchive.create({
      data: {
        mamcosId: scope.mamcosId ?? null, reportType: kind, format, title: doc.heading,
        periodFrom: AS_AT_REPORTS.includes(kind) ? null : from, periodTo: to, fileName, mimeType: info.mime,
        sizeBytes: content.length, content: new Uint8Array(content), preparedBy, approvedBy, generatedById: user.id,
      },
      select: { id: true, reportType: true, format: true, title: true, periodFrom: true, periodTo: true, fileName: true, sizeBytes: true, preparedBy: true, approvedBy: true, generatedAt: true },
    });
    return row;
  }

  list(scope: LedgerScope, q: { report?: string; format?: string; limit?: number } = {}) {
    return this.prisma.accountingReportArchive.findMany({
      where: { ...(scope.mamcosId !== undefined ? { mamcosId: scope.mamcosId } : {}), ...(q.report ? { reportType: q.report } : {}), ...(q.format ? { format: q.format } : {}) },
      select: { id: true, reportType: true, format: true, title: true, periodFrom: true, periodTo: true, fileName: true, sizeBytes: true, preparedBy: true, approvedBy: true, generatedAt: true },
      orderBy: { generatedAt: 'desc' },
      take: q.limit ?? 100,
    });
  }

  async file(scope: LedgerScope, id: string) {
    const row = await this.prisma.accountingReportArchive.findFirst({
      where: { id, ...(scope.mamcosId !== undefined ? { mamcosId: scope.mamcosId } : {}) },
      select: { fileName: true, mimeType: true, content: true },
    });
    if (!row) throw new NotFoundException('Report not found');
    return row;
  }
}
