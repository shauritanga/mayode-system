-- MAYOData proposal trust/compliance primitives:
-- formal consent records, official questionnaire capture, and future AI/equipment evidence intake.

CREATE TABLE "consent_records" (
  "id" TEXT NOT NULL,
  "farmer_id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "granted" BOOLEAN NOT NULL DEFAULT true,
  "form_version" TEXT NOT NULL DEFAULT 'MAYODATA_CONSENT_2026_07',
  "language" TEXT NOT NULL DEFAULT 'sw',
  "explanation_read_by_user_id" TEXT,
  "signature_url" TEXT,
  "thumbprint_url" TEXT,
  "witness_name" TEXT,
  "notes" TEXT,
  "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMP(3),

  CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "consent_records_farmer_id_scope_captured_at_idx"
  ON "consent_records"("farmer_id", "scope", "captured_at");

ALTER TABLE "consent_records"
  ADD CONSTRAINT "consent_records_farmer_id_fkey"
  FOREIGN KEY ("farmer_id") REFERENCES "farmers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "farmer_questionnaires" (
  "id" TEXT NOT NULL,
  "farmer_id" TEXT NOT NULL,
  "farm_id" TEXT,
  "field_officer_user_id" TEXT,
  "form_version" TEXT NOT NULL DEFAULT 'MAYODATA_FIELD_QUESTIONNAIRE_2026_07',
  "language" TEXT NOT NULL DEFAULT 'sw',
  "official_use" JSONB NOT NULL DEFAULT '{}',
  "farmer_snapshot" JSONB NOT NULL DEFAULT '{}',
  "farm_registration" JSONB NOT NULL DEFAULT '{}',
  "planting_inputs" JSONB NOT NULL DEFAULT '{}',
  "mid_season_costs" JSONB NOT NULL DEFAULT '{}',
  "harvest_sales" JSONB NOT NULL DEFAULT '{}',
  "consent_acknowledged" BOOLEAN NOT NULL DEFAULT false,
  "signature_url" TEXT,
  "photo_urls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "gps_latitude" DOUBLE PRECISION,
  "gps_longitude" DOUBLE PRECISION,
  "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "farmer_questionnaires_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "farmer_questionnaires_farmer_id_captured_at_idx"
  ON "farmer_questionnaires"("farmer_id", "captured_at");

CREATE INDEX "farmer_questionnaires_farm_id_idx"
  ON "farmer_questionnaires"("farm_id");

ALTER TABLE "farmer_questionnaires"
  ADD CONSTRAINT "farmer_questionnaires_farmer_id_fkey"
  FOREIGN KEY ("farmer_id") REFERENCES "farmers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "farmer_questionnaires"
  ADD CONSTRAINT "farmer_questionnaires_farm_id_fkey"
  FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ai_integration_records" (
  "id" TEXT NOT NULL,
  "source_type" TEXT NOT NULL,
  "farm_id" TEXT,
  "crop_cycle_id" TEXT,
  "lot_id" TEXT,
  "external_reference" TEXT,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "recommendation" JSONB,
  "captured_by_user_id" TEXT,
  "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ai_integration_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_integration_records_source_type_captured_at_idx"
  ON "ai_integration_records"("source_type", "captured_at");

CREATE INDEX "ai_integration_records_farm_id_idx"
  ON "ai_integration_records"("farm_id");

CREATE INDEX "ai_integration_records_crop_cycle_id_idx"
  ON "ai_integration_records"("crop_cycle_id");

CREATE INDEX "ai_integration_records_lot_id_idx"
  ON "ai_integration_records"("lot_id");

ALTER TABLE "ai_integration_records"
  ADD CONSTRAINT "ai_integration_records_farm_id_fkey"
  FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ai_integration_records"
  ADD CONSTRAINT "ai_integration_records_crop_cycle_id_fkey"
  FOREIGN KEY ("crop_cycle_id") REFERENCES "crop_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ai_integration_records"
  ADD CONSTRAINT "ai_integration_records_lot_id_fkey"
  FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
