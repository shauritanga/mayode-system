import { Prisma } from '@prisma/client';

type Db = Prisma.TransactionClient;

export interface StockBalance {
  onHandKg: number;
  reservedKg: number;
  availableKg: number;
}

/** available = on-hand - reserved. */
export function composeBalance(physicalKg: number, reservedKg: number): StockBalance {
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return { onHandKg: r(physicalKg), reservedKg: r(reservedKg), availableKg: r(physicalKg - reservedKg) };
}

/** The kinds of stock a sale order can draw on: paddy and rice, never by-products. */
export const SELLABLE_CATEGORIES = ['PADDY', 'PROCESSED', 'BROKEN'] as const;

/**
 * One stock record: on-hand is what the batch ledger holds at this warehouse in batches that can be sold;
 * reserved is what operations orders have allocated plus what sale orders have reserved.
 */
export async function warehouseBalance(db: Db, warehouseId: string): Promise<StockBalance> {
  const [physical, allocations, reservations] = await Promise.all([
    db.stockLedgerEntry.aggregate({
      where: { warehouseId, batch: { stockStatus: 'AVAILABLE', product: { category: { in: [...SELLABLE_CATEGORIES] } } } },
      _sum: { quantityKg: true },
    }),
    db.orderAllocation.findMany({ where: { warehouseId }, select: { quantityKg: true, dispatchedKg: true, releasedKg: true } }),
    db.stockMovement.groupBy({ by: ['type'], where: { warehouseId, type: { in: ['RESERVE', 'UNRESERVE'] } }, _sum: { quantityKg: true } }),
  ]);
  const allocated = allocations.reduce((t, a) => t + (a.quantityKg - a.dispatchedKg - a.releasedKg), 0);
  const sum = (type: string) => reservations.find((r) => r.type === type)?._sum.quantityKg ?? 0;
  return composeBalance(physical._sum.quantityKg ?? 0, allocated + sum('RESERVE') - sum('UNRESERVE'));
}

/** Serialises concurrent stock changes on one warehouse so reservations cannot oversell. */
export async function lockWarehouse(db: Db, warehouseId: string): Promise<void> {
  await db.$queryRaw`SELECT id FROM warehouses WHERE id = ${warehouseId} FOR UPDATE`;
}

/**
 * Kilograms on hand that no lot accounts for yet (stock that was counted in rather than received
 * from recorded deliveries). A lot holds its total weight minus what has already been loaded out.
 */
export async function unlottedKg(db: Db, warehouseId: string): Promise<number> {
  const [{ onHandKg }, lots, loaded] = await Promise.all([
    warehouseBalance(db, warehouseId),
    db.lot.aggregate({ where: { warehouseId }, _sum: { totalWeightKg: true } }),
    db.orderLoad.aggregate({
      where: { saleOrder: { warehouseId } },
      _sum: { weightKg: true },
    }),
  ]);
  const heldInLots = (lots._sum.totalWeightKg ?? 0) - (loaded._sum.weightKg ?? 0);
  return Math.max(onHandKg - heldInLots, 0);
}
