
-- CreateEnum
CREATE TYPE "FarmSaleStatus" AS ENUM ('PENDING_FEE', 'OPEN', 'SOLD', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "FarmSaleFeePayer" AS ENUM ('SELLER', 'BUYER');

-- CreateEnum
CREATE TYPE "FarmSaleFeeStatus" AS ENUM ('PENDING', 'PAID', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IrrigationTransferStatus" ADD VALUE 'BUYER_REQUESTED';
ALTER TYPE "IrrigationTransferStatus" ADD VALUE 'AWAITING_CODE';

-- AlterTable
ALTER TABLE "irrigation_allocation_transfers" ADD COLUMN     "code_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "code_expires_at" TIMESTAMP(3),
ADD COLUMN     "code_hash" TEXT,
ADD COLUMN     "code_verified_at" TIMESTAMP(3),
ADD COLUMN     "sale_listing_id" TEXT;

-- AlterTable
ALTER TABLE "org_settings" ADD COLUMN     "farm_sale_listing_fee_tzs" INTEGER NOT NULL DEFAULT 20000;

-- CreateTable
CREATE TABLE "farm_sale_listings" (
    "id" TEXT NOT NULL,
    "mamcos_id" TEXT NOT NULL,
    "hectare_id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "asking_price" DECIMAL(14,2) NOT NULL,
    "description" TEXT,
    "fee_paid_by" "FarmSaleFeePayer" NOT NULL,
    "fee_amount" INTEGER NOT NULL,
    "status" "FarmSaleStatus" NOT NULL DEFAULT 'PENDING_FEE',
    "published_at" TIMESTAMP(3),
    "sold_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "farm_sale_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farm_sale_fees" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "payer_farmer_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "order_reference" TEXT NOT NULL,
    "status" "FarmSaleFeeStatus" NOT NULL DEFAULT 'PENDING',
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "farm_sale_fees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farm_sale_notifications" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "send_at" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3),

    CONSTRAINT "farm_sale_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farm_debt_holds" (
    "id" TEXT NOT NULL,
    "hectare_id" TEXT NOT NULL,
    "new_farmer_id" TEXT NOT NULL,
    "previous_farmer_id" TEXT NOT NULL,
    "dues" JSONB NOT NULL,
    "amount_at_transfer" DECIMAL(14,2) NOT NULL,
    "cleared_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "farm_debt_holds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "farm_sale_listings_mamcos_id_status_idx" ON "farm_sale_listings"("mamcos_id", "status");

-- CreateIndex
CREATE INDEX "farm_sale_listings_hectare_id_idx" ON "farm_sale_listings"("hectare_id");

-- CreateIndex
CREATE UNIQUE INDEX "farm_sale_fees_order_reference_key" ON "farm_sale_fees"("order_reference");

-- CreateIndex
CREATE INDEX "farm_sale_fees_listing_id_status_idx" ON "farm_sale_fees"("listing_id", "status");

-- CreateIndex
CREATE INDEX "farm_sale_notifications_sent_at_send_at_idx" ON "farm_sale_notifications"("sent_at", "send_at");

-- CreateIndex
CREATE UNIQUE INDEX "farm_sale_notifications_listing_id_user_id_key" ON "farm_sale_notifications"("listing_id", "user_id");

-- CreateIndex
CREATE INDEX "farm_debt_holds_hectare_id_cleared_at_idx" ON "farm_debt_holds"("hectare_id", "cleared_at");

-- AddForeignKey
ALTER TABLE "irrigation_allocation_transfers" ADD CONSTRAINT "irrigation_allocation_transfers_sale_listing_id_fkey" FOREIGN KEY ("sale_listing_id") REFERENCES "farm_sale_listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_sale_listings" ADD CONSTRAINT "farm_sale_listings_hectare_id_fkey" FOREIGN KEY ("hectare_id") REFERENCES "irrigation_hectares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_sale_listings" ADD CONSTRAINT "farm_sale_listings_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_sale_fees" ADD CONSTRAINT "farm_sale_fees_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "farm_sale_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_sale_fees" ADD CONSTRAINT "farm_sale_fees_payer_farmer_id_fkey" FOREIGN KEY ("payer_farmer_id") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_sale_notifications" ADD CONSTRAINT "farm_sale_notifications_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "farm_sale_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_debt_holds" ADD CONSTRAINT "farm_debt_holds_hectare_id_fkey" FOREIGN KEY ("hectare_id") REFERENCES "irrigation_hectares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

