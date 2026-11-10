-- Harvest passes (digital clearance with an SMS code), harvester arrivals, gate incidents, and the daily fee reconciliation.
CREATE TYPE "HarvestPassStatus" AS ENUM ('ISSUED', 'USED', 'VOID');
CREATE TYPE "HarvestIncidentStatus" AS ENUM ('OPEN', 'RESOLVED');

CREATE TABLE "harvest_passes" (
  "id" TEXT NOT NULL,
  "mamcos_id" TEXT NOT NULL,
  "type_id" TEXT NOT NULL,
  "block_id" TEXT NOT NULL,
  "hectare_id" TEXT NOT NULL,
  "farmer_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "status" "HarvestPassStatus" NOT NULL DEFAULT 'ISSUED',
  "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "used_at" TIMESTAMP(3),
  "used_by_id" TEXT,
  "used_via" TEXT,
  "arrival_id" TEXT,
  "voided_at" TIMESTAMP(3),
  "voided_by_id" TEXT,
  "void_reason" TEXT,
  CONSTRAINT "harvest_passes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "harvest_passes_type_fkey" FOREIGN KEY ("type_id") REFERENCES "farmer_due_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "harvest_passes_block_fkey" FOREIGN KEY ("block_id") REFERENCES "irrigation_blocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "harvest_passes_hectare_fkey" FOREIGN KEY ("hectare_id") REFERENCES "irrigation_hectares"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "harvest_passes_farmer_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "harvest_passes_code_key" ON "harvest_passes" ("code");
CREATE UNIQUE INDEX "harvest_passes_type_id_hectare_id_key" ON "harvest_passes" ("type_id", "hectare_id");
CREATE INDEX "harvest_passes_mamcos_id_block_id_idx" ON "harvest_passes" ("mamcos_id", "block_id");
CREATE INDEX "harvest_passes_farmer_id_idx" ON "harvest_passes" ("farmer_id");

CREATE TABLE "harvest_arrivals" (
  "id" TEXT NOT NULL,
  "mamcos_id" TEXT NOT NULL,
  "block_id" TEXT NOT NULL,
  "operator_name" TEXT NOT NULL,
  "operator_phone" TEXT,
  "machine" TEXT,
  "note" TEXT,
  "logged_by_id" TEXT NOT NULL,
  "arrived_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "departed_at" TIMESTAMP(3),
  "departed_by_id" TEXT,
  CONSTRAINT "harvest_arrivals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "harvest_arrivals_block_fkey" FOREIGN KEY ("block_id") REFERENCES "irrigation_blocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "harvest_arrivals_mamcos_id_block_id_departed_at_idx" ON "harvest_arrivals" ("mamcos_id", "block_id", "departed_at");

CREATE TABLE "harvest_incidents" (
  "id" TEXT NOT NULL,
  "mamcos_id" TEXT NOT NULL,
  "block_id" TEXT NOT NULL,
  "hectare_id" TEXT,
  "kind" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "status" "HarvestIncidentStatus" NOT NULL DEFAULT 'OPEN',
  "raised_by_id" TEXT NOT NULL,
  "resolved_by_id" TEXT,
  "resolved_at" TIMESTAMP(3),
  "resolution" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "harvest_incidents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "harvest_incidents_block_fkey" FOREIGN KEY ("block_id") REFERENCES "irrigation_blocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "harvest_incidents_mamcos_id_status_idx" ON "harvest_incidents" ("mamcos_id", "status");
CREATE INDEX "harvest_incidents_block_id_idx" ON "harvest_incidents" ("block_id");

CREATE TABLE "harvest_fund_splits" (
  "mamcos_id" TEXT NOT NULL,
  "maintenance_percent" INTEGER NOT NULL,
  "updated_by_id" TEXT,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "harvest_fund_splits_pkey" PRIMARY KEY ("mamcos_id"),
  CONSTRAINT "harvest_fund_splits_percent" CHECK ("maintenance_percent" BETWEEN 0 AND 100)
);

CREATE TABLE "harvest_reconciliations" (
  "id" TEXT NOT NULL,
  "mamcos_id" TEXT NOT NULL,
  "day" DATE NOT NULL,
  "payments_count" INTEGER NOT NULL,
  "collected" DECIMAL(14,2) NOT NULL,
  "operating" DECIMAL(14,2) NOT NULL,
  "maintenance" DECIMAL(14,2) NOT NULL,
  "maintenance_percent" INTEGER NOT NULL,
  "note" TEXT,
  "reconciled_by_id" TEXT NOT NULL,
  "reconciled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "harvest_reconciliations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "harvest_reconciliations_mamcos_id_day_key" ON "harvest_reconciliations" ("mamcos_id", "day");

-- Permissions: passes, arrivals and incidents (View = look up, Create = log an arrival or report, Edit = use a pass or resolve).
INSERT INTO "resources" ("id", "key", "label") VALUES (gen_random_uuid()::text, 'harvest_passes', 'Harvest Passes and Gate') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "role_permissions" ("id", "role_id", "resource_id", "action", "created_at")
SELECT gen_random_uuid()::text, r."id", res."id", g."action"::"PermissionAction", now()
FROM "roles" r
JOIN (VALUES
  ('Block Leader', 'VIEW'), ('Block Leader', 'CREATE'), ('Block Leader', 'EDIT'),
  ('Canal Leader', 'VIEW'), ('Canal Leader', 'CREATE'), ('Canal Leader', 'EDIT'),
  ('Cashier', 'VIEW'), ('Accountant', 'VIEW'), ('Manager', 'VIEW'),
  ('Cooperative Admin', 'VIEW'), ('Cooperative Admin', 'CREATE'), ('Cooperative Admin', 'EDIT'), ('Cooperative Admin', 'DELETE')
) AS g("role_name", "action") ON r."name" = g."role_name"
JOIN "resources" res ON res."key" = 'harvest_passes'
WHERE r."mamcos_id" IS NOT NULL
ON CONFLICT ("role_id", "resource_id", "action") DO NOTHING;
