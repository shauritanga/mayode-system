/** The arithmetic of interest on inputs given on credit. Pure, so every rule is easy to test: nothing here knows any rate or period, it only reads the AMCOS's own terms. */

export type Terms = { enabled: boolean; period: 'MONTHLY' | 'SEASON'; graceDays: number; paymentOrder: 'INTEREST_FIRST' | 'PRINCIPAL_FIRST' };
export type Rate = { id: string; label: string; ratePercent: number; validFrom: Date; validTo: Date | null };
export type Period = { key: string; end: Date; ratePercent: number | null; label: string };

export const cents = (n: number) => Math.round(n * 100) / 100;
export const ymd = (d: Date) => d.toISOString().slice(0, 10);
export const utcDay = (v: string | Date) => new Date(`${(typeof v === 'string' ? v : v.toISOString()).slice(0, 10)}T00:00:00.000Z`);

export function addDays(d: Date, n: number) { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; }
/** The same day-of-month `n` months on, kept inside the month (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(d: Date, n: number) {
  const day = d.getUTCDate();
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
  x.setUTCDate(Math.min(day, last));
  return x;
}

/** The rate the AMCOS set for a date, if any. */
export function rateOn(rates: Rate[], date: Date): Rate | undefined {
  return [...rates].sort((a, b) => +b.validFrom - +a.validFrom).find((r) => r.validFrom <= date && (!r.validTo || date <= r.validTo));
}

/**
 * The interest periods of one debt, up to `until`.
 * MONTHLY: one every month after the grace days, at the rate the AMCOS set for the day that month ends.
 * SEASON: one for each rate entry (a season) that ends on or after the day interest starts, at that entry's rate.
 * A period with no rate set has `ratePercent: null` and charges nothing, until the AMCOS sets one.
 */
export function periodsFor(terms: Terms, rates: Rate[], issuedOn: Date, until: Date): Period[] {
  const start = addDays(issuedOn, terms.graceDays);
  const out: Period[] = [];
  if (terms.period === 'MONTHLY') {
    for (let k = 1; k <= 120; k++) {
      const end = addMonths(start, k);
      if (end > until) break;
      out.push({ key: `M${k}`, end, ratePercent: rateOn(rates, end)?.ratePercent ?? null, label: `month ${k}` });
    }
  } else {
    for (const r of [...rates].filter((x) => x.validTo).sort((a, b) => +a.validFrom - +b.validFrom)) {
      if (r.validTo! < start || issuedOn > r.validTo! || r.validTo! > until) continue;
      out.push({ key: `S${r.id}`, end: r.validTo!, ratePercent: r.ratePercent, label: r.label });
    }
  }
  return out;
}

export const interestOf = (base: number, ratePercent: number) => cents((base * ratePercent) / 100);

/** What the farmer is told about the terms, in plain words. */
export function describeTerms(terms: Terms, rates: Rate[], today: Date, language: 'en' | 'sw' = 'en'): string {
  const en = language === 'en';
  if (!terms.enabled) return en ? 'No interest is charged on inputs given on credit.' : 'Hakuna riba inayotozwa kwenye pembejeo za mkopo.';
  const live = rates.filter((r) => !r.validTo || r.validTo >= today).sort((a, b) => +a.validFrom - +b.validFrom).slice(0, 3);
  const grace = terms.graceDays ? (en ? ` Interest starts ${terms.graceDays} days after the inputs are given.` : ` Riba huanza siku ${terms.graceDays} baada ya pembejeo kutolewa.`) : '';
  if (!live.length) return en ? 'Interest may be charged on inputs given on credit, but the AMCOS has not set the rate yet.' : 'Riba inaweza kutozwa kwenye pembejeo za mkopo, lakini AMCOS haijaweka kiwango bado.';
  const per = terms.period === 'MONTHLY' ? (en ? 'per month' : 'kwa mwezi') : (en ? 'per season' : 'kwa msimu');
  const list = live.map((r) => `${r.ratePercent}% ${per} (${r.label})`).join('; ');
  return (en ? `Interest on inputs given on credit: ${list}.` : `Riba kwenye pembejeo za mkopo: ${list}.`) + grace;
}
