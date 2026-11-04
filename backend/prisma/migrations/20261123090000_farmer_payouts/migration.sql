-- Paying farmers (or walk-in sellers) for paddy the cooperative bought, from a chosen money account.
CREATE TABLE "farmer_payouts" (
  "id" TEXT NOT NULL,
  "mamcos_id" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "farmer_id" TEXT,
  "seller_name" TEXT,
  "amount" DECIMAL(14,2) NOT NULL,
  "paid_on" DATE NOT NULL,
  "method" TEXT NOT NULL DEFAULT 'CASH',
  "reference" TEXT,
  "note" TEXT,
  "cash_account_id" TEXT,
  "voided_at" TIMESTAMP(3),
  "voided_by_id" TEXT,
  "void_reason" TEXT,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "farmer_payouts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "farmer_payouts_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "farmer_payouts_payee_check" CHECK (("farmer_id" IS NOT NULL) <> ("seller_name" IS NOT NULL)),
  CONSTRAINT "farmer_payouts_void_check" CHECK (("voided_at" IS NULL) = ("void_reason" IS NULL))
);
ALTER TABLE "farmer_payouts" ADD CONSTRAINT "farmer_payouts_mamcos_id_fkey" FOREIGN KEY ("mamcos_id") REFERENCES "mamcos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "farmer_payouts" ADD CONSTRAINT "farmer_payouts_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "farmer_payouts" ADD CONSTRAINT "farmer_payouts_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "farmer_payouts_mamcos_number_key" ON "farmer_payouts"("mamcos_id", "number");
CREATE INDEX "farmer_payouts_mamcos_farmer_idx" ON "farmer_payouts"("mamcos_id", "farmer_id");
