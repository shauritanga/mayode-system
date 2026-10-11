import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { hasGrant, type AccessUser } from './role-access';

/**
 * Cooperative-admin delegation.
 *
 * Super Admin is platform-wide. A cooperative admin is a non-super account with a
 * `mamcosId` that holds the `roles` / `users` grants; they may manage roles and
 * accounts of their own AMCOS only, and may never hand out more than they hold.
 */

/** Resources whose scope is the whole platform; a cooperative admin can never grant these. */
export const PLATFORM_ONLY_RESOURCES = ['settings', 'locations', 'rewards', 'buyer_portal'] as const;

export interface Grant {
  resource: string;
  action: string;
}

export interface DelegatingActor extends AccessUser {
  id: string;
  roleId?: string | null;
  mamcosId?: string | null;
}

export const isSuperAdmin = (actor: { role: UserRole }) => actor.role === UserRole.SUPER_ADMIN;

/** The AMCOS a non-super actor is confined to, or a 403 if they have none. */
export function requireTenant(actor: DelegatingActor): string {
  if (!actor.mamcosId) {
    throw new ForbiddenException(
      'Only Super Admin or a cooperative admin may manage roles and accounts',
    );
  }
  return actor.mamcosId;
}

/** The actor's own grants, flattened. */
export function grantsOf(actor: AccessUser): Grant[] {
  const role = actor.customRole;
  if (!role?.isActive || role.isSystem) return [];
  return role.permissions.map((p) => ({ resource: p.resource.key, action: p.action }));
}

/**
 * Throws unless every wanted grant is one the actor holds themselves and is
 * grantable inside a cooperative. Super Admin is exempt.
 */
export function assertWithinCeiling(actor: AccessUser, wanted: Grant[]): void {
  if (actor.role === UserRole.SUPER_ADMIN) return;
  const platformOnly = wanted.filter((g) => (PLATFORM_ONLY_RESOURCES as readonly string[]).includes(g.resource));
  if (platformOnly.length) {
    throw new BadRequestException(
      `These permissions are platform-wide and cannot be granted inside a cooperative: ${[...new Set(platformOnly.map((g) => g.resource))].join(', ')}`,
    );
  }
  const over = wanted.filter((g) => !hasGrant(actor, g.resource, g.action));
  if (over.length) {
    const list = over.map((g) => `${g.action} ${g.resource}`).join(', ');
    throw new ForbiddenException(`You cannot grant permissions you do not hold: ${list}`);
  }
}

/** A role's grants, in the shape assertWithinCeiling expects. */
export function grantsOfRole(role: {
  permissions: { action: string; resource: { key: string } }[];
}): Grant[] {
  return role.permissions.map((p) => ({ resource: p.resource.key, action: p.action }));
}
