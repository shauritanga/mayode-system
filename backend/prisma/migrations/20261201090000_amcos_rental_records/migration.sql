-- AlterTable
ALTER TABLE "land_listings" ADD COLUMN     "hectare_id" TEXT,
ADD COLUMN     "lease_terms" TEXT,
ADD COLUMN     "rent_out_reason" TEXT,
ADD COLUMN     "season_count" INTEGER;

-- AlterTable
ALTER TABLE "disputes" ADD COLUMN     "rental_record_id" TEXT;

-- CreateTable
CREATE TABLE "amcos_rental_records" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "mamcos_id" TEXT NOT NULL,
    "farm_id" TEXT NOT NULL,
    "farm_code" TEXT NOT NULL,
    "hectare_id" TEXT,
    "hectare_code" TEXT,
    "owner_farmer_id" TEXT NOT NULL,
    "owner_name" TEXT NOT NULL,
    "tenant_farmer_id" TEXT NOT NULL,
    "tenant_name" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "duration_months" INTEGER NOT NULL,
    "season_count" INTEGER,
    "reason" TEXT,
    "terms" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "terminated_at" TIMESTAMP(3),
    "witness_note" TEXT,
    "witness_note_by_id" TEXT,
    "witness_note_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "amcos_rental_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "amcos_rental_records_listing_id_key" ON "amcos_rental_records"("listing_id");

-- CreateIndex
CREATE INDEX "amcos_rental_records_mamcos_id_status_idx" ON "amcos_rental_records"("mamcos_id", "status");

-- CreateIndex
CREATE INDEX "amcos_rental_records_hectare_id_idx" ON "amcos_rental_records"("hectare_id");

-- CreateIndex
CREATE INDEX "land_listings_hectare_id_idx" ON "land_listings"("hectare_id");

-- CreateIndex
CREATE INDEX "disputes_rental_record_id_idx" ON "disputes"("rental_record_id");

-- AddForeignKey
ALTER TABLE "land_listings" ADD CONSTRAINT "land_listings_hectare_id_fkey" FOREIGN KEY ("hectare_id") REFERENCES "irrigation_hectares"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_rental_record_id_fkey" FOREIGN KEY ("rental_record_id") REFERENCES "amcos_rental_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amcos_rental_records" ADD CONSTRAINT "amcos_rental_records_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "land_listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amcos_rental_records" ADD CONSTRAINT "amcos_rental_records_hectare_id_fkey" FOREIGN KEY ("hectare_id") REFERENCES "irrigation_hectares"("id") ON DELETE SET NULL ON UPDATE CASCADE;

