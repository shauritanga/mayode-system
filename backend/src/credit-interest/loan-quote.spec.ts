import { loanSummary, quoteLoan } from './loan-quote';
import type { Rate, Terms } from './interest-schedule';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const terms: Terms = { enabled: true, period: 'MONTHLY', graceDays: 0, paymentOrder: 'INTEREST_FIRST' };
const rate = (p: number): Rate => ({ id: 'r', label: 'Season', ratePercent: p, validFrom: d('2026-01-01'), validTo: null });

describe('loan quote', () => {
  it('works out the interest and total from the AMCOS rate', () => {
    const q = quoteLoan(terms, [rate(2)], 1_000_000, d('2026-03-01'), d('2026-06-01'));
    expect(q.perPeriodInterest).toBe(20_000);
    expect(q.interestToDue).toBe(60_000);
    expect(q.totalToDue).toBe(1_060_000);
    const text = loanSummary(q, 'en');
    expect(text).toContain('Loan: TZS 1,000,000');
    expect(text).toContain('2% per month = TZS 20,000');
    expect(text).toContain('total to repay TZS 1,060,000');
  });
  it('without a due date says what one period costs and that it grows', () => {
    const text = loanSummary(quoteLoan(terms, [rate(2)], 1_000_000, d('2026-03-01'), null), 'en');
    expect(text).toContain('TZS 1,020,000');
    expect(text).toContain('grows');
  });
  it('no interest when the AMCOS has none switched on', () => {
    const text = loanSummary(quoteLoan({ ...terms, enabled: false }, [], 500_000, d('2026-03-01'), null), 'en');
    expect(text).toContain('Interest: none');
    expect(text).toContain('Total to repay: TZS 500,000');
  });
  it('says so when no rate is set yet, and reads in Swahili', () => {
    expect(loanSummary(quoteLoan(terms, [], 500_000, d('2026-03-01'), null), 'en')).toContain('has not set the rate');
    expect(loanSummary(quoteLoan(terms, [rate(2)], 1_000_000, d('2026-03-01'), null), 'sw')).toContain('Mkopo: TZS 1,000,000');
  });
});
