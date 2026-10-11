import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { UpdateRiceProtocolDto } from './dto/rice-protocol.dto';
import { RiceProtocolsService } from './rice-protocols.service';

const superAdmin = {
  id: 's',
  role: UserRole.SUPER_ADMIN,
  mamcosId: null,
} as any;
const coopUser = (mamcosId = 'm1') =>
  ({ id: 'u', role: UserRole.CUSTOM, mamcosId }) as any;

const tasks = (keys: string[]) =>
  keys.map((key) => ({
    key,
    title: key,
    guidance: 'g',
    daysFromPlanting: 10,
  })) as any;
const REQUIRED = ['harvest', 'drying', 'bagging'];

function setup(opts: { protocol?: any; max?: number } = {}) {
  const create = jest.fn(async ({ data }) => ({ id: 'new', ...data }));
  const update = jest.fn();
  const prisma: any = {
    riceProtocol: {
      findUnique: jest.fn().mockResolvedValue(opts.protocol ?? null),
      findFirst: jest.fn().mockResolvedValue(opts.protocol ?? null),
      aggregate: jest
        .fn()
        .mockResolvedValue({ _max: { version: opts.max ?? 1 } }),
      create,
      update,
    },
    cropCycle: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    riceCalendarTask: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn(async (ops) => Promise.all(ops)),
  };
  return {
    service: new RiceProtocolsService(prisma, {} as any),
    prisma,
    create,
  };
}

describe('Platform rice calendar', () => {
  it('only Super Admin changes it; a cooperative user cannot', async () => {
    const protocol = { id: 'p', mamcosId: null, isActive: true, version: 1 };
    const { service } = setup({ protocol });
    await expect(
      service.update(
        'p',
        { name: 'x', taskDefinitions: tasks(REQUIRED) } as any,
        coopUser(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.bootstrapPlatform(coopUser())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.platformVersions(coopUser())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('Super Admin saves a new platform version, numbered among platform versions only', async () => {
    const protocol = { id: 'p', mamcosId: null, isActive: true, version: 2 };
    const { service, prisma, create } = setup({ protocol, max: 2 });
    await service.update(
      'p',
      {
        name: 'Our calendar',
        taskDefinitions: tasks([...REQUIRED, 'custom_step']),
      } as any,
      superAdmin,
    );
    expect(prisma.riceProtocol.aggregate).toHaveBeenCalledWith({
      where: { mamcosId: null, varietyId: null },
      _max: { version: true },
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ mamcosId: null, version: 3 }),
    });
    expect(prisma.riceProtocol.update).toHaveBeenCalledWith({
      where: { id: 'p' },
      data: { isActive: false },
    });
  });

  it('refuses to drop the tasks the harvest quality check depends on, or duplicate keys', async () => {
    const protocol = { id: 'p', mamcosId: null, isActive: true, version: 1 };
    const { service, create } = setup({ protocol });
    await expect(
      service.update(
        'p',
        { name: 'x', taskDefinitions: tasks(['harvest', 'drying']) } as any,
        superAdmin,
      ),
    ).rejects.toThrow('bagging');
    await expect(
      service.update(
        'p',
        { name: 'x', taskDefinitions: tasks([...REQUIRED, 'harvest']) } as any,
        superAdmin,
      ),
    ).rejects.toThrow('unique key');
    expect(create).not.toHaveBeenCalled();
  });

  it('only the active version can be edited', async () => {
    const { service } = setup({
      protocol: { id: 'p', mamcosId: null, isActive: false, version: 1 },
    });
    await expect(
      service.update(
        'p',
        { name: 'x', taskDefinitions: tasks(REQUIRED) } as any,
        superAdmin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('Cooperative calendars stay in the cooperative', () => {
  it("a cooperative edits its own calendar but not another cooperative's", async () => {
    const own = { id: 'c', mamcosId: 'm1', isActive: true, version: 1 };
    const a = setup({ protocol: own });
    await a.service.update(
      'c',
      { name: 'Ours', taskDefinitions: tasks(REQUIRED) } as any,
      coopUser('m1'),
    );
    expect(a.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ mamcosId: 'm1' }),
    });
    const b = setup({ protocol: own });
    await expect(
      b.service.update(
        'c',
        { name: 'x', taskDefinitions: tasks(REQUIRED) } as any,
        coopUser('m2'),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      b.service.getForMamcos('m1', coopUser('m2')),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      b.service.upcoming('m1', coopUser('m2')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('Crop-cycle task schedules come from the platform calendar', () => {
  it('uses the platform calendar, never a cooperative one, and schedules for every farm', async () => {
    const platform = {
      id: 'pl',
      mamcosId: null,
      isActive: true,
      version: 4,
      taskDefinitions: tasks(REQUIRED),
    };
    const { service, prisma } = setup({ protocol: platform });
    prisma.cropCycle.findUnique.mockResolvedValue({
      plantingDate: new Date('2026-01-01'),
      expectedHarvest: new Date('2026-05-01'),
      riceVarietyId: null,
      variety: null,
    });
    await service.scheduleForCycle('cycle-1');
    expect(prisma.riceProtocol.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { mamcosId: null, varietyId: null, isActive: true },
      }),
    );
    expect(prisma.riceCalendarTask.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          cropCycleId: 'cycle-1',
          protocolVersion: 4,
          taskKey: 'harvest',
        }),
      ]),
    });
  });

  it('schedules nothing until Super Admin has created the platform calendar', async () => {
    const { service, prisma } = setup({ protocol: null });
    prisma.cropCycle.findUnique.mockResolvedValue({
      plantingDate: new Date('2026-01-01'),
      expectedHarvest: null,
      riceVarietyId: null,
      variety: null,
    });
    expect(await service.scheduleForCycle('cycle-1')).toMatchObject({
      created: 0,
    });
    expect(prisma.riceCalendarTask.createMany).not.toHaveBeenCalled();
  });

  it('platformCalendar returns the active tasks with stage names for the mobile app', async () => {
    const platform = {
      id: 'pl',
      name: 'Mbalari',
      mamcosId: null,
      isActive: true,
      version: 1,
      updatedAt: new Date(),
      taskDefinitions: tasks(REQUIRED),
    };
    const { service } = setup({ protocol: platform });
    const cal = await service.platformCalendar();
    expect(cal?.tasks.map((t: any) => t.key)).toEqual(REQUIRED);
    expect(cal?.tasks[0].stageName).toBe('Harvesting');
    const none = await setup({ protocol: null }).service.platformCalendar();
    expect(none).toBeNull();
  });
});

describe("A cooperative's upcoming view", () => {
  it("lays its own calendar over members' cycles: due soon and overdue, nothing far away", async () => {
    const day = 86_400_000;
    const planting = new Date(Date.now() - 20 * day);
    const own = {
      id: 'c',
      mamcosId: 'm1',
      isActive: true,
      version: 1,
      taskDefinitions: [
        {
          key: 'overdue_step',
          title: 'Overdue',
          guidance: 'g',
          daysFromPlanting: 10,
        },
        {
          key: 'soon_step',
          title: 'Soon',
          guidance: 'g',
          daysFromPlanting: 30,
        },
        { key: 'far_step', title: 'Far', guidance: 'g', daysFromPlanting: 200 },
      ],
    };
    const { service, prisma } = setup({ protocol: own });
    prisma.cropCycle.findMany.mockResolvedValue([
      {
        id: 'cy',
        season: '2026',
        plantingDate: planting,
        expectedHarvest: null,
        farm: { farmCode: 'F1' },
        farmer: { firstName: 'A', lastName: 'B' },
      },
    ]);
    const rows = await service.upcoming('m1', coopUser('m1'));
    expect(rows.map((r) => r.taskKey)).toEqual(['overdue_step', 'soon_step']);
    expect(rows[0].overdue).toBe(true);
    expect(rows[1].overdue).toBe(false);
  });
});

describe('Task activity type', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const body = (activityType?: string) => ({
    name: 'x',
    taskDefinitions: [
      {
        key: 'harvest',
        title: 'Harvest',
        guidance: 'g',
        daysFromHarvest: 0,
        ...(activityType !== undefined ? { activityType } : {}),
      },
    ],
  });
  const meta = { type: 'body' as const, metatype: UpdateRiceProtocolDto };

  it('accepts a real activity type, or none', async () => {
    await expect(
      pipe.transform(body('HARVESTING'), meta),
    ).resolves.toBeDefined();
    await expect(pipe.transform(body(), meta)).resolves.toBeDefined();
  });

  it('rejects free text that is not an activity type (it would break scheduling and completion)', async () => {
    await expect(
      pipe.transform(body('Dig the soil'), meta),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
