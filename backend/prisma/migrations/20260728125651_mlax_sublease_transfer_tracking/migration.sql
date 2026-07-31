-- AlterTable
ALTER TABLE "land_listing_ownership_transfers" ADD COLUMN     "fee_charged_at" TIMESTAMP(3),
ADD COLUMN     "transfer_fee_tzs" DOUBLE PRECISION NOT NULL DEFAULT 10000;

-- AlterTable
ALTER TABLE "land_listing_sub_leases" ADD COLUMN     "settled_at" TIMESTAMP(3);
