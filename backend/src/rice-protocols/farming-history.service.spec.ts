import { NotFoundException } from '@nestjs/common';
import { FarmingHistoryService } from './farming-history.service';

const D = (s: string) => new Date(`${s}T09:00:00+03:00`);

const task = (o: Record<string, unknown>) => ({
  id: 't',
  taskKey: 'k',
  title: 'T',
  status: 'PENDING',
  dueDate: D('2026-03-01'),
  originalDueDate: null,
  rescheduleCount: 0,
  rescheduleReason: null,
  reminderSentAt: null,
  missedAt: null,
  completedAt: null,
  recordedAt: null,
  photoUrls: [],
  measurements: null,
  protocolVersion: 1,
  activityLogId: null,
  ...o,
});

function build(cycle: unknown, claim?: unknown, cycles: unknown[] = []) {
  const prisma = {
    cropCycle: {
      findUnique: jest.fn().mockResolvedValue(cycle),
      findMany: jest.fn().mockResolvedValue(cycles),
    },
    insuranceClaim: { findUnique: jest.fn().mockResolvedValue(claim) },
    farmer: { findUnique: jest.fn().mockResolvedValue({ id: 'f1' }) },
  };
  const ownership = { assertFarmAccess: jest.fn().mockResolvedValue(undefined) };
  const svc = new FarmingHistoryService(prisma as never, ownership as never);
  return { svc, prisma, ownership };
}

const baseCycle = (tasks: unknown[], activities: unknown[] = []) => ({
  id: 'c1',
  farmId: 'farm1',
  season: '2026A',
  status: 'ACTIVE',
  riceVariety: 'SARO 5',
  plantingDate: D('2026-01-01'),
  expectedHarvest: D('2026-05-01'),
  harvestDate: null,
  farm: { farmCode: 'F-1', village: 'V', mamcosId: null },
  farmer: { controlNumber: 'C1', firstName: 'A', lastName: 'B' },
  variety: { id: 'v1', name: 'SARO 5', maturityDays: 120 },
  calendarTasks: tasks,
  activities,
});

describe('FarmingHistoryService', () => {
  const user = { id: 'u', role: 'SUPER_ADMIN' } as never;

  it('counts on time, late, missed and separates extra activities', async () => {
    const { svc } = build(
      baseCycle(
        [
          task({ id: 'a', status: 'COMPLETED', dueDate: D('2020-01-10'), completedAt: D('2020-01-10'), activityLogId: 'l1' }),
          task({ id: 'b', status: 'COMPLETED', dueDate: D('2020-01-10'), completedAt: D('2020-01-15'), missedAt: D('2020-01-12'), activityLogId: 'l2' }),
          task({ id: 'c', status: 'MISSED', dueDate: D('2020-01-10'), missedAt: D('2020-01-12') }),
          task({ id: 'd', status: 'PENDING', dueDate: D('2099-01-10') }),
        ],
        [
          { id: 'l1', activityType: 'X', activityDate: D('2020-01-10'), description: '', photoUrls: [] },
          { id: 'l2', activityType: 'X', activityDate: D('2020-01-15'), description: '', photoUrls: [] },
          { id: 'l3', activityType: 'WEEDING', activityDate: D('2020-01-20'), description: 'extra', photoUrls: ['p'] },
        ],
      ),
    );
    const h = await svc.forCycle('c1', user);
    expect(h.summary).toMatchObject({ total: 4, due: 3, onTime: 1, late: 1, missed: 1, upcoming: 1 });
    expect(h.summary.onTimePct).toBe(33);
    expect(h.summary.completedPct).toBe(67);
    expect(h.extra).toHaveLength(1);
    expect(h.extra[0].activityType).toBe('WEEDING');
  });

  it('reports the position at the incident date', async () => {
    const { svc } = build(
      baseCycle([
        task({ id: 'a', status: 'COMPLETED', dueDate: D('2020-01-10'), completedAt: D('2020-01-10') }),
        task({ id: 'b', status: 'MISSED', dueDate: D('2020-03-10'), missedAt: D('2020-03-12') }),
      ]),
    );
    const h = await svc.forCycle('c1', user, D('2020-02-01'));
    expect(h.summaryAtIncident?.due).toBe(1);
    expect(h.summaryAtIncident?.onTime).toBe(1);
    expect(h.summary.missed).toBe(1);
  });

  it('throws when the cycle does not exist', async () => {
    const { svc } = build(null);
    await expect(svc.forCycle('x', user)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('claim: uses the policy cycle, else the farm cycle covering the incident', async () => {
    const claim = (cropCycleId: string | null) => ({
      id: 'cl', incidentDate: D('2026-02-01'), incidentType: 'DROUGHT', status: 'PENDING', claimedAmount: 1,
      policy: { farmerId: 'f1', farmId: 'farm1', cropCycleId },
    });
    const a = build(baseCycle([]), claim('c9'));
    expect((await a.svc.forClaim('cl', user)).cropCycle?.id).toBe('c1');
    expect(a.prisma.cropCycle.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'c9' } }));

    const b = build(baseCycle([]), claim(null), [{ id: 'c2', harvestDate: null, expectedHarvest: D('2026-05-01') }]);
    await b.svc.forClaim('cl', user);
    expect(b.prisma.cropCycle.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'c2' } }));

    const c = build(null, claim(null), []);
    const r = await c.svc.forClaim('cl', user);
    expect(r.cropCycle).toBeNull();
  });

  it('claim: a farmer cannot read someone else\'s claim', async () => {
    const { svc, prisma } = build(baseCycle([]), {
      id: 'cl', incidentDate: D('2026-02-01'), policy: { farmerId: 'other', farmId: null, cropCycleId: null },
    });
    prisma.farmer.findUnique.mockResolvedValue({ id: 'f1' });
    await expect(svc.forClaim('cl', { id: 'u', role: 'FARMER' } as never)).rejects.toBeInstanceOf(NotFoundException);
  });
});
