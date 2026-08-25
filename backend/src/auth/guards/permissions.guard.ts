import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import {
  PERMISSION_KEY,
  RequiredPermission,
} from '../decorators/require-permission.decorator';

/**
 * Layers a resource+action permission check on top of RolesGuard. A route
 * without @RequirePermission() is a no-op here — this only narrows access
 * further for handlers that opt in, it never widens it beyond what @Roles()
 * already allows (RolesGuard still runs first in @UseGuards order).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RequiredPermission>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      throw new ForbiddenException('User is not authenticated');
    }

    // The two "god" system roles always pass, matching their behavior
    // everywhere else in the app.
    if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN) {
      return true;
    }

    const customRole = user.customRole as
      | { isActive: boolean; permissions: { action: string; resource: { key: string } }[] }
      | null
      | undefined;

    const granted =
      !!customRole &&
      customRole.isActive &&
      customRole.permissions.some(
        (p) => p.resource.key === required.resource && p.action === required.action,
      );

    if (!granted) {
      throw new ForbiddenException(
        `Missing permission: ${required.action} on ${required.resource}`,
      );
    }

    return true;
  }
}
