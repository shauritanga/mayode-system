-- Expenses: second-person approval above a limit, receipt attachments, and corrections.
ALTER TYPE "CashTransactionStatus" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';
ALTER TYPE "CashTransactionStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

ALTER TABLE "cash_transactions" ADD COLUMN "attachments" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "cash_transactions" ADD COLUMN "approved_by_id" TEXT;
ALTER TABLE "cash_transactions" ADD COLUMN "approved_at" TIMESTAMP(3);
ALTER TABLE "cash_transactions" ADD COLUMN "rejected_reason" TEXT;
ALTER TABLE "cash_transactions" ADD COLUMN "replaces_id" TEXT;

ALTER TABLE "mamcos" ADD COLUMN "expense_approval_threshold" DECIMAL(14,2);

-- Permission to approve large expenses (a different person from the one who recorded it).
INSERT INTO "resources" ("id", "key", "label") VALUES (gen_random_uuid()::text, 'expense_approval', 'Expense Approval')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("id", "role_id", "resource_id", "action", "created_at")
SELECT gen_random_uuid()::text, r."id", res."id", 'EDIT'::"PermissionAction", now()
FROM "roles" r
JOIN "resources" res ON res."key" = 'expense_approval'
WHERE r."mamcos_id" IS NOT NULL AND r."name" IN ('Manager', 'Cooperative Admin')
ON CONFLICT ("role_id", "resource_id", "action") DO NOTHING;
