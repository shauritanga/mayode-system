CREATE TYPE "BudgetStatus" AS ENUM ('DRAFT', 'APPROVED', 'REJECTED');

ALTER TABLE "budgets"
ADD COLUMN "status" "BudgetStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN "approved_at" TIMESTAMP(3),
ADD COLUMN "approved_by_user_id" TEXT;

ALTER TABLE "budgets"
ADD CONSTRAINT "budgets_mamcos_id_fkey"
FOREIGN KEY ("mamcos_id") REFERENCES "mamcos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "budgets_mamcos_id_status_idx"
ON "budgets"("mamcos_id", "status");
