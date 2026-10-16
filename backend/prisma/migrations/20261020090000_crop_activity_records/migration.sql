-- Crop activities and farm records: more activity types, plot, structured input, cost and remarks.
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'SEED_SELECTION';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'NURSERY_ESTABLISHMENT';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'FIELD_INSPECTION';

ALTER TABLE "activity_logs"
  ADD COLUMN "plot_id" TEXT,
  ADD COLUMN "input_name" TEXT,
  ADD COLUMN "input_quantity" DOUBLE PRECISION,
  ADD COLUMN "input_unit" TEXT,
  ADD COLUMN "cost" DOUBLE PRECISION,
  ADD COLUMN "remarks" TEXT;

ALTER TABLE "activity_logs"
  ADD CONSTRAINT "activity_logs_plot_id_fkey"
  FOREIGN KEY ("plot_id") REFERENCES "plots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "activity_logs_crop_cycle_id_activity_date_idx" ON "activity_logs"("crop_cycle_id", "activity_date");
