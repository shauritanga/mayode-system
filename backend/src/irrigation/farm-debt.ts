import { ConflictException } from '@nestjs/common';
import type { Db } from './irrigation-common';

/**
 * Dues that belong to a farm. A due is owed by a farmer but can say how it divides between their farms
 * (`farmSplit`: [{hectareId, share}], shares adding up to 1). When a farm is sold, the farm's share of those dues
 * stays on the seller's account and becomes a hold on the farm: the new owner cannot use it until they are paid.
 */
type SplitEntry = { hectareId: string; share: number };

const cents = (n: number) => Math.round(n * 100) / 100;

function shareOf(farmSplit: unknown, hectareId: string): number {
  if (!Array.isArray(farmSplit)) return 0;
  const entry = (farmSplit as SplitEntry[]).find((e) => e && e.hectareId === hectareId);
  const share = entry ? Number(entry.share) : 0;
  return Number.isFinite(share) && share > 0 ? Math.min(share, 1) : 0;
}

interface DueRow {
  id: string; amount: unknown; waivedAmount: unknown; farmSplit: unknown;
  payments: { amount: unknown }[];
}

const outstandingOf = (d: DueRow) =>
  Math.max(0, Number(d.amount) - Number(d.waivedAmount) - d.payments.reduce((m, p) => m + Number(p.amount), 0));

async function activeDues(db: Db, farmerId: string, mamcosId: string | null): Promise<DueRow[]> {
  if (!mamcosId) return [];
  return db.farmerDue.findMany({
    where: { mamcosId, farmerId, status: 'ACTIVE' },
    select: { id: true, amount: true, waivedAmount: true, farmSplit: true, payments: { where: { voidedAt: null }, select: { amount: true } } },
  });
}

/** What the farmer still owes that is NOT part of the given farm (everything, when no farm is named). */
export async function owedOutsideFarm(db: Db, farmerId: string, mamcosId: string | null, hectareId?: string): Promise<number> {
  const dues = await activeDues(db, farmerId, mamcosId);
  return cents(dues.reduce((n, d) => n + outstandingOf(d) * (1 - (hectareId ? shareOf(d.farmSplit, hectareId) : 0)), 0));
}

/** The dues (and the farm's share of each) that are owed on this farm right now. */
export async function farmDebtOf(db: Db, farmerId: string, mamcosId: string | null, hectareId: string) {
  const dues = await activeDues(db, farmerId, mamcosId);
  const rows = dues
    .map((d) => ({ dueId: d.id, share: shareOf(d.farmSplit, hectareId), owed: outstandingOf(d) }))
    .filter((r) => r.share > 0 && r.owed > 0);
  return { dues: rows.map((r) => ({ dueId: r.dueId, share: r.share })), amount: cents(rows.reduce((n, r) => n + r.owed * r.share, 0)) };
}

/** Records the hold when a sold farm still carries dues. Called inside the transfer's transaction. */
export async function createFarmDebtHold(
  tx: Db, args: { hectareId: string; newFarmerId: string; previousFarmerId: string; mamcosId: string | null },
) {
  const debt = await farmDebtOf(tx, args.previousFarmerId, args.mamcosId, args.hectareId);
  if (debt.amount <= 0) return null;
  return tx.farmDebtHold.create({
    data: { hectareId: args.hectareId, newFarmerId: args.newFarmerId, previousFarmerId: args.previousFarmerId, dues: debt.dues, amountAtTransfer: debt.amount },
  });
}

/** What is still owed on a hold: the farm's share of its dues that remain unpaid. */
async function remainingOf(db: Db, hold: { dues: unknown }) {
  const items = Array.isArray(hold.dues) ? (hold.dues as { dueId: string; share: number }[]) : [];
  if (!items.length) return 0;
  const dues = await db.farmerDue.findMany({
    where: { id: { in: items.map((i) => i.dueId) }, status: 'ACTIVE' },
    select: { id: true, amount: true, waivedAmount: true, farmSplit: true, payments: { where: { voidedAt: null }, select: { amount: true } } },
  });
  return cents(dues.reduce((n, d) => n + outstandingOf(d) * (items.find((i) => i.dueId === d.id)?.share ?? 0), 0));
}

/** Open holds on a farm, each with what is left to pay. A hold whose dues are paid is closed here. */
export async function openFarmDebtHolds(db: Db, hectareId: string) {
  const holds = await db.farmDebtHold.findMany({ where: { hectareId, clearedAt: null }, orderBy: { createdAt: 'asc' } });
  const open: { id: string; remaining: number; amountAtTransfer: number }[] = [];
  for (const h of holds) {
    const remaining = await remainingOf(db, h);
    if (remaining <= 0.005) await db.farmDebtHold.update({ where: { id: h.id }, data: { clearedAt: new Date() } });
    else open.push({ id: h.id, remaining, amountAtTransfer: Number(h.amountAtTransfer) });
  }
  return open;
}

/** Throws while a farm still has dues carried over from the previous owner. */
export async function assertFarmUsable(db: Db, hectareId: string) {
  const open = await openFarmDebtHolds(db, hectareId);
  if (!open.length) return;
  const total = cents(open.reduce((n, h) => n + h.remaining, 0));
  throw new ConflictException(
    `This farm cannot be used yet: ${total.toLocaleString('en-US')} TZS of dues from before it was sold must be cleared by the new owner first`,
  );
}
