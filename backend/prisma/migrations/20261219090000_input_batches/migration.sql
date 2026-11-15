-- Farm inputs are received in batches with an optional expiry date; every movement says which batch it touches.
ALTER TABLE "farm_input_movements" ADD COLUMN "batch_no" TEXT;
ALTER TABLE "farm_input_movements" ADD COLUMN "expires_on" DATE;
CREATE INDEX "farm_input_movements_item_id_warehouse_id_batch_no_idx" ON "farm_input_movements"("item_id", "warehouse_id", "batch_no");
