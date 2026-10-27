CREATE TYPE "StockOwnerType" AS ENUM ('COOPERATIVE', 'FARMER', 'CUSTOMER', 'OTHER');
CREATE TYPE "StockStatus" AS ENUM ('AVAILABLE', 'QUARANTINED', 'DAMAGED', 'REJECTED');
ALTER TABLE "stock_batches"
  ADD COLUMN "owner_type" "StockOwnerType" NOT NULL DEFAULT 'COOPERATIVE',
  ADD COLUMN "owner_farmer_id" TEXT,
  ADD COLUMN "stock_status" "StockStatus" NOT NULL DEFAULT 'AVAILABLE',
  ADD COLUMN "status_reason" TEXT,
  ADD COLUMN "status_changed_by_user_id" TEXT,
  ADD COLUMN "status_changed_at" TIMESTAMP(3);
UPDATE "stock_batches" b SET "owner_type" = 'FARMER', "owner_farmer_id" = r."farmer_id"
FROM "goods_receipts" r WHERE b."receipt_id" = r."id" AND r."farmer_id" IS NOT NULL;
CREATE INDEX "stock_batches_mamcos_id_stock_status_idx" ON "stock_batches"("mamcos_id", "stock_status");
CREATE INDEX "stock_batches_owner_type_owner_farmer_id_idx" ON "stock_batches"("owner_type", "owner_farmer_id");
CREATE TABLE "stock_status_events" (
  "id" TEXT NOT NULL,
  "batch_id" TEXT NOT NULL,
  "from_status" "StockStatus",
  "to_status" "StockStatus" NOT NULL,
  "reason" TEXT NOT NULL,
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_status_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "stock_status_events_batch_id_created_at_idx" ON "stock_status_events"("batch_id", "created_at");
ALTER TABLE "stock_status_events" ADD CONSTRAINT "stock_status_events_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "stock_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
INSERT INTO "resources" ("id", "key", "label") VALUES (gen_random_uuid()::text, 'ops_quality', 'Inventory Quality and Disposition') ON CONFLICT ("key") DO NOTHING;
CREATE TYPE "StockCountStatus" AS ENUM ('COUNTING', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');
CREATE TABLE "stock_counts" (
  "id" TEXT NOT NULL,
  "mamcos_id" TEXT,
  "reference" TEXT NOT NULL,
  "warehouse_id" TEXT NOT NULL,
  "status" "StockCountStatus" NOT NULL DEFAULT 'COUNTING',
  "blind" BOOLEAN NOT NULL DEFAULT true,
  "note" TEXT,
  "created_by_user_id" TEXT NOT NULL,
  "approved_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submitted_at" TIMESTAMP(3),
  "approved_at" TIMESTAMP(3),
  CONSTRAINT "stock_counts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "stock_counts_reference_key" ON "stock_counts"("reference");
CREATE INDEX "stock_counts_mamcos_id_status_idx" ON "stock_counts"("mamcos_id", "status");
CREATE INDEX "stock_counts_warehouse_id_created_at_idx" ON "stock_counts"("warehouse_id", "created_at");
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "stock_count_lines" (
  "id" TEXT NOT NULL,
  "count_id" TEXT NOT NULL,
  "batch_id" TEXT NOT NULL,
  "system_kg" DOUBLE PRECISION NOT NULL,
  "counted_kg" DOUBLE PRECISION,
  "note" TEXT,
  "counted_by_user_id" TEXT,
  "counted_at" TIMESTAMP(3),
  CONSTRAINT "stock_count_lines_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "stock_count_lines_count_id_batch_id_key" ON "stock_count_lines"("count_id", "batch_id");
CREATE INDEX "stock_count_lines_batch_id_idx" ON "stock_count_lines"("batch_id");
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_count_id_fkey" FOREIGN KEY ("count_id") REFERENCES "stock_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "stock_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
