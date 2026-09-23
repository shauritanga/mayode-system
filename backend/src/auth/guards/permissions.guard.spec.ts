import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { PermissionsGuard } from './permissions.guard';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';

function buildGuard(
  metadata: { resource: string; action: string } | undefined,
  user: any,
): { guard: PermissionsGuard; context: any } {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(metadata),
  } as unknown as Reflector;
  const guard = new PermissionsGuard(reflector);
  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  };
  return { guard, context };
}

describe('PermissionsGuard', () => {
  it('is a no-op for routes without @RequirePermission()', () => {
    const { guard, context } = buildGuard(undefined, {
      role: UserRole.FARMER,
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('lets only SUPER_ADMIN bypass the permission matrix', () => {
    for (const role of [UserRole.SUPER_ADMIN]) {
      const { guard, context } = buildGuard(
        { resource: 'marketplace', action: 'DELETE' },
        { role },
      );
      expect(guard.canActivate(context)).toBe(true);
    }
  });

  it('allows a custom-role user holding the required grant', () => {
    const { guard, context } = buildGuard(
      { resource: 'marketplace', action: 'VIEW' },
      {
        role: UserRole.FIELD_OFFICER,
        customRole: {
          isActive: true,
          permissions: [{ action: 'VIEW', resource: { key: 'marketplace' } }],
        },
      },
    );
    expect(guard.canActivate(context)).toBe(true);
    expect(context.switchToHttp).toBeDefined();
  });

  it('rejects a custom-role user missing the required grant', () => {
    const { guard, context } = buildGuard(
      { resource: 'marketplace', action: 'EDIT' },
      {
        role: UserRole.FIELD_OFFICER,
        customRole: {
          isActive: true,
          permissions: [{ action: 'VIEW', resource: { key: 'marketplace' } }],
        },
      },
    );
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('rejects when the custom role is inactive', () => {
    const { guard, context } = buildGuard(
      { resource: 'reports', action: 'VIEW' },
      {
        role: UserRole.MAMCOS_SECRETARY,
        customRole: {
          isActive: false,
          permissions: [{ action: 'VIEW', resource: { key: 'reports' } }],
        },
      },
    );
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('rejects system-enum users that carry no custom role', () => {
    const { guard, context } = buildGuard(
      { resource: 'reports', action: 'VIEW' },
      { role: UserRole.AUDITOR, customRole: null },
    );
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('does not let ADMIN bypass a restricted custom role', () => {
    const { guard, context } = buildGuard({ resource: 'reports', action: 'VIEW' }, {
      role: UserRole.ADMIN, customRole: { isActive: true, isSystem: false, permissions: [] },
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('rejects unauthenticated requests on guarded routes', () => {
    const { guard, context } = buildGuard(
      { resource: 'reports', action: 'VIEW' },
      undefined,
    );
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('reads metadata via the shared PERMISSION_KEY', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);
    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({}) }),
    };
    guard.canActivate(context as any);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      PERMISSION_KEY,
      expect.anything(),
    );
  });
});
