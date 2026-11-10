/** Official statement headings, generated from the report and the chosen period. Dates are plain YYYY-MM-DD strings (East Africa dates, no time zone maths). */

export type ReportKind =
  | 'COMPREHENSIVE_INCOME'
  | 'FINANCIAL_POSITION'
  | 'CASH_FLOWS'
  | 'CHANGES_IN_EQUITY'
  | 'TRIAL_BALANCE'
  | 'GENERAL_LEDGER'
  | 'INCOME_EXPENDITURE';

export const REPORT_KINDS: ReportKind[] = [
  'COMPREHENSIVE_INCOME', 'FINANCIAL_POSITION', 'CASH_FLOWS', 'CHANGES_IN_EQUITY', 'TRIAL_BALANCE', 'GENERAL_LEDGER', 'INCOME_EXPENDITURE',
];

export const REPORT_NAMES: Record<ReportKind, string> = {
  COMPREHENSIVE_INCOME: 'Statement of Comprehensive Income',
  FINANCIAL_POSITION: 'Statement of Financial Position',
  CASH_FLOWS: 'Statement of Cash Flows',
  CHANGES_IN_EQUITY: 'Statement of Changes in Equity',
  TRIAL_BALANCE: 'Trial Balance',
  GENERAL_LEDGER: 'General Ledger',
  INCOME_EXPENDITURE: 'Income and Expenditure Statement',
};

/** Reports that show balances at one date ("as at"); every other report covers a span of time. */
export const AS_AT_REPORTS: ReportKind[] = ['FINANCIAL_POSITION', 'TRIAL_BALANCE'];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIso(value: string): { y: number; m: number; d: number } | null {
  const hit = ISO.exec(value);
  if (!hit) return null;
  const y = Number(hit[1]), m = Number(hit[2]), d = Number(hit[3]);
  const real = new Date(Date.UTC(y, m - 1, d));
  if (real.getUTCFullYear() !== y || real.getUTCMonth() !== m - 1 || real.getUTCDate() !== d) return null;
  return { y, m, d };
}

/** 2026-12-31 → "31 December 2026". */
export function longDate(value: string): string {
  const p = parseIso(value);
  return p ? `${p.d} ${MONTHS[p.m - 1]} ${p.y}` : value;
}

function addDays(value: string, days: number): string {
  const p = parseIso(value)!;
  return new Date(Date.UTC(p.y, p.m - 1, p.d + days)).toISOString().slice(0, 10);
}

/** A span of exactly twelve whole months (1 Jan–31 Dec, or 1 Jul–30 Jun, …) is a "Year". */
export function isFullYear(from: string, to: string): boolean {
  const a = parseIso(from), b = parseIso(to);
  if (!a || !b) return false;
  const next = parseIso(addDays(to, 1))!;
  return next.d === 1 && a.d === 1 && (next.y - a.y) * 12 + (next.m - a.m) === 12;
}

/** The period a user picked: a financial year, a month or a custom range. */
export function resolvePeriod(input: { from?: string; to?: string; year?: number; month?: number }): { from: string; to: string } {
  if (input.year && input.month) {
    const first = `${input.year}-${String(input.month).padStart(2, '0')}-01`;
    const last = new Date(Date.UTC(input.year, input.month, 0)).toISOString().slice(0, 10);
    return { from: first, to: last };
  }
  if (input.year) return { from: `${input.year}-01-01`, to: `${input.year}-12-31` };
  if (!input.from || !input.to) throw new Error('Choose a financial year, a month, or a start and end date');
  if (!parseIso(input.from) || !parseIso(input.to)) throw new Error('Dates must be written as YYYY-MM-DD');
  if (input.from > input.to) throw new Error('The start date is after the end date');
  return { from: input.from, to: input.to };
}

/** "Statement of Financial Position as at 31 December 2026" and its siblings. */
export function reportHeading(kind: ReportKind, from: string, to: string): string {
  const name = REPORT_NAMES[kind];
  if (AS_AT_REPORTS.includes(kind)) return `${name} as at ${longDate(to)}`;
  if (kind === 'GENERAL_LEDGER') return `${name} for the Period ${longDate(from)} to ${longDate(to)}`;
  return `${name} for the ${isFullYear(from, to) ? 'Year' : 'Period'} Ended ${longDate(to)}`;
}

/** A line under the heading that spells out the span when the heading only names the end date. */
export function periodLine(kind: ReportKind, from: string, to: string): string {
  if (AS_AT_REPORTS.includes(kind)) return `Balances at ${longDate(to)}`;
  return `Covering ${longDate(from)} to ${longDate(to)}`;
}

export function fileSlug(kind: ReportKind, from: string, to: string): string {
  const base = REPORT_NAMES[kind].toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return AS_AT_REPORTS.includes(kind) ? `${base}-as-at-${to}` : `${base}-${from}-to-${to}`;
}
