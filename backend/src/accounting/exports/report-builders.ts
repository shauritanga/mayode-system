import { AccountType } from '@prisma/client';
import { money, type ReportDocument, type Row, type Table } from './report-document';
import { REPORT_NAMES, type ReportKind } from './report-titles';

type Line = { code: string; name: string; balance: number };
const lineRows = (lines: Line[]): Row[] => lines.map((l) => ({ cells: [l.code, l.name, money(l.balance)] }));
const sum = (lines: Line[]) => money(lines.reduce((n, l) => n + l.balance, 0));
const AMOUNT3 = [{ label: 'Code', width: 1 }, { label: 'Description', width: 5 }, { label: 'Amount', align: 'right' as const, width: 2 }];
const humanise = (s: string) => s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/^./, (c) => c.toUpperCase());

type Body = Pick<ReportDocument, 'tables' | 'notes'>;

export function incomeStatement(kind: 'COMPREHENSIVE_INCOME' | 'INCOME_EXPENDITURE', pnl: { incomeLines: Line[]; expenseLines: Line[]; income: number; expenses: number }): Body {
  const comp = kind === 'COMPREHENSIVE_INCOME';
  const surplus = money(pnl.income - pnl.expenses);
  const rows: Row[] = [
    { cells: ['', comp ? 'Revenue' : 'Income', null], style: 'heading' },
    ...lineRows(pnl.incomeLines),
    { cells: ['', comp ? 'Total revenue' : 'Total income', money(pnl.income)], style: 'subtotal' },
    { cells: ['', comp ? 'Expenses' : 'Expenditure', null], style: 'heading' },
    ...lineRows(pnl.expenseLines),
    { cells: ['', comp ? 'Total expenses' : 'Total expenditure', money(pnl.expenses)], style: 'subtotal' },
    { cells: ['', comp ? 'Surplus / (deficit) for the period' : 'Surplus / (deficit) of income over expenditure', surplus], style: comp ? 'subtotal' : 'total' },
  ];
  if (comp) {
    rows.push({ cells: ['', 'Other comprehensive income', 0], style: 'normal' });
    rows.push({ cells: ['', 'Total comprehensive income for the period', surplus], style: 'total' });
  }
  return { tables: [{ columns: AMOUNT3, rows }], notes: [] };
}

export function financialPosition(bs: any): Body {
  const equityRows: Row[] = [...lineRows(bs.equityLines), { cells: ['', 'Accumulated surplus / (deficit)', money(bs.retainedEarnings)] }];
  const totalEL = money(bs.totalEquity + bs.liabilities);
  const tables: Table[] = [
    { heading: 'Assets', columns: AMOUNT3, rows: [...lineRows(bs.assetLines), { cells: ['', 'Total assets', money(bs.assets)], style: 'total' }] },
    {
      heading: 'Equity and liabilities', columns: AMOUNT3,
      rows: [
        { cells: ['', 'Equity', null], style: 'heading' }, ...equityRows,
        { cells: ['', 'Total equity', money(bs.totalEquity)], style: 'subtotal' },
        { cells: ['', 'Liabilities', null], style: 'heading' }, ...lineRows(bs.liabilityLines),
        { cells: ['', 'Total liabilities', money(bs.liabilities)], style: 'subtotal' },
        { cells: ['', 'Total equity and liabilities', totalEL], style: 'total' },
      ],
    },
  ];
  const notes: string[] = [];
  if (Math.abs(money(bs.balanceCheck)) >= 0.01) notes.push(`The statement is out of balance by ${money(bs.balanceCheck).toLocaleString('en-US')}. Review the journal entries before relying on these figures.`);
  return { tables, notes };
}

export function trialBalance(tb: { lines: any[]; totalDebit: number; totalCredit: number; balanced: boolean; difference: number }): Body {
  const shown = tb.lines.filter((l) => Math.abs(l.debitBalance) > 0.004 || Math.abs(l.creditBalance) > 0.004);
  const rows: Row[] = shown.map((l) => ({ cells: [l.code, l.name, l.debitBalance || null, l.creditBalance || null] }));
  rows.push({ cells: ['', 'Total', money(tb.totalDebit), money(tb.totalCredit)], style: 'total' });
  const cols = [{ label: 'Code', width: 1 }, { label: 'Account', width: 5 }, { label: 'Debit', align: 'right' as const, width: 2 }, { label: 'Credit', align: 'right' as const, width: 2 }];
  return { tables: [{ columns: cols, rows }], notes: tb.balanced ? [] : [`The trial balance is out by ${money(Math.abs(tb.difference)).toLocaleString('en-US')}.`] };
}

export function cashFlows(cf: any): Body {
  const rows: Row[] = [];
  const section = (title: string, net: string, s: { lines: any[]; netCashFlow: number }) => {
    rows.push({ cells: [title, null], style: 'heading' });
    const bySource = new Map<string, number>();
    for (const l of s.lines) bySource.set(l.sourceType, (bySource.get(l.sourceType) ?? 0) + l.net);
    [...bySource.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([k, v]) => rows.push({ cells: [humanise(k), money(v)] }));
    rows.push({ cells: [net, money(s.netCashFlow)], style: 'subtotal' });
  };
  section('Cash flows from operating activities', 'Net cash from operating activities', cf.operating);
  section('Cash flows from investing activities', 'Net cash used in investing activities', cf.investing);
  section('Cash flows from financing activities', 'Net cash from financing activities', cf.financing);
  rows.push({ cells: ['Net increase / (decrease) in cash and cash equivalents', money(cf.netCashFlow)], style: 'subtotal' });
  rows.push({ cells: ['Cash and cash equivalents at the beginning of the period', money(cf.openingCashBalance)] });
  rows.push({ cells: ['Cash and cash equivalents at the end of the period', money(cf.closingCashBalance)], style: 'total' });
  return {
    tables: [{ columns: [{ label: 'Description', width: 6 }, { label: 'Amount', align: 'right', width: 2 }], rows }],
    notes: ['Cash and cash equivalents are the balance of ledger account 1000 (cash, bank and mobile money). Each activity is grouped by the kind of transaction that moved the cash.'],
  };
}

export type EquityRow = { code: string; name: string; opening: number; movement: number; closing: number };
export function changesInEquity(equity: EquityRow[], openingSurplus: number, periodSurplus: number): Body {
  const rows: Row[] = equity.map((e) => ({ cells: [e.name, e.opening, 0, e.movement, e.closing] }));
  rows.push({ cells: ['Accumulated surplus / (deficit)', money(openingSurplus), money(periodSurplus), 0, money(openingSurplus + periodSurplus)] });
  const t = (i: number) => money(rows.reduce((n, r) => n + (Number(r.cells[i]) || 0), 0));
  rows.push({ cells: ['Total equity', t(1), t(2), t(3), t(4)], style: 'total' });
  return {
    tables: [{
      columns: [{ label: 'Component of equity', width: 4 }, { label: 'Balance at start', align: 'right', width: 2 }, { label: 'Surplus for the period', align: 'right', width: 2 }, { label: 'Other movements', align: 'right', width: 2 }, { label: 'Balance at end', align: 'right', width: 2 }],
      rows,
    }],
    notes: ['Other movements are contributions, reserve allocations and other entries posted directly to equity accounts during the period.'],
  };
}

export type LedgerEntryRow = { accountId: string; entryDate: Date; entryNumber: string; description: string | null; debit: number; credit: number };
export type LedgerAccount = { id: string; code: string; name: string; type: AccountType };
const eat = (d: Date) => { const s = new Date(d.getTime() + 3 * 3_600_000).toISOString().slice(0, 10); return `${s.slice(8)}/${s.slice(5, 7)}/${s.slice(0, 4)}`; };

export function generalLedger(accounts: LedgerAccount[], entries: LedgerEntryRow[], periodStart: Date): Body {
  const tables: Table[] = [];
  const cols = [{ label: 'Date', width: 1.5 }, { label: 'Entry no.', width: 2 }, { label: 'Description', width: 4.5 }, { label: 'Debit', align: 'right' as const, width: 2 }, { label: 'Credit', align: 'right' as const, width: 2 }, { label: 'Balance', align: 'right' as const, width: 2 }];
  for (const a of accounts) {
    const mine = entries.filter((e) => e.accountId === a.id);
    const natural = a.type === AccountType.ASSET || a.type === AccountType.EXPENSE ? 1 : -1;
    const before = mine.filter((e) => e.entryDate < periodStart);
    const during = mine.filter((e) => e.entryDate >= periodStart).sort((x, y) => x.entryDate.getTime() - y.entryDate.getTime() || x.entryNumber.localeCompare(y.entryNumber));
    const opening = money(before.reduce((n, e) => n + (e.debit - e.credit) * natural, 0));
    if (!during.length && Math.abs(opening) < 0.005) continue;
    let run = opening, dr = 0, cr = 0;
    const rows: Row[] = [{ cells: ['', '', 'Opening balance', null, null, opening], style: 'heading' }];
    for (const e of during) {
      run = money(run + (e.debit - e.credit) * natural);
      dr += e.debit; cr += e.credit;
      rows.push({ cells: [eat(e.entryDate), e.entryNumber, e.description ?? '', e.debit || null, e.credit || null, run] });
    }
    rows.push({ cells: ['', '', 'Totals and closing balance', money(dr), money(cr), run], style: 'total' });
    tables.push({ heading: `${a.code} · ${a.name}`, columns: cols, rows });
  }
  return { tables, notes: tables.length ? ['Balances are shown on each account\'s normal side: debit for assets and expenses, credit for liabilities, equity and income. A negative balance is shown in brackets.'] : ['No ledger activity or balances were found for this period.'] };
}

export const statementName = (k: ReportKind) => REPORT_NAMES[k];
