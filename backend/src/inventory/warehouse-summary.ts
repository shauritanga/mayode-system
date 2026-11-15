import { FarmerPaymentStatus, InventoryStatus } from '@prisma/client';

export interface SummaryRecord {
  weightKg: number;
  bags: number | null;
  status: InventoryStatus;
  qualityGrade: string | null;
  riceVariety: string | null;
  lotVariety: string | null;
  warehouseName: string | null;
  warehouseLocation: string | null;
  centreName: string | null;
  totalValue: number | null;
  amountPaid: number;
  farmerPaymentStatus: FarmerPaymentStatus;
}

export interface Slice {
  name: string;
  weightKg: number;
  count: number;
  value: number;
}

/** Rice in the building: received, stored or batched into a lot. */
const IN_STOCK: InventoryStatus[] = ['RECEIVED', 'IN_STORAGE', 'BATCHED'];

function group(
  records: SummaryRecord[],
  key: (r: SummaryRecord) => string,
): Slice[] {
  const map = new Map<string, Slice>();
  for (const r of records) {
    const name = key(r);
    const row = map.get(name) ?? { name, weightKg: 0, count: 0, value: 0 };
    row.weightKg += r.weightKg;
    row.count += 1;
    row.value += r.totalValue ?? 0;
    map.set(name, row);
  }
  return [...map.values()].sort((a, b) => b.weightKg - a.weightKg);
}

/**
 * Warehouse dashboard figures. Balance is the rice still held (received, stored or batched);
 * shipped rice has left the building but is not yet sold, and sold rice is fully paid for by the buyer.
 */
export interface LedgerStock {
  /** On-hand rice per warehouse straight from the stock ledger. */
  warehouses: { name: string; onHandKg: number; reservedKg: number }[];
}

export function summariseWarehouse(records: SummaryRecord[], ledger?: LedgerStock) {
  const sumKg = (rows: SummaryRecord[]) =>
    rows.reduce((s, r) => s + r.weightKg, 0);
  const inStock = records.filter((r) => IN_STOCK.includes(r.status));
  const shipped = records.filter((r) => r.status === 'SHIPPED');
  const sold = records.filter((r) => r.status === 'SOLD');
  const awaiting = records.filter(
    (r) => IN_STOCK.includes(r.status) && !r.warehouseName,
  );
  const round = (n: number) => Math.round(n * 1000) / 1000;
  const ledgerKg = ledger ? round(ledger.warehouses.reduce((t, w) => t + w.onHandKg, 0)) : null;
  const priced = records.filter((r) => r.totalValue != null);
  const purchaseValue = priced.reduce((s, r) => s + (r.totalValue ?? 0), 0);
  const paid = records.reduce((s, r) => s + r.amountPaid, 0);
  return {
    totalReceivedKg: sumKg(records),
    totalReceivedCount: records.length,
    totalBags: records.reduce((s, r) => s + (r.bags ?? 0), 0),
    // One honest figure: when the stock ledger is given it is the only "in stock" number.
    inStockKg: ledgerKg ?? sumKg(inStock),
    shippedKg: sumKg(shipped),
    soldKg: sumKg(sold),
    currentBalanceKg: ledgerKg ?? sumKg(inStock),
    reservedKg: ledger ? round(ledger.warehouses.reduce((t, w) => t + w.reservedKg, 0)) : 0,
    /** Delivered by farmers but not yet received into a warehouse, so not stock yet. */
    awaitingReceiptKg: round(sumKg(awaiting)),
    awaitingReceiptCount: awaiting.length,
    purchaseValue,
    paidToFarmers: paid,
    owedToFarmers: Math.max(purchaseValue - paid, 0),
    unpricedKg: sumKg(records.filter((r) => r.totalValue == null)),
    byGrade: group(records, (r) => r.qualityGrade ?? 'Ungraded'),
    byVariety: group(records, (r) => r.riceVariety ?? r.lotVariety ?? 'Unspecified'),
    byWarehouse: ledger
      ? ledger.warehouses
          .map((w) => ({ name: w.name, weightKg: w.onHandKg, count: 0, value: 0 }))
          .sort((a, b) => b.weightKg - a.weightKg)
      : group(records, (r) => r.warehouseName ?? r.warehouseLocation ?? 'Not yet in a warehouse'),
    byCentre: group(records, (r) => r.centreName ?? 'No collection centre'),
    byStatus: group(records, (r) => r.status),
    byPayment: group(records, (r) => r.farmerPaymentStatus),
  };
}
