import { FarmAccountService } from './farm-account.service';
import { splitOf } from './farm-split';

const svc = new (FarmAccountService as any)({}, { resolveTenantMamcosId: () => 'm1' }) as any;
const due = (over: any = {}) => ({
  id: 'd1', category: 'LEVY', description: 'Levy', amount: 300, waivedAmount: 0, status: 'ACTIVE', issuedOn: new Date('2026-01-10'), updatedAt: new Date('2026-01-10'),
  dueDate: null, farmer: { firstName: 'A', lastName: 'B' }, payments: [], farmSplit: [{ hectareId: 'h1', share: 0.5 }, { hectareId: 'h2', share: 0.5 }], ...over,
});
const codes = new Map([['h1', '1.1R-1'], ['h2', '1.1R-2']]);

describe('splitOf', () => {
  it('shares add up to exactly 1', () => {
    for (const by of ['AREA', 'EQUAL'] as const) {
      const s = splitOf([{ hectareId: 'a', area: 1 }, { hectareId: 'b', area: 1 }, { hectareId: 'c', area: 1 }], by)!;
      expect(Math.round(s.reduce((n, x) => n + x.share, 0) * 1e6) / 1e6).toBe(1);
    }
  });
  it('weights by area and has nothing to split without land', () => {
    expect(splitOf([{ hectareId: 'a', area: 3 }, { hectareId: 'b', area: 1 }])!.map((x) => x.share)).toEqual([0.75, 0.25]);
    expect(splitOf([])).toBeNull();
  });
});

describe('FarmAccountService', () => {
  it('a farm gets its share of a charge and of a receipt, and farms add up to the farmer', () => {
    const d = due({ payments: [{ id: 'p1', amount: 100, paidOn: new Date('2026-02-01'), method: 'CASH', reference: null, receiptNo: 'R1', voidedAt: null }] });
    const farm = (h: string) => svc.dueEntries([d], codes, h);
    const sum = (es: any[], k: 'charged' | 'paid') => es.reduce((n, e) => n + e[k], 0);
    expect(sum(farm('h1'), 'charged')).toBe(150);
    expect(sum(farm('h1'), 'paid')).toBe(50);
    expect(sum(farm('h1'), 'charged') + sum(farm('h2'), 'charged')).toBe(300);
    expect(sum(svc.dueEntries([d], codes), 'paid')).toBe(100);
  });
  it('a charge with no split sits on the farmer, not on any farm', () => {
    const d = due({ farmSplit: null });
    expect(svc.dueEntries([d], codes, 'h1')).toHaveLength(0);
    const all = svc.dueEntries([d], codes);
    expect(all[0].farmId).toBeNull();
    expect(all[0].charged).toBe(300);
  });
  it('a voided receipt is listed but does not count', () => {
    const d = due({ farmSplit: null, payments: [{ id: 'p1', amount: 100, paidOn: new Date(), method: 'CASH', reference: null, receiptNo: 'R1', voidedAt: new Date() }] });
    const es = svc.dueEntries([d], codes);
    const pay = es.find((e: any) => e.kind === 'PAYMENT');
    expect(pay.paid).toBe(0);
    expect(pay.voided).toBe(true);
    expect(svc.totals(es, [d]).outstanding).toBe(300);
  });
  it('a cancelled charge and its receipts do not count', () => {
    const d = due({ farmSplit: null, status: 'CANCELLED' });
    expect(svc.totals(svc.dueEntries([d], codes), [d])).toMatchObject({ charged: 0, outstanding: 0 });
  });
  it('overdue is the unpaid part of a charge past its date, scaled to the farm', () => {
    const d = due({ dueDate: new Date('2020-01-01') });
    expect(svc.totals(svc.dueEntries([d], codes, 'h1'), [d], 'h1').overdue).toBe(150);
  });
});
