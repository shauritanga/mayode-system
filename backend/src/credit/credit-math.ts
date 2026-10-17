const r2 = (n: number) => Math.round(n * 100) / 100;

/** Amount to repay: principal plus flat interest (annual rate × term). No rate means no interest. */
export function totalRepayable(principal: number, annualRatePct: number | null | undefined, termMonths: number): number {
  return r2(principal * (1 + ((annualRatePct ?? 0) / 100) * (termMonths / 12)));
}

/** Same day-of-month `n` months on, clamped to the end of shorter months. */
export function addMonths(date: Date, n: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

export interface Instalment {
  number: number;
  dueDate: Date;
  amount: number;
}

/** Equal monthly instalments from one month after `start`; the last one absorbs rounding. */
export function buildSchedule(total: number, termMonths: number, start: Date): Instalment[] {
  const base = r2(total / termMonths);
  return Array.from({ length: termMonths }, (_, i) => ({
    number: i + 1,
    dueDate: addMonths(start, i + 1),
    amount: i === termMonths - 1 ? r2(total - base * (termMonths - 1)) : base,
  }));
}

export type InstalmentStatus = 'PAID' | 'PARTIAL' | 'OVERDUE' | 'UPCOMING';
export interface InstalmentView extends Instalment {
  paidAmount: number;
  balance: number;
  status: InstalmentStatus;
}

/** Applies everything repaid so far to the earliest instalments, then marks what is late. */
export function allocateRepayments(instalments: Instalment[], repaid: number, now = new Date()) {
  let left = Math.max(repaid, 0);
  const rows: InstalmentView[] = [...instalments]
    .sort((a, b) => a.number - b.number)
    .map((i) => {
      const paid = r2(Math.min(left, i.amount));
      left = r2(left - paid);
      const balance = r2(i.amount - paid);
      const status: InstalmentStatus =
        balance <= 0 ? 'PAID' : i.dueDate.getTime() < now.getTime() ? 'OVERDUE' : paid > 0 ? 'PARTIAL' : 'UPCOMING';
      return { ...i, paidAmount: paid, balance, status };
    });
  const overdue = rows.filter((r) => r.status === 'OVERDUE');
  return {
    rows,
    overdueCount: overdue.length,
    overdueAmount: r2(overdue.reduce((t, r) => t + r.balance, 0)),
    nextDue: rows.find((r) => r.status !== 'PAID' && r.status !== 'OVERDUE') ?? null,
  };
}

export interface ProductionPoint {
  areaHa: number | null;
  yieldKg: number | null;
}

/** Average kilograms per hectare over harvests that have both area and yield recorded. */
export function averageYieldPerHa(history: ProductionPoint[]): number | null {
  const usable = history.filter((h) => (h.areaHa ?? 0) > 0 && (h.yieldKg ?? 0) > 0);
  const area = usable.reduce((t, h) => t + (h.areaHa ?? 0), 0);
  return area > 0 ? Math.round(usable.reduce((t, h) => t + (h.yieldKg ?? 0), 0) / area) : null;
}

/** Yield and revenue the farm could be expected to produce, from its own history. */
export function expectedOutcome(farmHa: number, history: ProductionPoint[], pricePerKg: number | null) {
  const perHa = averageYieldPerHa(history);
  const estimatedYieldKg = perHa && farmHa > 0 ? Math.round(farmHa * perHa) : null;
  return {
    yieldPerHa: perHa,
    estimatedYieldKg,
    pricePerKg,
    expectedRevenue: estimatedYieldKg && pricePerKg ? Math.round(estimatedYieldKg * pricePerKg) : null,
  };
}

/** Rule of thumb: borrow no more than half of expected revenue, less what is still owed. Indicative only. */
export function indicativeLimit(expectedRevenue: number | null, outstanding: number): number | null {
  return expectedRevenue ? Math.max(0, Math.round(expectedRevenue * 0.5 - outstanding)) : null;
}

export function nextLoanReference(year: number, last?: string | null): string {
  const n = last ? parseInt(last.split('-')[2] ?? '0', 10) : 0;
  return `LA-${year}-${String((Number.isFinite(n) ? n : 0) + 1).padStart(4, '0')}`;
}

const NEXT: Record<string, string[]> = {
  SUBMITTED: ['UNDER_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED', 'WITHDRAWN'],
  APPROVED: ['DISBURSED', 'REJECTED', 'WITHDRAWN'],
  REJECTED: [],
  DISBURSED: [],
  WITHDRAWN: [],
};
export const canMoveApplication = (from: string, to: string) => (NEXT[from] ?? []).includes(to);
