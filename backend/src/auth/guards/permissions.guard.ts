import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasGrant, requiredPermission } from '../role-access';
import { ALLOW_SELF_SERVICE_KEY } from '../decorators/allow-self-service.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.reflector.getAllAndOverride<boolean>(ALLOW_SELF_SERVICE_KEY, [context.getHandler(), context.getClass()]) === true) return true;
    const required = requiredPermission(this.reflector, context);
    if (!required) return true; // Explicit self-service routes enforce ownership in their service.
    const { user } = context.switchToHttp().getRequest();
    if (!hasGrant(user, required.resource, required.action)) {
      throw new ForbiddenException(`Missing permission: ${required.action} on ${required.resource}`);
    }
    return true;
  }
}
