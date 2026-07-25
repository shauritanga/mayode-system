-- CreateEnum
CREATE TYPE "AlertCategory" AS ENUM ('IRRIGATION', 'FERTILIZER', 'PEST_DISEASE', 'ACTIVITY_OVERDUE', 'CROP_PROGRESS', 'WEATHER_RISK', 'HARVEST', 'PRODUCTIVITY', 'OTHER');

-- CreateEnum
CREATE TYPE "AlertUrgency" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'COMPLETED', 'DISMISSED', 'EXPIRED');

-- CreateTable
CREATE TABLE "farm_alerts" (
    "id" TEXT NOT NULL,
    "farm_id" TEXT NOT NULL,
    "plot_id" TEXT,
    "farmer_id" TEXT,
    "farming_season_id" TEXT,
    "crop_cycle_id" TEXT,
    "category" "AlertCategory" NOT NULL,
    "urgency" "AlertUrgency" NOT NULL DEFAULT 'MEDIUM',
    "title" TEXT NOT NULL,
    "preview_message" TEXT NOT NULL,
    "recommendation" TEXT,
    "action_details" TEXT,
    "expected_action_date" TIMESTAMP(3),
    "dedupe_key" TEXT,
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "completed_at" TIMESTAMP(3),
    "completed_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "farm_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "farm_alerts_farm_id_status_idx" ON "farm_alerts"("farm_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "farm_alerts_dedupe_key_key" ON "farm_alerts"("dedupe_key");

-- AddForeignKey
ALTER TABLE "farm_alerts" ADD CONSTRAINT "farm_alerts_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

