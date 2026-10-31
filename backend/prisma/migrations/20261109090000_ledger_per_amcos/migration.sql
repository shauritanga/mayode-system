-- AlterTable
ALTER TABLE "bills" ADD COLUMN     "mamcos_id" TEXT;
-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "mamcos_id" TEXT;
-- AlterTable
ALTER TABLE "ledger_entries" ADD COLUMN     "mamcos_id" TEXT;
-- CreateIndex
CREATE INDEX "bills_mamcos_id_idx" ON "bills"("mamcos_id");
-- CreateIndex
CREATE INDEX "invoices_mamcos_id_idx" ON "invoices"("mamcos_id");
-- CreateIndex
CREATE INDEX "ledger_entries_mamcos_id_entry_date_idx" ON "ledger_entries"("mamcos_id", "entry_date");
-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_mamcos_id_fkey" FOREIGN KEY ("mamcos_id") REFERENCES "mamcos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_mamcos_id_fkey" FOREIGN KEY ("mamcos_id") REFERENCES "mamcos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_mamcos_id_fkey" FOREIGN KEY ("mamcos_id") REFERENCES "mamcos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------------------------
-- Backfill: attribute existing postings to the cooperative whose books they belong to, from the record that caused
-- them. Rows that cannot be attributed (e.g. manual journals, records with no cooperative) stay NULL = platform-level,
-- visible to Super Admin only. Safe to re-run: it only fills rows that are still NULL.
-- ---------------------------------------------------------------------------------------------------------------
UPDATE "ledger_entries" e SET "mamcos_id" = f."mamcos_id"
FROM "loan_records" l JOIN "farmers" f ON f."id" = l."farmer_id"
WHERE e."mamcos_id" IS NULL AND e."source_type" = 'LoanDisbursement' AND e."source_id" = l."id";

UPDATE "ledger_entries" e SET "mamcos_id" = f."mamcos_id"
FROM "loan_deductions" d JOIN "loan_records" l ON l."id" = d."loan_record_id" JOIN "farmers" f ON f."id" = l."farmer_id"
WHERE e."mamcos_id" IS NULL AND e."source_type" IN ('LoanDeduction', 'LenderRemittance') AND e."source_id" = d."id";

UPDATE "ledger_entries" e SET "mamcos_id" = f."mamcos_id"
FROM "payments" p JOIN "farmers" f ON f."id" = p."farmer_id"
WHERE e."mamcos_id" IS NULL AND e."source_type" IN ('FarmerPayout', 'Payment', 'MembershipPayment', 'FarmerProcurementPayment') AND e."source_id" = p."id";

UPDATE "ledger_entries" e SET "mamcos_id" = s."mamcos_id"
FROM "sales" s
WHERE e."mamcos_id" IS NULL AND e."source_type" IN ('Sale', 'SaleAdjustment', 'SaleAdjustmentPayables', 'SaleSettlement') AND e."source_id" = s."id";

UPDATE "ledger_entries" e SET "mamcos_id" = r."mamcos_id"
FROM "inventory_records" r
WHERE e."mamcos_id" IS NULL AND e."source_type" = 'PaddyDelivery' AND e."source_id" = r."id";

UPDATE "ledger_entries" e SET "mamcos_id" = fm."mamcos_id"
FROM "tractor_bookings" t JOIN "farmers" fm ON fm."id" = t."farmer_id"
WHERE e."mamcos_id" IS NULL AND e."source_type" = 'TractorBooking' AND e."source_id" = t."id";

UPDATE "ledger_entries" e SET "mamcos_id" = fa."mamcos_id"
FROM "input_costs" c JOIN "crop_cycles" cc ON cc."id" = c."crop_cycle_id" JOIN "farms" fa ON fa."id" = cc."farm_id"
WHERE e."mamcos_id" IS NULL AND e."source_type" = 'InputCost' AND e."source_id" = c."id";

UPDATE "ledger_entries" e SET "mamcos_id" = fa."mamcos_id"
FROM "revenues" rv JOIN "crop_cycles" cc ON cc."id" = rv."crop_cycle_id" JOIN "farms" fa ON fa."id" = cc."farm_id"
WHERE e."mamcos_id" IS NULL AND e."source_type" = 'Revenue' AND e."source_id" = rv."id";

UPDATE "ledger_entries" e SET "mamcos_id" = m."mamcos_id"
FROM "member_contributions" m
WHERE e."mamcos_id" IS NULL AND e."source_type" = 'MemberContribution' AND e."source_id" = m."id";

UPDATE "ledger_entries" e SET "mamcos_id" = r."mamcos_id"
FROM "reserve_allocations" r
WHERE e."mamcos_id" IS NULL AND e."source_type" = 'ReserveAllocation' AND e."source_id" = r."id";

-- Sales invoices follow their sale; ledger rows for bills have no source table to read, so they inherit from the bill row once stamped.
UPDATE "invoices" i SET "mamcos_id" = s."mamcos_id" FROM "sales" s WHERE i."mamcos_id" IS NULL AND i."sale_id" = s."id";
UPDATE "ledger_entries" e SET "mamcos_id" = b."mamcos_id" FROM "bills" b
WHERE e."mamcos_id" IS NULL AND e."source_type" IN ('Bill', 'BillPayment') AND e."source_id" = b."id" AND b."mamcos_id" IS NOT NULL;
