-- CreateEnum
CREATE TYPE "FieldOfficerVisitPurpose" AS ENUM ('ROUTINE_CHECK', 'FARMING_ASSISTANCE', 'VERIFICATION', 'DISPUTE_FOLLOWUP', 'TRAINING', 'OTHER');

-- AlterTable
ALTER TABLE "field_officers" ADD COLUMN     "mamcos_id" TEXT;

-- CreateTable
CREATE TABLE "field_officer_visits" (
    "id" TEXT NOT NULL,
    "field_officer_id" TEXT NOT NULL,
    "farmer_id" TEXT NOT NULL,
    "farm_id" TEXT,
    "crop_cycle_id" TEXT,
    "purpose" "FieldOfficerVisitPurpose" NOT NULL DEFAULT 'ROUTINE_CHECK',
    "notes" TEXT,
    "photo_urls" TEXT[],
    "gps_latitude" DOUBLE PRECISION,
    "gps_longitude" DOUBLE PRECISION,
    "visited_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_officer_visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "field_officer_visits_field_officer_id_visited_at_idx" ON "field_officer_visits"("field_officer_id", "visited_at");

-- CreateIndex
CREATE INDEX "field_officer_visits_farmer_id_visited_at_idx" ON "field_officer_visits"("farmer_id", "visited_at");

-- CreateIndex
CREATE INDEX "field_officers_mamcos_id_idx" ON "field_officers"("mamcos_id");

-- AddForeignKey
ALTER TABLE "field_officers" ADD CONSTRAINT "field_officers_mamcos_id_fkey" FOREIGN KEY ("mamcos_id") REFERENCES "mamcos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_officer_visits" ADD CONSTRAINT "field_officer_visits_field_officer_id_fkey" FOREIGN KEY ("field_officer_id") REFERENCES "field_officers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_officer_visits" ADD CONSTRAINT "field_officer_visits_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_officer_visits" ADD CONSTRAINT "field_officer_visits_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_officer_visits" ADD CONSTRAINT "field_officer_visits_crop_cycle_id_fkey" FOREIGN KEY ("crop_cycle_id") REFERENCES "crop_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
