/** One neutral statement layout that the PDF, Word and Excel writers all draw from, so the three always agree. */

export type Cell = string | number | null;
export type RowStyle = 'normal' | 'heading' | 'subtotal' | 'total';

export interface Column { label: string; align?: 'left' | 'right'; width?: number /* relative weight */; money?: boolean }
export interface Row { cells: Cell[]; style?: RowStyle }
export interface Table { heading?: string; columns: Column[]; rows: Row[]; note?: string }

export interface ReportDocument {
  amcosName: string;
  heading: string;      // e.g. "Statement of Financial Position as at 31 December 2026"
  kind: string;         // statement name only, e.g. "Statement of Financial Position"
  periodLine: string;
  currency: string;     // "Tanzanian Shillings (TZS)"
  tables: Table[];
  notes: string[];
  preparedBy: string;
  approvedBy: string | null;
  generatedAt: string;  // human-readable, East Africa time
}

export const money = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** 1,234.50 / (1,234.50) for negatives; a dash for zero — the convention on printed statements. */
export function fmtMoney(n: number): string {
  const v = money(n);
  if (v === 0) return '-';
  const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v < 0 ? `(${s})` : s;
}

export const cellText = (c: Cell, col?: Column): string => (typeof c === 'number' ? (col?.money === false ? String(c) : fmtMoney(c)) : c ?? '');
