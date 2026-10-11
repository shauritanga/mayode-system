import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { RiceProtocolsService } from './rice-protocols.service';

const DAY = 86_400_000;
const superAdmin = {
  id: 's',
  role: UserRole.SUPER_ADMIN,
  mamcosId: null,
} as any;
const staff = { id: 'st', role: UserRole.FIELD_OFFICER, mamcosId: 'm1' } as any;
const farmer = { id: 'f', role: UserRole.FARMER } as any;

const def = (
  key: string,
  days: number,
  from: 'planting' | 'harvest' = 'planting',
  extra: object = {},
) => ({
  key,
  title: `${key} title`,
  guidance: `${key} guidance`,
  ...(from === 'planting'
    ? { daysFromPlanting: days }
    : { daysFromHarvest: days }),
  ...extra,
});
const REQUIRED = [
  def('harvest', 0, 'harvest'),
  def('drying', 2, 'harvest'),
  def('bagging', 7, 'harvest'),
];

/** SARO 5 matures in 120 days, Super in 135: different timing and a different set of activities. */
const SARO = { id: 'v-saro', name: 'SARO 5', maturityDays: 120 };
const SUPER = { id: 'v-super', name: 'Super', maturityDays: 135 };

function world(opts: { cycle?: Record<string, unknown>; tasks?: any[] } = {}) {
  const protocols: any[] = [
    {
      id: 'p-default',
      mamcosId: null,
      varietyId: null,
      isActive: true,
      version: 1,
      name: 'Default',
      taskDefinitions: [def('plant', 0), def('weed', 30), ...REQUIRED],
    },
    {
      id: 'p-saro',
      mamcosId: null,
      varietyId: 'v-saro',
      isActive: true,
      version: 3,
      name: 'SARO',
      taskDefinitions: [
        def('plant', 0),
        def('weed', 25),
        def('top_dress', 40),
        ...REQUIRED,
      ],
    },
  ];
  const cycle: any = {
    id: 'c1',
    plantingDate: new Date('2026-01-10T07:00:00Z'),
    expectedHarvest: null,
    riceVarietyId: 'v-saro',
    variety: SARO,
    ...opts.cycle,
  };
  const tasks: any[] = opts.tasks ?? [];
  let n = 0;
  const prisma: any = {
    riceProtocol: {
      findFirst: jest.fn(
        async ({ where }: any) =>
          protocols.find(
            (p) =>
              p.mamcosId === where.mamcosId &&
              p.varietyId === where.varietyId &&
              p.isActive === where.isActive,
          ) ?? null,
      ),
      findMany: jest.fn(),
      findUnique: jest.fn(
        async ({ where }: any) =>
          protocols.find((p) => p.id === where.id) ?? null,
      ),
      aggregate: jest.fn(async ({ where }: any) => ({
        _max: {
          version:
            Math.max(
              0,
              ...protocols
                .filter(
                  (p) =>
                    p.mamcosId === where.mamcosId &&
                    p.varietyId === where.varietyId,
                )
                .map((p) => p.version),
            ) || null,
        },
      })),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `p-${++n}`, isActive: true, ...data };
        protocols.push(row);
        return row;
      }),
      update: jest.fn(),
    },
    riceVariety: {
      findUnique: jest.fn(
        async ({ where }: any) =>
          [SARO, SUPER].find((v) => v.id === where.id) ?? null,
      ),
    },
    cropCycle: {
      findUnique: jest.fn(async () => cycle),
      update: jest.fn(async ({ data }: any) => {
        Object.assign(cycle, data);
        return cycle;
      }),
    },
    riceCalendarTask: {
      findMany: jest.fn(async () => tasks),
      findUnique: jest.fn(async ({ where }: any) => ({
        ...tasks.find((t) => t.id === where.id),
        cropCycle: { farmId: 'farm1', farmerId: 'fm1' },
      })),
      createMany: jest.fn(async ({ data }: any) => {
        data.forEach((d: any) =>
          tasks.push({
            id: `t${tasks.length + 1}`,
            status: 'PENDING',
            rescheduleCount: 0,
            rescheduleReason: null,
            ...d,
          }),
        );
        return { count: data.length };
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const t = tasks.find((x) => x.id === where.id);
        for (const [k, v] of Object.entries(data))
          t[k] =
            v && typeof v === 'object' && 'increment' in (v as any)
              ? (t[k] ?? 0) + (v as any).increment
              : v;
        return t;
      }),
      deleteMany: jest.fn(async ({ where }: any) => {
        where.id.in.forEach((id: string) =>
          tasks.splice(
            tasks.findIndex((t) => t.id === id),
            1,
          ),
        );
        return { count: where.id.in.length };
      }),
    },
    activityLog: { create: jest.fn().mockResolvedValue({ id: 'a1' }) },
    harvestQualityCheck: { upsert: jest.fn() },
    $transaction: jest.fn(async (ops: any) => Promise.all(ops)),
  };
  const ownership: any = { assertFarmAccess: jest.fn() };
  return {
    service: new RiceProtocolsService(prisma, ownership),
    prisma,
    tasks,
    cycle,
    protocols,
  };
}

describe('Which calendar a variety follows', () => {
  it('a variety with its own calendar uses it; a variety without one gets the default', async () => {
    const { service } = world();
    expect((await service.activePlatform('v-saro'))?.id).toBe('p-saro');
    expect((await service.activePlatform('v-super'))?.id).toBe('p-default');
    expect((await service.activePlatform(null))?.id).toBe('p-default');
  });

  it("tells the screen when the default is being shown instead of the variety's own", async () => {
    const { service } = world();
    expect((await service.platformCalendar('v-saro'))?.usesDefault).toBe(false);
    const fallback = await service.platformCalendar('v-super');
    expect(fallback?.usesDefault).toBe(true);
    expect(fallback?.version).toBe(1);
  });
});

describe('Creating a calendar for a variety', () => {
  it('starts from a copy of the default, numbered from 1 on its own', async () => {
    const { service, prisma } = world();
    const created = await service.bootstrapPlatform(superAdmin, {
      varietyId: 'v-super',
    });
    expect(created.varietyId).toBe('v-super');
    expect(created.version).toBe(1);
    expect(created.taskDefinitions).toEqual(
      (await service.activePlatformExact(null))!.taskDefinitions,
    );
    expect(created.name).toBe('Super Rice Farming Calendar');
    expect(prisma.riceProtocol.aggregate).toHaveBeenCalledWith({
      where: { mamcosId: null, varietyId: 'v-super' },
      _max: { version: true },
    });
  });

  it("can start from another variety's calendar instead", async () => {
    const { service } = world();
    const created = await service.bootstrapPlatform(superAdmin, {
      varietyId: 'v-super',
      copyFromVarietyId: 'v-saro',
    });
    expect((created.taskDefinitions as any[]).map((t) => t.key)).toContain(
      'top_dress',
    );
  });

  it('is Super Admin only, and returns the existing calendar rather than making a second', async () => {
    const { service } = world();
    await expect(
      service.bootstrapPlatform(staff, { varietyId: 'v-super' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(
      (await service.bootstrapPlatform(superAdmin, { varietyId: 'v-saro' })).id,
    ).toBe('p-saro');
    await expect(
      service.bootstrapPlatform(superAdmin, { varietyId: 'nope' }),
    ).rejects.toThrow('variety not found');
  });
});

describe("Generating a farmer's calendar from variety and planting date", () => {
  it('different varieties give different activities and dates', async () => {
    const saro = world();
    await saro.service.scheduleForCycle('c1');
    const keys = saro.tasks.map((t) => t.taskKey);
    expect(keys).toEqual(
      expect.arrayContaining(['top_dress', 'weed', 'harvest']),
    );
    const weed = saro.tasks.find((t) => t.taskKey === 'weed');
    expect(weed.dueDate.getTime()).toBe(
      new Date('2026-01-10T07:00:00Z').getTime() + 25 * DAY,
    );
    expect(weed.protocolId).toBe('p-saro');
    expect(weed.originalDueDate).toEqual(weed.dueDate);

    const sup = world({ cycle: { riceVarietyId: 'v-super', variety: SUPER } });
    await sup.service.scheduleForCycle('c1');
    expect(sup.tasks.map((t) => t.taskKey)).not.toContain('top_dress');
    expect(sup.tasks.find((t) => t.taskKey === 'weed').dueDate.getTime()).toBe(
      new Date('2026-01-10T07:00:00Z').getTime() + 30 * DAY,
    );
  });

  it("works out the harvest date from the variety's maturity, and uses it for harvest tasks", async () => {
    const { service, tasks, cycle } = world();
    await service.scheduleForCycle('c1');
    const harvest = new Date('2026-01-10T07:00:00Z').getTime() + 120 * DAY;
    expect(cycle.expectedHarvest.getTime()).toBe(harvest);
    expect(tasks.find((t) => t.taskKey === 'harvest').dueDate.getTime()).toBe(
      harvest,
    );
    expect(tasks.find((t) => t.taskKey === 'bagging').dueDate.getTime()).toBe(
      harvest + 7 * DAY,
    );

    const longer = world({
      cycle: { riceVarietyId: 'v-super', variety: SUPER },
    });
    await longer.service.scheduleForCycle('c1');
    expect(
      longer.tasks.find((t) => t.taskKey === 'harvest').dueDate.getTime(),
    ).toBe(new Date('2026-01-10T07:00:00Z').getTime() + 135 * DAY);
  });

  it('does nothing without a planting date or any calendar', async () => {
    const noDate = world({ cycle: { plantingDate: null } });
    expect(await noDate.service.scheduleForCycle('c1')).toMatchObject({
      created: 0,
    });
    const noCalendar = world();
    noCalendar.protocols.length = 0;
    expect(await noCalendar.service.scheduleForCycle('c1')).toMatchObject({
      created: 0,
    });
  });
});

describe('Re-planning when dates or variety change', () => {
  const future = (days: number) => new Date(Date.now() + days * DAY);
  const task = (over: Record<string, unknown>) => ({
    id: 't',
    cropCycleId: 'c1',
    taskKey: 'weed',
    status: 'PENDING',
    dueDate: future(10),
    originalDueDate: future(10),
    rescheduleCount: 0,
    rescheduleReason: null,
    protocolId: 'p-saro',
    protocolVersion: 3,
    title: 'old',
    guidance: 'old',
    ...over,
  });

  it('moves pending future activities when the planting date moves', async () => {
    const planting = future(-10);
    const t = task({ id: 'weed1' });
    const { service, tasks } = world({
      cycle: { plantingDate: planting },
      tasks: [t],
    });
    const res = await service.scheduleForCycle('c1');
    expect(res.redated).toBe(1);
    const moved = tasks.find((x) => x.id === 'weed1');
    expect(moved.dueDate.getTime()).toBe(planting.getTime() + 25 * DAY);
    // The first due date stays on record, with the reason it moved.
    expect(moved.originalDueDate.getTime()).toBe(t.originalDueDate.getTime());
    expect(moved.rescheduleReason).toMatch(/changed/);
  });

  it('never touches completed or missed activities, or ones already past due, or staff-moved ones', async () => {
    const done = task({ id: 'a', taskKey: 'weed', status: 'COMPLETED' });
    const missed = task({ id: 'b', taskKey: 'top_dress', status: 'MISSED' });
    const pastDue = task({ id: 'c', taskKey: 'plant', dueDate: future(-3) });
    const moved = task({
      id: 'd',
      taskKey: 'drying',
      rescheduleCount: 1,
      dueDate: future(50),
    });
    const before = [done, missed, pastDue, moved].map((x) =>
      x.dueDate.getTime(),
    );
    const { service, tasks } = world({
      cycle: { plantingDate: future(-40) },
      tasks: [done, missed, pastDue, moved],
    });
    await service.scheduleForCycle('c1');
    expect(
      ['a', 'b', 'c', 'd'].map((id) =>
        tasks.find((x) => x.id === id).dueDate.getTime(),
      ),
    ).toEqual(before);
  });

  it('changing the variety swaps pending wording and drops pending activities the new calendar lacks, keeping the done ones', async () => {
    const { service, tasks } = world({
      cycle: {
        riceVarietyId: 'v-super',
        variety: SUPER,
        plantingDate: new Date(Date.now() - 5 * DAY),
      },
      tasks: [
        task({ id: 'x1', taskKey: 'top_dress', dueDate: future(30) }), // only in SARO's calendar: dropped
        task({ id: 'x2', taskKey: 'weed', dueDate: future(20) }), // in both: wording refreshed
        task({
          id: 'x3',
          taskKey: 'plant',
          status: 'COMPLETED',
          dueDate: future(-4),
        }), // done: kept as is
      ],
    });
    const res = await service.scheduleForCycle('c1', { varietyChanged: true });
    expect(res.removed).toBe(1);
    expect(tasks.map((t) => t.id)).not.toContain('x1');
    expect(tasks.find((t) => t.id === 'x2').protocolId).toBe('p-default');
    expect(tasks.find((t) => t.id === 'x2').title).toBe('weed title');
    expect(tasks.find((t) => t.id === 'x3').title).toBe('old');
  });
});

describe('Rescheduling and completing', () => {
  const staffTask = (status: string) => ({
    id: 't1',
    status,
    dueDate: new Date('2026-03-05T07:00:00Z'),
    originalDueDate: null,
    rescheduleCount: 0,
    requiredMeasurements: null,
    evidenceRequired: false,
    taskKey: 'weed',
    cropCycleId: 'c1',
    activityType: null,
  });

  it('refuses to reschedule a missed or completed activity', async () => {
    for (const status of ['MISSED', 'COMPLETED']) {
      const { service } = world({ tasks: [staffTask(status)] });
      await expect(
        service.rescheduleTask('t1', { dueDate: '2026-04-01' } as any, staff),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    const { service } = world({ tasks: [staffTask('PENDING')] });
    await expect(
      service.rescheduleTask('t1', { dueDate: '2026-04-01' } as any, farmer),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('records that it moved, why (in English), and keeps the first due date', async () => {
    const { service, tasks } = world({ tasks: [staffTask('PENDING')] });
    await service.rescheduleTask(
      't1',
      { dueDate: '2026-04-01', reason: 'Flooded field' } as any,
      staff,
    );
    expect(tasks[0].rescheduleCount).toBe(1);
    expect(tasks[0].rescheduleReason).toBe('Flooded field');
    expect(tasks[0].originalDueDate.toISOString()).toBe(
      '2026-03-05T07:00:00.000Z',
    );
    expect(JSON.stringify(tasks[0])).not.toContain('Ratiba');
  });

  it('a missed activity can still be completed: it turns completed, keeps its missed mark, and is stamped by the server', async () => {
    const missed = {
      ...staffTask('MISSED'),
      missedAt: new Date('2026-03-07T07:00:00Z'),
    };
    const { service, tasks } = world({ tasks: [missed] });
    const res = await service.completeTask(
      't1',
      { photoUrls: [] } as any,
      farmer,
    );
    expect(res.status).toBe('COMPLETED');
    expect(tasks[0].missedAt).toEqual(new Date('2026-03-07T07:00:00Z'));
    expect(tasks[0].recordedAt).toBeInstanceOf(Date);
  });

  it('a completion time in the future is capped at the moment the server received it', async () => {
    const { service, tasks } = world({ tasks: [staffTask('PENDING')] });
    await service.completeTask(
      't1',
      { completedAt: new Date(Date.now() + 5 * DAY).toISOString() } as any,
      farmer,
    );
    expect(tasks[0].completedAt.getTime()).toBeLessThanOrEqual(
      tasks[0].recordedAt.getTime(),
    );
  });
});
