ALTER TYPE "DueCategory" ADD VALUE IF NOT EXISTS 'INTEREST';

CREATE TABLE "input_credit_terms" (
  "mamcos_id" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "period" TEXT NOT NULL DEFAULT 'MONTHLY',
  "grace_days" INTEGER NOT NULL DEFAULT 0,
  "payment_order" TEXT NOT NULL DEFAULT 'INTEREST_FIRST',
  "updated_by_id" TEXT,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "input_credit_terms_pkey" PRIMARY KEY ("mamcos_id")
);

CREATE TABLE "input_interest_rates" (
  "id" TEXT NOT NULL,
  "mamcos_id" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "rate_percent" DECIMAL(7,3) NOT NULL,
  "valid_from" DATE NOT NULL,
  "valid_to" DATE,
  "season_id" TEXT,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "input_interest_rates_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "input_interest_rates_mamcos_id_valid_from_idx" ON "input_interest_rates"("mamcos_id", "valid_from");

CREATE TABLE "input_interest_accruals" (
  "id" TEXT NOT NULL,
  "mamcos_id" TEXT NOT NULL,
  "principal_due_id" TEXT NOT NULL,
  "interest_due_id" TEXT NOT NULL,
  "period_key" TEXT NOT NULL,
  "period_end" DATE NOT NULL,
  "base_principal" DECIMAL(14,2) NOT NULL,
  "rate_percent" DECIMAL(7,3) NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "input_interest_accruals_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "input_interest_accruals_principal_due_id_period_key_key" ON "input_interest_accruals"("principal_due_id", "period_key");
CREATE INDEX "input_interest_accruals_mamcos_id_idx" ON "input_interest_accruals"("mamcos_id");
CREATE INDEX "input_interest_accruals_interest_due_id_idx" ON "input_interest_accruals"("interest_due_id");
