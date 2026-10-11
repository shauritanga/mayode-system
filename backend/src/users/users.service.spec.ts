import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { UsersService } from './users.service';

function buildService(existing: any, customRole: any = null) {
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(existing),
      update: jest.fn().mockImplementation(async (args: any) => ({
        ...existing,
        ...args.data,
      })),
    },
    role: { findUnique: jest.fn().mockResolvedValue(customRole) },
  };
  return { service: new UsersService(prisma as any), prisma };
}

describe('UsersService.findOne access scoping', () => {
  const stored = { id: 'user-1', role: UserRole.FARMER, phone: '+2551' };

  it('allows a user to read their own account', async () => {
    const { service } = buildService(stored);
    await expect(
      service.findOne('user-1', { id: 'user-1', role: UserRole.FARMER }),
    ).resolves.toEqual(stored);
  });

  it('allows SUPER_ADMIN to read any account', async () => {
    const { service } = buildService(stored);
    for (const role of [UserRole.SUPER_ADMIN]) {
      await expect(
        service.findOne('user-1', { id: 'other', role }),
      ).resolves.toEqual(stored);
    }
  });

  it('rejects a non-staff user reading someone else’s account', async () => {
    const { service } = buildService(stored);
    await expect(
      service.findOne('user-1', { id: 'other', role: UserRole.FARMER }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.findOne('user-1', {
        id: 'other',
        role: UserRole.MAMCOS_SECRETARY,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects unauthenticated reads of other accounts', async () => {
    const { service } = buildService(stored);
    await expect(service.findOne('user-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('still returns 404 for a missing user', async () => {
    const { service } = buildService(null);
    await expect(
      service.findOne('missing', { id: 'missing', role: UserRole.FARMER }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('UsersService.update custom-role assignment', () => {
  const stored = { id: 'user-1', role: UserRole.FIELD_OFFICER };
  const grant = { id: 'role-1', isActive: true, isSystem: false };

  it('lets SUPER_ADMIN attach an active custom role', async () => {
    const { service, prisma } = buildService(stored, grant);
    await service.update(
      'user-1',
      { roleId: 'role-1' },
      { id: 'admin', role: UserRole.SUPER_ADMIN },
    );
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ roleId: 'role-1' }) }),
    );
  });

  it('rejects ADMIN attaching a custom role', async () => {
    const { service } = buildService(stored, grant);
    await expect(
      service.update('user-1', { roleId: 'role-1' }, { id: 'admin', role: UserRole.ADMIN }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects detaching a role without a replacement', async () => {
    const { service, prisma } = buildService(stored, grant);
    await expect(service.update('user-1', { roleId: null }, { id: 'admin', role: UserRole.SUPER_ADMIN })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('demotes a Super Admin when assigning a custom role', async () => {
    const { service, prisma } = buildService({ ...stored, role: UserRole.SUPER_ADMIN }, grant);
    await service.update('user-1', { roleId: 'role-1' }, { id: 'other-super-admin', role: UserRole.SUPER_ADMIN });
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { roleId: 'role-1', role: UserRole.CUSTOM } }));
  });

  it('rejects non-admin callers assigning a custom role — even to self', async () => {
    const { service } = buildService(stored, grant);
    await expect(
      service.update('user-1', { roleId: 'role-1' }, { id: 'user-1', role: UserRole.FIELD_OFFICER }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.update('user-1', { roleId: 'role-1' }, { id: 'sec', role: UserRole.MAMCOS_SECRETARY }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects unknown, inactive, or system roles', async () => {
    const admin = { id: 'admin', role: UserRole.SUPER_ADMIN };
    const { service: missing } = buildService(stored, null);
    await expect(
      missing.update('user-1', { roleId: 'nope' }, admin),
    ).rejects.toBeInstanceOf(BadRequestException);

    const { service: inactive } = buildService(stored, { ...grant, isActive: false });
    await expect(
      inactive.update('user-1', { roleId: 'role-1' }, admin),
    ).rejects.toBeInstanceOf(BadRequestException);

    const { service: system } = buildService(stored, { ...grant, isSystem: true });
    await expect(
      system.update('user-1', { roleId: 'role-1' }, admin),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('UsersService cooperative-admin scoping', () => {
  const admin = {
    id: 'coop-admin',
    role: UserRole.CUSTOM,
    mamcosId: 'mamcos-1',
    roleId: 'own-role',
    customRole: {
      isActive: true,
      isSystem: false,
      permissions: [
        { action: 'VIEW', resource: { key: 'users' } },
        { action: 'EDIT', resource: { key: 'users' } },
        { action: 'VIEW', resource: { key: 'farmers' } },
      ],
    },
  } as any;
  const mine = { id: 'staff-1', role: UserRole.CUSTOM, mamcosId: 'mamcos-1', mamcosStaff: null };
  const theirs = { id: 'staff-2', role: UserRole.CUSTOM, mamcosId: 'mamcos-2', mamcosStaff: null };
  const ownRole = (over: Record<string, unknown> = {}) => ({
    id: 'role-1', isActive: true, isSystem: false, systemRole: 'CUSTOM', mamcosId: 'mamcos-1',
    permissions: [{ action: 'VIEW', resource: { key: 'farmers' } }], ...over,
  });

  it('lists only the admin\'s own AMCOS accounts', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new UsersService({ user: { findMany } } as any);
    await service.findAll(admin);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { OR: [{ mamcosId: 'mamcos-1' }, { mamcosStaff: { mamcosId: 'mamcos-1' } }] } }),
    );
    await service.findAll({ id: 's', role: UserRole.SUPER_ADMIN } as any);
    expect(findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: undefined }));
  });

  it('hides accounts of other cooperatives', async () => {
    const { service } = buildService(theirs);
    await expect(service.findOne('staff-2', admin)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.update('staff-2', { isActive: false }, admin)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lets the admin assign a role of their own AMCOS within their grants', async () => {
    const { service, prisma } = buildService(mine, ownRole());
    await service.update('staff-1', { roleId: 'role-1' }, admin);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ roleId: 'role-1', mamcosId: 'mamcos-1' }) }),
    );
  });

  it('refuses roles of another cooperative, platform roles and roles above their grants', async () => {
    for (const role of [
      ownRole({ mamcosId: 'mamcos-2' }),
      ownRole({ mamcosId: null }),
      ownRole({ permissions: [{ action: 'DELETE', resource: { key: 'farmers' } }] }),
    ]) {
      const { service, prisma } = buildService(mine, role);
      await expect(service.update('staff-1', { roleId: 'role-1' }, admin)).rejects.toThrow();
      expect(prisma.user.update).not.toHaveBeenCalled();
    }
  });

  it('refuses changing their own role or deactivating themselves', async () => {
    const self = { id: 'coop-admin', role: UserRole.CUSTOM, mamcosId: 'mamcos-1', mamcosStaff: null };
    const { service } = buildService(self, ownRole());
    await expect(service.update('coop-admin', { roleId: 'role-1' }, admin)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.update('coop-admin', { isActive: false }, admin)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('never lets them assign the Super Admin role', async () => {
    const { service } = buildService(mine, null);
    await expect(service.update('staff-1', { role: UserRole.SUPER_ADMIN }, admin)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('keeps a field officer\'s operational role when moved to a general role', async () => {
    const officer = { id: 'staff-1', role: UserRole.FIELD_OFFICER, mamcosId: 'mamcos-1', mamcosStaff: { mamcosId: 'mamcos-1' } };
    const { service, prisma } = buildService(officer, ownRole());
    await service.update('staff-1', { roleId: 'role-1' }, admin);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: UserRole.FIELD_OFFICER }) }),
    );
  });
});
