ALTER TABLE "budgets"
ADD COLUMN IF NOT EXISTS "mamcos_id" TEXT;

CREATE INDEX IF NOT EXISTS "budgets_mamcos_id_idx"
ON "budgets"("mamcos_id");
