/*
  Warnings:

  - You are about to drop the `_deprecated_field_officers` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_deprecated_mamcos_secretaries` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[order_reference]` on the table `escrow_payments` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[payout_order_reference]` on the table `escrow_payments` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "SubLeaseStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED');

-- DropForeignKey
ALTER TABLE "_deprecated_field_officers" DROP CONSTRAINT "field_officers_mamcos_id_fkey";

-- DropForeignKey
ALTER TABLE "_deprecated_field_officers" DROP CONSTRAINT "field_officers_user_id_fkey";

-- DropForeignKey
ALTER TABLE "_deprecated_mamcos_secretaries" DROP CONSTRAINT "mamcos_secretaries_mamcos_id_fkey";

-- DropForeignKey
ALTER TABLE "_deprecated_mamcos_secretaries" DROP CONSTRAINT "mamcos_secretaries_user_id_fkey";

-- DropForeignKey
ALTER TABLE "farms" DROP CONSTRAINT "farms_farmer_id_fkey";

-- AlterTable
ALTER TABLE "escrow_payments" ADD COLUMN     "order_reference" TEXT,
ADD COLUMN     "payout_failure_reason" TEXT,
ADD COLUMN     "payout_order_reference" TEXT,
ADD COLUMN     "payout_recipient_id" TEXT,
ADD COLUMN     "payout_status" "PayoutStatus",
ADD COLUMN     "phone_number" TEXT;

-- AlterTable
ALTER TABLE "land_listings" ADD COLUMN     "agreement_generated_at" TIMESTAMP(3),
ADD COLUMN     "agreement_pdf_url" TEXT,
ADD COLUMN     "facilitated_by_staff_id" TEXT,
ADD COLUMN     "last_price_drop_at" TIMESTAMP(3),
ADD COLUMN     "previous_renter_id" TEXT;

-- DropTable
DROP TABLE "_deprecated_field_officers";

-- DropTable
DROP TABLE "_deprecated_mamcos_secretaries";

-- CreateTable
CREATE TABLE "land_listing_sub_leases" (
    "id" TEXT NOT NULL,
    "original_listing_id" TEXT NOT NULL,
    "original_renter_id" TEXT NOT NULL,
    "status" "SubLeaseStatus" NOT NULL DEFAULT 'PENDING',
    "new_renter_id" TEXT,
    "new_asking_price" DOUBLE PRECISION,
    "approved_by_owner_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "land_listing_sub_leases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "land_listing_ownership_transfers" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "from_owner_id" TEXT NOT NULL,
    "to_owner_phone" TEXT NOT NULL,
    "to_owner_id" TEXT,
    "reason" TEXT,
    "transferred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "land_listing_ownership_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "escrow_payments_order_reference_key" ON "escrow_payments"("order_reference");

-- CreateIndex
CREATE UNIQUE INDEX "escrow_payments_payout_order_reference_key" ON "escrow_payments"("payout_order_reference");

-- AddForeignKey
ALTER TABLE "farms" ADD CONSTRAINT "farms_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "land_listings" ADD CONSTRAINT "land_listings_previous_renter_id_fkey" FOREIGN KEY ("previous_renter_id") REFERENCES "farmers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "land_listings" ADD CONSTRAINT "land_listings_facilitated_by_staff_id_fkey" FOREIGN KEY ("facilitated_by_staff_id") REFERENCES "mamcos_staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "land_listing_sub_leases" ADD CONSTRAINT "land_listing_sub_leases_original_listing_id_fkey" FOREIGN KEY ("original_listing_id") REFERENCES "land_listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "land_listing_sub_leases" ADD CONSTRAINT "land_listing_sub_leases_original_renter_id_fkey" FOREIGN KEY ("original_renter_id") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "land_listing_sub_leases" ADD CONSTRAINT "land_listing_sub_leases_new_renter_id_fkey" FOREIGN KEY ("new_renter_id") REFERENCES "farmers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "land_listing_ownership_transfers" ADD CONSTRAINT "land_listing_ownership_transfers_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "land_listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "land_listing_ownership_transfers" ADD CONSTRAINT "land_listing_ownership_transfers_from_owner_id_fkey" FOREIGN KEY ("from_owner_id") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "land_listing_ownership_transfers" ADD CONSTRAINT "land_listing_ownership_transfers_to_owner_id_fkey" FOREIGN KEY ("to_owner_id") REFERENCES "farmers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrow_payments" ADD CONSTRAINT "escrow_payments_payout_recipient_id_fkey" FOREIGN KEY ("payout_recipient_id") REFERENCES "farmers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
