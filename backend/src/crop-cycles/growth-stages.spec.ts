import { CropCycleStatus, RiceGrowthStage } from '@prisma/client';
import {
  GROWTH_STAGE_ORDER,
  applyGrowthStage,
  stageIndex,
} from './growth-stages';

function fakeDb(cycle: {
  growthStage: RiceGrowthStage | null;
  stageUpdatedAt: Date | null;
  status: CropCycleStatus;
}) {
  const changes: unknown[] = [];
  const updates: Record<string, unknown>[] = [];
  const db = {
    cropCycle: {
      findUnique: async () => cycle,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return data;
      },
    },
    cropStageChange: {
      create: async ({ data }: { data: unknown }) => changes.push(data),
    },
  };
  return { db: db as never, changes, updates };
}

describe('growth stages', () => {
  it('has the ten rice stages in order', () => {
    expect(GROWTH_STAGE_ORDER).toHaveLength(10);
    expect(GROWTH_STAGE_ORDER[0]).toBe('LAND_PREPARATION');
    expect(GROWTH_STAGE_ORDER[9]).toBe('POST_HARVEST');
  });

  it('maps legacy stage names onto the steps they belong to', () => {
    expect(stageIndex('GERMINATION')).toBe(stageIndex('VEGETATIVE_GROWTH'));
    expect(stageIndex('PANICLE_INITIATION')).toBe(stageIndex('TILLERING'));
  });

  it('starts a planned crop once it reaches planting', async () => {
    const { db, updates } = fakeDb({
      growthStage: null,
      stageUpdatedAt: null,
      status: CropCycleStatus.PLANNED,
    });
    await applyGrowthStage(db, 'c1', RiceGrowthStage.PLANTING, { source: 'ADMIN' });
    expect(updates[0]).toMatchObject({ growthStage: 'PLANTING', status: 'ACTIVE' });
  });

  it('does not start a planned crop that is still being prepared', async () => {
    const { db, updates } = fakeDb({
      growthStage: null,
      stageUpdatedAt: null,
      status: CropCycleStatus.PLANNED,
    });
    await applyGrowthStage(db, 'c1', RiceGrowthStage.NURSERY_PREPARATION, { source: 'ADMIN' });
    expect(updates[0]).not.toHaveProperty('status');
  });

  it('marks an active crop harvested after post-harvest', async () => {
    const { db, updates } = fakeDb({
      growthStage: RiceGrowthStage.HARVEST,
      stageUpdatedAt: new Date('2026-01-01'),
      status: CropCycleStatus.ACTIVE,
    });
    await applyGrowthStage(db, 'c1', RiceGrowthStage.POST_HARVEST, { source: 'ADMIN' });
    expect(updates[0]).toMatchObject({ status: 'HARVESTED' });
  });

  it('records an older report in the timeline without moving the crop back', async () => {
    const { db, changes, updates } = fakeDb({
      growthStage: RiceGrowthStage.FLOWERING,
      stageUpdatedAt: new Date('2026-03-01'),
      status: CropCycleStatus.ACTIVE,
    });
    await applyGrowthStage(db, 'c1', RiceGrowthStage.TILLERING, {
      source: 'VISIT',
      at: new Date('2026-02-01'),
    });
    expect(changes).toHaveLength(1);
    expect(updates).toHaveLength(0);
  });
});
