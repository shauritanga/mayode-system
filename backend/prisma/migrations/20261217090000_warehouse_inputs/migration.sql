-- Farm inputs, fuel and bags become stock in a warehouse, with a reference for every movement.
ALTER TYPE "InputMovementType" ADD VALUE IF NOT EXISTS 'TRANSFER_OUT';
ALTER TYPE "InputMovementType" ADD VALUE IF NOT EXISTS 'TRANSFER_IN';
ALTER TYPE "InputMovementType" ADD VALUE IF NOT EXISTS 'WRITE_OFF';
ALTER TYPE "InputMovementType" ADD VALUE IF NOT EXISTS 'COUNT_ADJUSTMENT';

CREATE TYPE "InputStockClass" AS ENUM ('INPUT', 'FUEL', 'PACKAGING');

ALTER TABLE "warehouses" ADD COLUMN "is_default_for_inputs" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "farm_input_items" ADD COLUMN "stock_class" "InputStockClass" NOT NULL DEFAULT 'INPUT';
ALTER TABLE "farm_input_items" ADD COLUMN "packaging_kg" DOUBLE PRECISION;

ALTER TABLE "farm_input_movements" ADD COLUMN "warehouse_id" TEXT;
ALTER TABLE "farm_input_movements" ADD COLUMN "ref_type" TEXT;
ALTER TABLE "farm_input_movements" ADD COLUMN "ref_id" TEXT;
ALTER TABLE "farm_input_movements" ADD COLUMN "reason" TEXT;
ALTER TABLE "farm_input_movements" ADD COLUMN "supplier_name" TEXT;
ALTER TABLE "farm_input_movements" ADD COLUMN "unit_cost" DOUBLE PRECISION;
ALTER TABLE "farm_input_movements" ADD COLUMN "group_id" TEXT;
ALTER TABLE "farm_input_movements" ADD COLUMN "reversal_of_id" TEXT;
CREATE UNIQUE INDEX "farm_input_movements_reversal_of_id_key" ON "farm_input_movements"("reversal_of_id");
CREATE INDEX "farm_input_movements_warehouse_id_item_id_idx" ON "farm_input_movements"("warehouse_id", "item_id");
CREATE INDEX "farm_input_movements_ref_type_ref_id_idx" ON "farm_input_movements"("ref_type", "ref_id");
ALTER TABLE "farm_input_movements" ADD CONSTRAINT "farm_input_movements_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Every cooperative that keeps inputs gets a default store: its oldest active warehouse, or a new "Main store".
INSERT INTO "warehouses" ("id", "mamcos_id", "name", "location", "is_active", "updated_at")
SELECT gen_random_uuid()::text, m."mamcos_id", 'Main store', NULL, true, now()
FROM (SELECT DISTINCT "mamcos_id" FROM "farm_input_items" WHERE "mamcos_id" IS NOT NULL) m
WHERE NOT EXISTS (SELECT 1 FROM "warehouses" w WHERE w."mamcos_id" = m."mamcos_id" AND w."is_active");

UPDATE "warehouses" SET "is_default_for_inputs" = true
WHERE "id" IN (SELECT DISTINCT ON ("mamcos_id") "id" FROM "warehouses" WHERE "is_active" AND "mamcos_id" IS NOT NULL ORDER BY "mamcos_id", "created_at");

-- Stock already recorded sits in that default store, marked as older records. Balances per item do not change.
UPDATE "farm_input_movements" mv SET "warehouse_id" = w."id", "ref_type" = COALESCE(mv."ref_type", 'LEGACY')
FROM "farm_input_items" i JOIN "warehouses" w ON w."mamcos_id" = i."mamcos_id" AND w."is_default_for_inputs"
WHERE mv."item_id" = i."id" AND mv."warehouse_id" IS NULL;

-- Fuel was filed as an input type; it becomes its own class so it is never given to farmers on credit.
UPDATE "farm_input_items" SET "stock_class" = 'FUEL' WHERE "type" = 'FUEL';
