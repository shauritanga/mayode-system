-- CreateEnum
CREATE TYPE "FarmRegistryStatus" AS ENUM ('PRE_REGISTERED', 'OWNER_CONFIRMATION_PENDING', 'OWNER_CONFIRMED', 'FIELD_VERIFICATION_PENDING', 'FIELD_VERIFIED', 'CLAIMED', 'DISPUTED', 'INACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "farm_registry_records" (
    "id" TEXT NOT NULL,
    "source_mamcos_id" TEXT,
    "source_officer_id" TEXT,
    "owner_name" TEXT NOT NULL,
    "owner_phone" TEXT NOT NULL,
    "owner_national_id" TEXT,
    "name" TEXT,
    "plot_number" TEXT,
    "block" TEXT,
    "canal" TEXT,
    "scheme" TEXT,
    "section" TEXT,
    "village" TEXT,
    "ward" TEXT,
    "district" TEXT,
    "region" TEXT,
    "farm_size_hectares" DOUBLE PRECISION,
    "status" "FarmRegistryStatus" NOT NULL DEFAULT 'OWNER_CONFIRMATION_PENDING',
    "notes" TEXT,
    "farm_id" TEXT,
    "claimed_by_farmer_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "farm_registry_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "farm_registry_records_farm_id_key" ON "farm_registry_records"("farm_id");

-- CreateIndex
CREATE INDEX "farm_registry_records_owner_phone_status_idx" ON "farm_registry_records"("owner_phone", "status");

-- AddForeignKey
ALTER TABLE "farm_registry_records" ADD CONSTRAINT "farm_registry_records_source_mamcos_id_fkey" FOREIGN KEY ("source_mamcos_id") REFERENCES "mamcos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

