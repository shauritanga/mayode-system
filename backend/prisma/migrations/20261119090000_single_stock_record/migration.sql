-- One physical stock record (the batch ledger), valued in the books.

-- Cost per kg on batches, and the price the cooperative pays on a receipt.
ALTER TABLE "stock_batches" ADD COLUMN "unit_cost" DOUBLE PRECISION;
ALTER TABLE "goods_receipts" ADD COLUMN "price_per_kg" DOUBLE PRECISION;
ALTER TABLE "goods_receipts" ADD COLUMN "valued_by_source" TEXT;
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_unit_cost_check" CHECK ("unit_cost" IS NULL OR "unit_cost" >= 0);
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_price_per_kg_check" CHECK ("price_per_kg" IS NULL OR "price_per_kg" >= 0);

-- Legacy stock (counted in at the old warehouse counter) becomes one opening batch per warehouse,
-- so the single stock record starts with the same kilograms the warehouse already held.
-- The old stock_movements rows are kept for history; from now on only reservations live there.
INSERT INTO "products" ("id", "mamcos_id", "code", "name", "category", "unit", "tax_rate_percent", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid()::text, w."mamcos_id", 'OPENING-' || substr(w."id", 1, 8), 'Paddy (opening balance)', 'PADDY'::"ProductCategory", 'kg', 0, true, now(), now()
FROM "warehouses" w
JOIN (
  SELECT "warehouse_id",
         SUM(CASE WHEN "type" IN ('IN', 'ADJUST') THEN "quantity_kg" WHEN "type" = 'OUT' THEN -"quantity_kg" ELSE 0 END) AS net
  FROM "stock_movements" GROUP BY "warehouse_id"
) m ON m."warehouse_id" = w."id"
WHERE m.net > 0;

WITH legacy AS (
  SELECT "warehouse_id",
         SUM(CASE WHEN "type" IN ('IN', 'ADJUST') THEN "quantity_kg" WHEN "type" = 'OUT' THEN -"quantity_kg" ELSE 0 END) AS net
  FROM "stock_movements" GROUP BY "warehouse_id"
), made AS (
  INSERT INTO "stock_batches" ("id", "mamcos_id", "reference", "product_id", "warehouse_id", "owner_type", "stock_status", "created_at")
  SELECT gen_random_uuid()::text, w."mamcos_id", 'BT-OPEN-' || substr(w."id", 1, 8), p."id", w."id", 'COOPERATIVE'::"StockOwnerType", 'AVAILABLE'::"StockStatus", now()
  FROM legacy l
  JOIN "warehouses" w ON w."id" = l."warehouse_id"
  JOIN "products" p ON p."code" = 'OPENING-' || substr(w."id", 1, 8)
  WHERE l.net > 0
  RETURNING "id", "warehouse_id"
)
INSERT INTO "stock_ledger" ("id", "batch_id", "warehouse_id", "type", "quantity_kg", "ref_type", "reason", "created_at")
SELECT gen_random_uuid()::text, made."id", made."warehouse_id", 'RECEIPT'::"LedgerType", l.net, 'legacy-opening', 'Stock held before the single stock record', now()
FROM made JOIN legacy l ON l."warehouse_id" = made."warehouse_id";

-- Stock rows are never edited or deleted; a mistake is corrected by a new row.
-- (Created last so the backfill above is not blocked.)
CREATE FUNCTION stock_ledger_immutable() RETURNS trigger AS $$
BEGIN
  IF current_setting('app.ledger_maintenance', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Stock records cannot be changed or deleted; add a correcting entry instead' USING ERRCODE = '23514';
END $$ LANGUAGE plpgsql;
CREATE TRIGGER stock_ledger_immutable BEFORE UPDATE OR DELETE ON "stock_ledger"
  FOR EACH ROW EXECUTE FUNCTION stock_ledger_immutable();
