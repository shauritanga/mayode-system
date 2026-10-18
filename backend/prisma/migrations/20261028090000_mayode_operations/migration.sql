-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('PADDY', 'PROCESSED', 'BROKEN', 'BYPRODUCT');

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('INDIVIDUAL', 'BUSINESS');

-- CreateEnum
CREATE TYPE "ReceiptSource" AS ENUM ('MAYODE_FARM', 'EXTERNAL_FARMER');

-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InspectionResult" AS ENUM ('NOT_REQUIRED', 'PASSED', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "LedgerType" AS ENUM ('RECEIPT', 'PROCESS_OUT', 'PROCESS_IN', 'DISPATCH', 'ADJUSTMENT', 'TRANSFER_OUT', 'TRANSFER_IN', 'WRITE_OFF');

-- CreateEnum
CREATE TYPE "ProcessingKind" AS ENUM ('MILLING', 'PACKAGING');

-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('COMPLETED', 'REVERSED');

-- CreateEnum
CREATE TYPE "OutputKind" AS ENUM ('PRODUCT', 'BROKEN', 'BRAN', 'HUSK', 'OTHER');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'EXPIRED', 'CANCELLED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "OpsOrderStatus" AS ENUM ('PENDING_ACCOUNTS_REVIEW', 'RETURNED_TO_SALES', 'APPROVED_FOR_INVOICING', 'INVOICED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PayState" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID');

-- CreateEnum
CREATE TYPE "FulfilState" AS ENUM ('NOT_AUTHORIZED', 'AUTHORIZED', 'SHORTAGE', 'ALLOCATED', 'PARTIALLY_DISPATCHED', 'DISPATCHED');

-- CreateEnum
CREATE TYPE "OpsInvoiceStatus" AS ENUM ('ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "OpsPaymentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "OpsPaymentMethod" AS ENUM ('CONTROL_NUMBER', 'MOBILE_MONEY', 'BANK_TRANSFER', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "OpsDispatchStatus" AS ENUM ('PREPARED', 'RELEASED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OpsDeliveryState" AS ENUM ('NOT_DELIVERED', 'DELIVERED', 'EXCEPTION');

-- CreateEnum
CREATE TYPE "FarmTaskType" AS ENUM ('TASK', 'INSPECTION');

-- CreateEnum
CREATE TYPE "FarmTaskStatus" AS ENUM ('ASSIGNED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'PENDING_REVIEW', 'RETURNED', 'REJECTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "FarmInputType" AS ENUM ('SEED', 'FERTILIZER', 'PESTICIDE', 'HERBICIDE', 'FUEL', 'OTHER');

-- CreateEnum
CREATE TYPE "InputMovementType" AS ENUM ('IN', 'OUT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "HarvestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'CLOSED');

-- AlterTable
ALTER TABLE "farms" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "is_mayode_farm" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "manager_user_id" TEXT;

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "mamcos_id" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "rice_variety" TEXT,
    "category" "ProductCategory" NOT NULL,
    "grade" TEXT,
    "pack_size_kg" DOUBLE PRECISION,
    "unit" TEXT NOT NULL DEFAULT 'kg',
    "unit_price" DOUBLE PRECISION,
    "tax_rate_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reorder_level_kg" DOUBLE PRECISION,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "mamcos_id" TEXT,
    "reference" TEXT NOT NULL,
    "type" "CustomerType" NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT,
    "id_number" TEXT,
    "contact_person" TEXT,
    "business_reg_no" TEXT,
    "tin" TEXT,
    "vrn" TEXT,
    "billing_address" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_batches" (
    "id" TEXT NOT NULL,
    "mamcos_id" TEXT,
    "reference" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "storage_location" TEXT,
    "rice_variety" TEXT,
    "grade" TEXT,
    "receipt_id" TEXT,
    "processing_run_id" TEXT,
    "output_kind" "OutputKind",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_ledger" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "type" "LedgerType" NOT NULL,
    "quantity_kg" DOUBLE PRECISION NOT NULL,
    "ref_type" TEXT,
    "ref_id" TEXT,
    "reason" TEXT,
    "approved_by_user_id" TEXT,
    "reversal_of_id" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" TEXT NOT NULL,
    "mamcos_id" TEXT,
    "reference" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "source_type" "ReceiptSource" NOT NULL,
    "farmer_id" TEXT,
    "seller_name" TEXT,
    "seller_phone" TEXT,
    "farm_id" TEXT,
    "plot_id" TEXT,
    "crop_cycle_id" TEXT,
    "harvest_record_id" TEXT,
    "harvest_batch_ref" TEXT,
    "rice_variety" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL,
    "gross_kg" DOUBLE PRECISION NOT NULL,
    "bags" INTEGER,
    "bag_weight_kg" DOUBLE PRECISION,
    "moisture_pct" DOUBLE PRECISION,
    "quality_grade" TEXT,
    "inspection" "InspectionResult" NOT NULL DEFAULT 'NOT_REQUIRED',
    "rejected_kg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "inspection_notes" TEXT,
    "notes" TEXT,
    "attachments" TEXT[],
    "status" "ReceiptStatus" NOT NULL DEFAULT 'DRAFT',
    "received_by_user_id" TEXT NOT NULL,
    "confirmed_by_user_id" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processing_runs" (
    "id" TEXT NOT NULL,
    "mamcos_id" TEXT,
    "reference" TEXT NOT NULL,
    "kind" "ProcessingKind" NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL,
    "machine" TEXT,
    "operator_name" TEXT,
    "operator_user_id" TEXT,
    "input_kg" DOUBLE PRECISION NOT NULL,
    "output_kg" DOUBLE PRECISION NOT NULL,
    "loss_kg" DOUBLE PRECISION NOT NULL,
    "loss_note" TEXT,
    "status" "ProcessingStatus" NOT NULL DEFAULT 'COMPLETED',
    "reversed_at" TIMESTAMP(3),
    "reversed_by_user_id" TEXT,
    "reverse_reason" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processing_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processing_inputs" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "quantity_kg" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "processing_inputs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processing_outputs" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "batch_id" TEXT,
    "product_id" TEXT,
    "kind" "OutputKind" NOT NULL,
    "quantity_kg" DOUBLE PRECISION NOT NULL,
    "destination_location" TEXT,
    "note" TEXT,

    CONSTRAINT "processing_outputs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotations" (
    "id" TEXT NOT NULL,
    "mamcos_id" TEXT,
    "reference" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "valid_until" TIMESTAMP(3),
    "delivery_mode" TEXT,
    "delivery_note" TEXT,
    "notes" TEXT,
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discount_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tax_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_lines" (
    "id" TEXT NOT NULL,
    "quotation_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit_price" DOUBLE PRECISION NOT NULL,
    "discount_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tax_rate_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "line_total" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "quotation_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ops_orders" (
    "id" TEXT NOT NULL,
    "mamcos_id" TEXT,
    "reference" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "quotation_id" TEXT,
    "status" "OpsOrderStatus" NOT NULL DEFAULT 'PENDING_ACCOUNTS_REVIEW',
    "payment_status" "PayState" NOT NULL DEFAULT 'UNPAID',
    "fulfil_state" "FulfilState" NOT NULL DEFAULT 'NOT_AUTHORIZED',
    "delivery_mode" TEXT,
    "delivery_note" TEXT,
    "notes" TEXT,
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discount_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tax_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amount_paid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_by_user_id" TEXT NOT NULL,
    "reviewed_by_user_id" TEXT,
    "review_decision" TEXT,
    "review_comment" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "authorized_by_user_id" TEXT,
    "authorized_at" TIMESTAMP(3),
    "authorization_override" TEXT,
    "shortage_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ops_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ops_order_lines" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit_price" DOUBLE PRECISION NOT NULL,
    "discount_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tax_rate_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "line_total" DOUBLE PRECISION NOT NULL,
    "dispatched_qty" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "ops_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ops_order_events" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "from_status" TEXT,
    "to_status" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ops_order_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_allocations" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "order_line_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "quantity_kg" DOUBLE PRECISION NOT NULL,
    "dispatched_kg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "released_kg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ops_invoices" (
    "id" TEXT NOT NULL,
    "mamcos_id" TEXT,
    "invoice_number" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "customer_details" JSONB NOT NULL,
    "status" "OpsInvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "subtotal" DOUBLE PRECISION NOT NULL,
    "discount_total" DOUBLE PRECISION NOT NULL,
    "tax_total" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "amount_paid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "invoice_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_date" TIMESTAMP(3),
    "payment_instructions" TEXT,
    "control_number" TEXT,
    "control_number_at" TIMESTAMP(3),
    "control_number_source" TEXT,
    "void_reason" TEXT,
    "issued_by_user_id" TEXT NOT NULL,
    "shared_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ops_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ops_invoice_lines" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "brand" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "unit_price" DOUBLE PRECISION NOT NULL,
    "discount_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tax_rate_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "line_total" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ops_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ops_payments" (
    "id" TEXT NOT NULL,
    "mamcos_id" TEXT,
    "invoice_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" "OpsPaymentMethod" NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'MANUAL',
    "provider_reference" TEXT NOT NULL,
    "status" "OpsPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paid_at" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "payer_name" TEXT,
    "raw_payload" JSONB,
    "recorded_by_user_id" TEXT,
    "confirmed_by_user_id" TEXT,
    "reject_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ops_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ops_dispatches" (
    "id" TEXT NOT NULL,
    "mamcos_id" TEXT,
    "reference" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "invoice_id" TEXT,
    "warehouse_id" TEXT NOT NULL,
    "status" "OpsDispatchStatus" NOT NULL DEFAULT 'PREPARED',
    "vehicle_plate" TEXT NOT NULL,
    "driver_name" TEXT NOT NULL,
    "driver_phone" TEXT,
    "transporter" TEXT,
    "dispatch_at" TIMESTAMP(3) NOT NULL,
    "released_at" TIMESTAMP(3),
    "releasing_officer_id" TEXT NOT NULL,
    "supervisor_user_id" TEXT,
    "supervisor_name" TEXT,
    "destination" TEXT,
    "notes" TEXT,
    "attachments" TEXT[],
    "release_note_number" TEXT,
    "share_token" TEXT,
    "delivery_state" "OpsDeliveryState" NOT NULL DEFAULT 'NOT_DELIVERED',
    "delivered_at" TIMESTAMP(3),
    "received_by" TEXT,
    "delivery_note" TEXT,
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ops_dispatches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ops_dispatch_lines" (
    "id" TEXT NOT NULL,
    "dispatch_id" TEXT NOT NULL,
    "order_line_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "quantity_kg" DOUBLE PRECISION NOT NULL,
    "packages" INTEGER,

    CONSTRAINT "ops_dispatch_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfers" (
    "id" TEXT NOT NULL,
    "mamcos_id" TEXT,
    "reference" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "from_warehouse_id" TEXT NOT NULL,
    "to_warehouse_id" TEXT NOT NULL,
    "quantity_kg" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_TRANSIT',
    "received_kg" DOUBLE PRECISION,
    "note" TEXT,
    "sent_by_user_id" TEXT NOT NULL,
    "received_by_user_id" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received_at" TIMESTAMP(3),

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farm_tasks" (
    "id" TEXT NOT NULL,
    "mamcos_id" TEXT,
    "reference" TEXT NOT NULL,
    "type" "FarmTaskType" NOT NULL DEFAULT 'TASK',
    "farm_id" TEXT NOT NULL,
    "plot_id" TEXT,
    "crop_cycle_id" TEXT,
    "activity_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "assignee_user_id" TEXT NOT NULL,
    "assigned_by_user_id" TEXT NOT NULL,
    "reviewer_user_id" TEXT,
    "planned_start" TIMESTAMP(3),
    "deadline" TIMESTAMP(3),
    "expected_output" TEXT,
    "required_inputs" TEXT,
    "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
    "attachments" TEXT[],
    "require_gps" BOOLEAN NOT NULL DEFAULT true,
    "geofence_m" INTEGER NOT NULL DEFAULT 300,
    "status" "FarmTaskStatus" NOT NULL DEFAULT 'ASSIGNED',
    "parent_task_id" TEXT,
    "inspection_objective" TEXT,
    "review_decision" TEXT,
    "review_comment" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "farm_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_check_ins" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'CHECK_IN',
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy_m" DOUBLE PRECISION,
    "device_time" TIMESTAMP(3) NOT NULL,
    "server_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference_lat" DOUBLE PRECISION,
    "reference_lon" DOUBLE PRECISION,
    "distance_m" DOUBLE PRECISION,
    "within_geofence" BOOLEAN,
    "photo_urls" TEXT[],
    "note" TEXT,
    "client_key" TEXT,

    CONSTRAINT "task_check_ins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_reports" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "submitted_by_user_id" TEXT NOT NULL,
    "actual_start" TIMESTAMP(3),
    "actual_end" TIMESTAMP(3),
    "work_done_qty" DOUBLE PRECISION,
    "work_done_unit" TEXT,
    "equipment" TEXT,
    "observations" TEXT,
    "incomplete_reason" TEXT,
    "photo_urls" TEXT[],
    "inputs" JSONB,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_events" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "from_status" TEXT,
    "to_status" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_reports" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "crop_condition" TEXT,
    "growth_stage" TEXT,
    "pests" TEXT,
    "diseases" TEXT,
    "soil_water" TEXT,
    "observations" TEXT,
    "photo_urls" TEXT[],
    "recommendations" JSONB,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspection_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farm_input_items" (
    "id" TEXT NOT NULL,
    "mamcos_id" TEXT,
    "name" TEXT NOT NULL,
    "type" "FarmInputType" NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'kg',
    "unit_cost" DOUBLE PRECISION,
    "reorder_level" DOUBLE PRECISION,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "farm_input_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farm_input_movements" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "type" "InputMovementType" NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "task_id" TEXT,
    "farm_id" TEXT,
    "plot_id" TEXT,
    "crop_cycle_id" TEXT,
    "employee_user_id" TEXT,
    "note" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "farm_input_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harvest_records" (
    "id" TEXT NOT NULL,
    "mamcos_id" TEXT,
    "reference" TEXT NOT NULL,
    "batch_ref" TEXT NOT NULL,
    "farm_id" TEXT NOT NULL,
    "plot_id" TEXT,
    "crop_cycle_id" TEXT NOT NULL,
    "rice_variety" TEXT,
    "harvest_date" TIMESTAMP(3) NOT NULL,
    "estimated_kg" DOUBLE PRECISION,
    "actual_kg" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'kg',
    "team" TEXT,
    "responsible_user_id" TEXT,
    "quality_notes" TEXT,
    "destination" TEXT NOT NULL DEFAULT 'WAREHOUSE',
    "transported_kg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "transport_note" TEXT,
    "status" "HarvestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "harvest_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "products_code_key" ON "products"("code");

-- CreateIndex
CREATE INDEX "products_mamcos_id_category_idx" ON "products"("mamcos_id", "category");

-- CreateIndex
CREATE UNIQUE INDEX "customers_reference_key" ON "customers"("reference");

-- CreateIndex
CREATE INDEX "customers_mamcos_id_name_idx" ON "customers"("mamcos_id", "name");

-- CreateIndex
CREATE INDEX "customers_phone_idx" ON "customers"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "stock_batches_reference_key" ON "stock_batches"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "stock_batches_receipt_id_key" ON "stock_batches"("receipt_id");

-- CreateIndex
CREATE INDEX "stock_batches_product_id_warehouse_id_idx" ON "stock_batches"("product_id", "warehouse_id");

-- CreateIndex
CREATE INDEX "stock_batches_mamcos_id_idx" ON "stock_batches"("mamcos_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_ledger_reversal_of_id_key" ON "stock_ledger"("reversal_of_id");

-- CreateIndex
CREATE INDEX "stock_ledger_batch_id_idx" ON "stock_ledger"("batch_id");

-- CreateIndex
CREATE INDEX "stock_ledger_warehouse_id_created_at_idx" ON "stock_ledger"("warehouse_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_ledger_ref_type_ref_id_idx" ON "stock_ledger"("ref_type", "ref_id");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_reference_key" ON "goods_receipts"("reference");

-- CreateIndex
CREATE INDEX "goods_receipts_mamcos_id_status_idx" ON "goods_receipts"("mamcos_id", "status");

-- CreateIndex
CREATE INDEX "goods_receipts_farmer_id_idx" ON "goods_receipts"("farmer_id");

-- CreateIndex
CREATE INDEX "goods_receipts_harvest_record_id_idx" ON "goods_receipts"("harvest_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "processing_runs_reference_key" ON "processing_runs"("reference");

-- CreateIndex
CREATE INDEX "processing_runs_mamcos_id_processed_at_idx" ON "processing_runs"("mamcos_id", "processed_at");

-- CreateIndex
CREATE INDEX "processing_inputs_run_id_idx" ON "processing_inputs"("run_id");

-- CreateIndex
CREATE INDEX "processing_inputs_batch_id_idx" ON "processing_inputs"("batch_id");

-- CreateIndex
CREATE INDEX "processing_outputs_run_id_idx" ON "processing_outputs"("run_id");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_reference_key" ON "quotations"("reference");

-- CreateIndex
CREATE INDEX "quotations_mamcos_id_status_idx" ON "quotations"("mamcos_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ops_orders_reference_key" ON "ops_orders"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "ops_orders_quotation_id_key" ON "ops_orders"("quotation_id");

-- CreateIndex
CREATE INDEX "ops_orders_mamcos_id_status_idx" ON "ops_orders"("mamcos_id", "status");

-- CreateIndex
CREATE INDEX "ops_orders_customer_id_idx" ON "ops_orders"("customer_id");

-- CreateIndex
CREATE INDEX "ops_order_lines_order_id_idx" ON "ops_order_lines"("order_id");

-- CreateIndex
CREATE INDEX "ops_order_events_order_id_created_at_idx" ON "ops_order_events"("order_id", "created_at");

-- CreateIndex
CREATE INDEX "order_allocations_batch_id_idx" ON "order_allocations"("batch_id");

-- CreateIndex
CREATE INDEX "order_allocations_order_id_idx" ON "order_allocations"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "ops_invoices_invoice_number_key" ON "ops_invoices"("invoice_number");

-- CreateIndex
CREATE UNIQUE INDEX "ops_invoices_control_number_key" ON "ops_invoices"("control_number");

-- CreateIndex
CREATE INDEX "ops_invoices_order_id_idx" ON "ops_invoices"("order_id");

-- CreateIndex
CREATE INDEX "ops_invoices_mamcos_id_status_idx" ON "ops_invoices"("mamcos_id", "status");

-- CreateIndex
CREATE INDEX "ops_payments_order_id_idx" ON "ops_payments"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "ops_payments_provider_provider_reference_key" ON "ops_payments"("provider", "provider_reference");

-- CreateIndex
CREATE UNIQUE INDEX "ops_dispatches_reference_key" ON "ops_dispatches"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "ops_dispatches_release_note_number_key" ON "ops_dispatches"("release_note_number");

-- CreateIndex
CREATE UNIQUE INDEX "ops_dispatches_share_token_key" ON "ops_dispatches"("share_token");

-- CreateIndex
CREATE INDEX "ops_dispatches_order_id_idx" ON "ops_dispatches"("order_id");

-- CreateIndex
CREATE INDEX "ops_dispatches_mamcos_id_status_idx" ON "ops_dispatches"("mamcos_id", "status");

-- CreateIndex
CREATE INDEX "ops_dispatch_lines_dispatch_id_idx" ON "ops_dispatch_lines"("dispatch_id");

-- CreateIndex
CREATE INDEX "ops_dispatch_lines_batch_id_idx" ON "ops_dispatch_lines"("batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfers_reference_key" ON "stock_transfers"("reference");

-- CreateIndex
CREATE INDEX "stock_transfers_mamcos_id_status_idx" ON "stock_transfers"("mamcos_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "farm_tasks_reference_key" ON "farm_tasks"("reference");

-- CreateIndex
CREATE INDEX "farm_tasks_assignee_user_id_status_idx" ON "farm_tasks"("assignee_user_id", "status");

-- CreateIndex
CREATE INDEX "farm_tasks_mamcos_id_status_idx" ON "farm_tasks"("mamcos_id", "status");

-- CreateIndex
CREATE INDEX "farm_tasks_farm_id_plot_id_idx" ON "farm_tasks"("farm_id", "plot_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_check_ins_client_key_key" ON "task_check_ins"("client_key");

-- CreateIndex
CREATE INDEX "task_check_ins_task_id_idx" ON "task_check_ins"("task_id");

-- CreateIndex
CREATE INDEX "task_check_ins_user_id_server_time_idx" ON "task_check_ins"("user_id", "server_time");

-- CreateIndex
CREATE INDEX "task_reports_task_id_idx" ON "task_reports"("task_id");

-- CreateIndex
CREATE INDEX "task_events_task_id_created_at_idx" ON "task_events"("task_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "inspection_reports_task_id_key" ON "inspection_reports"("task_id");

-- CreateIndex
CREATE UNIQUE INDEX "farm_input_items_mamcos_id_name_key" ON "farm_input_items"("mamcos_id", "name");

-- CreateIndex
CREATE INDEX "farm_input_movements_item_id_idx" ON "farm_input_movements"("item_id");

-- CreateIndex
CREATE INDEX "farm_input_movements_task_id_idx" ON "farm_input_movements"("task_id");

-- CreateIndex
CREATE INDEX "farm_input_movements_plot_id_crop_cycle_id_idx" ON "farm_input_movements"("plot_id", "crop_cycle_id");

-- CreateIndex
CREATE UNIQUE INDEX "harvest_records_reference_key" ON "harvest_records"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "harvest_records_batch_ref_key" ON "harvest_records"("batch_ref");

-- CreateIndex
CREATE INDEX "harvest_records_mamcos_id_harvest_date_idx" ON "harvest_records"("mamcos_id", "harvest_date");

-- CreateIndex
CREATE INDEX "harvest_records_crop_cycle_id_idx" ON "harvest_records"("crop_cycle_id");

-- AddForeignKey
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "goods_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_processing_run_id_fkey" FOREIGN KEY ("processing_run_id") REFERENCES "processing_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "stock_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_plot_id_fkey" FOREIGN KEY ("plot_id") REFERENCES "plots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_crop_cycle_id_fkey" FOREIGN KEY ("crop_cycle_id") REFERENCES "crop_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_harvest_record_id_fkey" FOREIGN KEY ("harvest_record_id") REFERENCES "harvest_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_runs" ADD CONSTRAINT "processing_runs_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_inputs" ADD CONSTRAINT "processing_inputs_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "processing_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_inputs" ADD CONSTRAINT "processing_inputs_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "stock_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_outputs" ADD CONSTRAINT "processing_outputs_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "processing_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_outputs" ADD CONSTRAINT "processing_outputs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ops_orders" ADD CONSTRAINT "ops_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ops_orders" ADD CONSTRAINT "ops_orders_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ops_order_lines" ADD CONSTRAINT "ops_order_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "ops_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ops_order_lines" ADD CONSTRAINT "ops_order_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ops_order_events" ADD CONSTRAINT "ops_order_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "ops_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_allocations" ADD CONSTRAINT "order_allocations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "ops_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_allocations" ADD CONSTRAINT "order_allocations_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "ops_order_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_allocations" ADD CONSTRAINT "order_allocations_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "stock_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ops_invoices" ADD CONSTRAINT "ops_invoices_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "ops_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ops_invoice_lines" ADD CONSTRAINT "ops_invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "ops_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ops_payments" ADD CONSTRAINT "ops_payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "ops_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ops_payments" ADD CONSTRAINT "ops_payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "ops_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ops_dispatches" ADD CONSTRAINT "ops_dispatches_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "ops_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ops_dispatches" ADD CONSTRAINT "ops_dispatches_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ops_dispatch_lines" ADD CONSTRAINT "ops_dispatch_lines_dispatch_id_fkey" FOREIGN KEY ("dispatch_id") REFERENCES "ops_dispatches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ops_dispatch_lines" ADD CONSTRAINT "ops_dispatch_lines_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "ops_order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ops_dispatch_lines" ADD CONSTRAINT "ops_dispatch_lines_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "stock_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_tasks" ADD CONSTRAINT "farm_tasks_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_tasks" ADD CONSTRAINT "farm_tasks_plot_id_fkey" FOREIGN KEY ("plot_id") REFERENCES "plots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_tasks" ADD CONSTRAINT "farm_tasks_crop_cycle_id_fkey" FOREIGN KEY ("crop_cycle_id") REFERENCES "crop_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_tasks" ADD CONSTRAINT "farm_tasks_parent_task_id_fkey" FOREIGN KEY ("parent_task_id") REFERENCES "farm_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_check_ins" ADD CONSTRAINT "task_check_ins_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "farm_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_reports" ADD CONSTRAINT "task_reports_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "farm_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "farm_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_reports" ADD CONSTRAINT "inspection_reports_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "farm_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_input_movements" ADD CONSTRAINT "farm_input_movements_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "farm_input_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_input_movements" ADD CONSTRAINT "farm_input_movements_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "farm_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_records" ADD CONSTRAINT "harvest_records_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_records" ADD CONSTRAINT "harvest_records_plot_id_fkey" FOREIGN KEY ("plot_id") REFERENCES "plots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_records" ADD CONSTRAINT "harvest_records_crop_cycle_id_fkey" FOREIGN KEY ("crop_cycle_id") REFERENCES "crop_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Permission resources for the new operations screens.
INSERT INTO "resources" ("id", "key", "label") VALUES (gen_random_uuid()::text, 'ops_catalog', 'Products and Brands') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "resources" ("id", "key", "label") VALUES (gen_random_uuid()::text, 'ops_customers', 'Customers') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "resources" ("id", "key", "label") VALUES (gen_random_uuid()::text, 'ops_orders', 'Quotations and Customer Orders') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "resources" ("id", "key", "label") VALUES (gen_random_uuid()::text, 'ops_review', 'Order Review and Invoicing') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "resources" ("id", "key", "label") VALUES (gen_random_uuid()::text, 'ops_payments', 'Payments and Fulfilment Authorisation') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "resources" ("id", "key", "label") VALUES (gen_random_uuid()::text, 'ops_receiving', 'Goods Receiving') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "resources" ("id", "key", "label") VALUES (gen_random_uuid()::text, 'ops_processing', 'Rice Processing') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "resources" ("id", "key", "label") VALUES (gen_random_uuid()::text, 'ops_stock', 'Stock and Adjustments') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "resources" ("id", "key", "label") VALUES (gen_random_uuid()::text, 'ops_dispatch', 'Order Preparation and Dispatch') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "resources" ("id", "key", "label") VALUES (gen_random_uuid()::text, 'ops_farm_tasks', 'Farm Tasks and Assignments') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "resources" ("id", "key", "label") VALUES (gen_random_uuid()::text, 'ops_farm_review', 'Farm Task Review') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "resources" ("id", "key", "label") VALUES (gen_random_uuid()::text, 'ops_field_work', 'My Field Work') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "resources" ("id", "key", "label") VALUES (gen_random_uuid()::text, 'ops_farm_inputs', 'Farm Inputs') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "resources" ("id", "key", "label") VALUES (gen_random_uuid()::text, 'ops_harvest', 'Harvest Records') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "resources" ("id", "key", "label") VALUES (gen_random_uuid()::text, 'ops_reports', 'Operations Dashboards and Reports') ON CONFLICT ("key") DO NOTHING;
