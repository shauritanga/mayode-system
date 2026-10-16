-- Rice aggregation: collection centres, variety, bags, purchase price/value, batch and farmer payment on deliveries.
CREATE TYPE "FarmerPaymentStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID');

CREATE TABLE "collection_centres" (
  "id" TEXT NOT NULL,
  "mamcos_id" TEXT,
  "name" TEXT NOT NULL,
  "region" TEXT,
  "district" TEXT,
  "ward" TEXT,
  "village" TEXT,
  "contact_phone" TEXT,
  "warehouse_id" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "collection_centres_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "collection_centres_mamcos_id_idx" ON "collection_centres"("mamcos_id");
ALTER TABLE "collection_centres" ADD CONSTRAINT "collection_centres_mamcos_id_fkey"
  FOREIGN KEY ("mamcos_id") REFERENCES "mamcos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "collection_centres" ADD CONSTRAINT "collection_centres_warehouse_id_fkey"
  FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "inventory_records"
  ADD COLUMN "mamcos_id" TEXT,
  ADD COLUMN "collection_centre_id" TEXT,
  ADD COLUMN "rice_variety" TEXT,
  ADD COLUMN "bags" INTEGER,
  ADD COLUMN "price_per_kg" DOUBLE PRECISION,
  ADD COLUMN "total_value" DOUBLE PRECISION,
  ADD COLUMN "batch_number" TEXT,
  ADD COLUMN "farmer_payment_status" "FarmerPaymentStatus" NOT NULL DEFAULT 'UNPAID',
  ADD COLUMN "amount_paid" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "paid_at" TIMESTAMP(3);
ALTER TABLE "inventory_records" ADD CONSTRAINT "inventory_records_collection_centre_id_fkey"
  FOREIGN KEY ("collection_centre_id") REFERENCES "collection_centres"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "inventory_records_mamcos_id_status_idx" ON "inventory_records"("mamcos_id", "status");
CREATE INDEX "inventory_records_collection_centre_id_idx" ON "inventory_records"("collection_centre_id");

-- Existing deliveries: cooperative from the farm, variety from the crop season or the lot.
UPDATE "inventory_records" r SET "mamcos_id" = f."mamcos_id" FROM "farms" f WHERE r."farm_id" = f."id";
UPDATE "inventory_records" r SET "rice_variety" = c."rice_variety" FROM "crop_cycles" c WHERE r."crop_cycle_id" = c."id" AND c."rice_variety" IS NOT NULL;
UPDATE "inventory_records" r SET "rice_variety" = l."rice_variety" FROM "lots" l WHERE r."lot_number" = l."lot_number" AND r."rice_variety" IS NULL AND l."rice_variety" IS NOT NULL;
