import { progressOf } from './order-progress';

describe('progressOf', () => {
  it('reports no deliveries', () => {
    expect(progressOf(1000, [])).toMatchObject({ deliveredKg: 0, progressPct: 0, paymentStatus: 'NO_DELIVERIES' });
  });

  it('tracks delivered quantity and part payment', () => {
    const p = progressOf(1000, [
      { quantityKg: 400, totalRevenue: 800_000, paymentReceived: true },
      { quantityKg: 200, totalRevenue: 400_000, paymentReceived: false },
    ]);
    expect(p).toMatchObject({ deliveredKg: 600, deliveredValue: 1_200_000, paidValue: 800_000, outstandingValue: 400_000, progressPct: 60, paymentStatus: 'PARTIAL' });
  });

  it('caps progress at 100 and detects fully paid and unpaid', () => {
    expect(progressOf(100, [{ quantityKg: 150, totalRevenue: 10, paymentReceived: true }])).toMatchObject({ progressPct: 100, paymentStatus: 'PAID' });
    expect(progressOf(100, [{ quantityKg: 50, totalRevenue: 10, paymentReceived: false }]).paymentStatus).toBe('UNPAID');
  });
});
