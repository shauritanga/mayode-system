-- Warehouse stock ledger, reserve-then-release sale orders, delivery tracking, and
-- cooperative ownership on buyers/sales/audit rows. Additive: existing rows keep
-- mamcos_id NULL (platform-level) until backfilled below.

-- CreateEnum
CREATE TYPE "SaleOrderStatus" AS ENUM ('RESERVED', 'CONFIRMED', 'RELEASED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "StockMovementType" AS ENUM ('IN', 'RESERVE', 'UNRESERVE', 'OUT', 'ADJUST');
CREATE TYPE "DeliveryMode" AS ENUM ('BUYER_PICKUP', 'OWN_FLEET', 'HIRED');
CREATE TYPE "DeliveryStatus" AS ENUM ('REQUESTED', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED');

-- Existing tables
ALTER TABLE "buyers" ADD COLUMN "mamcos_id" TEXT;
ALTER TABLE "lots" ADD COLUMN "warehouse_id" TEXT;
ALTER TABLE "sales" ADD COLUMN "mamcos_id" TEXT;
ALTER TABLE "inventory_records" ADD COLUMN "warehouse_id" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "mamcos_id" TEXT;

-- Company-arranged transport has no driver at release time.
ALTER TABLE "dispatches" ALTER COLUMN "vehicle_plate_number" DROP NOT NULL;
ALTER TABLE "dispatches" ALTER COLUMN "driver_name" DROP NOT NULL;
ALTER TABLE "dispatches" ALTER COLUMN "driver_phone" DROP NOT NULL;

-- CreateTable
CREATE TABLE "warehouses" (
    "id" TEXT NOT NULL,
    "mamcos_id" TEXT,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "capacity_kg" DOUBLE PRECISION,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "warehouse_keepers" (
    "id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "warehouse_keepers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity_kg" DOUBLE PRECISION NOT NULL,
    "ref_type" TEXT,
    "ref_id" TEXT,
    "note" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sale_orders" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "mamcos_id" TEXT,
    "buyer_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "lot_id" TEXT NOT NULL,
    "quantity_kg" DOUBLE PRECISION NOT NULL,
    "price_per_kg" DOUBLE PRECISION NOT NULL,
    "fairtrade_premium" DOUBLE PRECISION,
    "rice_variety" TEXT,
    "packaging" TEXT,
    "status" "SaleOrderStatus" NOT NULL DEFAULT 'RESERVED',
    "needs_transport" BOOLEAN NOT NULL DEFAULT false,
    "credit_term_days" INTEGER,
    "credit_approved_by_user_id" TEXT,
    "release_approved_by_user_id" TEXT,
    "release_approved_at" TIMESTAMP(3),
    "notes" TEXT,
    "sale_id" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "confirmed_by_user_id" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "released_by_user_id" TEXT,
    "released_at" TIMESTAMP(3),
    "cancelled_by_user_id" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sale_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sale_order_events" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "from_status" "SaleOrderStatus",
    "to_status" "SaleOrderStatus",
    "note" TEXT,
    "data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sale_order_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "deliveries" (
    "id" TEXT NOT NULL,
    "sale_order_id" TEXT NOT NULL,
    "mode" "DeliveryMode",
    "status" "DeliveryStatus" NOT NULL DEFAULT 'REQUESTED',
    "destination" TEXT,
    "transporter_name" TEXT,
    "vehicle_plate" TEXT,
    "driver_name" TEXT,
    "driver_phone" TEXT,
    "fee" DOUBLE PRECISION,
    "requested_by_user_id" TEXT NOT NULL,
    "assigned_by_user_id" TEXT,
    "assigned_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "received_by" TEXT,
    "proof_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reference_counters" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "reference_counters_pkey" PRIMARY KEY ("key")
);

-- Indexes
CREATE INDEX "buyers_mamcos_id_idx" ON "buyers"("mamcos_id");
CREATE INDEX "sales_mamcos_id_idx" ON "sales"("mamcos_id");
CREATE INDEX "inventory_records_warehouse_id_idx" ON "inventory_records"("warehouse_id");
CREATE INDEX "audit_logs_mamcos_id_created_at_idx" ON "audit_logs"("mamcos_id", "created_at");
CREATE INDEX "warehouses_mamcos_id_idx" ON "warehouses"("mamcos_id");
CREATE UNIQUE INDEX "warehouse_keepers_warehouse_id_user_id_key" ON "warehouse_keepers"("warehouse_id", "user_id");
CREATE INDEX "warehouse_keepers_user_id_idx" ON "warehouse_keepers"("user_id");
CREATE INDEX "stock_movements_warehouse_id_created_at_idx" ON "stock_movements"("warehouse_id", "created_at");
CREATE INDEX "stock_movements_ref_type_ref_id_idx" ON "stock_movements"("ref_type", "ref_id");
CREATE UNIQUE INDEX "sale_orders_reference_key" ON "sale_orders"("reference");
CREATE UNIQUE INDEX "sale_orders_sale_id_key" ON "sale_orders"("sale_id");
CREATE INDEX "sale_orders_mamcos_id_status_idx" ON "sale_orders"("mamcos_id", "status");
CREATE INDEX "sale_orders_warehouse_id_status_idx" ON "sale_orders"("warehouse_id", "status");
CREATE INDEX "sale_order_events_order_id_created_at_idx" ON "sale_order_events"("order_id", "created_at");
CREATE UNIQUE INDEX "deliveries_sale_order_id_key" ON "deliveries"("sale_order_id");

-- Foreign keys
ALTER TABLE "buyers" ADD CONSTRAINT "buyers_mamcos_id_fkey" FOREIGN KEY ("mamcos_id") REFERENCES "mamcos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "lots" ADD CONSTRAINT "lots_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_records" ADD CONSTRAINT "inventory_records_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_mamcos_id_fkey" FOREIGN KEY ("mamcos_id") REFERENCES "mamcos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "warehouse_keepers" ADD CONSTRAINT "warehouse_keepers_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "warehouse_keepers" ADD CONSTRAINT "warehouse_keepers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_orders" ADD CONSTRAINT "sale_orders_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "buyers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_orders" ADD CONSTRAINT "sale_orders_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_orders" ADD CONSTRAINT "sale_orders_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_orders" ADD CONSTRAINT "sale_orders_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sale_order_events" ADD CONSTRAINT "sale_order_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sale_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_sale_order_id_fkey" FOREIGN KEY ("sale_order_id") REFERENCES "sale_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Permission-catalog resources for the new screens.
INSERT INTO "resources" ("id", "key", "label") VALUES
  (gen_random_uuid()::text, 'warehouses', 'Warehouses & Stock'),
  (gen_random_uuid()::text, 'sale_orders', 'Sale Orders'),
  (gen_random_uuid()::text, 'warehouse_desk', 'Warehouse Desk (confirm & release)'),
  (gen_random_uuid()::text, 'release_approvals', 'Release & Credit Approvals'),
  (gen_random_uuid()::text, 'audit_logs', 'Audit Log')
ON CONFLICT ("key") DO NOTHING;

-- Cooperative admins created before this migration get the new grants too
-- (they already hold every non-platform resource on their own cooperative).
INSERT INTO "role_permissions" ("id", "role_id", "resource_id", "action")
SELECT gen_random_uuid()::text, r."id", res."id", a.action::"PermissionAction"
FROM "roles" r
CROSS JOIN "resources" res
CROSS JOIN (VALUES ('VIEW'), ('CREATE'), ('EDIT'), ('DELETE')) AS a(action)
WHERE r."name" = 'Cooperative Admin' AND r."mamcos_id" IS NOT NULL
  AND res."key" IN ('warehouses', 'sale_orders', 'warehouse_desk', 'release_approvals', 'audit_logs')
ON CONFLICT DO NOTHING;
