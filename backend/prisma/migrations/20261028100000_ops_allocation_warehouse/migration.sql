-- The warehouse a reservation is held at (stock is counted per batch and warehouse).
ALTER TABLE "order_allocations" ADD COLUMN "warehouse_id" TEXT NOT NULL DEFAULT '';
ALTER TABLE "order_allocations" ALTER COLUMN "warehouse_id" DROP DEFAULT;
