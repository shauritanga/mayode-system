import { Rate, Terms, addMonths, describeTerms, interestOf, periodsFor, rateOn, utcDay } from './interest-schedule';

const d = utcDay;
const monthly: Terms = { enabled: true, period: 'MONTHLY', graceDays: 0, paymentOrder: 'INTEREST_FIRST' };
const season: Terms = { ...monthly, period: 'SEASON' };
const rate = (id: string, pct: number, from: string, to: string | null, label = id): Rate => ({ id, label, ratePercent: pct, validFrom: d(from), validTo: to ? d(to) : null });

describe('interest schedule', () => {
  it('keeps month ends inside the month', () => {
    expect(addMonths(d('2026-01-31'), 1).toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(addMonths(d('2026-03-15'), 2).toISOString().slice(0, 10)).toBe('2026-05-15');
  });

  it('takes the rate set for the date, and none when the AMCOS set none', () => {
    const rates = [rate('a', 3, '2026-01-01', '2026-03-31'), rate('b', 5, '2026-04-01', null)];
    expect(rateOn(rates, d('2026-02-10'))?.ratePercent).toBe(3);
    expect(rateOn(rates, d('2026-09-10'))?.ratePercent).toBe(5);
    expect(rateOn(rates, d('2025-12-31'))).toBeUndefined();
  });

  it('monthly: one period per month after the grace days, each at that month\'s own rate', () => {
    const rates = [rate('a', 3, '2026-01-01', '2026-02-28'), rate('b', 5, '2026-03-01', null)];
    const p = periodsFor({ ...monthly, graceDays: 10 }, rates, d('2026-01-01'), d('2026-04-30'));
    expect(p.map((x) => [x.end.toISOString().slice(0, 10), x.ratePercent])).toEqual([['2026-02-11', 3], ['2026-03-11', 5], ['2026-04-11', 5]]);
  });

  it('monthly: a month with no rate charges nothing yet', () => {
    expect(periodsFor(monthly, [rate('a', 4, '2026-02-02', null)], d('2026-01-01'), d('2026-03-01')).map((x) => x.ratePercent)).toEqual([null, 4]);
  });

  it('season: one period for each season that ends after the credit was given', () => {
    const rates = [rate('s1', 10, '2026-01-01', '2026-06-30', 'Masika'), rate('s2', 8, '2026-07-01', '2026-12-31', 'Vuli')];
    expect(periodsFor(season, rates, d('2026-03-01'), d('2026-12-31')).map((x) => [x.label, x.ratePercent])).toEqual([['Masika', 10], ['Vuli', 8]]);
    expect(periodsFor(season, rates, d('2026-08-01'), d('2026-12-31')).map((x) => x.label)).toEqual(['Vuli']); // the credit came after Masika ended
    expect(periodsFor(season, rates, d('2026-03-01'), d('2026-05-01'))).toEqual([]); // no season has ended yet
  });

  it('rounds the interest to cents', () => {
    expect(interestOf(100_000, 5)).toBe(5000);
    expect(interestOf(33_333.33, 2.5)).toBe(833.33);
  });

  it('describes the terms in plain words, and says so when nothing is charged', () => {
    expect(describeTerms({ ...monthly, enabled: false }, [], d('2026-01-01'))).toMatch(/No interest/);
    expect(describeTerms(monthly, [rate('a', 5, '2026-01-01', null, 'Masika 2026')], d('2026-02-01'))).toMatch(/5% per month \(Masika 2026\)/);
    expect(describeTerms(season, [rate('a', 10, '2026-01-01', '2026-06-30', 'Masika')], d('2026-02-01'), 'sw')).toMatch(/10% kwa msimu/);
    expect(describeTerms(monthly, [], d('2026-01-01'))).toMatch(/not set the rate/);
  });
});
