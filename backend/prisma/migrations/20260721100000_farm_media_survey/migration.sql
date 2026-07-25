-- CreateEnum
CREATE TYPE "FarmDataSource" AS ENUM ('AMCOS', 'OWNER', 'RENTER', 'FIELD_OFFICER', 'SATELLITE', 'GOVERNMENT', 'SENSOR', 'IMPORT', 'SYSTEM');

-- CreateTable
CREATE TABLE "farm_photos" (
    "id" TEXT NOT NULL,
    "farm_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "uploaded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "farm_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farm_field_surveys" (
    "id" TEXT NOT NULL,
    "farm_id" TEXT NOT NULL,
    "surveyed_by_id" TEXT,
    "survey_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "FarmDataSource" NOT NULL DEFAULT 'FIELD_OFFICER',
    "soil_ph" DOUBLE PRECISION,
    "soil_texture" TEXT,
    "soil_organic_matter" DOUBLE PRECISION,
    "soil_notes" TEXT,
    "road_distance_meters" INTEGER,
    "road_access_quality" TEXT,
    "water_source" TEXT,
    "water_distance_meters" INTEGER,
    "water_reliability" TEXT,
    "slope" TEXT,
    "flood_risk" TEXT,
    "observations" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "farm_field_surveys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "farm_photos_farm_id_idx" ON "farm_photos"("farm_id");

-- CreateIndex
CREATE INDEX "farm_field_surveys_farm_id_idx" ON "farm_field_surveys"("farm_id");

-- AddForeignKey
ALTER TABLE "farm_photos" ADD CONSTRAINT "farm_photos_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_field_surveys" ADD CONSTRAINT "farm_field_surveys_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

