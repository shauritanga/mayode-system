CREATE TYPE "InsuranceApplicationStatus" AS ENUM ('SUBMITTED','UNDER_REVIEW','APPROVED','REJECTED','ACTIVATED','WITHDRAWN');

ALTER TABLE "insurance_policies"
  ADD COLUMN "mamcos_id" TEXT,
  ADD COLUMN "premium_paid_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "premium_paid_at" TIMESTAMP(3),
  ADD COLUMN "premium_reference" TEXT;
UPDATE "insurance_policies" p SET "mamcos_id" = f."mamcos_id" FROM "farmers" f WHERE f."id" = p."farmer_id";
CREATE INDEX "insurance_policies_mamcos_id_idx" ON "insurance_policies"("mamcos_id");

ALTER TABLE "insurance_claims"
  ADD COLUMN "inspection_photo_urls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "assessed_loss_amount" DOUBLE PRECISION,
  ADD COLUMN "recommendation" TEXT,
  ADD COLUMN "approved_amount" DOUBLE PRECISION,
  ADD COLUMN "decision_note" TEXT,
  ADD COLUMN "decided_at" TIMESTAMP(3),
  ADD COLUMN "payment_reference" TEXT;
-- Claims already approved or paid before this change keep a sensible approved amount.
UPDATE "insurance_claims" SET "approved_amount" = COALESCE("paid_amount", "claimed_amount") WHERE "status" IN ('APPROVED','PAID');

CREATE TABLE "insurance_applications" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "farmer_id" TEXT NOT NULL,
  "mamcos_id" TEXT,
  "provider_id" TEXT NOT NULL,
  "farm_id" TEXT,
  "crop_cycle_id" TEXT,
  "product_type" "InsuranceProductType" NOT NULL,
  "rice_variety" TEXT,
  "insured_area_hectares" DOUBLE PRECISION NOT NULL,
  "requested_sum_insured" DOUBLE PRECISION,
  "notes" TEXT,
  "status" "InsuranceApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
  "risk_snapshot" JSONB NOT NULL,
  "risk_level" TEXT NOT NULL,
  "submitted_by_user_id" TEXT NOT NULL,
  "submitted_on_behalf" BOOLEAN NOT NULL DEFAULT false,
  "review_started_at" TIMESTAMP(3),
  "sum_insured" DOUBLE PRECISION,
  "premium_amount" DOUBLE PRECISION,
  "start_date" TIMESTAMP(3),
  "end_date" TIMESTAMP(3),
  "decision_note" TEXT,
  "decided_by_user_id" TEXT,
  "decided_at" TIMESTAMP(3),
  "premium_paid_amount" DOUBLE PRECISION,
  "premium_paid_at" TIMESTAMP(3),
  "premium_reference" TEXT,
  "recorded_by_user_id" TEXT,
  "policy_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "insurance_applications_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "insurance_applications_reference_key" ON "insurance_applications"("reference");
CREATE UNIQUE INDEX "insurance_applications_policy_id_key" ON "insurance_applications"("policy_id");
CREATE INDEX "insurance_applications_farmer_id_idx" ON "insurance_applications"("farmer_id");
CREATE INDEX "insurance_applications_provider_id_status_idx" ON "insurance_applications"("provider_id","status");
CREATE INDEX "insurance_applications_mamcos_id_status_idx" ON "insurance_applications"("mamcos_id","status");
ALTER TABLE "insurance_applications" ADD CONSTRAINT "insurance_applications_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "insurance_applications" ADD CONSTRAINT "insurance_applications_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "insurance_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "insurance_applications" ADD CONSTRAINT "insurance_applications_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "insurance_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
