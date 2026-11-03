-- Simple expense / income records (money out and money in) that post to the ledger.
CREATE TYPE "CashTransactionKind" AS ENUM ('EXPENSE', 'INCOME');
CREATE TYPE "CashTransactionStatus" AS ENUM ('POSTED', 'VOID');

CREATE TABLE "cash_transactions" (
    "id" TEXT NOT NULL,
    "mamcos_id" TEXT NOT NULL,
    "kind" "CashTransactionKind" NOT NULL,
    "number" TEXT NOT NULL,
    "transaction_date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "vat_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "account_code" TEXT NOT NULL,
    "party" TEXT,
    "method" TEXT NOT NULL DEFAULT 'CASH',
    "reference" TEXT,
    "note" TEXT,
    "status" "CashTransactionStatus" NOT NULL DEFAULT 'POSTED',
    "voided_at" TIMESTAMP(3),
    "voided_by_id" TEXT,
    "void_reason" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cash_transactions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cash_transactions_amount_check" CHECK ("amount" > 0 AND "vat_amount" >= 0 AND "vat_amount" < "amount"),
    CONSTRAINT "cash_transactions_method_check" CHECK ("method" IN ('CASH', 'BANK', 'MOBILE_MONEY')),
    CONSTRAINT "cash_transactions_void_check" CHECK (("status" = 'VOID') = ("voided_at" IS NOT NULL))
);
CREATE UNIQUE INDEX "cash_transactions_mamcos_id_number_key" ON "cash_transactions"("mamcos_id", "number");
CREATE INDEX "cash_transactions_mamcos_id_transaction_date_idx" ON "cash_transactions"("mamcos_id", "transaction_date");
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_mamcos_id_fkey" FOREIGN KEY ("mamcos_id") REFERENCES "mamcos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
