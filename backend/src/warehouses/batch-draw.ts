import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { batchBalances, lockBatches } from '../ops/ops-common';
import { SELLABLE_CATEGORIES } from './stock';

type Db = Prisma.TransactionClient;

const same = (a?: string | null, b?: string | null) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Takes kilograms out of a warehouse's batches, oldest first, preferring batches of the grade and variety that was sold.
 * Writes one DISPATCH row per batch and returns what was taken, so the caller can book its cost.
 */
export async function drawFromBatches(
  tx: Db,
  p: { warehouseId: string; quantityKg: number; grade?: string | null; variety?: string | null; refType: string; refId: string; actorId: string; note?: string; type?: 'DISPATCH' | 'ADJUSTMENT' },
): Promise<{ batchId: string; quantityKg: number; entryId: string }[]> {
  const batches = await tx.stockBatch.findMany({
    where: { stockStatus: 'AVAILABLE', product: { category: { in: [...SELLABLE_CATEGORIES] } }, ledger: { some: { warehouseId: p.warehouseId } } },
    orderBy: { createdAt: 'asc' },
  });
  await lockBatches(tx, batches.map((b) => b.id));
  const balances = await batchBalances(tx, batches.map((b) => b.id), p.warehouseId);
  const rank = (b: (typeof batches)[number]) => (p.grade && same(b.grade, p.grade) ? 0 : 1) + (p.variety && same(b.riceVariety, p.variety) ? 0 : 1);
  const ordered = [...batches].sort((a, b) => rank(a) - rank(b) || a.createdAt.getTime() - b.createdAt.getTime());
  let left = Math.round(p.quantityKg * 1000) / 1000;
  const taken: { batchId: string; quantityKg: number; entryId: string }[] = [];
  for (const b of ordered) {
    if (left <= 0.0005) break;
    // Stock reserved by operations orders stays with them; only the free part of a batch can leave here.
    const free = balances.get(b.id)?.availableKg ?? 0;
    const take = Math.round(Math.min(free, left) * 1000) / 1000;
    if (take <= 0) continue;
    const entry = await tx.stockLedgerEntry.create({
      data: { batchId: b.id, warehouseId: p.warehouseId, type: p.type ?? 'DISPATCH', quantityKg: -take, refType: p.refType, refId: p.refId, reason: p.note, createdByUserId: p.actorId, ...(p.type === 'ADJUSTMENT' ? { approvedByUserId: p.actorId } : {}) },
    });
    taken.push({ batchId: b.id, quantityKg: take, entryId: entry.id });
    left = Math.round((left - take) * 1000) / 1000;
  }
  if (left > 0.0005) {
    throw new ConflictException(`Only ${Math.round((p.quantityKg - left) * 100) / 100} kg of stock is free in this warehouse to load`);
  }
  return taken;
}
