-- Staff tasks: the Cashier's daily cash summary, input distribution with the farmer's code, purchase orders and delivery receipts,
-- maintenance schedules, plot-level loans; and the access the Procurement Officer, Accountant and Manager need for them.
ALTER TABLE "loan_records" ADD COLUMN "hectare_id" TEXT;

CREATE TABLE "cash_drawer_closes" (
  "id" TEXT NOT NULL,
  "mamcos_id" TEXT NOT NULL,
  "day" DATE NOT NULL,
  "cashier_id" TEXT NOT NULL,
  "payments_count" INTEGER NOT NULL,
  "expected_cash" DECIMAL(14,2) NOT NULL,
  "expected_mobile" DECIMAL(14,2) NOT NULL,
  "expected_bank" DECIMAL(14,2) NOT NULL,
  "counted_cash" DECIMAL(14,2) NOT NULL,
  "variance" DECIMAL(14,2) NOT NULL,
  "note" TEXT,
  "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
  "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "received_by_id" TEXT,
  "received_at" TIMESTAMP(3),
  "receive_note" TEXT,
  CONSTRAINT "cash_drawer_closes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cash_drawer_closes_counted" CHECK ("counted_cash" >= 0)
);
CREATE UNIQUE INDEX "cash_drawer_closes_mamcos_id_day_cashier_id_key" ON "cash_drawer_closes" ("mamcos_id", "day", "cashier_id");
CREATE INDEX "cash_drawer_closes_mamcos_id_status_idx" ON "cash_drawer_closes" ("mamcos_id", "status");

CREATE TABLE "input_issues" (
  "id" TEXT NOT NULL,
  "mamcos_id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "farmer_id" TEXT NOT NULL,
  "item_id" TEXT NOT NULL,
  "item_name" TEXT NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL,
  "unit" TEXT NOT NULL,
  "unit_price" DECIMAL(14,2) NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "due_id" TEXT,
  "farm_ids" TEXT[],
  "due_date" DATE,
  "ack_code_hash" TEXT NOT NULL,
  "ack_status" TEXT NOT NULL DEFAULT 'PENDING',
  "ack_at" TIMESTAMP(3),
  "ack_by_id" TEXT,
  "ack_attempts" INTEGER NOT NULL DEFAULT 0,
  "note" TEXT,
  "issued_by_id" TEXT NOT NULL,
  "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "input_issues_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "input_issues_quantity" CHECK ("quantity" > 0),
  CONSTRAINT "input_issues_farmer_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "input_issues_item_fkey" FOREIGN KEY ("item_id") REFERENCES "farm_input_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "input_issues_mamcos_id_reference_key" ON "input_issues" ("mamcos_id", "reference");
CREATE INDEX "input_issues_mamcos_id_ack_status_idx" ON "input_issues" ("mamcos_id", "ack_status");
CREATE INDEX "input_issues_farmer_id_idx" ON "input_issues" ("farmer_id");

CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');
CREATE TABLE "purchase_orders" (
  "id" TEXT NOT NULL,
  "mamcos_id" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "supplier_id" TEXT NOT NULL,
  "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "expected_on" DATE,
  "note" TEXT,
  "total_amount" DECIMAL(14,2) NOT NULL,
  "created_by_id" TEXT NOT NULL,
  "approved_by_id" TEXT,
  "approved_at" TIMESTAMP(3),
  "cancel_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_orders_supplier_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "purchase_orders_mamcos_id_number_key" ON "purchase_orders" ("mamcos_id", "number");
CREATE INDEX "purchase_orders_mamcos_id_status_idx" ON "purchase_orders" ("mamcos_id", "status");
CREATE TABLE "purchase_order_lines" (
  "id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "item_name" TEXT NOT NULL,
  "input_item_id" TEXT,
  "unit" TEXT NOT NULL,
  "quantity" DECIMAL(12,2) NOT NULL,
  "unit_price" DECIMAL(14,2) NOT NULL,
  "received" DECIMAL(12,2) NOT NULL DEFAULT 0,
  CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_order_lines_qty" CHECK ("quantity" > 0 AND "received" >= 0),
  CONSTRAINT "purchase_order_lines_order_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "delivery_receipts" (
  "id" TEXT NOT NULL,
  "mamcos_id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "received_on" DATE NOT NULL,
  "delivery_note" TEXT,
  "note" TEXT,
  "received_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delivery_receipts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "delivery_receipts_order_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "delivery_receipts_mamcos_id_number_key" ON "delivery_receipts" ("mamcos_id", "number");
CREATE TABLE "delivery_receipt_lines" (
  "id" TEXT NOT NULL,
  "receipt_id" TEXT NOT NULL,
  "order_line_id" TEXT NOT NULL,
  "quantity" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "delivery_receipt_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "delivery_receipt_lines_qty" CHECK ("quantity" > 0),
  CONSTRAINT "delivery_receipt_lines_receipt_fkey" FOREIGN KEY ("receipt_id") REFERENCES "delivery_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "delivery_receipt_lines_line_fkey" FOREIGN KEY ("order_line_id") REFERENCES "purchase_order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TYPE "MaintenanceTarget" AS ENUM ('CANAL', 'BLOCK', 'GATE', 'EQUIPMENT', 'OTHER');
CREATE TABLE "maintenance_schedules" (
  "id" TEXT NOT NULL,
  "mamcos_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "target" "MaintenanceTarget" NOT NULL,
  "canal_id" TEXT,
  "block_id" TEXT,
  "asset_id" TEXT,
  "location" TEXT,
  "interval_days" INTEGER NOT NULL,
  "next_due_on" DATE NOT NULL,
  "last_done_on" DATE,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "maintenance_schedules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "maintenance_schedules_interval" CHECK ("interval_days" BETWEEN 1 AND 3650)
);
CREATE INDEX "maintenance_schedules_mamcos_id_next_due_on_idx" ON "maintenance_schedules" ("mamcos_id", "next_due_on");
CREATE TABLE "maintenance_logs" (
  "id" TEXT NOT NULL,
  "schedule_id" TEXT NOT NULL,
  "done_on" DATE NOT NULL,
  "done_by_id" TEXT NOT NULL,
  "note" TEXT,
  "cost" DECIMAL(14,2),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "maintenance_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "maintenance_logs_schedule_fkey" FOREIGN KEY ("schedule_id") REFERENCES "maintenance_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "maintenance_logs_schedule_id_done_on_idx" ON "maintenance_logs" ("schedule_id", "done_on");

-- Permissions
INSERT INTO "resources" ("id", "key", "label") VALUES
  (gen_random_uuid()::text, 'cash_drawer', 'Cash Drawer and Daily Collections'),
  (gen_random_uuid()::text, 'input_distribution', 'Input Distribution'),
  (gen_random_uuid()::text, 'purchase_orders', 'Purchase Orders and Deliveries'),
  (gen_random_uuid()::text, 'purchase_order_approval', 'Purchase Order Approval'),
  (gen_random_uuid()::text, 'maintenance_schedule', 'Maintenance Schedules')
ON CONFLICT ("key") DO NOTHING;
INSERT INTO "role_permissions" ("id", "role_id", "resource_id", "action", "created_at")
SELECT gen_random_uuid()::text, r."id", res."id", g."action"::"PermissionAction", now()
FROM "roles" r
JOIN (VALUES
  ('Cashier', 'cash_drawer', 'VIEW'), ('Cashier', 'cash_drawer', 'CREATE'),
  ('Accountant', 'cash_drawer', 'VIEW'), ('Accountant', 'cash_drawer', 'EDIT'),
  ('Manager', 'cash_drawer', 'VIEW'),
  ('Procurement Officer', 'input_distribution', 'VIEW'), ('Procurement Officer', 'input_distribution', 'CREATE'), ('Procurement Officer', 'input_distribution', 'EDIT'),
  ('Accountant', 'input_distribution', 'VIEW'), ('Manager', 'input_distribution', 'VIEW'),
  ('Procurement Officer', 'purchase_orders', 'VIEW'), ('Procurement Officer', 'purchase_orders', 'CREATE'), ('Procurement Officer', 'purchase_orders', 'EDIT'),
  ('Accountant', 'purchase_orders', 'VIEW'), ('Manager', 'purchase_orders', 'VIEW'),
  ('Manager', 'purchase_order_approval', 'EDIT'),
  ('Procurement Officer', 'maintenance_schedule', 'VIEW'), ('Procurement Officer', 'maintenance_schedule', 'CREATE'), ('Procurement Officer', 'maintenance_schedule', 'EDIT'),
  ('Accountant', 'maintenance_schedule', 'VIEW'), ('Manager', 'maintenance_schedule', 'VIEW'),
  ('Block Leader', 'maintenance_schedule', 'VIEW'), ('Canal Leader', 'maintenance_schedule', 'VIEW'),
  ('Cooperative Admin', 'cash_drawer', 'VIEW'), ('Cooperative Admin', 'cash_drawer', 'CREATE'), ('Cooperative Admin', 'cash_drawer', 'EDIT'),
  ('Cooperative Admin', 'input_distribution', 'VIEW'), ('Cooperative Admin', 'input_distribution', 'CREATE'), ('Cooperative Admin', 'input_distribution', 'EDIT'),
  ('Cooperative Admin', 'purchase_orders', 'VIEW'), ('Cooperative Admin', 'purchase_orders', 'CREATE'), ('Cooperative Admin', 'purchase_orders', 'EDIT'),
  ('Cooperative Admin', 'purchase_order_approval', 'EDIT'),
  ('Cooperative Admin', 'maintenance_schedule', 'VIEW'), ('Cooperative Admin', 'maintenance_schedule', 'CREATE'), ('Cooperative Admin', 'maintenance_schedule', 'EDIT'),
  -- the Procurement Officer records maintenance on equipment (assets); the Accountant manages the loan portfolio; the Manager administers staff access
  ('Procurement Officer', 'assets', 'EDIT'),
  ('Accountant', 'loans', 'CREATE'), ('Accountant', 'loans', 'EDIT'),
  ('Manager', 'users', 'VIEW'), ('Manager', 'users', 'CREATE'), ('Manager', 'users', 'EDIT'),
  ('Manager', 'roles', 'VIEW'), ('Manager', 'roles', 'CREATE'), ('Manager', 'roles', 'EDIT')
) AS g("role_name", "resource_key", "action") ON r."name" = g."role_name"
JOIN "resources" res ON res."key" = g."resource_key"
WHERE r."mamcos_id" IS NOT NULL
ON CONFLICT ("role_id", "resource_id", "action") DO NOTHING;
