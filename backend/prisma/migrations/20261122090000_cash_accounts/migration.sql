-- Named money accounts (cash box, bank accounts, mobile money wallets) for each AMCOS.
-- The books keep one cash account (1000); each line on it is now tagged with the money account it moved through.
CREATE TYPE "CashAccountKind" AS ENUM ('CASH', 'BANK', 'MOBILE_MONEY');
CREATE TYPE "CashTransferStatus" AS ENUM ('POSTED', 'CANCELLED');

CREATE TABLE "cash_accounts" (
  "id" TEXT NOT NULL,
  "mamcos_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" "CashAccountKind" NOT NULL,
  "provider" TEXT,
  "account_number" TEXT,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cash_accounts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cash_accounts_name_check" CHECK (char_length(btrim("name")) BETWEEN 2 AND 80)
);
ALTER TABLE "cash_accounts" ADD CONSTRAINT "cash_accounts_mamcos_id_fkey" FOREIGN KEY ("mamcos_id") REFERENCES "mamcos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "cash_accounts_mamcos_name_key" ON "cash_accounts"("mamcos_id", lower("name"));
-- At most one default account of each kind per cooperative.
CREATE UNIQUE INDEX "cash_accounts_one_default_per_kind" ON "cash_accounts"("mamcos_id", "kind") WHERE "is_default" AND "is_active";
CREATE INDEX "cash_accounts_mamcos_idx" ON "cash_accounts"("mamcos_id", "is_active");

CREATE TABLE "cash_transfers" (
  "id" TEXT NOT NULL,
  "mamcos_id" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "from_account_id" TEXT,
  "to_account_id" TEXT,
  "amount" DECIMAL(14,2) NOT NULL,
  "transfer_date" DATE NOT NULL,
  "note" TEXT,
  "status" "CashTransferStatus" NOT NULL DEFAULT 'POSTED',
  "cancelled_at" TIMESTAMP(3),
  "cancelled_by_id" TEXT,
  "cancel_reason" TEXT,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cash_transfers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cash_transfers_amount_check" CHECK ("amount" > 0),
  -- A transfer moves money between two different places; null means "not assigned to an account yet".
  CONSTRAINT "cash_transfers_different_check" CHECK ("from_account_id" IS DISTINCT FROM "to_account_id")
);
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_mamcos_id_fkey" FOREIGN KEY ("mamcos_id") REFERENCES "mamcos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_from_fkey" FOREIGN KEY ("from_account_id") REFERENCES "cash_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_to_fkey" FOREIGN KEY ("to_account_id") REFERENCES "cash_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "cash_transfers_mamcos_number_key" ON "cash_transfers"("mamcos_id", "number");
CREATE INDEX "cash_transfers_mamcos_date_idx" ON "cash_transfers"("mamcos_id", "transfer_date");

-- Which money account each cash line of the ledger moved through (null = not assigned yet).
ALTER TABLE "ledger_entries" ADD COLUMN "cash_account_id" TEXT;
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "ledger_entries_cash_account_id_idx" ON "ledger_entries"("cash_account_id");

-- A transfer posts two lines on the same ledger account (one per money account), so the per-source and per-reversal
-- uniqueness now also looks at the money account.
DROP INDEX "ledger_entries_source_type_source_id_account_id_revision_key";
CREATE UNIQUE INDEX "ledger_entries_source_account_revision_cash_key" ON "ledger_entries"("source_type", "source_id", "account_id", "revision", COALESCE("cash_account_id", ''));
DROP INDEX "ledger_entries_reverses_journal_id_account_id_key";
CREATE UNIQUE INDEX "ledger_entries_reverses_account_cash_key" ON "ledger_entries"("reverses_journal_id", "account_id", COALESCE("cash_account_id", ''));

-- The money account a record used, kept on the record so later corrections and cancellations go back to the same account.
ALTER TABLE "cash_transactions" ADD COLUMN "cash_account_id" TEXT;
ALTER TABLE "payroll_runs" ADD COLUMN "cash_account_id" TEXT;
ALTER TABLE "due_payments" ADD COLUMN "cash_account_id" TEXT;
ALTER TABLE "ops_payments" ADD COLUMN "cash_account_id" TEXT;
ALTER TABLE "invoices" ADD COLUMN "cash_account_id" TEXT;
ALTER TABLE "bills" ADD COLUMN "cash_account_id" TEXT;
ALTER TABLE "bank_statements" ADD COLUMN "cash_account_id" TEXT;
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "due_payments" ADD CONSTRAINT "due_payments_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ops_payments" ADD CONSTRAINT "ops_payments_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bills" ADD CONSTRAINT "bills_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
