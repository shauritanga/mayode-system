/**
 * Compliance-linked stipends. A gate opener or a chairman is paid in full when they logged the water on at least 90% of the days
 * water was scheduled for them; below that the stipend shrinks in proportion. Pure functions: the service supplies the schedules and logs.
 */
export const COMPLIANCE_TARGET = 0.9;

export interface ScheduleLike { weekdays: number[]; startsOn: Date; endsOn: Date | null }

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Every calendar day of a YYYY-MM period, as YYYY-MM-DD. */
export function daysOfPeriod(period: string): string[] {
  const [y, m] = period.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: last }, (_, i) => ymd(new Date(Date.UTC(y, m - 1, i + 1))));
}

/** The days of a period on which a schedule says water runs (its weekdays, inside its own start and end). */
export function scheduledDays(s: ScheduleLike, period: string): Set<string> {
  const out = new Set<string>();
  for (const day of daysOfPeriod(period)) {
    const d = new Date(`${day}T00:00:00.000Z`);
    if (d < s.startsOn || (s.endsOn && d > s.endsOn)) continue;
    if (s.weekdays.includes(d.getUTCDay())) out.add(day);
  }
  return out;
}

export interface ComplianceResult { factor: number; pct: number | null; scheduled: number; logged: number; note: string }

/** The share of the stipend earned, and a sentence saying why. */
export function complianceResult(scheduled: number, logged: number): ComplianceResult {
  if (scheduled === 0) return { factor: 1, pct: null, scheduled: 0, logged: 0, note: 'No water schedule to check against' };
  const pct = Math.min(1, logged / scheduled);
  const factor = pct >= COMPLIANCE_TARGET ? 1 : Math.round((pct / COMPLIANCE_TARGET) * 10000) / 10000;
  return { factor, pct, scheduled, logged, note: `${logged} of ${scheduled} scheduled days logged (${Math.round(pct * 1000) / 10}%)` };
}
