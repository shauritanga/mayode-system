-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "OwnershipType" AS ENUM ('OWNED', 'RENTED', 'LEASED', 'COMMUNAL', 'INHERITED');

-- CreateEnum
CREATE TYPE "EducationLevel" AS ENUM ('NONE', 'PRIMARY', 'SECONDARY', 'VOCATIONAL', 'TERTIARY');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('NATIONAL_ID', 'TITLE_DEED', 'LEASE_AGREEMENT', 'PHOTO', 'RECEIPT', 'CERTIFICATE', 'OTHER');

-- AlterTable
ALTER TABLE "crop_cycles" ADD COLUMN     "plot_id" TEXT;

-- AlterTable
ALTER TABLE "farmers" ADD COLUMN     "dependents" INTEGER,
ADD COLUMN     "education_level" "EducationLevel",
ADD COLUMN     "email" TEXT,
ADD COLUMN     "farming_experience_years" INTEGER,
ADD COLUMN     "residence_latitude" DOUBLE PRECISION,
ADD COLUMN     "residence_longitude" DOUBLE PRECISION,
ADD COLUMN     "verification_status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "verified_at" TIMESTAMP(3),
ADD COLUMN     "verified_by_id" TEXT;

-- AlterTable
ALTER TABLE "farms" ADD COLUMN     "accessibility" TEXT,
ADD COLUMN     "irrigation_method" TEXT,
ADD COLUMN     "land_tenure" TEXT,
ADD COLUMN     "ownership_type" "OwnershipType",
ADD COLUMN     "previous_crops" TEXT[],
ADD COLUMN     "soil_fertility" TEXT,
ADD COLUMN     "soil_type" TEXT,
ADD COLUMN     "water_source" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "push_token" TEXT;

-- CreateTable
CREATE TABLE "plots" (
    "id" TEXT NOT NULL,
    "plot_code" TEXT NOT NULL,
    "farm_id" TEXT NOT NULL,
    "name" TEXT,
    "size_acres" DOUBLE PRECISION,
    "soil_condition" TEXT,
    "irrigation_status" TEXT,
    "current_stage" TEXT,
    "boundary_coordinates" JSONB,
    "center_latitude" DOUBLE PRECISION,
    "center_longitude" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farmer_verifications" (
    "id" TEXT NOT NULL,
    "farmer_id" TEXT NOT NULL,
    "field_officer_id" TEXT NOT NULL,
    "status" "VerificationStatus" NOT NULL,
    "gps_verified" BOOLEAN NOT NULL DEFAULT false,
    "documents_reviewed" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "rejection_reason" TEXT,
    "gps_latitude" DOUBLE PRECISION,
    "gps_longitude" DOUBLE PRECISION,
    "verified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "farmer_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "households" (
    "id" TEXT NOT NULL,
    "farmer_id" TEXT NOT NULL,
    "household_size" INTEGER,
    "dependents" INTEGER,
    "adults_count" INTEGER,
    "children_count" INTEGER,
    "primary_income_source" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "households_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT,
    "size_bytes" INTEGER,
    "farmer_id" TEXT,
    "farm_id" TEXT,
    "uploaded_by_id" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plots_plot_code_key" ON "plots"("plot_code");

-- CreateIndex
CREATE INDEX "farmer_verifications_farmer_id_idx" ON "farmer_verifications"("farmer_id");

-- CreateIndex
CREATE UNIQUE INDEX "households_farmer_id_key" ON "households"("farmer_id");

-- CreateIndex
CREATE INDEX "documents_farmer_id_idx" ON "documents"("farmer_id");

-- CreateIndex
CREATE INDEX "documents_farm_id_idx" ON "documents"("farm_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_idx" ON "notifications"("user_id", "is_read");

-- AddForeignKey
ALTER TABLE "crop_cycles" ADD CONSTRAINT "crop_cycles_plot_id_fkey" FOREIGN KEY ("plot_id") REFERENCES "plots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plots" ADD CONSTRAINT "plots_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farmer_verifications" ADD CONSTRAINT "farmer_verifications_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farmer_verifications" ADD CONSTRAINT "farmer_verifications_field_officer_id_fkey" FOREIGN KEY ("field_officer_id") REFERENCES "field_officers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "households" ADD CONSTRAINT "households_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data backfill: create one "Main Plot" per existing farm and link its crop cycles to it.
-- (No-op on a fresh DB with zero farms; correct for environments that already have farms.)
INSERT INTO "plots" ("id", "plot_code", "farm_id", "name", "size_acres", "soil_condition", "created_at", "updated_at")
SELECT gen_random_uuid()::text, f."farm_code" || '-P1', f."id", 'Main Plot', f."actual_acres", f."soil_condition", now(), now()
FROM "farms" f
WHERE NOT EXISTS (SELECT 1 FROM "plots" p WHERE p."farm_id" = f."id");

UPDATE "crop_cycles" cc
SET "plot_id" = p."id"
FROM "plots" p
WHERE p."farm_id" = cc."farm_id" AND cc."plot_id" IS NULL;
