import { UserRole } from '@prisma/client';

/** The slice of a request user the tenant helpers need. */
export interface TenantActor {
  id: string;
  role: UserRole;
  mamcosId?: string | null;
}

/**
 * Row filter for tenant-owned data. Super Admin sees every cooperative and the platform;
 * everyone else sees only their own cooperative's rows, or platform rows when they have none.
 */
export const tenantWhere = (
  actor: TenantActor,
): { mamcosId?: string | null } =>
  actor.role === UserRole.SUPER_ADMIN
    ? {}
    : { mamcosId: actor.mamcosId ?? null };

/** Owner stamped on rows the actor creates: their cooperative, or null for platform-level. */
export const tenantOwner = (actor: TenantActor): string | null =>
  actor.role === UserRole.SUPER_ADMIN ? null : (actor.mamcosId ?? null);

/** True when `rowMamcosId` is visible to the actor. */
export const canSeeTenantRow = (
  actor: TenantActor,
  rowMamcosId: string | null,
): boolean =>
  actor.role === UserRole.SUPER_ADMIN ||
  (actor.mamcosId ?? null) === rowMamcosId;
