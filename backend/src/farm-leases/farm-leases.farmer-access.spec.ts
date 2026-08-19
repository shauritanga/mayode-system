import { FarmLeasesService } from './farm-leases.service';
import { UserRole } from '@prisma/client';

/**
 * P1-B1: Farmers must be able to read ownership + seasonal assignments for
 * farms they can access (assertFarmAccess), so the mobile farm detail screen
 * does not falsely show "confirm ownership" after a 403.
 */
describe('FarmLeasesService farmer farm reads (P1-B1)', () => {
  const farmerUser = { id: 'user-1', role: UserRole.FARMER };
  const farmId = 'farm-1';

  function buildService(overrides?: {
    ownerships?: any[];
    assignments?: any[];
    assertFarmAccess?: jest.Mock;
  }) {
    const ownership = {
      assertFarmAccess:
        overrides?.assertFarmAccess ?? jest.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      farmOwnership: {
        findMany: jest.fn().mockResolvedValue(overrides?.ownerships ?? []),
      },
      seasonalFarmAssignment: {
        findMany: jest.fn().mockResolvedValue(overrides?.assignments ?? []),
      },
    };
    const service = new FarmLeasesService(
      prisma as any,
      ownership as any,
      {} as any, // notifications
      {} as any, // sms
      {} as any, // disputes
    );
    return { service, ownership, prisma };
  }

  it('loads ownership for a farmer after assertFarmAccess succeeds', async () => {
    const rows = [
      { id: 'own-1', farmId, confirmationStatus: 'VERIFIED' },
    ];
    const { service, ownership, prisma } = buildService({ ownerships: rows });

    const result = await service.findOwnershipForFarm(farmId, farmerUser);

    expect(ownership.assertFarmAccess).toHaveBeenCalledWith(farmerUser, farmId);
    expect(prisma.farmOwnership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { farmId } }),
    );
    expect(result).toEqual(rows);
  });

  it('loads seasonal assignments for a farmer after assertFarmAccess succeeds', async () => {
    const rows = [
      { id: 'asg-1', farmId, status: 'VERIFIED', assignmentType: 'OWNER_OPERATED' },
    ];
    const { service, ownership, prisma } = buildService({ assignments: rows });

    const result = await service.findAssignmentsForFarm(farmId, farmerUser);

    expect(ownership.assertFarmAccess).toHaveBeenCalledWith(farmerUser, farmId);
    expect(prisma.seasonalFarmAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { farmId } }),
    );
    expect(result).toEqual(rows);
  });

  it('does not query ownership when assertFarmAccess rejects', async () => {
    const assertFarmAccess = jest
      .fn()
      .mockRejectedValue(new Error('forbidden'));
    const { service, prisma } = buildService({ assertFarmAccess });

    await expect(
      service.findOwnershipForFarm(farmId, farmerUser),
    ).rejects.toThrow('forbidden');
    expect(prisma.farmOwnership.findMany).not.toHaveBeenCalled();
  });
});
