import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthService } from './auth.service';

function buildService() {
  const prisma = {
    role: { findUnique: jest.fn().mockResolvedValue(null) },
    user: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  return new AuthService(prisma as any, {} as any, {} as any);
}

const officerDto = {
  phone: '+255700000001',
  password: 'SecurePass123!',
  roleId: 'custom-officer',
  firstName: 'Field',
  lastName: 'Officer',
  mamcosId: 'mamcos-1',
} as any;

describe('AuthService.createStaffAccount platform-level creation', () => {
  it('rejects cooperative staff (e.g. secretary) minting accounts', async () => {
    const service = buildService();
    await expect(
      service.createStaffAccount(officerDto, UserRole.MAMCOS_SECRETARY),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.createStaffAccount(officerDto, UserRole.FIELD_OFFICER),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.createStaffAccount(officerDto, UserRole.FARMER),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a plain ADMIN creating SUPER_ADMIN/ADMIN accounts', async () => {
    const service = buildService();
    for (const role of [UserRole.SUPER_ADMIN, UserRole.ADMIN]) {
      await expect(
        service.createStaffAccount(
          { ...officerDto, role } as any,
          UserRole.ADMIN,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  it('rejects an unknown or inactive custom role before creating', async () => {
    const service = buildService();
    await expect(
      service.createStaffAccount(
        { ...officerDto, roleId: 'missing-role' } as any,
        UserRole.SUPER_ADMIN,
      ),
    ).rejects.toThrow('Select an active, non-system role created by Super Admin');
  });

  it('rejects a plain ADMIN attaching a custom role at creation', async () => {
    const service = buildService();
    await expect(
      service.createStaffAccount(
        { ...officerDto, roleId: 'role-1' } as any,
        UserRole.ADMIN,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('Account creation uses roles selected by Super Admin', () => {
  function setup(customRole: any) {
    const user = { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'created-user', ...data })) };
    const prisma = { role: { findUnique: jest.fn().mockResolvedValue(customRole) }, user, $transaction: jest.fn(async (fn) => fn({ user })) };
    return { service: new AuthService(prisma as any, {} as any, {} as any), user };
  }
  it('creates a general account with the selected role and no inherited Admin privilege', async () => {
    const { service, user } = setup({ id: 'role-1', isActive: true, isSystem: false, systemRole: null });
    await service.createStaffAccount({ ...officerDto, roleId: 'role-1' }, UserRole.SUPER_ADMIN);
    expect(user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ role: UserRole.CUSTOM, roleId: 'role-1' }) }));
  });
  it('creates Super Admin only when explicitly selected', async () => {
    const { service, user } = setup(null);
    await service.createStaffAccount({ ...officerDto, role: UserRole.SUPER_ADMIN, roleId: undefined }, UserRole.SUPER_ADMIN);
    expect(user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ role: UserRole.SUPER_ADMIN }) }));
  });
  it('rejects built-in fallbacks, missing assignments, inactive and system role records', async () => {
    for (const role of [null, { isActive: false }, { isActive: true, isSystem: true }]) {
      const { service, user } = setup(role);
      await expect(service.createStaffAccount(officerDto, UserRole.SUPER_ADMIN)).rejects.toThrow();
      await expect(service.createStaffAccount({ ...officerDto, roleId: undefined }, UserRole.SUPER_ADMIN)).rejects.toThrow('A custom role is required');
      await expect(service.createStaffAccount({ ...officerDto, role: UserRole.ADMIN }, UserRole.SUPER_ADMIN)).rejects.toThrow('Select a custom role');
      expect(user.create).not.toHaveBeenCalled();
    }
  });
});
