-- A transfer can wait for the receiving member to accept or decline (SMS + app) before approval/execution.
ALTER TYPE "IrrigationTransferStatus" ADD VALUE 'AWAITING_RECIPIENT' BEFORE 'PENDING_APPROVAL';
ALTER TABLE "irrigation_allocation_transfers" ADD COLUMN "recipient_responded_at" TIMESTAMP(3);
ALTER TABLE "irrigation_schemes" ADD COLUMN "require_recipient_acceptance" BOOLEAN NOT NULL DEFAULT false;

-- One open transfer per hectare. The predicate lists the closed states rather than naming the new value,
-- because a value added in this migration cannot be used until the transaction commits.
DROP INDEX "irrigation_transfers_one_pending_per_hectare";
CREATE UNIQUE INDEX "irrigation_transfers_one_pending_per_hectare"
  ON "irrigation_allocation_transfers" ("hectare_id") WHERE "status" NOT IN ('COMPLETED', 'REJECTED', 'CANCELLED');
