CREATE TYPE "LoanApplicationStatus" AS ENUM ('SUBMITTED','UNDER_REVIEW','APPROVED','REJECTED','DISBURSED','WITHDRAWN');
CREATE TYPE "LoanPurpose" AS ENUM ('SEED_AND_INPUTS','LAND_PREPARATION','LABOUR','EQUIPMENT','IRRIGATION','HARVEST_AND_TRANSPORT','WORKING_CAPITAL','OTHER');

CREATE TABLE "loan_applications" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "farmer_id" TEXT NOT NULL,
  "mamcos_id" TEXT,
  "lender_id" TEXT NOT NULL,
  "amount_requested" DOUBLE PRECISION NOT NULL,
  "term_months" INTEGER NOT NULL,
  "purpose" "LoanPurpose" NOT NULL,
  "purpose_note" TEXT,
  "crop_cycle_id" TEXT,
  "status" "LoanApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
  "profile_snapshot" JSONB NOT NULL,
  "credit_score" INTEGER,
  "submitted_by_user_id" TEXT NOT NULL,
  "submitted_on_behalf" BOOLEAN NOT NULL DEFAULT false,
  "review_started_at" TIMESTAMP(3),
  "approved_amount" DOUBLE PRECISION,
  "interest_rate_percent" DOUBLE PRECISION,
  "auto_deduct_percent" DOUBLE PRECISION,
  "decision_note" TEXT,
  "decided_by_user_id" TEXT,
  "decided_at" TIMESTAMP(3),
  "disbursed_amount" DOUBLE PRECISION,
  "disbursed_at" TIMESTAMP(3),
  "disbursement_ref" TEXT,
  "loan_record_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "loan_applications_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "loan_applications_reference_key" ON "loan_applications"("reference");
CREATE UNIQUE INDEX "loan_applications_loan_record_id_key" ON "loan_applications"("loan_record_id");
CREATE INDEX "loan_applications_farmer_id_idx" ON "loan_applications"("farmer_id");
CREATE INDEX "loan_applications_lender_id_status_idx" ON "loan_applications"("lender_id","status");
CREATE INDEX "loan_applications_mamcos_id_status_idx" ON "loan_applications"("mamcos_id","status");
ALTER TABLE "loan_applications" ADD CONSTRAINT "loan_applications_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "loan_applications" ADD CONSTRAINT "loan_applications_lender_id_fkey" FOREIGN KEY ("lender_id") REFERENCES "lenders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "loan_applications" ADD CONSTRAINT "loan_applications_loan_record_id_fkey" FOREIGN KEY ("loan_record_id") REFERENCES "loan_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "loan_instalments" (
  "id" TEXT NOT NULL,
  "loan_record_id" TEXT NOT NULL,
  "number" INTEGER NOT NULL,
  "due_date" TIMESTAMP(3) NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "loan_instalments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "loan_instalments_loan_record_id_number_key" ON "loan_instalments"("loan_record_id","number");
ALTER TABLE "loan_instalments" ADD CONSTRAINT "loan_instalments_loan_record_id_fkey" FOREIGN KEY ("loan_record_id") REFERENCES "loan_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
