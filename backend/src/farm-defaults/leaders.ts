import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

type Db = Prisma.TransactionClient | PrismaService;

export interface LeaderContact {
  farmerId: string;
  userId: string;
  phone: string;
  language: string | null;
  /** Blocks (e.g. 1.1R) the farmer farms that this leader looks after. */
  blocks: string[];
}

/**
 * The block and canal leaders who look after a farmer's hectares, so they hear about a late member at the same time as the
 * member does. A leader whose term has lapsed, and the farmer themselves, are left out.
 */
export async function leadersOfFarmer(db: Db, farmerId: string): Promise<LeaderContact[]> {
  const held = await db.irrigationHectareAllocation.findMany({
    where: { farmerId, status: 'ACTIVE' },
    select: { hectare: { select: { block: { select: { id: true, code: true, canalId: true } } } } },
  });
  if (!held.length) return [];
  const blocks = new Map(held.map((h) => [h.hectare.block.id, h.hectare.block]));
  const canalIds = [...new Set([...blocks.values()].map((b) => b.canalId))];
  const startOfToday = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  const rows = await db.irrigationLeadership.findMany({
    where: {
      status: 'ACTIVE', farmerId: { not: farmerId },
      AND: [
        { OR: [{ termEnd: null }, { termEnd: { gte: startOfToday } }] },
        { OR: [{ position: 'BLOCK_LEADER', blockId: { in: [...blocks.keys()] } }, { position: 'CANAL_LEADER', canalId: { in: canalIds } }] },
      ],
    },
    select: { farmerId: true, position: true, blockId: true, canalId: true, farmer: { select: { user: { select: { id: true, phone: true, language: true } } } } },
  });
  const byLeader = new Map<string, LeaderContact>();
  for (const r of rows) {
    const user = r.farmer.user;
    if (!user?.phone) continue;
    const mine = [...blocks.values()].filter((b) => (r.position === 'BLOCK_LEADER' ? b.id === r.blockId : b.canalId === r.canalId)).map((b) => b.code);
    const known = byLeader.get(r.farmerId);
    if (known) known.blocks = [...new Set([...known.blocks, ...mine])];
    else byLeader.set(r.farmerId, { farmerId: r.farmerId, userId: user.id, phone: user.phone, language: user.language, blocks: [...new Set(mine)] });
  }
  return [...byLeader.values()];
}
