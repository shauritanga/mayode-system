import { fileSlug, isFullYear, longDate, periodLine, reportHeading, resolvePeriod } from './report-titles';

describe('statement headings', () => {
  it('uses "for the Year Ended" for a full year and "for the Period Ended" for a shorter span', () => {
    expect(reportHeading('COMPREHENSIVE_INCOME', '2026-01-01', '2026-12-31')).toBe('Statement of Comprehensive Income for the Year Ended 31 December 2026');
    expect(reportHeading('COMPREHENSIVE_INCOME', '2026-01-01', '2026-06-30')).toBe('Statement of Comprehensive Income for the Period Ended 30 June 2026');
    expect(reportHeading('CASH_FLOWS', '2026-01-01', '2026-12-31')).toBe('Statement of Cash Flows for the Year Ended 31 December 2026');
    expect(reportHeading('CHANGES_IN_EQUITY', '2026-01-01', '2026-12-31')).toBe('Statement of Changes in Equity for the Year Ended 31 December 2026');
    expect(reportHeading('INCOME_EXPENDITURE', '2026-01-01', '2026-12-31')).toBe('Income and Expenditure Statement for the Year Ended 31 December 2026');
  });
  it('uses "as at" for balances at a date', () => {
    expect(reportHeading('FINANCIAL_POSITION', '2026-12-31', '2026-12-31')).toBe('Statement of Financial Position as at 31 December 2026');
    expect(reportHeading('TRIAL_BALANCE', '2026-12-31', '2026-12-31')).toBe('Trial Balance as at 31 December 2026');
  });
  it('writes the General Ledger with its whole period', () => {
    expect(reportHeading('GENERAL_LEDGER', '2026-01-01', '2026-12-31')).toBe('General Ledger for the Period 1 January 2026 to 31 December 2026');
  });
  it('treats any twelve whole months as a year, and a month or odd range as a period', () => {
    expect(isFullYear('2025-07-01', '2026-06-30')).toBe(true);
    expect(isFullYear('2026-01-01', '2026-01-31')).toBe(false);
    expect(isFullYear('2026-01-05', '2026-12-31')).toBe(false);
    expect(reportHeading('CASH_FLOWS', '2026-02-01', '2026-02-28')).toBe('Statement of Cash Flows for the Period Ended 28 February 2026');
  });
  it('resolves a year, a month and a custom range, and refuses bad input', () => {
    expect(resolvePeriod({ year: 2026 })).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(resolvePeriod({ year: 2024, month: 2 })).toEqual({ from: '2024-02-01', to: '2024-02-29' });
    expect(resolvePeriod({ from: '2026-01-01', to: '2026-06-30' })).toEqual({ from: '2026-01-01', to: '2026-06-30' });
    expect(() => resolvePeriod({ from: '2026-07-01', to: '2026-06-30' })).toThrow('after');
    expect(() => resolvePeriod({ from: '2026-02-30', to: '2026-03-01' })).toThrow('YYYY-MM-DD');
    expect(() => resolvePeriod({})).toThrow();
  });
  it('formats dates and file names', () => {
    expect(longDate('2026-03-05')).toBe('5 March 2026');
    expect(periodLine('CASH_FLOWS', '2026-01-01', '2026-06-30')).toBe('Covering 1 January 2026 to 30 June 2026');
    expect(fileSlug('TRIAL_BALANCE', '2026-12-31', '2026-12-31')).toBe('trial-balance-as-at-2026-12-31');
  });
});
