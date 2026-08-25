import { SetMetadata } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';

export const PERMISSION_KEY = 'permission';

export interface RequiredPermission {
  resource: string;
  action: PermissionAction;
}

/**
 * Layers a resource+action permission check on top of the existing
 * @Roles() check via PermissionsGuard. SUPER_ADMIN/ADMIN always bypass this
 * (see PermissionsGuard); any other user must carry a custom Role with a
 * matching RolePermission grant.
 */
export const RequirePermission = (resource: string, action: PermissionAction) =>
  SetMetadata(PERMISSION_KEY, { resource, action } satisfies RequiredPermission);
