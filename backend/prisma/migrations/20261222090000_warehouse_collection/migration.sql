ALTER TABLE "input_issues" ADD COLUMN "warehouse_id" TEXT;
ALTER TABLE "input_applications"
  ADD COLUMN "warehouse_id" TEXT, ADD COLUMN "collect_code_hash" TEXT, ADD COLUMN "collect_code_hint" TEXT,
  ADD COLUMN "ready_at" TIMESTAMP(3), ADD COLUMN "collected_at" TIMESTAMP(3), ADD COLUMN "collected_by_id" TEXT;
CREATE UNIQUE INDEX "input_applications_collect_code_hash_key" ON "input_applications"("collect_code_hash");

CREATE TABLE "input_stock_thresholds" (
  "id" TEXT NOT NULL,
  "mamcos_id" TEXT NOT NULL,
  "warehouse_id" TEXT NOT NULL,
  "item_id" TEXT NOT NULL,
  "min_quantity" DOUBLE PRECISION NOT NULL,
  "low_since" TIMESTAMP(3),
  "updated_by_id" TEXT,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "input_stock_thresholds_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "input_stock_thresholds_warehouse_id_item_id_key" ON "input_stock_thresholds"("warehouse_id", "item_id");
CREATE INDEX "input_stock_thresholds_mamcos_id_idx" ON "input_stock_thresholds"("mamcos_id");
