-- CreateEnum
CREATE TYPE "EquipmentType" AS ENUM ('TRACTOR', 'POWER_TILLER', 'COMBINE_HARVESTER', 'THRESHER', 'TRANSPLANTER', 'SPRAYER', 'TRUCK', 'OTHER');
-- CreateEnum
CREATE TYPE "EquipmentOwnership" AS ENUM ('AMCOS', 'EXTERNAL');
-- CreateEnum
CREATE TYPE "MachineryActivityType" AS ENUM ('PLOUGHING', 'HARROWING', 'LEVELLING', 'TRANSPLANTING', 'SPRAYING', 'HARVESTING', 'THRESHING', 'TRANSPORT', 'OTHER');
-- CreateEnum
CREATE TYPE "MachineryActivityStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
-- CreateEnum
CREATE TYPE "ActivityFeeStatus" AS ENUM ('NOT_APPLICABLE', 'PENDING', 'PAID');
-- CreateTable
CREATE TABLE "amcos_equipment" (
    "id" TEXT NOT NULL,
    "mamcos_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "EquipmentType" NOT NULL,
    "registration_no" TEXT,
    "ownership" "EquipmentOwnership" NOT NULL DEFAULT 'AMCOS',
    "owner_name" TEXT,
    "owner_phone" TEXT,
    "fee_per_hectare" DECIMAL(12,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "amcos_equipment_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "machinery_activities" (
    "id" TEXT NOT NULL,
    "mamcos_id" TEXT NOT NULL,
    "activity_date" DATE NOT NULL,
    "type" "MachineryActivityType" NOT NULL,
    "equipment_id" TEXT NOT NULL,
    "operator_name" TEXT,
    "block_id" TEXT,
    "location" TEXT,
    "hectares" DECIMAL(8,2) NOT NULL,
    "fee_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "fee_status" "ActivityFeeStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "fee_paid_on" DATE,
    "status" "MachineryActivityStatus" NOT NULL DEFAULT 'COMPLETED',
    "notes" TEXT,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "machinery_activities_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "amcos_equipment_mamcos_id_is_active_idx" ON "amcos_equipment"("mamcos_id", "is_active");
-- CreateIndex
CREATE UNIQUE INDEX "amcos_equipment_mamcos_id_name_key" ON "amcos_equipment"("mamcos_id", "name");
-- CreateIndex
CREATE INDEX "machinery_activities_mamcos_id_activity_date_idx" ON "machinery_activities"("mamcos_id", "activity_date");
-- CreateIndex
CREATE INDEX "machinery_activities_equipment_id_idx" ON "machinery_activities"("equipment_id");
-- CreateIndex
CREATE INDEX "machinery_activities_block_id_idx" ON "machinery_activities"("block_id");
-- AddForeignKey
ALTER TABLE "amcos_equipment" ADD CONSTRAINT "amcos_equipment_mamcos_id_fkey" FOREIGN KEY ("mamcos_id") REFERENCES "mamcos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "machinery_activities" ADD CONSTRAINT "machinery_activities_mamcos_id_fkey" FOREIGN KEY ("mamcos_id") REFERENCES "mamcos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "machinery_activities" ADD CONSTRAINT "machinery_activities_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "amcos_equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "machinery_activities" ADD CONSTRAINT "machinery_activities_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "irrigation_blocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "machinery_activities" ADD CONSTRAINT "machinery_activities_hectares_positive" CHECK ("hectares" > 0);
ALTER TABLE "machinery_activities" ADD CONSTRAINT "machinery_activities_fee_not_negative" CHECK ("fee_amount" >= 0);
ALTER TABLE "amcos_equipment" ADD CONSTRAINT "amcos_equipment_fee_not_negative" CHECK ("fee_per_hectare" IS NULL OR "fee_per_hectare" >= 0);
-- A fee can only be marked paid with a payment date, and "not applicable" never carries an amount.
ALTER TABLE "machinery_activities" ADD CONSTRAINT "machinery_activities_fee_consistent"
  CHECK (("fee_status" <> 'PAID' OR "fee_paid_on" IS NOT NULL) AND ("fee_status" <> 'NOT_APPLICABLE' OR "fee_amount" = 0));

-- Permission resource (Roles & Permissions matrix).
INSERT INTO "resources" ("id", "key", "label") VALUES (gen_random_uuid()::text, 'machinery', 'Machinery & Task Management') ON CONFLICT ("key") DO NOTHING;
