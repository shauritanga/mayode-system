import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { canSeeTenantRow, tenantOwner, tenantWhere, type TenantActor } from '../common/tenant';
import { padRef } from './ops-rules';

export type Tx = Prisma.TransactionClient;
export type Actor = TenantActor;

export const scope = (actor: Actor) => tenantWhere(actor);
export const owner = (actor: Actor) => tenantOwner(actor);

/** Throws "not found" for a record that belongs to another cooperative. */
const NOT_FOUND: Record<string, string> = {
  Product: 'Product not found', Customer: 'Customer not found', Batch: 'Batch not found', Receipt: 'Receipt not found', Quotation: 'Quotation not found', Order: 'Order not found',
  Invoice: 'Invoice not found', Payment: 'Payment not found', Dispatch: 'Dispatch not found', Transfer: 'Transfer not found', Allocation: 'Allocation not found',
  'Processing run': 'Processing run not found', Task: 'Task not found', Farm: 'Farm not found', Farmer: 'Farmer not found', Harvest: 'Harvest not found', 'Stock entry': 'Stock entry not found', Input: 'Input not found',
};

export function assertVisible(actor: Actor, row: { mamcosId: string | null } | null | undefined, what: string): asserts row {
  if (!row || !canSeeTenantRow(actor, row.mamcosId)) throw new NotFoundException(NOT_FOUND[what] ?? 'Not found');
}

/** A reference like INV-2026-0042 that restarts each year and is unique across all users, even at the same moment. */
export async function nextRef(tx: Tx, prefix: string, width = 4): Promise<string> {
  const key = `${prefix}-${new Date().getFullYear()}`;
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO reference_counters ("key", "value") VALUES (${key}, 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = reference_counters."value" + 1
    RETURNING "value"`;
  return padRef(key, rows[0].value, width);
}

/** Locks the given stock batches for the rest of the transaction, always in the same order so two jobs cannot deadlock. */
export async function lockBatches(tx: Tx, ids: string[]): Promise<void> {
  const unique = [...new Set(ids)].sort();
  if (!unique.length) return;
  await tx.$queryRaw`SELECT id FROM stock_batches WHERE id IN (${Prisma.join(unique)}) ORDER BY id FOR UPDATE`;
}

export interface BatchBalance {
  physicalKg: number;
  reservedKg: number;
  availableKg: number;
}

/** Stock of each batch at one warehouse: what is physically there, what orders have claimed, and what is left to sell. */
export async function batchBalances(db: Tx | PrismaService, batchIds: string[], warehouseId?: string): Promise<Map<string, BatchBalance>> {
  const out = new Map<string, BatchBalance>();
  if (!batchIds.length) return out;
  const [ledger, allocs] = await Promise.all([
    db.stockLedgerEntry.groupBy({
      by: ['batchId'],
      where: { batchId: { in: batchIds }, ...(warehouseId ? { warehouseId } : {}) },
      _sum: { quantityKg: true },
    }),
    db.orderAllocation.findMany({
      where: { batchId: { in: batchIds }, ...(warehouseId ? { warehouseId } : {}) },
      select: { batchId: true, quantityKg: true, dispatchedKg: true, releasedKg: true },
    }),
  ]);
  const reserved = new Map<string, number>();
  for (const a of allocs) reserved.set(a.batchId, (reserved.get(a.batchId) ?? 0) + (a.quantityKg - a.dispatchedKg - a.releasedKg));
  for (const id of batchIds) {
    const physical = ledger.find((l) => l.batchId === id)?._sum.quantityKg ?? 0;
    const res = reserved.get(id) ?? 0;
    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    out.set(id, { physicalKg: r3(physical), reservedKg: r3(res), availableKg: r3(physical - res) });
  }
  return out;
}

/** Tells the right people in a workflow: whoever holds a permission inside the cooperative (or Mayode itself). */
@Injectable()
export class OpsNotifyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async userIdsWith(resource: string, action: 'VIEW' | 'CREATE' | 'EDIT' | 'DELETE', mamcosId: string | null): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        mamcosId: mamcosId ?? null,
        OR: [
          ...(mamcosId ? [] : [{ role: UserRole.SUPER_ADMIN }]),
          { customRole: { isActive: true, permissions: { some: { action, resource: { key: resource } } } } },
        ],
      },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  async tell(userIds: (string | null | undefined)[], note: { type: string; title: string; body: string; data?: Prisma.InputJsonValue }) {
    const ids = [...new Set(userIds.filter((x): x is string => !!x))];
    await Promise.all(ids.map((userId) => this.notifications.create({ userId, ...note }).catch(() => undefined)));
  }

  async tellPermission(resource: string, action: 'VIEW' | 'CREATE' | 'EDIT' | 'DELETE', mamcosId: string | null, note: { type: string; title: string; body: string; data?: Prisma.InputJsonValue }, also: (string | null | undefined)[] = []) {
    await this.tell([...(await this.userIdsWith(resource, action, mamcosId)), ...also], note);
  }
}

export function forbid(message: string): never {
  throw new ForbiddenException(message);
}
