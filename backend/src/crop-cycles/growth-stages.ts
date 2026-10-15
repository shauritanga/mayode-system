import { CropCycleStatus, Prisma, RiceGrowthStage } from '@prisma/client';

/** The rice crop stages in the order a crop moves through them. */
export const GROWTH_STAGE_ORDER: RiceGrowthStage[] = [
  RiceGrowthStage.LAND_PREPARATION,
  RiceGrowthStage.NURSERY_PREPARATION,
  RiceGrowthStage.PLANTING, // transplanting / direct seeding
  RiceGrowthStage.VEGETATIVE_GROWTH,
  RiceGrowthStage.TILLERING,
  RiceGrowthStage.FLOWERING,
  RiceGrowthStage.GRAIN_FILLING,
  RiceGrowthStage.MATURITY,
  RiceGrowthStage.HARVEST, // harvesting
  RiceGrowthStage.POST_HARVEST,
];

export const GROWTH_STAGE_LABELS: Record<RiceGrowthStage, string> = {
  LAND_PREPARATION: 'Land preparation',
  NURSERY_PREPARATION: 'Nursery preparation',
  PLANTING: 'Transplanting / direct seeding',
  GERMINATION: 'Vegetative growth',
  VEGETATIVE_GROWTH: 'Vegetative growth',
  TILLERING: 'Tillering',
  PANICLE_INITIATION: 'Tillering',
  FLOWERING: 'Flowering',
  GRAIN_FILLING: 'Grain filling',
  MATURITY: 'Maturity',
  HARVEST: 'Harvesting',
  POST_HARVEST: 'Post-harvest',
};

/** Position in the 10-step sequence; legacy stage names map onto the step they belong to. */
export function stageIndex(stage: RiceGrowthStage): number {
  const canonical: Partial<Record<RiceGrowthStage, RiceGrowthStage>> = {
    GERMINATION: RiceGrowthStage.VEGETATIVE_GROWTH,
    PANICLE_INITIATION: RiceGrowthStage.TILLERING,
  };
  return GROWTH_STAGE_ORDER.indexOf(canonical[stage] ?? stage);
}

type Db = Pick<Prisma.TransactionClient, 'cropCycle' | 'cropStageChange'>;

/**
 * Move a crop cycle to a growth stage and keep the timeline. A report that is older than the
 * stage already on file is recorded in the timeline but does not move the crop backwards.
 * Reaching planting starts a planned crop; finishing post-harvest marks an active crop harvested.
 */
export async function applyGrowthStage(
  db: Db,
  cropCycleId: string,
  stage: RiceGrowthStage,
  opts: { source: 'ADMIN' | 'VISIT'; at?: Date; userId?: string; note?: string },
) {
  const cycle = await db.cropCycle.findUnique({
    where: { id: cropCycleId },
    select: { growthStage: true, stageUpdatedAt: true, status: true },
  });
  if (!cycle) return null;
  const at = opts.at ?? new Date();
  await db.cropStageChange.create({
    data: {
      cropCycleId,
      stage,
      source: opts.source,
      note: opts.note,
      changedByUserId: opts.userId,
      changedAt: at,
    },
  });
  if (cycle.stageUpdatedAt && at < cycle.stageUpdatedAt) return cycle;

  let status: CropCycleStatus | undefined;
  const index = stageIndex(stage);
  if (
    cycle.status === CropCycleStatus.PLANNED &&
    index >= GROWTH_STAGE_ORDER.indexOf(RiceGrowthStage.PLANTING)
  ) {
    status = CropCycleStatus.ACTIVE;
  }
  if (
    stage === RiceGrowthStage.POST_HARVEST &&
    (cycle.status === CropCycleStatus.ACTIVE || status === CropCycleStatus.ACTIVE)
  ) {
    status = CropCycleStatus.HARVESTED;
  }
  return db.cropCycle.update({
    where: { id: cropCycleId },
    data: { growthStage: stage, stageUpdatedAt: at, ...(status ? { status } : {}) },
  });
}
