CREATE TYPE "BuyerBusinessType" AS ENUM ('MILLER','TRADER','EXPORTER','PROCESSOR','RETAILER','WHOLESALER','INSTITUTION','NGO','OTHER');
CREATE TYPE "AgreementStatus" AS ENUM ('DRAFT','ACTIVE','FULFILLED','CANCELLED');

ALTER TABLE "buyers"
  ADD COLUMN "business_type" "BuyerBusinessType",
  ADD COLUMN "region" TEXT,
  ADD COLUMN "district" TEXT,
  ADD COLUMN "location" TEXT,
  ADD COLUMN "preferred_varieties" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "delivery_location" TEXT,
  ADD COLUMN "notes" TEXT;

ALTER TABLE "buyer_orders"
  ADD COLUMN "mamcos_id" TEXT,
  ADD COLUMN "offered_price_per_kg" DOUBLE PRECISION,
  ADD COLUMN "delivery_location" TEXT,
  ADD COLUMN "quality_grade" TEXT;
UPDATE "buyer_orders" o SET "mamcos_id" = b."mamcos_id" FROM "buyers" b WHERE b."id" = o."buyer_id";
CREATE INDEX "buyer_orders_mamcos_id_idx" ON "buyer_orders"("mamcos_id");

ALTER TABLE "market_prices" ADD COLUMN "mamcos_id" TEXT;
CREATE INDEX "market_prices_mamcos_id_idx" ON "market_prices"("mamcos_id");

CREATE TABLE "purchase_agreements" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "mamcos_id" TEXT,
  "buyer_id" TEXT NOT NULL,
  "buyer_order_id" TEXT,
  "rice_variety" TEXT,
  "quality_terms" TEXT,
  "quantity_kg" DOUBLE PRECISION NOT NULL,
  "price_per_kg" DOUBLE PRECISION NOT NULL,
  "delivery_location" TEXT,
  "payment_terms" TEXT,
  "start_date" TIMESTAMP(3) NOT NULL,
  "end_date" TIMESTAMP(3) NOT NULL,
  "status" "AgreementStatus" NOT NULL DEFAULT 'DRAFT',
  "signed_at" TIMESTAMP(3),
  "document_url" TEXT,
  "notes" TEXT,
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "purchase_agreements_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "purchase_agreements_reference_key" ON "purchase_agreements"("reference");
CREATE INDEX "purchase_agreements_mamcos_id_status_idx" ON "purchase_agreements"("mamcos_id","status");
CREATE INDEX "purchase_agreements_buyer_id_idx" ON "purchase_agreements"("buyer_id");
ALTER TABLE "purchase_agreements" ADD CONSTRAINT "purchase_agreements_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "buyers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_agreements" ADD CONSTRAINT "purchase_agreements_buyer_order_id_fkey" FOREIGN KEY ("buyer_order_id") REFERENCES "buyer_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sales" ADD COLUMN "agreement_id" TEXT;
ALTER TABLE "sales" ADD CONSTRAINT "sales_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "purchase_agreements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sale_orders" ADD COLUMN "buyer_order_id" TEXT, ADD COLUMN "agreement_id" TEXT;
