import { summariseWarehouse, SummaryRecord } from './warehouse-summary';

const rec = (over: Partial<SummaryRecord>): SummaryRecord => ({
  weightKg: 100,
  bags: 2,
  status: 'RECEIVED',
  qualityGrade: 'Grade 1',
  riceVariety: 'SARO 5',
  lotVariety: null,
  warehouseName: 'Main store',
  warehouseLocation: null,
  centreName: 'Madibira',
  totalValue: 100000,
  amountPaid: 40000,
  farmerPaymentStatus: 'PARTIAL',
  ...over,
});

describe('summariseWarehouse', () => {
  const s = summariseWarehouse([
    rec({}),
    rec({ weightKg: 200, status: 'BATCHED', qualityGrade: null, riceVariety: null, lotVariety: 'Kilombero', totalValue: null, amountPaid: 0, farmerPaymentStatus: 'UNPAID' }),
    rec({ weightKg: 50, status: 'SHIPPED', warehouseName: null, warehouseLocation: 'Bay B' }),
    rec({ weightKg: 300, status: 'SOLD', centreName: null, amountPaid: 100000, farmerPaymentStatus: 'PAID' }),
  ]);
  it('splits rice into received, held, shipped and sold', () => {
    expect(s.totalReceivedKg).toBe(650);
    expect(s.inStockKg).toBe(300);
    expect(s.currentBalanceKg).toBe(300);
    expect(s.shippedKg).toBe(50);
    expect(s.soldKg).toBe(300);
    expect(s.totalBags).toBe(8);
  });
  it('totals what is owed to farmers and what has no price yet', () => {
    expect(s.purchaseValue).toBe(300000);
    expect(s.paidToFarmers).toBe(180000);
    expect(s.owedToFarmers).toBe(120000);
    expect(s.unpricedKg).toBe(200);
  });
  it('groups by grade, variety (falling back to the lot), warehouse and centre', () => {
    expect(s.byGrade.map((g) => g.name)).toEqual(['Grade 1', 'Ungraded']);
    expect(s.byVariety.find((v) => v.name === 'Kilombero')?.weightKg).toBe(200);
    expect(s.byWarehouse.map((w) => w.name)).toEqual(['Main store', 'Bay B']);
    expect(s.byCentre.find((c) => c.name === 'No collection centre')?.weightKg).toBe(300);
  });
});
