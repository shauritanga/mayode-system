import {
  canMoveOrder, canMoveTask, documentTotals, geofence, harvestPosition, haversineM, lineTotals, outputsExceedInput,
  paymentState, physicalKg, runBalance, suggestAllocation,
} from './ops-rules';

describe('ops rules', () => {
  it('prices a line: discount first, then tax on the rest', () => {
    expect(lineTotals({ quantity: 100, unitPrice: 2500, discountPercent: 10, taxRatePercent: 18 })).toEqual({ gross: 250000, discount: 25000, net: 225000, tax: 40500, total: 265500 });
    expect(lineTotals({ quantity: 3, unitPrice: 0.1 }).total).toBe(0.3);
  });

  it('totals a document across lines', () => {
    const t = documentTotals([{ quantity: 10, unitPrice: 1000 }, { quantity: 5, unitPrice: 2000, discountPercent: 50, taxRatePercent: 18 }]);
    expect(t).toEqual({ subtotal: 20000, discountTotal: 5000, taxTotal: 900, total: 15900 });
  });

  it('only calls an order paid when confirmed money covers the total', () => {
    expect(paymentState(1000, 0)).toBe('UNPAID');
    expect(paymentState(1000, 400)).toBe('PARTIALLY_PAID');
    expect(paymentState(1000, 999.99)).toBe('PARTIALLY_PAID');
    expect(paymentState(1000, 1000)).toBe('PAID');
    expect(paymentState(1000, 1200)).toBe('PAID');
  });

  it('limits order and task transitions', () => {
    expect(canMoveOrder('PENDING_ACCOUNTS_REVIEW', 'APPROVED_FOR_INVOICING')).toBe(true);
    expect(canMoveOrder('PENDING_ACCOUNTS_REVIEW', 'INVOICED')).toBe(false);
    expect(canMoveOrder('CANCELLED', 'INVOICED')).toBe(false);
    expect(canMoveTask('IN_PROGRESS', 'PENDING_REVIEW')).toBe(true);
    expect(canMoveTask('ASSIGNED', 'COMPLETED')).toBe(false);
    expect(canMoveTask('PENDING_REVIEW', 'COMPLETED')).toBe(true);
    expect(canMoveTask('COMPLETED', 'IN_PROGRESS')).toBe(false);
  });

  it('adds up signed ledger rows', () => {
    expect(physicalKg([{ type: 'RECEIPT', quantityKg: 500 }, { type: 'PROCESS_OUT', quantityKg: -300 }, { type: 'ADJUSTMENT', quantityKg: -2.5 }])).toBe(197.5);
  });

  it('allocates oldest batches first and reports any shortage', () => {
    const a = suggestAllocation([
      { batchId: 'new', createdAt: new Date('2026-03-02'), availableKg: 500 },
      { batchId: 'old', createdAt: new Date('2026-03-01'), availableKg: 200 },
      { batchId: 'empty', createdAt: new Date('2026-02-01'), availableKg: 0 },
    ], 450);
    expect(a.picks).toEqual([{ batchId: 'old', quantityKg: 200 }, { batchId: 'new', quantityKg: 250 }]);
    expect(a.shortageKg).toBe(0);
    expect(suggestAllocation([{ batchId: 'x', createdAt: new Date(), availableKg: 100 }], 150).shortageKg).toBe(50);
  });

  it('measures milling yield and loss, and refuses outputs larger than the input', () => {
    const b = runBalance(1000, [{ kind: 'PRODUCT', quantityKg: 620 }, { kind: 'BROKEN', quantityKg: 80 }, { kind: 'BRAN', quantityKg: 60 }, { kind: 'HUSK', quantityKg: 200 }]);
    expect(b).toEqual({ outputKg: 960, lossKg: 40, lossPct: 4, milledYieldPct: 62 });
    expect(outputsExceedInput(1000, [{ kind: 'PRODUCT', quantityKg: 1001 }])).toBe(true);
    expect(outputsExceedInput(1000, [{ kind: 'PRODUCT', quantityKg: 1000 }])).toBe(false);
  });

  it('reconciles a harvest against warehouse receipts', () => {
    const p = harvestPosition({ actualKg: 5000, transportedKg: 4800 }, [
      { grossKg: 3000, rejectedKg: 50, status: 'CONFIRMED' }, { grossKg: 1700, rejectedKg: 0, status: 'CONFIRMED' }, { grossKg: 100, rejectedKg: 0, status: 'DRAFT' },
    ]);
    expect(p).toEqual({ actualKg: 5000, transportedKg: 4800, receivedKg: 4700, acceptedKg: 4650, rejectedKg: 50, lostInTransitKg: 100, notYetTransportedKg: 200 });
  });

  it('measures distance and applies the geofence', () => {
    expect(haversineM(-8.95, 33.9, -8.95, 33.9)).toBe(0);
    const d = haversineM(-8.95, 33.9, -8.95, 33.91);
    expect(d).toBeGreaterThan(1000);
    expect(d).toBeLessThan(1200);
    expect(geofence({ lat: -8.95, lon: 33.9 }, { lat: -8.95, lon: 33.9005 }, 300).within).toBe(true);
    expect(geofence({ lat: -8.95, lon: 33.9 }, { lat: -8.95, lon: 33.91 }, 300).within).toBe(false);
    expect(geofence({ lat: -8.95, lon: 33.9 }, null, 300)).toMatchObject({ distanceM: null, within: null });
    // A weak GPS fix gets extra allowance, but only up to 100 m.
    expect(geofence({ lat: -8.95, lon: 33.9, accuracyM: 80 }, { lat: -8.95, lon: 33.9034 }, 300).within).toBe(true);
    expect(geofence({ lat: -8.95, lon: 33.9, accuracyM: 5000 }, { lat: -8.95, lon: 33.9046 }, 300).within).toBe(false);
  });
});
