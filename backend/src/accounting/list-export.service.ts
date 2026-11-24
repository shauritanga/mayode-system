import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../common/ownership.service';
import { AccountingService, type LedgerScope } from './accounting.service';
import { CashAccountsService } from './cash-accounts.service';
import { CashTransactionsService } from './cash-transactions.service';
import { FarmerAccountsService } from './farmer-accounts.service';
import { ReportExportService } from './report-export.service';
import type { Cell, ReportDocument, Row } from './exports/report-document';
import { longDate } from './exports/report-titles';
import { eatDate, listFile, listHeader, todayEat } from './exports/list-header';
import type { ExportFormat } from './exports/writers';
import type { TableExportDto } from './dto/report-export.dto';

export const LIST_EXPORT_VIEWS = ['journal', 'trial-balance', 'general-ledger', 'cashbook', 'expenses', 'income', 'invoices', 'bills', 'farmers-owed', 'budgets'] as const;
export type ListExportView = typeof LIST_EXPORT_VIEWS[number];
export interface ListExportQuery { view: ListExportView; format: ExportFormat; from?: string; to?: string; q?: string; status?: string; account?: string; kind?: string; sourceType?: string }

const day = (d: Date | string | null | undefined) => (d ? longDate(eatDate(d)) : '—');
const total = (cells: Cell[]): Row => ({ cells, style: 'total' });
const SOURCE: Record<string, string> = { Expense: 'Expense', Income: 'Other income', Invoice: 'Invoice', Bill: 'Supplier bill', Manual: 'Manual journal' };
const DOC_STATUS: Record<string, string> = { OPEN: 'Not paid', OVERDUE: 'Overdue', PAID: 'Paid', VOID: 'Cancelled' };
const CASH_STATUS: Record<string, string> = { POSTED: 'Posted', PENDING_APPROVAL: 'Waiting for approval', VOID: 'Cancelled', REJECTED: 'Rejected' };

/** The accounting lists as PDF, Word or Excel: the same rows the screen shows, everything that matches the filters. */
@Injectable()
export class ListExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
    private readonly cash: CashTransactionsService,
    private readonly cashAccounts: CashAccountsService,
    private readonly farmerAccounts: FarmerAccountsService,
    private readonly reports: ReportExportService,
  ) {}

  async export(user: RequestUser, scope: LedgerScope, q: ListExportQuery) {
    for (const d of [q.from, q.to]) if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new BadRequestException('Dates must look like 2026-03-31.');
    if (q.from && q.to && q.from > q.to) throw new BadRequestException('The start date is after the end date.');
    const head = await listHeader(this.prisma, scope.mamcosId, user.id);
    const asAt = longDate(todayEat());
    const span = [q.from ? `From ${longDate(q.from)}` : '', q.to ? `to ${longDate(q.to)}` : ''].filter(Boolean).join(' ');
    const search = q.q?.trim() ? `Search: “${q.q.trim()}”` : '';
    const note = (...parts: string[]) => parts.filter(Boolean).join(' · ');
    const make = (kind: string, heading: string, periodLine: string, tables: ReportDocument['tables']): ReportDocument => ({ ...head, kind, heading, periodLine, tables });

    switch (q.view) {
      case 'trial-balance':
      case 'general-ledger': {
        const to = q.to ?? todayEat();
        const from = q.view === 'general-ledger' ? (q.from ?? `${to.slice(0, 4)}-01-01`) : to;
        const doc = await this.reports.build(q.view === 'trial-balance' ? 'TRIAL_BALANCE' : 'GENERAL_LEDGER', scope, from, to, { preparedBy: head.preparedBy, approvedBy: null });
        return listFile(q.format, doc, q.view === 'trial-balance' ? 'trial-balance' : 'general-ledger');
      }
      case 'journal': {
        const entries = await this.accounting.journalEntries(scope, { from: q.from, to: q.to, q: q.q, sourceType: q.sourceType || undefined, limit: 5000 });
        const rows: Row[] = [];
        let debit = 0, credit = 0;
        for (const e of entries) {
          rows.push({ cells: [day(e.entryDate), e.entryNumber, `${e.description ?? ''}${e.reversed ? ' (reversed)' : ''}`, SOURCE[e.sourceType] ?? e.sourceType ?? '', null, null], style: 'heading' });
          for (const l of e.lines) rows.push({ cells: ['', '', `${l.account?.code ?? ''} ${l.account?.name ?? ''}`.trim(), '', l.debit || 0, l.credit || 0] });
          debit += e.totalDebit; credit += e.totalCredit;
        }
        rows.push(total([`Total · ${entries.length} journal${entries.length === 1 ? '' : 's'}`, '', '', '', debit, credit]));
        return listFile(q.format, make('Journal Entries', `Journal Entries as at ${asAt}`, note(q.sourceType ? `Origin: ${SOURCE[q.sourceType] ?? q.sourceType}` : '', span, search) || 'Every posting to the books, newest first',
          [{ columns: [{ label: 'Date', width: 2 }, { label: 'Entry', width: 2 }, { label: 'Description / account', width: 5 }, { label: 'Source', width: 2 }, { label: 'Debit', align: 'right', width: 2 }, { label: 'Credit', align: 'right', width: 2 }], rows }]), 'journal-entries');
      }
      case 'cashbook': {
        const b = await this.cashAccounts.cashBook(scope, { account: q.account || undefined, kind: (q.kind as 'MOBILE_MONEY' | undefined) || undefined, from: q.from, to: q.to });
        const rows: Row[] = [{ cells: ['', '', 'Balance brought forward', '', null, null, b.opening], style: 'subtotal' },
          ...b.rows.map((r) => ({ cells: [day(r.date), r.number, r.description ?? '—', r.account, r.moneyIn || 0, r.moneyOut || 0, r.balance] as Cell[] })),
          total(['', '', 'Balance carried forward', '', b.totalIn, b.totalOut, b.closing])];
        return listFile(q.format, make(q.kind === 'MOBILE_MONEY' ? 'Mobile Money Cashbook' : 'Cashbook', `${q.kind === 'MOBILE_MONEY' ? 'Mobile Money Cashbook' : 'Cashbook'} as at ${asAt}`, note(b.account ?? '', span),
          [{ columns: [{ label: 'Date', width: 2 }, { label: 'Entry', width: 2 }, { label: 'What for', width: 4 }, { label: 'Account', width: 2.4 }, { label: 'Money in', align: 'right', width: 2 }, { label: 'Money out', align: 'right', width: 2 }, { label: 'Balance', align: 'right', width: 2 }], rows }]), 'cashbook');
      }
      case 'expenses':
      case 'income': {
        const exp = q.view === 'expenses';
        const l = await this.cash.list(scope, { kind: exp ? 'EXPENSE' : 'INCOME', from: q.from, to: q.to, q: q.q, limit: 2000 });
        const rows: Row[] = l.items.map((i) => ({ cells: [day(i.date), i.number, i.category, i.party ?? '—', i.account ?? '—', i.vatAmount || 0, i.amount, CASH_STATUS[i.status] ?? i.status] }));
        rows.push(total([`Total · ${l.count} posted`, '', '', '', '', null, l.total, '']));
        const name = exp ? 'Expenses' : 'Other Income';
        return listFile(q.format, make(name, `${name} as at ${asAt}`, note(span, search) || (exp ? 'Every cost paid by the cooperative' : 'Every other income received'),
          [{ columns: [{ label: 'Date', width: 2 }, { label: 'No.', width: 2 }, { label: 'Category', width: 3 }, { label: exp ? 'Paid to' : 'Received from', width: 3 }, { label: 'Money account', width: 2.4 }, { label: 'VAT', align: 'right', width: 1.6 }, { label: 'Amount', align: 'right', width: 2 }, { label: 'Status', width: 2 }], rows }]), exp ? 'expenses' : 'other-income');
      }
      case 'invoices':
      case 'bills': {
        const bill = q.view === 'bills';
        const unpaid = !q.status || q.status === 'unpaid';
        const list: any[] = unpaid ? (bill ? await this.accounting.payables(scope) : await this.accounting.receivables(scope)) : await this.accounting.documents(bill ? 'BILL' : 'INVOICE', scope, q.status);
        const rows: Row[] = list.map((d) => ({ cells: [bill ? d.billNumber : d.invoiceNumber, bill ? d.supplier : (d.buyer?.name ?? d.description ?? '—'), day(d.dueDate), d.total ?? d.amount, d.amountPaid ?? 0, d.balance ?? 0, DOC_STATUS[d.status] ?? d.status] }));
        rows.push(total([`Total · ${list.length}`, '', '', list.reduce((n, d) => n + (d.total ?? d.amount ?? 0), 0), list.reduce((n, d) => n + (d.amountPaid ?? 0), 0), list.reduce((n, d) => n + (d.balance ?? 0), 0), '']));
        const name = bill ? (unpaid ? 'Supplier Bills Outstanding' : q.status === 'VOID' ? 'Cancelled Supplier Bills' : 'Supplier Bills Paid') : (unpaid ? 'Customer Invoices Outstanding' : q.status === 'VOID' ? 'Cancelled Customer Invoices' : 'Customer Invoices Paid');
        return listFile(q.format, make(name, `${name} as at ${asAt}`, bill ? 'What the cooperative buys on credit' : 'What customers have been invoiced',
          [{ columns: [{ label: bill ? 'Bill no.' : 'Invoice no.', width: 2.4 }, { label: bill ? 'Supplier' : 'Customer', width: 3.4 }, { label: 'Due', width: 2.2 }, { label: 'Amount', align: 'right', width: 2 }, { label: 'Paid', align: 'right', width: 2 }, { label: 'Balance', align: 'right', width: 2 }, { label: 'Status', width: 1.8 }], rows }]), bill ? 'supplier-bills' : 'customer-invoices');
      }
      case 'farmers-owed': {
        const o = await this.farmerAccounts.owed(scope);
        const rows: Row[] = o.items.map((i) => ({ cells: [i.name, i.memberNumber ?? '—', i.phone ?? '—', i.bought, i.paid, i.owed, i.debts || 0] }));
        rows.push(total([`Total · ${o.items.length} farmer${o.items.length === 1 ? '' : 's'}`, '', '', o.items.reduce((n, i) => n + i.bought, 0), o.totalPaid, o.totalOwed, o.totalDebts]));
        return listFile(q.format, make('Owed to Farmers', `Amounts Owed to Farmers as at ${asAt}`, 'What the cooperative still has to pay for the paddy it bought',
          [{ columns: [{ label: 'Farmer', width: 3.4 }, { label: 'Member no.', width: 2 }, { label: 'Phone', width: 2.4 }, { label: 'Bought', align: 'right', width: 2 }, { label: 'Paid', align: 'right', width: 2 }, { label: 'We owe', align: 'right', width: 2 }, { label: 'They owe us', align: 'right', width: 2 }], rows }]), 'owed-to-farmers');
      }
      case 'budgets': {
        const [budgets, accounts] = [await this.accounting.findAllBudgets(user), await this.accounting.listAccounts()];
        const rows: Row[] = [];
        let grand = 0;
        for (const b of budgets) {
          const sum = b.lines.reduce((n, l) => n + l.amount, 0); grand += sum;
          rows.push({ cells: [b.name, `${day(b.startDate)} – ${day(b.endDate)}`, b.status === 'DRAFT' ? 'Draft' : b.status === 'APPROVED' ? 'Approved' : b.status, null], style: 'heading' });
          for (const l of b.lines) rows.push({ cells: [`   ${accounts.find((a) => a.id === l.accountId)?.name ?? l.accountId}`, '', '', l.amount] });
          rows.push({ cells: ['   Total budget', '', '', sum], style: 'subtotal' });
        }
        rows.push(total([`Total · ${budgets.length} budget${budgets.length === 1 ? '' : 's'}`, '', '', grand]));
        return listFile(q.format, make('Budgets', `Budgets as at ${asAt}`, 'Planned income and spending by account',
          [{ columns: [{ label: 'Budget / account', width: 4 }, { label: 'Period', width: 4 }, { label: 'Status', width: 2 }, { label: 'Amount', align: 'right', width: 2 }], rows }]), 'budgets');
      }
      default:
        throw new BadRequestException('That list cannot be exported.');
    }
  }

  /**
   * Draws a list the screen is showing. The cooperative's name, who prepared it and when come from the signed-in user,
   * never from the request; the request only supplies the rows. Everything is checked and clipped before it is drawn.
   */
  async table(user: RequestUser, scope: LedgerScope, dto: TableExportDto) {
    const clip = (v: unknown, n = 300): string => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, n);
    const cell = (v: unknown): Cell => (typeof v === 'number' && Number.isFinite(v) ? v : v == null ? null : clip(v));
    const columns = dto.columns.map((c) => ({ label: clip(c?.label, 60).trim(), align: c?.align === 'right' ? ('right' as const) : undefined, money: c?.money === false ? false : undefined }));
    if (columns.some((c) => !c.label)) throw new BadRequestException('Every column needs a name.');
    const fit = (cells: unknown): Cell[] => {
      if (!Array.isArray(cells)) throw new BadRequestException('Each row must be a list of cells.');
      return columns.map((_, i) => cell(cells[i]));
    };
    const rows: Row[] = dto.rows.map((r) => ({ cells: fit(r) }));
    if (dto.totals) rows.push(total(fit(dto.totals)));
    const head = await listHeader(this.prisma, scope.mamcosId, user.id);
    const title = clip(dto.title, 120).trim() || 'List';
    const doc: ReportDocument = { ...head, kind: title, heading: `${title} as at ${longDate(todayEat())}`, periodLine: clip(dto.subtitle, 300), tables: [{ columns, rows }] };
    return listFile(dto.format, doc, dto.name ?? 'list');
  }
}
