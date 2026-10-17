import {
  addMonths, allocateRepayments, averageYieldPerHa, buildSchedule, canMoveApplication,
  expectedOutcome, indicativeLimit, nextLoanReference, totalRepayable,
} from './credit-math';

describe('credit math', () => {
  it('adds flat interest only when a rate is set', () => {
    expect(totalRepayable(1_000_000, null, 6)).toBe(1_000_000);
    expect(totalRepayable(1_000_000, 12, 6)).toBe(1_060_000);
  });

  it('clamps month ends', () => {
    expect(addMonths(new Date('2026-01-31T00:00:00Z'), 1).toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(addMonths(new Date('2026-11-15T00:00:00Z'), 3).toISOString().slice(0, 10)).toBe('2027-02-15');
  });

  it('builds equal instalments that add up exactly', () => {
    const s = buildSchedule(1_000_000, 3, new Date('2026-01-10T00:00:00Z'));
    expect(s.map((i) => i.amount)).toEqual([333_333.33, 333_333.33, 333_333.34]);
    expect(s.reduce((t, i) => t + i.amount, 0)).toBeCloseTo(1_000_000, 2);
    expect(s[0].dueDate.toISOString().slice(0, 10)).toBe('2026-02-10');
  });

  it('applies repayments to the earliest instalments and flags what is late', () => {
    const s = buildSchedule(300_000, 3, new Date('2026-01-01T00:00:00Z'));
    const now = new Date('2026-03-15T00:00:00Z');
    const a = allocateRepayments(s, 150_000, now);
    expect(a.rows.map((r) => r.status)).toEqual(['PAID', 'OVERDUE', 'UPCOMING']);
    expect(a.rows[0]).toMatchObject({ paidAmount: 100_000, balance: 0 });
    expect(a.rows[1]).toMatchObject({ paidAmount: 50_000, balance: 50_000 });
  });

  it('reports overdue totals and the next due instalment', () => {
    const s = buildSchedule(300_000, 3, new Date('2026-01-01T00:00:00Z'));
    const a = allocateRepayments(s, 50_000, new Date('2026-03-15T00:00:00Z'));
    expect(a.overdueCount).toBe(2);
    expect(a.overdueAmount).toBe(150_000);
    expect(a.nextDue?.number).toBe(3);
    expect(allocateRepayments(s, 300_000, new Date('2027-01-01T00:00:00Z')).overdueCount).toBe(0);
  });

  it('estimates yield and revenue from the farmer’s own harvests', () => {
    expect(averageYieldPerHa([{ areaHa: 2, yieldKg: 8000 }, { areaHa: 1, yieldKg: 3000 }, { areaHa: null, yieldKg: 999 }])).toBe(3667);
    expect(averageYieldPerHa([])).toBeNull();
    expect(expectedOutcome(2, [{ areaHa: 1, yieldKg: 4000 }], 1200)).toMatchObject({ estimatedYieldKg: 8000, expectedRevenue: 9_600_000 });
    expect(expectedOutcome(2, [], 1200).expectedRevenue).toBeNull();
  });

  it('suggests a limit of half the expected revenue less debt', () => {
    expect(indicativeLimit(10_000_000, 1_000_000)).toBe(4_000_000);
    expect(indicativeLimit(1_000_000, 900_000)).toBe(0);
    expect(indicativeLimit(null, 0)).toBeNull();
  });

  it('numbers references and limits status moves', () => {
    expect(nextLoanReference(2026)).toBe('LA-2026-0001');
    expect(nextLoanReference(2026, 'LA-2026-0042')).toBe('LA-2026-0043');
    expect(canMoveApplication('SUBMITTED', 'APPROVED')).toBe(true);
    expect(canMoveApplication('APPROVED', 'DISBURSED')).toBe(true);
    expect(canMoveApplication('REJECTED', 'APPROVED')).toBe(false);
    expect(canMoveApplication('DISBURSED', 'WITHDRAWN')).toBe(false);
  });
});
