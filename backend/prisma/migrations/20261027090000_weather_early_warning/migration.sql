CREATE TYPE "WeatherAlertStatus" AS ENUM ('DRAFT','SENT','DISMISSED');
CREATE TYPE "AlertChannel" AS ENUM ('SMS','APP','WHATSAPP','OFFICER');

-- Alerts issued before this change were sent straight away.
ALTER TABLE "weather_alerts"
  ADD COLUMN "mamcos_id" TEXT,
  ADD COLUMN "status" "WeatherAlertStatus" NOT NULL DEFAULT 'SENT',
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "title_sw" TEXT,
  ADD COLUMN "message_sw" TEXT,
  ADD COLUMN "evidence" JSONB,
  ADD COLUMN "reviewed_by_user_id" TEXT,
  ADD COLUMN "sent_at" TIMESTAMP(3),
  ADD COLUMN "app_sent_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "whatsapp_sent_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "officers_notified" INTEGER NOT NULL DEFAULT 0;
UPDATE "weather_alerts" SET "sent_at" = "created_at";
ALTER TABLE "weather_alerts" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
CREATE INDEX "weather_alerts_mamcos_id_status_idx" ON "weather_alerts"("mamcos_id","status");

CREATE TABLE "alert_deliveries" (
  "id" TEXT NOT NULL,
  "alert_id" TEXT NOT NULL,
  "user_id" TEXT,
  "farmer_id" TEXT,
  "channel" "AlertChannel" NOT NULL,
  "status" TEXT NOT NULL,
  "detail" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "alert_deliveries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "alert_deliveries_alert_id_channel_idx" ON "alert_deliveries"("alert_id","channel");
ALTER TABLE "alert_deliveries" ADD CONSTRAINT "alert_deliveries_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "weather_alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "weather_snapshots" (
  "id" TEXT NOT NULL,
  "area_key" TEXT NOT NULL,
  "region" TEXT,
  "district" TEXT,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "days" JSONB NOT NULL,
  "fetched_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "weather_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "weather_snapshots_area_key_key" ON "weather_snapshots"("area_key");

ALTER TABLE "farmers" ADD COLUMN "whatsapp_opt_in" BOOLEAN NOT NULL DEFAULT false;
