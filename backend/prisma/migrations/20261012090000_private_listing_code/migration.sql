-- Private "Relationship" listings: a generated code the owner hands to one chosen renter.
-- Only a keyed hash of the code is stored. The first renter to redeem it is recorded and is the
-- only one who may take the listing. Additive; existing listings stay public.
ALTER TABLE "land_listings" ADD COLUMN "access_code_hash" TEXT;
ALTER TABLE "land_listings" ADD COLUMN "access_code_expires_at" TIMESTAMP(3);
ALTER TABLE "land_listings" ADD COLUMN "claimed_by_farmer_id" TEXT;
ALTER TABLE "land_listings" ADD COLUMN "claimed_at" TIMESTAMP(3);
ALTER TABLE "land_listings" ADD CONSTRAINT "land_listings_claimed_by_farmer_id_fkey"
  FOREIGN KEY ("claimed_by_farmer_id") REFERENCES "farmers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "land_listing_code_attempts" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "farmer_id" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "land_listing_code_attempts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "land_listing_code_attempts_farmer_id_created_at_idx" ON "land_listing_code_attempts"("farmer_id", "created_at");
CREATE INDEX "land_listing_code_attempts_listing_id_farmer_id_created_at_idx" ON "land_listing_code_attempts"("listing_id", "farmer_id", "created_at");
ALTER TABLE "land_listing_code_attempts" ADD CONSTRAINT "land_listing_code_attempts_listing_id_fkey"
  FOREIGN KEY ("listing_id") REFERENCES "land_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "land_listing_code_attempts" ADD CONSTRAINT "land_listing_code_attempts_farmer_id_fkey"
  FOREIGN KEY ("farmer_id") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
