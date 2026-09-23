import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { RolesGuard } from './roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { RequirePermission } from '../decorators/require-permission.decorator';
import { PermissionResource } from '../role-access';
import { RolesController } from '../../roles/roles.controller';
import { UsersController } from '../../users/users.controller';

const granted = (role: UserRole = UserRole.CUSTOM) => ({ role, customRole: { isActive: true, isSystem: false, permissions: [{ action: 'VIEW', resource: { key: 'reports' } }, { action: 'DELETE', resource: { key: 'users' } }] } });
function check(user: any, controller: any, handler: any, method = 'GET') {
  return new RolesGuard(new Reflector()).canActivate({ getClass: () => controller, getHandler: () => handler, switchToHttp: () => ({ getRequest: () => ({ user, method }) }) } as any);
}
@Roles(UserRole.ADMIN)
@PermissionResource('reports')
class Reports { list() {} }

describe('RolesGuard: only Super Admin has built-in access', () => {
  it('allows Super Admin regardless of historical profile allowlists', () => {
    expect(check({ role: UserRole.SUPER_ADMIN }, Reports, Reports.prototype.list)).toBe(true);
  });
  it.each([UserRole.ADMIN, UserRole.FARMER, UserRole.FIELD_OFFICER, UserRole.CUSTOM])('requires a grant for %s', (role) => {
    expect(() => check({ role }, Reports, Reports.prototype.list)).toThrow(ForbiddenException);
    expect(check(granted(role), Reports, Reports.prototype.list)).toBe(true);
  });
  it('rejects inactive roles and missing actions', () => {
    const user = granted();
    user.customRole.isActive = false;
    expect(() => check(user, Reports, Reports.prototype.list)).toThrow(ForbiddenException);
    expect(() => check(granted(), Reports, Reports.prototype.list, 'POST')).toThrow(ForbiddenException);
  });
  it('protects every role-management endpoint even with custom permissions', () => {
    for (const method of ['findAll', 'create', 'update', 'remove', 'setPermissions', 'getResources']) {
      expect(() => check(granted(UserRole.ADMIN), RolesController, RolesController.prototype[method])).toThrow(ForbiddenException);
      expect(check({ role: UserRole.SUPER_ADMIN }, RolesController, RolesController.prototype[method])).toBe(true);
    }
  });
  it('cannot delegate a Super Admin-only endpoint via a matching grant', () => {
    expect(() => check(granted(), UsersController, UsersController.prototype.remove, 'DELETE')).toThrow(ForbiddenException);
  });
  it('denies unauthenticated resource access', () => {
    expect(() => check(undefined, Reports, Reports.prototype.list)).toThrow(ForbiddenException);
  });
});
