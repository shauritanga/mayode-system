import { Prisma, StockMovementType } from '@prisma/client';

type Db = Prisma.TransactionClient;

export interface StockBalance {
  onHandKg: number;
  reservedKg: number;
  availableKg: number;
}

/** on-hand = IN + ADJUST - OUT; reserved = RESERVE - UNRESERVE; available = on-hand - reserved. */
export function balanceFrom(
  sums: Partial<Record<StockMovementType, number>>,
): StockBalance {
  const n = (t: StockMovementType) => sums[t] ?? 0;
  const onHandKg = n('IN') + n('ADJUST') - n('OUT');
  const reservedKg = n('RESERVE') - n('UNRESERVE');
  return { onHandKg, reservedKg, availableKg: onHandKg - reservedKg };
}

export async function warehouseBalance(
  db: Db,
  warehouseId: string,
): Promise<StockBalance> {
  const rows = await db.stockMovement.groupBy({
    by: ['type'],
    where: { warehouseId },
    _sum: { quantityKg: true },
  });
  return balanceFrom(
    Object.fromEntries(rows.map((r) => [r.type, r._sum.quantityKg ?? 0])),
  );
}

/** Serialises concurrent stock changes on one warehouse so reservations cannot oversell. */
export async function lockWarehouse(
  db: Db,
  warehouseId: string,
): Promise<void> {
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
  const heldInLots =
    (lots._sum.totalWeightKg ?? 0) - (loaded._sum.weightKg ?? 0);
  return Math.max(onHandKg - heldInLots, 0);
}
