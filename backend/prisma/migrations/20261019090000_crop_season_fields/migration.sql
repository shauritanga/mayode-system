-- Rice crop seasons: area, seed, method, irrigation, growth stage and a stage timeline.
ALTER TYPE "RiceGrowthStage" ADD VALUE IF NOT EXISTS 'NURSERY_PREPARATION';
ALTER TYPE "RiceGrowthStage" ADD VALUE IF NOT EXISTS 'VEGETATIVE_GROWTH';
ALTER TYPE "RiceGrowthStage" ADD VALUE IF NOT EXISTS 'POST_HARVEST';

CREATE TYPE "ProductionMethod" AS ENUM ('TRANSPLANTING', 'DIRECT_SEEDING', 'SRI');
CREATE TYPE "CycleIrrigationType" AS ENUM ('RAIN_FED', 'CANAL_GRAVITY', 'PUMP', 'SPRINKLER', 'SUPPLEMENTAL');

ALTER TABLE "crop_cycles"
  ADD COLUMN "farming_season_id" TEXT,
  ADD COLUMN "area_planted_ha" DOUBLE PRECISION,
  ADD COLUMN "seed_quantity_kg" DOUBLE PRECISION,
  ADD COLUMN "production_method" "ProductionMethod",
  ADD COLUMN "irrigation_type" "CycleIrrigationType",
  ADD COLUMN "growth_stage" "RiceGrowthStage",
  ADD COLUMN "stage_updated_at" TIMESTAMP(3);

ALTER TABLE "crop_cycles"
  ADD CONSTRAINT "crop_cycles_farming_season_id_fkey"
  FOREIGN KEY ("farming_season_id") REFERENCES "farming_seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "crop_cycles_farming_season_id_idx" ON "crop_cycles"("farming_season_id");

CREATE TABLE "crop_stage_changes" (
  "id" TEXT NOT NULL,
  "crop_cycle_id" TEXT NOT NULL,
  "stage" "RiceGrowthStage" NOT NULL,
  "source" TEXT NOT NULL,
  "note" TEXT,
  "changed_by_user_id" TEXT,
  "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crop_stage_changes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "crop_stage_changes_crop_cycle_id_changed_at_idx" ON "crop_stage_changes"("crop_cycle_id", "changed_at");
ALTER TABLE "crop_stage_changes"
  ADD CONSTRAINT "crop_stage_changes_crop_cycle_id_fkey"
  FOREIGN KEY ("crop_cycle_id") REFERENCES "crop_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: take each cycle's stage from its most recent field-officer visit.
UPDATE "crop_cycles" c SET "growth_stage" = v."growth_stage", "stage_updated_at" = v."visited_at"
FROM (
  SELECT DISTINCT ON ("crop_cycle_id") "crop_cycle_id", "growth_stage", "visited_at"
  FROM "field_officer_visits"
  WHERE "crop_cycle_id" IS NOT NULL AND "growth_stage" IS NOT NULL
  ORDER BY "crop_cycle_id", "visited_at" DESC
) v
WHERE c."id" = v."crop_cycle_id";
