import { SetMetadata } from '@nestjs/common';
import { PermissionAction } from '@prisma/client';

export const PERMISSION_KEY = 'permission';

export interface RequiredPermission {
  resource: string;
  action: PermissionAction;
}

/** Requires an explicit custom-role grant. Only Super Admin bypasses grants. */
export const RequirePermission = (resource: string, action: PermissionAction) =>
  SetMetadata(PERMISSION_KEY, {
    resource,
    action,
  } satisfies RequiredPermission);
