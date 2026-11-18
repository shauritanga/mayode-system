import { OpsReportsService } from './ops-reports.service';

/** paddyByMonth only reads goods receipts, so the rest of the service is left out. */
function make(receipts: any[]) {
  const findMany = jest.fn().mockResolvedValue(receipts);
  const svc = new (OpsReportsService as any)({ goodsReceipt: { findMany } }) as OpsReportsService;
  return { svc, findMany };
}
const actor = { id: 'u1', role: 'MAMCOS_SECRETARY', mamcosId: 'm1' } as any;
const NOW = new Date('2026-11-18T10:00:00Z');

describe('paddyByMonth', () => {
  it('returns 12 months ending this month, with empty months as 0', async () => {
    const { svc } = make([]);
    const r = await svc.paddyByMonth(actor, NOW);
    expect(r.months).toHaveLength(12);
    expect(r.months[0].month).toBe('2025-12');
    expect(r.months[11].month).toBe('2026-11');
    expect(r.totalKg).toBe(0);
    expect(r.peak).toBeNull();
  });

  it('adds up net kg per month and finds the peak', async () => {
    const { svc } = make([
      { receivedAt: new Date('2026-05-10T09:00:00Z'), grossKg: 1000, rejectedKg: 100 },
      { receivedAt: new Date('2026-05-20T09:00:00Z'), grossKg: 500, rejectedKg: 0 },
      { receivedAt: new Date('2026-07-02T09:00:00Z'), grossKg: 800, rejectedKg: 0 },
    ]);
    const r = await svc.paddyByMonth(actor, NOW);
    expect(r.months.find((m) => m.month === '2026-05')!.kg).toBe(1400);
    expect(r.months.find((m) => m.month === '2026-07')!.kg).toBe(800);
    expect(r.totalKg).toBe(2200);
    expect(r.peak).toEqual({ label: 'May', kg: 1400 });
  });

  it('puts a late-evening UTC receipt in the next East Africa month', async () => {
    const { svc } = make([{ receivedAt: new Date('2026-06-30T22:00:00Z'), grossKg: 300, rejectedKg: 0 }]);
    const r = await svc.paddyByMonth(actor, NOW);
    expect(r.months.find((m) => m.month === '2026-07')!.kg).toBe(300);
  });

  it('only asks for confirmed paddy in the actor\'s own AMCOS', async () => {
    const { svc, findMany } = make([]);
    await svc.paddyByMonth(actor, NOW);
    const where = findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ mamcosId: 'm1', status: 'CONFIRMED', product: { category: 'PADDY' } });
  });
});
