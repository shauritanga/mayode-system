import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { RolesService } from './roles.service';

const superAdmin = { id: 'super-1', role: UserRole.SUPER_ADMIN } as any;

/** A cooperative admin of `mamcosId`, holding the given grants through role `own-role`. */
const coopAdmin = (grants: [string, string][], mamcosId: string | null = 'mamcos-1') =>
  ({
    id: 'admin-1',
    role: UserRole.CUSTOM,
    roleId: 'own-role',
    mamcosId,
    customRole: { isActive: true, isSystem: false, permissions: grants.map(([r, a]) => ({ action: a, resource: { key: r } })) },
  }) as any;

const FULL: [string, string][] = [
  ['roles', 'VIEW'], ['roles', 'CREATE'], ['roles', 'EDIT'], ['roles', 'DELETE'],
  ['farmers', 'VIEW'], ['farmers', 'EDIT'],
];

describe('Role creation', () => {
  it('Super Admin creates an unprivileged platform role with no copied grants', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'role-1' });
    const service = new RolesService({ role: { findFirst: jest.fn().mockResolvedValue(null), create } } as any);
    await service.create({ name: 'Operations' }, superAdmin);
    expect(create).toHaveBeenCalledWith({
      data: { name: 'Operations', description: undefined, systemRole: UserRole.CUSTOM, mamcosId: null },
    });
  });

  it('Super Admin cannot create a role inside a cooperative', async () => {
    const create = jest.fn();
    const service = new RolesService({ role: { findFirst: jest.fn().mockResolvedValue(null), create } } as any);
    await expect(service.create({ name: 'Clerk', mamcosId: 'mamcos-9' }, superAdmin)).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('a cooperative admin always creates roles in their own AMCOS', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'role-1' });
    const service = new RolesService({ role: { findFirst: jest.fn().mockResolvedValue(null), create } } as any);
    await service.create({ name: 'Clerk', mamcosId: 'mamcos-9' }, coopAdmin(FULL));
    expect(create).toHaveBeenCalledWith({
      data: { name: 'Clerk', description: undefined, systemRole: UserRole.CUSTOM, mamcosId: 'mamcos-1' },
    });
  });

  it('rejects a duplicate name within the same scope', async () => {
    const service = new RolesService({ role: { findFirst: jest.fn().mockResolvedValue({ id: 'x' }) } } as any);
    await expect(service.create({ name: 'Clerk' }, coopAdmin(FULL))).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses accounts that belong to no cooperative', async () => {
    const service = new RolesService({} as any);
    await expect(service.create({ name: 'X' }, coopAdmin(FULL, null))).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('Role visibility is confined to the actor\'s cooperative', () => {
  it('lists only the actor\'s AMCOS roles', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new RolesService({ role: { findMany } } as any);
    await service.findAll(coopAdmin(FULL));
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { mamcosId: 'mamcos-1' } }));
    await service.findAll(superAdmin);
    expect(findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: undefined }));
  });

  it('hides other cooperatives\' and platform roles as not found', async () => {
    for (const mamcosId of ['mamcos-2', null]) {
      const service = new RolesService({
        role: { findUnique: jest.fn().mockResolvedValue({ id: 'r', mamcosId, permissions: [], _count: { users: 0 } }) },
      } as any);
      await expect(service.findOne('r', coopAdmin(FULL))).rejects.toBeInstanceOf(NotFoundException);
    }
  });
});

describe('Permission changes', () => {
  const customRole = (over: Record<string, unknown> = {}) => ({
    id: 'staff-role', isSystem: false, mamcosId: 'mamcos-1', permissions: [], _count: { users: 0 }, ...over,
  });
  function setup(role: any) {
    const prisma = {
      role: { findUnique: jest.fn().mockResolvedValue(role) },
      resource: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'res-farmers', key: 'farmers', label: 'Farmers' },
          { id: 'res-settings', key: 'settings', label: 'Settings' },
          { id: 'res-users', key: 'users', label: 'Users' },
        ]),
      },
      rolePermission: { deleteMany: jest.fn(), createMany: jest.fn() },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    return { prisma, service: new RolesService(prisma as any) };
  }

  it('protects the Super Admin role from permission changes', async () => {
    const { service } = setup({ id: 'super', isSystem: true, mamcosId: null, permissions: [] });
    await expect(service.setPermissions('super', { permissions: [] }, superAdmin)).rejects.toThrow('System roles');
  });

  it('lets a cooperative admin grant what they hold', async () => {
    const { service, prisma } = setup(customRole());
    await service.setPermissions('staff-role', { permissions: [{ resourceKey: 'farmers', actions: ['VIEW'] as any }] }, coopAdmin(FULL));
    expect(prisma.rolePermission.createMany).toHaveBeenCalledWith({ data: [{ roleId: 'staff-role', resourceId: 'res-farmers', action: 'VIEW' }] });
  });

  it('blocks granting an action the admin does not hold', async () => {
    const { service, prisma } = setup(customRole());
    await expect(
      service.setPermissions('staff-role', { permissions: [{ resourceKey: 'farmers', actions: ['DELETE'] as any }] }, coopAdmin(FULL)),
    ).rejects.toThrow('cannot grant permissions you do not hold');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('blocks granting a resource the admin does not hold', async () => {
    const { service } = setup(customRole());
    await expect(
      service.setPermissions('staff-role', { permissions: [{ resourceKey: 'users', actions: ['VIEW'] as any }] }, coopAdmin(FULL)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks platform-wide resources even if somehow held', async () => {
    const { service } = setup(customRole());
    const admin = coopAdmin([...FULL, ['settings', 'VIEW']]);
    await expect(
      service.setPermissions('staff-role', { permissions: [{ resourceKey: 'settings', actions: ['VIEW'] as any }] }, admin),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('forbids changing or deleting the role that grants the admin their own access', async () => {
    const { service } = setup(customRole({ id: 'own-role' }));
    await expect(service.setPermissions('own-role', { permissions: [] }, coopAdmin(FULL))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.update('own-role', { isActive: false }, coopAdmin(FULL))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.remove('own-role', coopAdmin(FULL))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('cannot edit roles of another cooperative', async () => {
    const { service } = setup(customRole({ mamcosId: 'mamcos-2' }));
    await expect(service.setPermissions('staff-role', { permissions: [] }, coopAdmin(FULL))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a cooperative admin only replaces grants on resources they can see', async () => {
    const { service, prisma } = setup(customRole());
    await service.setPermissions('staff-role', { permissions: [{ resourceKey: 'farmers', actions: ['VIEW'] as any }] }, coopAdmin(FULL));
    // 'farmers' is the only visible resource: grants on settings/users must survive the save.
    expect(prisma.rolePermission.deleteMany).toHaveBeenCalledWith({ where: { roleId: 'staff-role', resourceId: { in: ['res-farmers'] } } });
  });

  it('Super Admin replaces the whole matrix and is not subject to the ceiling', async () => {
    const { service, prisma } = setup(customRole());
    await service.setPermissions('staff-role', { permissions: [{ resourceKey: 'settings', actions: ['EDIT'] as any }] }, superAdmin);
    expect(prisma.rolePermission.deleteMany).toHaveBeenCalledWith({ where: { roleId: 'staff-role' } });
    expect(prisma.rolePermission.createMany).toHaveBeenCalled();
  });

  it('shows a cooperative admin only grantable resources they hold', async () => {
    const { service } = setup(customRole());
    const keys = (await service.getResources(coopAdmin([...FULL, ['settings', 'VIEW']]))).map((r) => r.key);
    expect(keys).toEqual(['farmers']);
  });
});
