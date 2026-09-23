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
