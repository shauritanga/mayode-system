ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "payout_approved_by_user_id" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "payout_approved_at" TIMESTAMP(3);
ALTER TABLE "loan_deductions" ADD COLUMN IF NOT EXISTS "payout_approved_by_user_id" TEXT;
ALTER TABLE "loan_deductions" ADD COLUMN IF NOT EXISTS "payout_approved_at" TIMESTAMP(3);
