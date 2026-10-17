import { ageingBucket, ageYears, isYouth, iso, pct, round } from './report-utils';

describe('report-utils', () => {
  it('rounds and computes percentages safely', () => {
    expect(round(2.345, 2)).toBe(2.35);
    expect(pct(1, 3)).toBe(33);
    expect(pct(5, 0)).toBe(0);
  });

  it('computes age and the youth cut-off at 35', () => {
    const now = new Date('2026-06-15');
    expect(ageYears(new Date('1991-06-16'), now)).toBe(34);
    expect(ageYears(new Date('1991-06-15'), now)).toBe(35);
    expect(isYouth(new Date('1991-06-15'), now)).toBe(true);
    expect(isYouth(new Date('1990-06-14'), now)).toBe(false);
    expect(isYouth(null, now)).toBe(false);
  });

  it('formats dates and ageing buckets', () => {
    expect(iso(new Date('2026-03-04T10:00:00Z'))).toBe('2026-03-04');
    expect(iso(null)).toBe('');
    expect(ageingBucket(90)).toBe('0–90 days');
    expect(ageingBucket(91)).toBe('91–180 days');
    expect(ageingBucket(400)).toBe('Over 1 year');
  });
});
