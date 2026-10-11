-- Large rice orders leave over several truck trips, each weighed on its own. Replace the
-- one-delivery-per-order model with one row per truck load. Nothing is lost: the deliveries
-- table only ever held in-flight workflow data from the previous (unreleased) migration.

ALTER TYPE "SaleOrderStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_RELEASED' BEFORE 'RELEASED';

DROP TABLE IF EXISTS "deliveries";

CREATE TABLE "order_loads" (
    "id" TEXT NOT NULL,
    "sale_order_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "weight_kg" DOUBLE PRECISION NOT NULL,
    "bag_count" INTEGER,
    "vehicle_plate" TEXT NOT NULL,
    "driver_name" TEXT NOT NULL,
    "driver_phone" TEXT,
    "mode" "DeliveryMode" NOT NULL,
    "transporter_name" TEXT,
    "fee" DOUBLE PRECISION,
    "destination" TEXT,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'ASSIGNED',
    "notes" TEXT,
    "loaded_by_user_id" TEXT NOT NULL,
    "loaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "departed_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "received_by" TEXT,
    "proof_note" TEXT,
    CONSTRAINT "order_loads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "order_loads_sale_order_id_sequence_key" ON "order_loads"("sale_order_id", "sequence");
ALTER TABLE "order_loads" ADD CONSTRAINT "order_loads_sale_order_id_fkey"
  FOREIGN KEY ("sale_order_id") REFERENCES "sale_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
