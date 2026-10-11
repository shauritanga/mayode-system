-- Platform-wide sale/warehouse rules, editable in Settings.
ALTER TABLE "org_settings" ADD COLUMN "load_tolerance_pct" DOUBLE PRECISION NOT NULL DEFAULT 2;
ALTER TABLE "org_settings" ADD COLUMN "reservation_expiry_days" INTEGER NOT NULL DEFAULT 7;
