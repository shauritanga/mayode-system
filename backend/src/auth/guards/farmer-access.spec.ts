import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { RolesGuard } from './roles.guard';
import { PermissionsGuard } from './permissions.guard';
import { Roles } from '../decorators/roles.decorator';
import { RequirePermission } from '../decorators/require-permission.decorator';
import { PermissionResource } from '../role-access';

@PermissionResource('farmers')
class SampleController {
  @Roles(UserRole.SUPER_ADMIN, UserRole.FIELD_OFFICER, UserRole.FARMER)
  editProfile() {}

  @Roles(UserRole.SUPER_ADMIN, UserRole.FIELD_OFFICER)
  staffOnlyList() {}

  @Roles(UserRole.SUPER_ADMIN)
  @RequirePermission('users', 'DELETE')
  superAdminOnly() {}

  @RequirePermission('farmers', 'EDIT')
  noRolesListed() {}
}

const ctx = (handler: keyof SampleController, user: any, method = 'PATCH') =>
  ({
    getHandler: () => SampleController.prototype[handler],
    getClass: () => SampleController,
    switchToHttp: () => ({ getRequest: () => ({ user, method }) }),
  }) as unknown as ExecutionContext;

const reflector = new Reflector();
const roles = new RolesGuard(reflector);
const perms = new PermissionsGuard(reflector);
// A farmer has no custom role at all: nothing an admin configures can grant or withhold access.
const farmer = { id: 'f1', role: UserRole.FARMER, customRole: null };
const passes = (handler: keyof SampleController, user: any) => {
  const c = ctx(handler, user);
  return roles.canActivate(c) && perms.canActivate(c);
};

describe('Farmer access does not depend on a role', () => {
  it('lets a farmer with no role use a route that lists FARMER', () => {
    expect(passes('editProfile', farmer)).toBe(true);
  });

  it.each(['staffOnlyList', 'superAdminOnly', 'noRolesListed'] as const)('still blocks a farmer from %s', (handler) => {
    expect(() => passes(handler, farmer)).toThrow(ForbiddenException);
  });

  it('does not let the bypass reach any other account type', () => {
    for (const role of [UserRole.FIELD_OFFICER, UserRole.CUSTOM, UserRole.ADMIN, UserRole.BUYER]) {
      expect(() => passes('editProfile', { id: 'u', role, customRole: null })).toThrow(ForbiddenException);
    }
  });

  it('keeps grants working for staff and Super Admin as before', () => {
    const staff = { id: 's', role: UserRole.FIELD_OFFICER, customRole: { isActive: true, isSystem: false, permissions: [{ action: 'EDIT', resource: { key: 'farmers' } }] } };
    expect(passes('editProfile', staff)).toBe(true);
    expect(passes('superAdminOnly', { id: 'a', role: UserRole.SUPER_ADMIN })).toBe(true);
  });
});
