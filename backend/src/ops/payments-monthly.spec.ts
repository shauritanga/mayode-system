import { OpsReportsService } from './ops-reports.service';

/** paymentsByMonth only reads the three payment tables, so the rest of the service is left out. */
function make(sales: any[], dues: any[], contributions: any[]) {
  const prisma = {
    opsPayment: { findMany: jest.fn().mockResolvedValue(sales) },
    duePayment: { findMany: jest.fn().mockResolvedValue(dues) },
    memberContribution: { findMany: jest.fn().mockResolvedValue(contributions) },
  };
  return { svc: new (OpsReportsService as any)(prisma) as OpsReportsService, prisma };
}
const grants = (...keys: string[]) => ({ isActive: true, isSystem: false, permissions: keys.map((k) => ({ resource: { key: k }, action: 'VIEW' })) });
const actor = (...keys: string[]) => ({ id: 'u1', role: 'CUSTOM', mamcosId: 'm1', customRole: grants(...keys) }) as any;
const NOW = new Date('2026-11-18T10:00:00Z');

describe('paymentsByMonth', () => {
  it('returns 12 months ending this month, empty months as 0', async () => {
    const { svc } = make([], [], []);
    const r = await svc.paymentsByMonth(actor('ops_reports', 'dues', 'accounting'), NOW);
    expect(r.months).toHaveLength(12);
    expect(r.months[0].month).toBe('2025-12');
    expect(r.months[11].month).toBe('2026-11');
    expect(r.totalAmount).toBe(0);
    expect(r.peak).toBeNull();
  });

  it('adds each kind of payment into its month and finds the busiest month', async () => {
    const { svc } = make(
      [{ paidAt: new Date('2026-05-10T09:00:00Z'), amount: 1000 }],
      [{ paidOn: new Date('2026-05-12T00:00:00Z'), amount: 250 }, { paidOn: new Date('2026-07-03T00:00:00Z'), amount: 300 }],
      [{ contributionDate: new Date('2026-07-20T09:00:00Z'), amount: 100 }],
    );
    const r = await svc.paymentsByMonth(actor('ops_reports', 'dues', 'accounting'), NOW);
    expect(r.months.find((m) => m.month === '2026-05')).toMatchObject({ sales: 1000, dues: 250, contributions: 0 });
    expect(r.months.find((m) => m.month === '2026-07')).toMatchObject({ sales: 0, dues: 300, contributions: 100 });
    expect(r.totalAmount).toBe(1650);
    expect(r.peak).toEqual({ label: 'May', amount: 1250 });
  });

  it('leaves out what the caller may not see, and does not query it', async () => {
    const { svc, prisma } = make([{ paidAt: NOW, amount: 5 }], [{ paidOn: NOW, amount: 7 }], [{ contributionDate: NOW, amount: 9 }]);
    const r = await svc.paymentsByMonth(actor('dues'), NOW);
    expect(r.series).toEqual({ sales: false, dues: true, contributions: false });
    expect(r.totalAmount).toBe(7);
    expect(prisma.opsPayment.findMany).not.toHaveBeenCalled();
    expect(prisma.memberContribution.findMany).not.toHaveBeenCalled();
  });

  it('only reads the caller\'s own AMCOS, and skips voided dues payments', async () => {
    const { svc, prisma } = make([], [], []);
    await svc.paymentsByMonth(actor('ops_reports', 'dues', 'accounting'), NOW);
    expect(prisma.duePayment.findMany.mock.calls[0][0].where).toMatchObject({ mamcosId: 'm1', voidedAt: null });
    expect(prisma.memberContribution.findMany.mock.calls[0][0].where).toMatchObject({ mamcosId: 'm1' });
    expect(prisma.opsPayment.findMany.mock.calls[0][0].where).toMatchObject({ mamcosId: 'm1', status: 'CONFIRMED' });
  });

  it('puts a late-evening UTC payment in the next East Africa month', async () => {
    const { svc } = make([], [], [{ contributionDate: new Date('2026-06-30T22:00:00Z'), amount: 40 }]);
    const r = await svc.paymentsByMonth(actor('accounting'), NOW);
    expect(r.months.find((m) => m.month === '2026-07')!.contributions).toBe(40);
  });
});
