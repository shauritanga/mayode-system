-- Rice varieties with their own calendars, missed-activity tracking, and the history fields an
-- insurance check needs. Additive; existing cycles keep their current tasks.

ALTER TYPE "CalendarTaskStatus" ADD VALUE IF NOT EXISTS 'MISSED';

CREATE TABLE "rice_varieties" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "maturity_days" INTEGER,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rice_varieties_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "rice_varieties_name_key" ON "rice_varieties"("name");

ALTER TABLE "rice_protocols" ADD COLUMN "variety_id" TEXT;
CREATE INDEX "rice_protocols_variety_id_idx" ON "rice_protocols"("variety_id");
ALTER TABLE "rice_protocols" ADD CONSTRAINT "rice_protocols_variety_id_fkey"
  FOREIGN KEY ("variety_id") REFERENCES "rice_varieties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "crop_cycles" ADD COLUMN "rice_variety_id" TEXT;
CREATE INDEX "crop_cycles_rice_variety_id_idx" ON "crop_cycles"("rice_variety_id");
ALTER TABLE "crop_cycles" ADD CONSTRAINT "crop_cycles_rice_variety_id_fkey"
  FOREIGN KEY ("rice_variety_id") REFERENCES "rice_varieties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "rice_calendar_tasks"
  ADD COLUMN "original_due_date" TIMESTAMP(3),
  ADD COLUMN "reminder_sent_at" TIMESTAMP(3),
  ADD COLUMN "missed_at" TIMESTAMP(3),
  ADD COLUMN "missed_notified_at" TIMESTAMP(3),
  ADD COLUMN "recorded_at" TIMESTAMP(3),
  ADD COLUMN "reschedule_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "reschedule_reason" TEXT,
  ADD COLUMN "protocol_id" TEXT;

ALTER TABLE "org_settings"
  ADD COLUMN "reminder_lead_days" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "missed_grace_days" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "reminder_by_sms" BOOLEAN NOT NULL DEFAULT true;

-- Existing free-text varieties become catalog entries (one per distinct spelling, ignoring case),
-- and the cycles that used them are linked. Nothing is renamed: the text column stays as it was.
INSERT INTO "rice_varieties" ("id", "name", "created_at", "updated_at")
SELECT gen_random_uuid()::text, v.name, now(), now()
FROM (
  SELECT DISTINCT ON (lower(trim("rice_variety"))) trim("rice_variety") AS name
  FROM "crop_cycles"
  WHERE "rice_variety" IS NOT NULL AND trim("rice_variety") <> ''
  ORDER BY lower(trim("rice_variety")), "created_at"
) v
ON CONFLICT ("name") DO NOTHING;

UPDATE "crop_cycles" c
SET "rice_variety_id" = rv."id"
FROM "rice_varieties" rv
WHERE c."rice_variety" IS NOT NULL AND lower(trim(c."rice_variety")) = lower(rv."name");

-- The due date a task started with, so a later reschedule can never hide that it moved.
UPDATE "rice_calendar_tasks" SET "original_due_date" = "due_date" WHERE "original_due_date" IS NULL;
