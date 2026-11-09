-- CreateEnum
CREATE TYPE "HarvestRateScope" AS ENUM ('AMCOS', 'CANAL', 'BLOCK');

-- CreateEnum
CREATE TYPE "HarvestRateStatus" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'SUPERSEDED', 'REJECTED');

-- AlterEnum
ALTER TYPE "DueCategory" ADD VALUE 'HARVEST_FEE';

-- CreateTable
CREATE TABLE "harvest_fee_rates" (
    "id" TEXT NOT NULL,
    "mamcos_id" TEXT NOT NULL,
    "scope" "HarvestRateScope" NOT NULL,
    "canal_id" TEXT,
    "block_id" TEXT,
    "rate_per_hectare" DECIMAL(14,2) NOT NULL,
    "status" "HarvestRateStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "note" TEXT,
    "requested_by_id" TEXT NOT NULL,
    "decided_by_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "harvest_fee_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "harvest_fee_rates_mamcos_id_status_idx" ON "harvest_fee_rates"("mamcos_id", "status");

-- CreateIndex
CREATE INDEX "harvest_fee_rates_canal_id_idx" ON "harvest_fee_rates"("canal_id");

-- CreateIndex
CREATE INDEX "harvest_fee_rates_block_id_idx" ON "harvest_fee_rates"("block_id");

-- AddForeignKey
ALTER TABLE "harvest_fee_rates" ADD CONSTRAINT "harvest_fee_rates_canal_id_fkey" FOREIGN KEY ("canal_id") REFERENCES "irrigation_canals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_fee_rates" ADD CONSTRAINT "harvest_fee_rates_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "irrigation_blocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Permissions for the harvest module: rates and opening a harvest, final approval of rates, and the block clearance list.
INSERT INTO "resources" ("id", "key", "label") VALUES
  (gen_random_uuid()::text, 'harvest_fees', 'Harvest Fees'),
  (gen_random_uuid()::text, 'harvest_fee_approval', 'Harvest Fee Rate Approval'),
  (gen_random_uuid()::text, 'harvest_clearance', 'Harvest Clearance')
ON CONFLICT ("key") DO NOTHING;

-- Existing roles by name (AMCOS-owned only). Safe to re-run.
INSERT INTO "role_permissions" ("id", "role_id", "resource_id", "action", "created_at")
SELECT gen_random_uuid()::text, r."id", res."id", g."action"::"PermissionAction", now()
FROM "roles" r
JOIN (VALUES
  ('Cashier', 'harvest_fees', 'VIEW'), ('Cashier', 'harvest_fees', 'CREATE'), ('Cashier', 'harvest_fees', 'EDIT'),
  ('Accountant', 'harvest_fees', 'VIEW'), ('Accountant', 'harvest_fees', 'CREATE'), ('Accountant', 'harvest_fees', 'EDIT'),
  ('Manager', 'harvest_fees', 'VIEW'),
  ('Manager', 'harvest_fee_approval', 'EDIT'),
  ('Cashier', 'harvest_clearance', 'VIEW'), ('Accountant', 'harvest_clearance', 'VIEW'), ('Manager', 'harvest_clearance', 'VIEW'),
  ('Block Leader', 'harvest_clearance', 'VIEW'), ('Canal Leader', 'harvest_clearance', 'VIEW'),
  ('Cooperative Admin', 'harvest_fees', 'VIEW'), ('Cooperative Admin', 'harvest_fees', 'CREATE'),
  ('Cooperative Admin', 'harvest_fees', 'EDIT'), ('Cooperative Admin', 'harvest_fees', 'DELETE'),
  ('Cooperative Admin', 'harvest_fee_approval', 'EDIT'),
  ('Cooperative Admin', 'harvest_clearance', 'VIEW')
) AS g("role_name", "resource_key", "action") ON r."name" = g."role_name"
JOIN "resources" res ON res."key" = g."resource_key"
WHERE r."mamcos_id" IS NOT NULL
ON CONFLICT ("role_id", "resource_id", "action") DO NOTHING;
