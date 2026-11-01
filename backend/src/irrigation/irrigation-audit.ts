import { Prisma } from '@prisma/client';
import type { RequestUser } from '../common/ownership.service';
import type { Db } from './irrigation-common';

export type AuditEntity = 'irrigation_scheme' | 'irrigation_canal' | 'irrigation_block' | 'irrigation_hectare' | 'farmer' | 'payroll';

const strip = (row: Record<string, unknown> | null | undefined) =>
  row ? JSON.parse(JSON.stringify(row)) : undefined;

/** Fields that changed, as { field: [before, after] } — what the History tabs display. */
export function diffRecords(before: Record<string, unknown>, after: Record<string, unknown>) {
  const changes: Record<string, [unknown, unknown]> = {};
  for (const key of Object.keys(after)) {
    if (['updatedAt', 'updatedById', 'createdAt'].includes(key)) continue;
    const a = JSON.stringify(before[key] ?? null);
    const b = JSON.stringify(after[key] ?? null);
    if (a !== b) changes[key] = [before[key] ?? null, after[key] ?? null];
  }
  return changes;
}

/** Writes a before/after audit row inside the caller's transaction, so history and data commit together. */
export async function writeAudit(
  db: Db,
  actor: RequestUser,
  entityType: AuditEntity,
  entityId: string,
  action: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
) {
  await db.auditLog.create({
    data: {
      userId: actor.id,
      action: `${entityType}.${action}`,
      entityType,
      entityId,
      mamcosId: actor.mamcosId ?? null,
      oldData: strip(before) as Prisma.InputJsonValue | undefined,
      newData: strip(after) as Prisma.InputJsonValue | undefined,
    },
  });
}
