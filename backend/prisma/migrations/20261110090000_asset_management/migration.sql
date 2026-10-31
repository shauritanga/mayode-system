-- CreateEnum
CREATE TYPE "AssetCategory" AS ENUM ('MACHINERY_VEHICLE', 'BUILDING_WAREHOUSE', 'MILL_PROCESSING', 'IRRIGATION_STRUCTURE', 'SOLAR_POWER', 'MEASURING_EQUIPMENT', 'TOOLS', 'OFFICE_IT', 'FURNITURE', 'OTHER');

-- CreateEnum
CREATE TYPE "AssetFundingSource" AS ENUM ('AMCOS_FUNDS', 'MEMBER_CONTRIBUTIONS', 'GRANT', 'LOAN', 'DONATION');

-- CreateEnum
CREATE TYPE "AssetCondition" AS ENUM ('NEW', 'GOOD', 'FAIR', 'POOR', 'UNDER_REPAIR');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('IN_USE', 'IDLE', 'DISPOSED');

-- CreateEnum
CREATE TYPE "AssetMaintenanceKind" AS ENUM ('SERVICE', 'REPAIR', 'INSPECTION', 'CALIBRATION', 'PEST_CONTROL', 'FUEL');

-- CreateEnum
CREATE TYPE "AssetDisposalMethod" AS ENUM ('SOLD', 'SCRAPPED', 'LOST_STOLEN', 'DONATED');

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "mamcos_id" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "AssetCategory" NOT NULL,
    "make" TEXT,
    "model" TEXT,
    "serial_no" TEXT,
    "purchase_date" DATE NOT NULL,
    "cost" DECIMAL(14,2) NOT NULL,
    "funding_source" "AssetFundingSource" NOT NULL DEFAULT 'AMCOS_FUNDS',
    "supplier" TEXT,
    "location" TEXT,
    "condition" "AssetCondition" NOT NULL DEFAULT 'GOOD',
    "status" "AssetStatus" NOT NULL DEFAULT 'IN_USE',
    "useful_life_years" INTEGER NOT NULL,
    "salvage_value" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "depreciation_start" DATE NOT NULL,
    "custodian_name" TEXT,
    "custodian_user_id" TEXT,
    "warranty_expires_on" DATE,
    "insurance_expires_on" DATE,
    "service_interval_days" INTEGER,
    "next_service_due" DATE,
    "equipment_id" TEXT,
    "notes" TEXT,
    "posted_purchase" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_maintenance" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "kind" "AssetMaintenanceKind" NOT NULL,
    "done_on" DATE NOT NULL,
    "cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "performed_by" TEXT,
    "notes" TEXT,
    "next_due_on" DATE,
    "posted" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "asset_maintenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_custody_log" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "from_name" TEXT,
    "to_name" TEXT NOT NULL,
    "to_user_id" TEXT,
    "assigned_on" DATE NOT NULL,
    "assigned_by" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "asset_custody_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_disposals" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "disposed_on" DATE NOT NULL,
    "method" "AssetDisposalMethod" NOT NULL,
    "proceeds" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "reason" TEXT,
    "book_value" DECIMAL(14,2) NOT NULL,
    "gain_loss" DECIMAL(14,2) NOT NULL,
    "posted" BOOLEAN NOT NULL DEFAULT false,
    "approved_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "asset_disposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_depreciation_runs" (
    "id" TEXT NOT NULL,
    "mamcos_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "posted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "posted_by" TEXT,

CONSTRAINT "asset_depreciation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_depreciation_lines" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

CONSTRAINT "asset_depreciation_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assets_equipment_id_key" ON "assets"("equipment_id");

-- CreateIndex
CREATE INDEX "assets_mamcos_id_status_idx" ON "assets"("mamcos_id", "status");

-- CreateIndex
CREATE INDEX "assets_mamcos_id_category_idx" ON "assets"("mamcos_id", "category");

-- CreateIndex
CREATE UNIQUE INDEX "assets_mamcos_id_tag_key" ON "assets"("mamcos_id", "tag");

-- CreateIndex
CREATE INDEX "asset_maintenance_asset_id_done_on_idx" ON "asset_maintenance"("asset_id", "done_on");

-- CreateIndex
CREATE INDEX "asset_custody_log_asset_id_assigned_on_idx" ON "asset_custody_log"("asset_id", "assigned_on");

-- CreateIndex
CREATE UNIQUE INDEX "asset_disposals_asset_id_key" ON "asset_disposals"("asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_depreciation_runs_mamcos_id_period_key" ON "asset_depreciation_runs"("mamcos_id", "period");

-- CreateIndex
CREATE INDEX "asset_depreciation_lines_asset_id_idx" ON "asset_depreciation_lines"("asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_depreciation_lines_run_id_asset_id_key" ON "asset_depreciation_lines"("run_id", "asset_id");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_mamcos_id_fkey" FOREIGN KEY ("mamcos_id") REFERENCES "mamcos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "amcos_equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_maintenance" ADD CONSTRAINT "asset_maintenance_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_custody_log" ADD CONSTRAINT "asset_custody_log_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_disposals" ADD CONSTRAINT "asset_disposals_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_depreciation_runs" ADD CONSTRAINT "asset_depreciation_runs_mamcos_id_fkey" FOREIGN KEY ("mamcos_id") REFERENCES "mamcos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_depreciation_lines" ADD CONSTRAINT "asset_depreciation_lines_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "asset_depreciation_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_depreciation_lines" ADD CONSTRAINT "asset_depreciation_lines_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Money and dates must make sense.
ALTER TABLE "assets" ADD CONSTRAINT "assets_cost_not_negative" CHECK ("cost" >= 0);
ALTER TABLE "assets" ADD CONSTRAINT "assets_salvage_within_cost" CHECK ("salvage_value" >= 0 AND "salvage_value" <= "cost");
ALTER TABLE "assets" ADD CONSTRAINT "assets_useful_life_positive" CHECK ("useful_life_years" >= 1);
ALTER TABLE "assets" ADD CONSTRAINT "assets_depreciation_not_before_purchase" CHECK ("depreciation_start" >= "purchase_date");
ALTER TABLE "asset_maintenance" ADD CONSTRAINT "asset_maintenance_cost_not_negative" CHECK ("cost" >= 0);
ALTER TABLE "asset_disposals" ADD CONSTRAINT "asset_disposals_proceeds_not_negative" CHECK ("proceeds" >= 0);
ALTER TABLE "asset_depreciation_runs" ADD CONSTRAINT "asset_depreciation_runs_period_format" CHECK ("period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
ALTER TABLE "asset_depreciation_lines" ADD CONSTRAINT "asset_depreciation_lines_amount_positive" CHECK ("amount" > 0);

-- Custody history is never deleted or rewritten.
CREATE OR REPLACE FUNCTION asset_custody_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Asset custody history cannot be changed or deleted';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER asset_custody_log_no_change BEFORE UPDATE OR DELETE ON "asset_custody_log"
  FOR EACH ROW EXECUTE FUNCTION asset_custody_log_immutable();

-- Permission resource, granted to every existing Cooperative Admin role (same reasoning as 20261107100000).
INSERT INTO "resources" ("id", "key", "label") VALUES (gen_random_uuid()::text, 'assets', 'Asset Management') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "role_permissions" ("id", "role_id", "resource_id", "action", "created_at")
SELECT gen_random_uuid()::text, r."id", res."id", a."action"::"PermissionAction", now()
FROM "roles" r
CROSS JOIN "resources" res
CROSS JOIN (VALUES ('VIEW'), ('CREATE'), ('EDIT'), ('DELETE')) AS a("action")
WHERE r."name" = 'Cooperative Admin' AND r."mamcos_id" IS NOT NULL AND res."key" = 'assets'
ON CONFLICT ("role_id", "resource_id", "action") DO NOTHING;

