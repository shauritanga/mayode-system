import { Prisma } from '@prisma/client';

/** How a charge divides between a farmer's farms (hectares). Shares add up to 1. */
export type FarmSplit = { hectareId: string; share: number }[];
export type Hold = { hectareId: string; area: number };

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Shares by hectare area (`AREA`) or equal (`EQUAL`); the last share takes the rounding so they add up to exactly 1. null when there is nothing to split over. */
export function splitOf(holds: Hold[], by: 'AREA' | 'EQUAL' = 'AREA'): FarmSplit | null {
  if (!holds.length) return null;
  const weights = holds.map((h) => (by === 'AREA' ? Math.max(h.area, 0) : 1));
  const total = weights.reduce((n, w) => n + w, 0);
  const w = total > 0 ? weights : holds.map(() => 1);
  const sum = w.reduce((n, x) => n + x, 0);
  let used = 0;
  return holds.map((h, i) => {
    const share = i === holds.length - 1 ? round6(1 - used) : round6(w[i] / sum);
    used = round6(used + share);
    return { hectareId: h.hectareId, share };
  });
}

type Db = { irrigationHectareAllocation: { findMany: (args: any) => Promise<any[]> } };

/** The hectares each of these farmers holds now (active allocations). */
export async function holdsOf(db: Db, farmerIds: string[]): Promise<Map<string, Hold[]>> {
  const out = new Map<string, Hold[]>();
  if (!farmerIds.length) return out;
  const rows = await db.irrigationHectareAllocation.findMany({
    where: { farmerId: { in: farmerIds }, status: 'ACTIVE' },
    select: { farmerId: true, hectareId: true, hectare: { select: { areaHectares: true } } },
    orderBy: { allocatedOn: 'asc' },
  });
  for (const r of rows) {
    const list = out.get(r.farmerId) ?? [];
    list.push({ hectareId: r.hectareId, area: Number(r.hectare.areaHectares) });
    out.set(r.farmerId, list);
  }
  return out;
}

/** The value to store in `FarmerDue.farmSplit` (Prisma wants JsonNull, not null, to write NULL). */
export const splitJson = (s: FarmSplit | null): Prisma.InputJsonValue | typeof Prisma.JsonNull => (s ? (s as unknown as Prisma.InputJsonValue) : Prisma.JsonNull);
