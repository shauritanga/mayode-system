-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'COUNTERED');

-- AlterEnum
ALTER TYPE "DisputeType" ADD VALUE 'UNREPORTED_MLAX_ACTIVITY';

-- AlterTable
ALTER TABLE "escrow_payments" ADD COLUMN     "installment_year" INTEGER;

-- AlterTable
ALTER TABLE "land_listings" ADD COLUMN     "last_installment_year" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "mayode_protected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "payment_plan" TEXT DEFAULT 'PREPAID',
ADD COLUMN     "rent_schedule_json" JSONB;

-- CreateTable
CREATE TABLE "land_listing_offers" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "farmer_id" TEXT NOT NULL,
    "offer_amount" DOUBLE PRECISION NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'PENDING',
    "counter_amount" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "land_listing_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "land_listing_improvements" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "renter_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount_tzs" DOUBLE PRECISION NOT NULL,
    "applied_to_year" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "land_listing_improvements_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "land_listing_offers" ADD CONSTRAINT "land_listing_offers_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "land_listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "land_listing_offers" ADD CONSTRAINT "land_listing_offers_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "land_listing_improvements" ADD CONSTRAINT "land_listing_improvements_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "land_listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "land_listing_improvements" ADD CONSTRAINT "land_listing_improvements_renter_id_fkey" FOREIGN KEY ("renter_id") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
