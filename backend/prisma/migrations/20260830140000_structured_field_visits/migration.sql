-- CreateEnum
CREATE TYPE "RiceGrowthStage" AS ENUM ('LAND_PREPARATION', 'PLANTING', 'GERMINATION', 'TILLERING', 'PANICLE_INITIATION', 'FLOWERING', 'GRAIN_FILLING', 'MATURITY', 'HARVEST');

-- CreateEnum
CREATE TYPE "FieldConditionStatus" AS ENUM ('GOOD', 'FAIR', 'POOR', 'NONE');

-- AlterTable
ALTER TABLE "field_officer_visits" ADD COLUMN     "growth_stage" "RiceGrowthStage",
ADD COLUMN     "rice_variety" TEXT,
ADD COLUMN     "crop_condition" "FieldConditionStatus",
ADD COLUMN     "water_status" "FieldConditionStatus",
ADD COLUMN     "weed_status" "FieldConditionStatus",
ADD COLUMN     "pest_status" "FieldConditionStatus",
ADD COLUMN     "disease_status" "FieldConditionStatus",
ADD COLUMN     "fertilizer_applied" BOOLEAN,
ADD COLUMN     "input_used" TEXT,
ADD COLUMN     "input_quantity" TEXT,
ADD COLUMN     "observations" TEXT,
ADD COLUMN     "recommendations" TEXT,
ADD COLUMN     "next_visit_date" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "field_officer_visits_field_officer_id_next_visit_date_idx" ON "field_officer_visits"("field_officer_id", "next_visit_date");
