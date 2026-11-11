-- Invoices and bills can be settled in parts.
ALTER TABLE "invoices" ADD COLUMN "amount_paid" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "bills" ADD COLUMN "amount_paid" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Documents already paid in full were settled in one go.
UPDATE "invoices" SET "amount_paid" = "amount" WHERE "status" = 'PAID';
UPDATE "bills" SET "amount_paid" = ROUND(("amount" - "withholding_amount")::numeric, 2)::double precision WHERE "status" = 'PAID';

CREATE TABLE "document_payments" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "document_id" TEXT NOT NULL,
  "mamcos_id" TEXT,
  "amount" DOUBLE PRECISION NOT NULL,
  "withholding" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "cash" DOUBLE PRECISION NOT NULL,
  "cash_account_id" TEXT,
  "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by_id" TEXT,
  CONSTRAINT "document_payments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "document_payments_kind_document_id_idx" ON "document_payments"("kind", "document_id");
CREATE INDEX "document_payments_mamcos_id_paid_at_idx" ON "document_payments"("mamcos_id", "paid_at");

-- Back-fill one payment row for each document that was already paid.
INSERT INTO "document_payments" ("id", "kind", "document_id", "mamcos_id", "amount", "withholding", "cash", "cash_account_id", "paid_at")
SELECT gen_random_uuid()::text, 'INVOICE', "id", "mamcos_id", "amount", "withholding_amount", ROUND(("amount" - "withholding_amount")::numeric, 2)::double precision, "cash_account_id", COALESCE("paid_at", "created_at")
FROM "invoices" WHERE "status" = 'PAID';
INSERT INTO "document_payments" ("id", "kind", "document_id", "mamcos_id", "amount", "withholding", "cash", "cash_account_id", "paid_at")
SELECT gen_random_uuid()::text, 'BILL', "id", "mamcos_id", ROUND(("amount" - "withholding_amount")::numeric, 2)::double precision, 0, ROUND(("amount" - "withholding_amount")::numeric, 2)::double precision, "cash_account_id", COALESCE("paid_at", "created_at")
FROM "bills" WHERE "status" = 'PAID';
