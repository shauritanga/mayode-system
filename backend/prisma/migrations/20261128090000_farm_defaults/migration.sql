-- Farms of farmers whose debt is past the grace period: blocked, run by the AMCOS, then possibly leased on M-LAX.
CREATE TYPE "FarmAdminStatus" AS ENUM ('NORMAL', 'UNDER_AMCOS', 'MLAX_NOTICE', 'AT_MLAX');
CREATE TYPE "FarmDefaultCaseStatus" AS ENUM ('UNDER_AMCOS', 'MLAX_NOTICE', 'AT_MLAX', 'RECLAIMED', 'TAKEN_OVER', 'LEASED_ON_MLAX', 'CLOSED');

ALTER TABLE "farms" ADD COLUMN "admin_status" "FarmAdminStatus" NOT NULL DEFAULT 'NORMAL', ADD COLUMN "admin_case_id" TEXT;
ALTER TABLE "land_listings" ADD COLUMN "default_case_id" TEXT, ADD COLUMN "minimum_price" DOUBLE PRECISION;

CREATE TABLE "farm_default_cases" (
  "id" TEXT NOT NULL,
  "mamcos_id" TEXT NOT NULL,
  "farmer_id" TEXT NOT NULL,
  "status" "FarmDefaultCaseStatus" NOT NULL DEFAULT 'UNDER_AMCOS',
  "opened_on" DATE NOT NULL,
  "grace_days" INTEGER NOT NULL,
  "debt_at_open" DECIMAL(14,2) NOT NULL,
  "penalty_due_id" TEXT,
  "notice_sent_at" TIMESTAMP(3),
  "notice_deadline" TIMESTAMP(3),
  "at_mlax_at" TIMESTAMP(3),
  "resolved_on" TIMESTAMP(3),
  "resolved_note" TEXT,
  "taken_by_farmer_id" TEXT,
  "taken_farm_ids" TEXT[],
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "farm_default_cases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "farm_default_cases_mamcos_fkey" FOREIGN KEY ("mamcos_id") REFERENCES "mamcos"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "farm_default_cases_farmer_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "farm_default_cases_mamcos_id_status_idx" ON "farm_default_cases" ("mamcos_id", "status");
CREATE INDEX "farm_default_cases_farmer_id_idx" ON "farm_default_cases" ("farmer_id");
-- One open case per farmer, so two runs of the check can never open it twice.
CREATE UNIQUE INDEX "farm_default_cases_one_open_per_farmer" ON "farm_default_cases" ("farmer_id") WHERE "status" IN ('UNDER_AMCOS', 'MLAX_NOTICE', 'AT_MLAX');

CREATE TABLE "farm_default_events" (
  "id" TEXT NOT NULL,
  "case_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "note" TEXT,
  "actor_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "farm_default_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "farm_default_events_case_fkey" FOREIGN KEY ("case_id") REFERENCES "farm_default_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "farm_default_events_case_id_created_at_idx" ON "farm_default_events" ("case_id", "created_at");

INSERT INTO "resources" ("id", "key", "label") VALUES (gen_random_uuid()::text, 'farm_administration', 'Farms under administration') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "role_permissions" ("id", "role_id", "resource_id", "action", "created_at")
SELECT gen_random_uuid()::text, r."id", res."id", a."action"::"PermissionAction", now()
FROM "roles" r
CROSS JOIN "resources" res
CROSS JOIN (VALUES ('VIEW'), ('CREATE'), ('EDIT'), ('DELETE')) AS a("action")
WHERE r."name" = 'Cooperative Admin' AND r."mamcos_id" IS NOT NULL AND res."key" = 'farm_administration'
ON CONFLICT ("role_id", "resource_id", "action") DO NOTHING;
