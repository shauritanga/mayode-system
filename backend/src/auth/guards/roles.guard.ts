import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { hasGrant, requiredPermission } from '../role-access';
import { ALLOW_SELF_SERVICE_KEY } from '../decorators/allow-self-service.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.reflector.getAllAndOverride<boolean>(ALLOW_SELF_SERVICE_KEY, [context.getHandler(), context.getClass()]) === true) return true;
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    const { user } = context.switchToHttp().getRequest();
    if (user?.role === UserRole.SUPER_ADMIN) return true;
    // An explicit Super Admin-only endpoint cannot be delegated via a grant.
    if (roles?.length === 1 && roles[0] === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only Super Admin may perform this action');
    }
    const required = requiredPermission(this.reflector, context);
    if (required) {
      if (hasGrant(user, required.resource, required.action)) return true;
      throw new ForbiddenException(`Missing permission: ${required.action} on ${required.resource}`);
    }
    if (!roles?.length) return true;
    // Historical operational profile enums never grant access themselves.
    throw new ForbiddenException('This action requires Super Admin or an explicit permission');
  }
}
