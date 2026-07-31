-- Connect cooperative sales to their source farmers, revenues and payouts.
ALTER TABLE "farmers" ADD COLUMN IF NOT EXISTS "data_share_consent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "farmers" ADD COLUMN IF NOT EXISTS "consented_at" TIMESTAMP(3);

ALTER TABLE "activity_logs" ADD COLUMN IF NOT EXISTS "family_labor_count" INTEGER;
ALTER TABLE "activity_logs" ADD COLUMN IF NOT EXISTS "hired_labor_count" INTEGER;
ALTER TABLE "activity_logs" ADD COLUMN IF NOT EXISTS "labor_wage_total" DOUBLE PRECISION;

ALTER TABLE "loan_records" ADD COLUMN IF NOT EXISTS "lender_payout_phone" TEXT;
ALTER TABLE "loan_records" ADD COLUMN IF NOT EXISTS "lender_payout_name" TEXT;

ALTER TABLE "revenues" ADD COLUMN IF NOT EXISTS "sale_id" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "sale_id" TEXT;

CREATE TABLE IF NOT EXISTS "sale_apportionments" (
  "id" TEXT NOT NULL,
  "sale_id" TEXT NOT NULL,
  "farmer_id" TEXT NOT NULL,
  "inventory_weight_kg" DOUBLE PRECISION NOT NULL,
  "weight_share" DOUBLE PRECISION NOT NULL,
  "quantity_kg" DOUBLE PRECISION NOT NULL,
  "gross_amount" DOUBLE PRECISION NOT NULL,
  "fairtrade_premium" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "revenue_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sale_apportionments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "sale_apportionments_sale_id_farmer_id_key" ON "sale_apportionments"("sale_id", "farmer_id");
CREATE UNIQUE INDEX IF NOT EXISTS "sale_apportionments_revenue_id_key" ON "sale_apportionments"("revenue_id");
CREATE INDEX IF NOT EXISTS "sale_apportionments_farmer_id_idx" ON "sale_apportionments"("farmer_id");

ALTER TABLE "revenues" ADD CONSTRAINT "revenues_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sale_apportionments" ADD CONSTRAINT "sale_apportionments_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_apportionments" ADD CONSTRAINT "sale_apportionments_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_apportionments" ADD CONSTRAINT "sale_apportionments_revenue_id_fkey" FOREIGN KEY ("revenue_id") REFERENCES "revenues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TYPE "PremiumFundEntryType" AS ENUM ('INCOME', 'EXPENSE');
CREATE TABLE "premium_fund_entries" (
  "id" TEXT NOT NULL,
  "entry_type" "PremiumFundEntryType" NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "description" TEXT NOT NULL,
  "sale_id" TEXT,
  "entry_date" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "premium_fund_entries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "premium_fund_entries_entry_date_idx" ON "premium_fund_entries"("entry_date");
ALTER TABLE "premium_fund_entries" ADD CONSTRAINT "premium_fund_entries_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "loan_deductions" (
  "id" TEXT NOT NULL,
  "loan_record_id" TEXT NOT NULL,
  "source_payment_id" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "order_reference" TEXT,
  "payout_status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "loan_deductions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "loan_deductions_order_reference_key" ON "loan_deductions"("order_reference");
CREATE UNIQUE INDEX "loan_deductions_loan_record_id_source_payment_id_key" ON "loan_deductions"("loan_record_id", "source_payment_id");
CREATE INDEX "loan_deductions_source_payment_id_idx" ON "loan_deductions"("source_payment_id");
ALTER TABLE "loan_deductions" ADD CONSTRAINT "loan_deductions_loan_record_id_fkey" FOREIGN KEY ("loan_record_id") REFERENCES "loan_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "loan_deductions" ADD CONSTRAINT "loan_deductions_source_payment_id_fkey" FOREIGN KEY ("source_payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');
CREATE TABLE "accounts" ("id" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL, "type" "AccountType" NOT NULL, "is_active" BOOLEAN NOT NULL DEFAULT true, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "accounts_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "accounts_code_key" ON "accounts"("code");
CREATE TABLE "ledger_entries" ("id" TEXT NOT NULL, "entry_number" TEXT NOT NULL, "account_id" TEXT NOT NULL, "debit" DOUBLE PRECISION NOT NULL DEFAULT 0, "credit" DOUBLE PRECISION NOT NULL DEFAULT 0, "entry_date" TIMESTAMP(3) NOT NULL, "source_type" TEXT NOT NULL, "source_id" TEXT NOT NULL, "description" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "ledger_entries_source_type_source_id_account_id_key" ON "ledger_entries"("source_type", "source_id", "account_id");
CREATE INDEX "ledger_entries_entry_date_idx" ON "ledger_entries"("entry_date");
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TYPE "InvoiceStatus" AS ENUM ('OPEN', 'PAID', 'OVERDUE', 'VOID');
CREATE TABLE "invoices" ("id" TEXT NOT NULL, "invoice_number" TEXT NOT NULL, "sale_id" TEXT, "buyer_id" TEXT, "amount" DOUBLE PRECISION NOT NULL, "due_date" TIMESTAMP(3) NOT NULL, "status" "InvoiceStatus" NOT NULL DEFAULT 'OPEN', "paid_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "invoices_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number"); CREATE UNIQUE INDEX "invoices_sale_id_key" ON "invoices"("sale_id"); CREATE INDEX "invoices_due_date_status_idx" ON "invoices"("due_date", "status");
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE; ALTER TABLE "invoices" ADD CONSTRAINT "invoices_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "buyers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TABLE "bills" ("id" TEXT NOT NULL, "bill_number" TEXT NOT NULL, "supplier" TEXT NOT NULL, "amount" DOUBLE PRECISION NOT NULL, "due_date" TIMESTAMP(3) NOT NULL, "status" "InvoiceStatus" NOT NULL DEFAULT 'OPEN', "paid_at" TIMESTAMP(3), "description" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "bills_pkey" PRIMARY KEY ("id")); CREATE UNIQUE INDEX "bills_bill_number_key" ON "bills"("bill_number"); CREATE INDEX "bills_due_date_status_idx" ON "bills"("due_date", "status");
CREATE TABLE "budgets" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, "start_date" TIMESTAMP(3) NOT NULL, "end_date" TIMESTAMP(3) NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "budgets_pkey" PRIMARY KEY ("id"));
CREATE TABLE "budget_lines" ("id" TEXT NOT NULL, "budget_id" TEXT NOT NULL, "account_id" TEXT NOT NULL, "amount" DOUBLE PRECISION NOT NULL, CONSTRAINT "budget_lines_pkey" PRIMARY KEY ("id")); CREATE UNIQUE INDEX "budget_lines_budget_id_account_id_key" ON "budget_lines"("budget_id", "account_id"); ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE; ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TYPE "ProjectStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETE', 'CANCELLED'); CREATE TYPE "VoteStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');
CREATE TABLE "community_projects" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, "funding_source" TEXT NOT NULL, "budget" DOUBLE PRECISION NOT NULL, "spent_amount" DOUBLE PRECISION NOT NULL DEFAULT 0, "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNED', "milestones" JSONB, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "community_projects_pkey" PRIMARY KEY ("id"));
CREATE TABLE "meeting_records" ("id" TEXT NOT NULL, "meeting_date" TIMESTAMP(3) NOT NULL, "agenda" TEXT NOT NULL, "decisions" TEXT NOT NULL, "attendee_count" INTEGER NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "meeting_records_pkey" PRIMARY KEY ("id"));
CREATE TABLE "votes" ("id" TEXT NOT NULL, "title" TEXT NOT NULL, "description" TEXT, "opens_at" TIMESTAMP(3) NOT NULL, "closes_at" TIMESTAMP(3) NOT NULL, "status" "VoteStatus" NOT NULL DEFAULT 'DRAFT', "meeting_id" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "votes_pkey" PRIMARY KEY ("id")); ALTER TABLE "votes" ADD CONSTRAINT "votes_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meeting_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TABLE "vote_options" ("id" TEXT NOT NULL, "vote_id" TEXT NOT NULL, "label" TEXT NOT NULL, CONSTRAINT "vote_options_pkey" PRIMARY KEY ("id")); ALTER TABLE "vote_options" ADD CONSTRAINT "vote_options_vote_id_fkey" FOREIGN KEY ("vote_id") REFERENCES "votes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "vote_responses" ("id" TEXT NOT NULL, "vote_id" TEXT NOT NULL, "option_id" TEXT NOT NULL, "farmer_id" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "vote_responses_pkey" PRIMARY KEY ("id")); CREATE UNIQUE INDEX "vote_responses_vote_id_farmer_id_key" ON "vote_responses"("vote_id", "farmer_id"); ALTER TABLE "vote_responses" ADD CONSTRAINT "vote_responses_vote_id_fkey" FOREIGN KEY ("vote_id") REFERENCES "votes"("id") ON DELETE CASCADE ON UPDATE CASCADE; ALTER TABLE "vote_responses" ADD CONSTRAINT "vote_responses_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "vote_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE; ALTER TABLE "vote_responses" ADD CONSTRAINT "vote_responses_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "partner_api_keys" ("id" TEXT NOT NULL, "partner_name" TEXT NOT NULL, "key_prefix" TEXT NOT NULL, "key_hash" TEXT NOT NULL, "is_active" BOOLEAN NOT NULL DEFAULT true, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "last_used_at" TIMESTAMP(3), CONSTRAINT "partner_api_keys_pkey" PRIMARY KEY ("id")); CREATE UNIQUE INDEX "partner_api_keys_key_prefix_key" ON "partner_api_keys"("key_prefix");
CREATE TABLE "partner_api_requests" ("id" TEXT NOT NULL, "api_key_id" TEXT NOT NULL, "farmer_id" TEXT, "endpoint" TEXT NOT NULL, "ip_address" TEXT, "response_code" INTEGER NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "partner_api_requests_pkey" PRIMARY KEY ("id")); CREATE INDEX "partner_api_requests_farmer_id_created_at_idx" ON "partner_api_requests"("farmer_id", "created_at"); ALTER TABLE "partner_api_requests" ADD CONSTRAINT "partner_api_requests_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "partner_api_keys"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
