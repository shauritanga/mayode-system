-- Mbalari cooperative rice calendar, task evidence and post-harvest quality gate.
CREATE TYPE "CalendarTaskStatus" AS ENUM ('PENDING', 'COMPLETED', 'SKIPPED');

CREATE TABLE "rice_protocols" (
  "id" TEXT NOT NULL,
  "mamcos_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "task_definitions" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "rice_protocols_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rice_calendar_tasks" (
  "id" TEXT NOT NULL,
  "crop_cycle_id" TEXT NOT NULL,
  "protocol_version" INTEGER NOT NULL,
  "task_key" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "guidance" TEXT NOT NULL,
  "activity_type" "ActivityType",
  "due_date" TIMESTAMP(3) NOT NULL,
  "required_measurements" JSONB,
  "evidence_required" BOOLEAN NOT NULL DEFAULT false,
  "status" "CalendarTaskStatus" NOT NULL DEFAULT 'PENDING',
  "measurements" JSONB,
  "photo_urls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "completed_at" TIMESTAMP(3),
  "completed_by_user_id" TEXT,
  "activity_log_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "rice_calendar_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "harvest_quality_checks" (
  "id" TEXT NOT NULL,
  "crop_cycle_id" TEXT NOT NULL,
  "harvest_maturity_pct" DOUBLE PRECISION,
  "panicle_moisture_pct" DOUBLE PRECISION,
  "drying_moisture_pct" DOUBLE PRECISION,
  "bag_count" INTEGER,
  "bag_weight_kg" DOUBLE PRECISION,
  "warehouse_location" TEXT,
  "warehouse_received_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "harvest_quality_checks_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "inventory_records" ADD COLUMN "crop_cycle_id" TEXT;

CREATE UNIQUE INDEX "rice_protocols_mamcos_id_version_key" ON "rice_protocols"("mamcos_id", "version");
CREATE INDEX "rice_protocols_mamcos_id_is_active_idx" ON "rice_protocols"("mamcos_id", "is_active");
CREATE UNIQUE INDEX "rice_calendar_tasks_crop_cycle_id_task_key_key" ON "rice_calendar_tasks"("crop_cycle_id", "task_key");
CREATE INDEX "rice_calendar_tasks_crop_cycle_id_status_due_date_idx" ON "rice_calendar_tasks"("crop_cycle_id", "status", "due_date");
CREATE UNIQUE INDEX "harvest_quality_checks_crop_cycle_id_key" ON "harvest_quality_checks"("crop_cycle_id");

ALTER TABLE "rice_protocols" ADD CONSTRAINT "rice_protocols_mamcos_id_fkey" FOREIGN KEY ("mamcos_id") REFERENCES "mamcos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rice_calendar_tasks" ADD CONSTRAINT "rice_calendar_tasks_crop_cycle_id_fkey" FOREIGN KEY ("crop_cycle_id") REFERENCES "crop_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "harvest_quality_checks" ADD CONSTRAINT "harvest_quality_checks_crop_cycle_id_fkey" FOREIGN KEY ("crop_cycle_id") REFERENCES "crop_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_records" ADD CONSTRAINT "inventory_records_crop_cycle_id_fkey" FOREIGN KEY ("crop_cycle_id") REFERENCES "crop_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
