-- CreateEnum
CREATE TYPE "InputPaymentStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID');

-- CreateEnum
CREATE TYPE "BuyerOrderStatus" AS ENUM ('OPEN', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED');

-- AlterTable
ALTER TABLE "input_costs" ADD COLUMN     "loan_record_id" TEXT,
ADD COLUMN     "payment_status" "InputPaymentStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "supplier_id" TEXT;

-- AlterTable
ALTER TABLE "insurance_policies" ADD COLUMN     "renewed_from_policy_id" TEXT;

-- AlterTable
ALTER TABLE "inventory_records" ADD COLUMN     "moisture_content_pct" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "buyer_order_id" TEXT;

-- CreateTable
CREATE TABLE "irrigation_schemes" (
    "id" TEXT NOT NULL,
    "mamcos_id" TEXT,
    "name" TEXT NOT NULL,
    "scheme_type" TEXT,
    "coverage_hectares" DOUBLE PRECISION,
    "water_source" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "irrigation_schemes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aggregation_centres" (
    "id" TEXT NOT NULL,
    "mamcos_id" TEXT,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "capacity_kg" DOUBLE PRECISION,
    "contact_person" TEXT,
    "contact_phone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aggregation_centres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact_person" TEXT,
    "contact_phone" TEXT,
    "contact_email" TEXT,
    "items_supplied" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buyer_orders" (
    "id" TEXT NOT NULL,
    "buyer_id" TEXT NOT NULL,
    "rice_variety" TEXT,
    "quantity_required_kg" DOUBLE PRECISION NOT NULL,
    "quality_requirements" TEXT,
    "status" "BuyerOrderStatus" NOT NULL DEFAULT 'OPEN',
    "required_by_date" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buyer_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_settings" (
    "id" TEXT NOT NULL,
    "org_name" TEXT NOT NULL,
    "logo_url" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "address" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_key_key" ON "notification_templates"("key");

-- AddForeignKey
ALTER TABLE "irrigation_schemes" ADD CONSTRAINT "irrigation_schemes_mamcos_id_fkey" FOREIGN KEY ("mamcos_id") REFERENCES "mamcos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aggregation_centres" ADD CONSTRAINT "aggregation_centres_mamcos_id_fkey" FOREIGN KEY ("mamcos_id") REFERENCES "mamcos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "input_costs" ADD CONSTRAINT "input_costs_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "input_costs" ADD CONSTRAINT "input_costs_loan_record_id_fkey" FOREIGN KEY ("loan_record_id") REFERENCES "loan_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyer_orders" ADD CONSTRAINT "buyer_orders_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "buyers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_buyer_order_id_fkey" FOREIGN KEY ("buyer_order_id") REFERENCES "buyer_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_renewed_from_policy_id_fkey" FOREIGN KEY ("renewed_from_policy_id") REFERENCES "insurance_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
