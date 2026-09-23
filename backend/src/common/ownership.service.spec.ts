import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { OwnershipService } from './ownership.service';

describe('OwnershipService.assertFarmAccess', () => {
  const farmerUser = { id: 'user-1', role: UserRole.FARMER };
  const farmId = 'farm-1';

  it('allows a farmer with a verified active-season assignment', async () => {
    const prisma = {
      farmer: { findUnique: jest.fn().mockResolvedValue({ id: 'farmer-1' }) },
      seasonalFarmAssignment: {
        findFirst: jest.fn().mockResolvedValue({ id: 'asg-1' }),
      },
      farm: { findUnique: jest.fn() },
    };
    const service = new OwnershipService(prisma as any);

    await expect(service.assertFarmAccess(farmerUser, farmId)).resolves.toBeUndefined();
    expect(prisma.farm.findUnique).not.toHaveBeenCalled();
  });

  it('allows the registered farm owner without an assignment (bootstrap)', async () => {
    const prisma = {
      farmer: { findUnique: jest.fn().mockResolvedValue({ id: 'farmer-1' }) },
      seasonalFarmAssignment: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      farm: { findUnique: jest.fn().mockResolvedValue({ farmerId: 'farmer-1' }) },
    };
    const service = new OwnershipService(prisma as any);

    await expect(service.assertFarmAccess(farmerUser, farmId)).resolves.toBeUndefined();
  });

  it('rejects a farmer with neither assignment nor ownership metadata', async () => {
    const prisma = {
      farmer: { findUnique: jest.fn().mockResolvedValue({ id: 'farmer-1' }) },
      seasonalFarmAssignment: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      farm: { findUnique: jest.fn().mockResolvedValue({ farmerId: 'other-farmer' }) },
    };
    const service = new OwnershipService(prisma as any);

    await expect(service.assertFarmAccess(farmerUser, farmId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows privileged staff without assignment checks', async () => {
    const prisma = {
      farmer: { findUnique: jest.fn() },
      seasonalFarmAssignment: { findFirst: jest.fn() },
      farm: { findUnique: jest.fn() },
    };
    const service = new OwnershipService(prisma as any);

    await expect(
      service.assertFarmAccess(
        { id: 'staff-1', role: UserRole.FIELD_OFFICER, customRole: { isActive: true, permissions: [{ action: 'VIEW', resource: { key: 'farms' } }] } },
        farmId,
      ),
    ).resolves.toBeUndefined();
    expect(prisma.farmer.findUnique).not.toHaveBeenCalled();
  });
});

describe('OwnershipService.passesMatrix', () => {
  const service = new OwnershipService({} as any);

  it('passes Super Admin without consulting grants', () => {
    for (const role of [UserRole.SUPER_ADMIN]) {
      expect(
        service.passesMatrix({ id: 'u', role }, 'inventory', 'CREATE'),
      ).toBe(true);
    }
  });

  it('requires a matching grant for custom-role users', () => {
    const granted = {
      id: 'u',
      role: UserRole.FIELD_OFFICER,
      customRole: {
        isActive: true,
        permissions: [
          { action: 'CREATE', resource: { key: 'inventory' } },
        ],
      },
    };
    expect(service.passesMatrix(granted, 'inventory', 'CREATE')).toBe(true);
    expect(service.passesMatrix(granted, 'inventory', 'DELETE')).toBe(false);
    expect(service.passesMatrix(granted, 'reports', 'VIEW')).toBe(false);
  });

  it('denies inactive custom roles', () => {
    expect(
      service.passesMatrix(
        {
          id: 'u',
          role: UserRole.FIELD_OFFICER,
          customRole: {
            isActive: false,
            permissions: [
              { action: 'CREATE', resource: { key: 'inventory' } },
            ],
          },
        },
        'inventory',
        'CREATE',
      ),
    ).toBe(false);
  });

  it('denies plain enum users without grants', () => {
    expect(
      service.passesMatrix(
        { id: 'u', role: UserRole.FIELD_OFFICER, customRole: null },
        'inventory',
        'CREATE',
      ),
    ).toBe(false);
    expect(
      service.passesMatrix({ id: 'u', role: UserRole.FARMER }, 'anything', 'DELETE'),
    ).toBe(false);
  });
});
