import { ForbiddenException, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionAction, UserRole } from '@prisma/client';
import { PERMISSION_KEY, RequiredPermission } from './decorators/require-permission.decorator';
import { ROLES_KEY } from './decorators/roles.decorator';

export interface AccessUser {
  role: UserRole;
  customRole?: {
    isActive: boolean;
    isSystem?: boolean;
    permissions: { action: string; resource: { key: string } }[];
  } | null;
}

export function hasGrant(user: AccessUser | undefined, resource: string, action: string): boolean {
  if (user?.role === UserRole.SUPER_ADMIN) return true;
  const role = user?.customRole;
  return !!role && role.isActive && !role.isSystem &&
    role.permissions.some((p) => p.resource.key === resource && p.action === action);
}

/**
 * Farmers are not a managed role: they have their own dashboard and mobile app, and the code (not an
 * admin-edited grant matrix) decides what they may call. A farmer may use any route that lists FARMER in
 * @Roles; the service layer then confines every read and write to the farmer's own records.
 */
export function isFarmerRoute(
  reflector: Reflector,
  context: ExecutionContext,
  user: { role?: UserRole } | undefined,
): boolean {
  if (user?.role !== UserRole.FARMER) return false;
  const roles = reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
  return !!roles?.includes(UserRole.FARMER);
}

export function assertAssignedRole(user: AccessUser): void {
  if (user.role === UserRole.FARMER) return; // farmers have no role to assign; see isFarmerRoute
  if (user.role !== UserRole.SUPER_ADMIN &&
      (!user.customRole?.isActive || user.customRole.isSystem)) {
    throw new ForbiddenException('Ask Super Admin to assign an active custom role to this account');
  }
}

const RESOURCE_KEY = 'permission_resource';
/** Default permission for every endpoint in a resource controller. Explicit grants override it. */
export const PermissionResource = (resource: string) => SetMetadata(RESOURCE_KEY, resource);

export function requiredPermission(reflector: Reflector, context: ExecutionContext): RequiredPermission | undefined {
  const targets = [context.getHandler(), context.getClass()];
  const explicit = reflector.getAllAndOverride<RequiredPermission>(PERMISSION_KEY, targets);
  if (explicit) return explicit;
  const resource = reflector.getAllAndOverride<string>(RESOURCE_KEY, targets);
  if (!resource) return undefined;
  const actions: Record<string, PermissionAction> = {
    GET: 'VIEW', HEAD: 'VIEW', POST: 'CREATE', PUT: 'EDIT', PATCH: 'EDIT', DELETE: 'DELETE',
  };
  const action = actions[context.switchToHttp().getRequest().method];
  if (!action) throw new ForbiddenException('Unsupported permission action');
  return { resource, action };
}
