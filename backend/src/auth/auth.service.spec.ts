import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthService } from './auth.service';

const actor = (role: UserRole, extra: Record<string, unknown> = {}) =>
  ({ id: 'actor-1', role, customRole: null, ...extra }) as any;

/** A cooperative admin: tenant-scoped, holding the given grants. */
const coopAdmin = (grants: [string, string][], mamcosId = 'mamcos-1') =>
  actor(UserRole.CUSTOM, {
    mamcosId,
    roleId: 'coop-admin-role',
    customRole: { isActive: true, isSystem: false, permissions: grants.map(([resource, action]) => ({ action, resource: { key: resource } })) },
  });

function buildService() {
  const prisma = {
    role: { findUnique: jest.fn().mockResolvedValue(null) },
    user: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  return new AuthService(prisma as any, {} as any, {} as any, {} as any);
}

const officerDto = {
  phone: '+255700000001',
  password: 'SecurePass123!',
  roleId: 'custom-officer',
  firstName: 'Field',
  lastName: 'Officer',
  mamcosId: 'mamcos-1',
} as any;

const platformDto = { ...officerDto, mamcosId: undefined } as any;

describe('AuthService.createStaffAccount platform-level creation', () => {
  it('rejects cooperative staff (e.g. secretary) minting accounts', async () => {
    const service = buildService();
    await expect(
      service.createStaffAccount(officerDto, actor(UserRole.MAMCOS_SECRETARY)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.createStaffAccount(officerDto, actor(UserRole.FIELD_OFFICER)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.createStaffAccount(officerDto, actor(UserRole.FARMER)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a plain ADMIN creating SUPER_ADMIN/ADMIN accounts', async () => {
    const service = buildService();
    for (const role of [UserRole.SUPER_ADMIN, UserRole.ADMIN]) {
      await expect(
        service.createStaffAccount(
          { ...officerDto, role } as any,
          actor(UserRole.ADMIN),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  it('rejects an unknown or inactive custom role before creating', async () => {
    const service = buildService();
    await expect(
      service.createStaffAccount(
        { ...officerDto, mamcosId: undefined, roleId: 'missing-role' } as any,
        actor(UserRole.SUPER_ADMIN),
      ),
    ).rejects.toThrow('Select an active, non-system role');
  });

  it('rejects a plain ADMIN attaching a custom role at creation', async () => {
    const service = buildService();
    await expect(
      service.createStaffAccount(
        { ...officerDto, roleId: 'role-1' } as any,
        actor(UserRole.ADMIN),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('Account creation uses roles selected by Super Admin', () => {
  function setup(customRole: any) {
    const user = { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'created-user', ...data })) };
    const prisma = { role: { findUnique: jest.fn().mockResolvedValue(customRole) }, mamcos: { findUnique: jest.fn().mockResolvedValue({ id: 'mamcos-1' }) }, user, $transaction: jest.fn(async (fn) => fn({ user })) };
    return { service: new AuthService(prisma as any, {} as any, {} as any, {} as any), user };
  }
  it('creates a general account with the selected role and no inherited Admin privilege', async () => {
    const { service, user } = setup({ id: 'role-1', isActive: true, isSystem: false, systemRole: null, mamcosId: null });
    await service.createStaffAccount({ ...platformDto, roleId: 'role-1' }, actor(UserRole.SUPER_ADMIN));
    expect(user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ role: UserRole.CUSTOM, roleId: 'role-1' }) }));
  });
  it('Super Admin cannot create cooperative staff: no staff type, AMCOS, or cooperative role', async () => {
    const { service, user } = setup({ id: 'role-1', isActive: true, isSystem: false, systemRole: null, mamcosId: null });
    await expect(service.createStaffAccount({ ...platformDto, roleId: 'role-1', staffType: 'MAMCOS_SECRETARY' }, actor(UserRole.SUPER_ADMIN))).rejects.toThrow('platform accounts only');
    await expect(service.createStaffAccount({ ...platformDto, roleId: 'role-1', mamcosId: 'mamcos-1' }, actor(UserRole.SUPER_ADMIN))).rejects.toThrow('platform accounts only');
    const coop = setup({ id: 'role-2', isActive: true, isSystem: false, systemRole: null, mamcosId: 'mamcos-1' });
    await expect(coop.service.createStaffAccount({ ...platformDto, roleId: 'role-2' }, actor(UserRole.SUPER_ADMIN))).rejects.toThrow('platform role');
    expect(user.create).not.toHaveBeenCalled();
    expect(coop.user.create).not.toHaveBeenCalled();
  });
  it('creates Super Admin only when explicitly selected', async () => {
    const { service, user } = setup(null);
    await service.createStaffAccount({ ...platformDto, role: UserRole.SUPER_ADMIN, roleId: undefined }, actor(UserRole.SUPER_ADMIN));
    expect(user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ role: UserRole.SUPER_ADMIN }) }));
  });
  it('rejects built-in fallbacks, missing assignments, inactive and system role records', async () => {
    for (const role of [null, { isActive: false }, { isActive: true, isSystem: true }]) {
      const { service, user } = setup(role);
      await expect(service.createStaffAccount(platformDto, actor(UserRole.SUPER_ADMIN))).rejects.toThrow();
      await expect(service.createStaffAccount({ ...platformDto, roleId: undefined }, actor(UserRole.SUPER_ADMIN))).rejects.toThrow('A custom role is required');
      await expect(service.createStaffAccount({ ...platformDto, role: UserRole.ADMIN }, actor(UserRole.SUPER_ADMIN))).rejects.toThrow('Select a custom role');
      expect(user.create).not.toHaveBeenCalled();
    }
  });
});

describe('Super Admin creating staff inside a chosen cooperative', () => {
  function setup(customRole: any) {
    const user = { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'created-user', ...data })) };
    const mamcosStaff = { create: jest.fn().mockResolvedValue({}), findFirst: jest.fn().mockResolvedValue(null), count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) };
    const prisma = { role: { findUnique: jest.fn().mockResolvedValue(customRole) }, mamcos: { findUnique: jest.fn().mockResolvedValue({ id: 'mamcos-1' }) }, user, mamcosStaff, $transaction: jest.fn(async (fn) => fn({ user, mamcosStaff })) };
    const service = new AuthService(prisma as any, {} as any, {} as any, {} as any);
    jest.spyOn(service as any, 'generateEmployeeCode').mockResolvedValue('FO-0001');
    return { service, user };
  }
  const coopRole = { id: 'fo-role', isActive: true, isSystem: false, systemRole: 'CUSTOM', mamcosId: 'mamcos-1', permissions: [] };

  it('puts the account in that cooperative, using that cooperative\'s role', async () => {
    const { service, user } = setup(coopRole);
    await service.createStaffAccount({ ...platformDto, roleId: 'fo-role', staffType: 'FIELD_OFFICER' as any }, actor(UserRole.SUPER_ADMIN), { onBehalfOfMamcosId: 'mamcos-1' });
    expect(user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ role: 'FIELD_OFFICER', mamcosId: 'mamcos-1', roleId: 'fo-role' }) }));
  });
  it('still refuses a role from a different cooperative', async () => {
    const { service, user } = setup({ ...coopRole, mamcosId: 'mamcos-2' });
    await expect(service.createStaffAccount({ ...platformDto, roleId: 'fo-role', staffType: 'FIELD_OFFICER' as any }, actor(UserRole.SUPER_ADMIN), { onBehalfOfMamcosId: 'mamcos-1' })).rejects.toThrow('role from your cooperative');
    expect(user.create).not.toHaveBeenCalled();
  });
  it('is ignored for anyone who is not Super Admin', async () => {
    const { service, user } = setup(coopRole);
    await expect(service.createStaffAccount({ ...platformDto, roleId: 'fo-role' }, coopAdmin([['users', 'CREATE']]), { onBehalfOfMamcosId: 'mamcos-9' })).resolves.toBeDefined();
    expect(user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ mamcosId: 'mamcos-1' }) }));
  });
});

describe('Cooperative-admin delegation', () => {
  const role = (over: Record<string, unknown> = {}) => ({
    id: 'staff-role', isActive: true, isSystem: false, systemRole: 'CUSTOM', mamcosId: 'mamcos-1',
    permissions: [{ action: 'VIEW', resource: { key: 'farmers' } }], ...over,
  });
  function setup(found: any) {
    const user = { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'new-user', ...data })) };
    const prisma = {
      role: { findUnique: jest.fn().mockResolvedValue(found) },
      mamcos: { findUnique: jest.fn().mockResolvedValue({ id: 'mamcos-1' }) },
      user,
      $transaction: jest.fn(async (fn) => fn({ user })),
    };
    return { service: new AuthService(prisma as any, {} as any, {} as any, {} as any), user };
  }
  const dto = { ...platformDto, roleId: 'staff-role', mamcosId: undefined };
  const admin = () => coopAdmin([['users', 'CREATE'], ['farmers', 'VIEW']]);

  it('creates the account inside the admin\'s own AMCOS', async () => {
    const { service, user } = setup(role());
    await service.createStaffAccount(dto, admin());
    expect(user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ mamcosId: 'mamcos-1', roleId: 'staff-role' }) }));
  });
  it('refuses a role that belongs to another cooperative or to the platform', async () => {
    for (const mamcosId of ['mamcos-2', null]) {
      const { service, user } = setup(role({ mamcosId }));
      await expect(service.createStaffAccount(dto, admin())).rejects.toBeInstanceOf(BadRequestException);
      expect(user.create).not.toHaveBeenCalled();
    }
  });
  it('refuses creating an account in another cooperative', async () => {
    const { service } = setup(role());
    await expect(service.createStaffAccount({ ...dto, mamcosId: 'mamcos-2' }, admin())).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('refuses a role that grants more than the admin holds', async () => {
    const { service, user } = setup(role({ permissions: [{ action: 'DELETE', resource: { key: 'farmers' } }] }));
    await expect(service.createStaffAccount(dto, admin())).rejects.toThrow('cannot grant permissions you do not hold');
    expect(user.create).not.toHaveBeenCalled();
  });
  it('never lets a cooperative admin create a Super Admin', async () => {
    const { service } = setup(null);
    await expect(service.createStaffAccount({ ...dto, role: UserRole.SUPER_ADMIN, roleId: undefined }, admin())).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('rejects non-super accounts that belong to no cooperative', async () => {
    const { service } = setup(role());
    await expect(service.createStaffAccount(dto, actor(UserRole.CUSTOM))).rejects.toBeInstanceOf(ForbiddenException);
  });
});
