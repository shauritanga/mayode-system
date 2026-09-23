import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { InventoryService } from './inventory.service';
import { OwnershipService } from '../common/ownership.service';

const CYCLE = {
  id: 'cycle-1',
  farmId: 'farm-1',
  farmerId: 'farmer-1',
  farm: { id: 'farm-1', farmCode: 'FP-01', mamcosId: 'mamcos-1' },
};

function buildService(cycle: any = CYCLE) {
  const prisma = {
    farmer: { findUnique: jest.fn().mockResolvedValue({ id: 'farmer-1' }) },
    seasonalFarmAssignment: {
      findFirst: jest.fn().mockResolvedValue({ id: 'asg-1' }),
    },
    farm: { findUnique: jest.fn() },
    cropCycle: { findUnique: jest.fn().mockResolvedValue(cycle) },
  };
  const ownership = new OwnershipService(prisma as any);
  const service = new InventoryService(
    prisma as any,
    {} as any,
    ownership,
    {} as any,
  );
  const receive = jest
    .spyOn(service, 'receiveInventory')
    .mockResolvedValue({ id: 'rec-1' } as any);
  return { service, prisma, receive };
}

const dto = { cropCycleId: 'cycle-1', weightKg: 100 } as any;
const grant = (resource: string, action: string) => ({
  isActive: true,
  permissions: [{ action, resource: { key: resource } }],
});

describe('InventoryService.reportMyDelivery', () => {
  it('lets a farmer report their own cycle', async () => {
    const { service, receive } = buildService();
    await service.reportMyDelivery(
      { id: 'user-1', role: UserRole.FARMER },
      dto,
    );
    expect(receive).toHaveBeenCalledWith(
      expect.objectContaining({ farmerId: 'farmer-1', cropCycleId: 'cycle-1' }),
    );
  });

  it('rejects a farmer reporting another farmer’s cycle', async () => {
    const { service } = buildService({ ...CYCLE, farmerId: 'farmer-9' });
    await expect(
      service.reportMyDelivery({ id: 'user-1', role: UserRole.FARMER }, dto),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns 404 for a missing cycle', async () => {
    const { service } = buildService(null);
    await expect(
      service.reportMyDelivery({ id: 'user-1', role: UserRole.FARMER }, dto),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lets grant-holding staff record on the cycle farmer’s behalf', async () => {
    const { service, receive } = buildService();
    await service.reportMyDelivery(
      {
        id: 'officer-1',
        role: UserRole.FIELD_OFFICER,
        customRole: grant('inventory', 'CREATE'),
      },
      dto,
    );
    expect(receive).toHaveBeenCalledWith(
      expect.objectContaining({
        farmerId: 'farmer-1',
        warehouseLocation: expect.stringContaining('Staff-recorded'),
      }),
    );
  });

  it('denies staff without the inventory CREATE grant', async () => {
    const { service, receive } = buildService();
    await expect(
      service.reportMyDelivery(
        {
          id: 'officer-1',
          role: UserRole.FIELD_OFFICER,
          customRole: grant('inventory', 'VIEW'),
        },
        dto,
      ),
    ).rejects.toThrow('Missing permission: CREATE on inventory');
    expect(receive).not.toHaveBeenCalled();
  });

  it('denies staff when the cycle has no farmer assigned', async () => {
    const { service } = buildService({ ...CYCLE, farmerId: null });
    await expect(
      service.reportMyDelivery(
        {
          id: 'officer-1',
          role: UserRole.FIELD_OFFICER,
          customRole: grant('inventory', 'CREATE'),
        },
        dto,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
