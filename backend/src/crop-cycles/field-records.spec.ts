import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { ActivityType } from '@prisma/client';
import { CropCyclesService } from './crop-cycles.service';
import {
  CreateActivityLogDto,
  UpdateCropCycleDto,
} from './dto/crop-cycles.dto';
import { CreateInputCostDto } from '../finance/dto/finance.dto';

const activity = {
  cropCycleId: 'cycle',
  activityType: ActivityType.HARVESTING,
  activityDate: '2026-05-01',
};
function setup() {
  const cycle = {
    id: 'cycle',
    farmerId: 'farmer',
    farmId: 'farm',
    farm: { farmCode: 'F1' },
    plantingDate: new Date('2026-06-01'),
    harvestDate: null,
    expectedHarvest: new Date('2026-09-01'),
    activities: [] as any[],
  };
  const prisma = {
    cropCycle: {
      findUnique: jest.fn().mockResolvedValue(cycle),
      findUniqueOrThrow: jest.fn().mockResolvedValue(cycle),
      update: jest.fn(),
    },
    activityLog: {
      create: jest.fn().mockResolvedValue({ id: 'activity' }),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    mamcosStaff: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const service = new CropCyclesService(
    prisma as any,
    { assertFarmAccess: jest.fn() } as any,
    { log: jest.fn() } as any,
    {} as any,
  );
  return { service, prisma, cycle };
}
describe('Field record validation', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  it.each([{ laborWorkers: -1 }, { laborWorkers: 1.5 }, { laborHours: -2 }])(
    'rejects invalid labor %j',
    async (extra) => {
      await expect(
        pipe.transform(
          { ...activity, ...extra },
          { type: 'body', metatype: CreateActivityLogDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
  it('rejects negative yield and expenses', async () => {
    await expect(
      pipe.transform(
        { actualYieldKg: -1 },
        { type: 'body', metatype: UpdateCropCycleDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      pipe.transform(
        {
          cropCycleId: 'cycle',
          category: 'SEEDS',
          itemName: 'Rice',
          totalCost: -5,
          dateIncurred: '2026-06-01',
        },
        { type: 'body', metatype: CreateInputCostDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rejects harvesting before the cycle planting date', async () => {
    const { service, prisma } = setup();
    await expect(
      service.logActivity({ id: 'user' } as any, activity),
    ).rejects.toThrow('Harvest date');
    expect(prisma.activityLog.create).not.toHaveBeenCalled();
  });
  it('rejects planting after a previously logged harvest', async () => {
    const { service, cycle } = setup();
    cycle.activities.push({
      id: 'old',
      activityType: 'HARVESTING',
      activityDate: new Date('2026-07-01'),
    });
    await expect(
      service.logActivity({ id: 'user' } as any, {
        ...activity,
        activityType: ActivityType.PLANTING,
        activityDate: '2026-08-01',
      }),
    ).rejects.toThrow('Harvest date');
  });
  it('checks chronology when editing an activity', async () => {
    const { service, prisma } = setup();
    prisma.activityLog.findUnique.mockResolvedValue({
      ...activity,
      id: 'old',
      activityDate: new Date('2026-08-01'),
    });
    await expect(
      service.updateActivityLog('old', { activityDate: '2026-04-01' }),
    ).rejects.toThrow('Harvest date');
    expect(prisma.activityLog.update).not.toHaveBeenCalled();
  });
  it('rejects malformed input quantities', async () => {
    const { service } = setup();
    await expect(
      service.logActivity({ id: 'user' } as any, {
        ...activity,
        activityDate: '2026-08-01',
        inputsUsed: { items: [{ name: 'Seed', quantity: -1, unit: 'kg' }] },
      }),
    ).rejects.toThrow('Each input');
  });
  it('stores structured inputs and accepts harvest on the planting day', async () => {
    const { service, prisma } = setup();
    const inputsUsed = { items: [{ name: 'Seed', quantity: 20, unit: 'kg' }] };
    await service.logActivity({ id: 'user' } as any, {
      ...activity,
      activityDate: '2026-06-01',
      inputsUsed,
      laborWorkers: 0,
    });
    expect(prisma.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ inputsUsed, laborWorkers: 0 }),
      }),
    );
  });
  it('rejects moving the expected harvest before planting', async () => {
    const { service, prisma } = setup();
    await expect(
      service.update('cycle', { expectedHarvest: '2026-05-01' }, {
        id: 'user',
      } as any),
    ).rejects.toThrow('Expected harvest');
    expect(prisma.cropCycle.update).not.toHaveBeenCalled();
  });
});
