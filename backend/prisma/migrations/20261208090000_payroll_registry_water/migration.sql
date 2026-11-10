-- Payroll: personnel registry (workers without a login), wage types, attendance and output, cost centers and budgets, tiers,
-- compliance-linked stipends, a two-person approval flow; and the water schedule and log the stipends are checked against.
CREATE TYPE "PayrollTier" AS ENUM ('CORE_ADMIN', 'FIELD_LEADERSHIP', 'SUPPORT');
CREATE TYPE "WageType" AS ENUM ('MONTHLY', 'DAILY', 'PIECE');
CREATE TYPE "CostCenter" AS ENUM ('ADMIN_OVERHEAD', 'FACILITY_MAINTENANCE', 'SECURITY', 'IRRIGATION_OPS', 'WAREHOUSE_OPS');
CREATE TYPE "ComplianceKind" AS ENUM ('NONE', 'WATER_LOG', 'CHAIRMAN_LOG');
ALTER TYPE "PayrollRunStatus" ADD VALUE IF NOT EXISTS 'SUBMITTED';
ALTER TYPE "PayrollRunStatus" ADD VALUE IF NOT EXISTS 'APPROVED';

CREATE TABLE "payroll_job_titles" (
  "id" TEXT NOT NULL,
  "mamcos_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "tier" "PayrollTier" NOT NULL,
  "cost_center" "CostCenter" NOT NULL,
  "wage_type" "WageType" NOT NULL,
  "compliance" "ComplianceKind" NOT NULL DEFAULT 'NONE',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_job_titles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_job_titles_mamcos_fkey" FOREIGN KEY ("mamcos_id") REFERENCES "mamcos"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "payroll_job_titles_mamcos_id_name_key" ON "payroll_job_titles" ("mamcos_id", "name");

-- Payees: a worker need not have a login.
ALTER TABLE "payroll_payees" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "payroll_payees"
  ADD COLUMN "worker_code" TEXT,
  ADD COLUMN "full_name" TEXT,
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "id_type" TEXT,
  ADD COLUMN "id_number" TEXT,
  ADD COLUMN "payout_method" TEXT,
  ADD COLUMN "payout_account" TEXT,
  ADD COLUMN "payout_name" TEXT,
  ADD COLUMN "title_id" TEXT,
  ADD COLUMN "tier" "PayrollTier" NOT NULL DEFAULT 'CORE_ADMIN',
  ADD COLUMN "cost_center" "CostCenter" NOT NULL DEFAULT 'ADMIN_OVERHEAD',
  ADD COLUMN "wage_type" "WageType" NOT NULL DEFAULT 'MONTHLY',
  ADD COLUMN "compliance" "ComplianceKind" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "rate" DECIMAL(14,2),
  ADD COLUMN "piece_unit" TEXT,
  ADD COLUMN "contract_end" DATE,
  ADD COLUMN "verified_by_id" TEXT,
  ADD COLUMN "verified_at" TIMESTAMP(3);
-- People already on the payroll: phone from their login, a worker ID in order, leaders in the field-leadership tier, already verified.
UPDATE "payroll_payees" p SET "phone" = u."phone" FROM "users" u WHERE u."id" = p."user_id";
WITH n AS (SELECT "id", row_number() OVER (PARTITION BY "mamcos_id" ORDER BY "created_at", "id") AS rn FROM "payroll_payees")
UPDATE "payroll_payees" p SET "worker_code" = 'WK-' || lpad(n.rn::text, 4, '0') FROM n WHERE n."id" = p."id";
UPDATE "payroll_payees" SET "tier" = 'FIELD_LEADERSHIP', "cost_center" = 'IRRIGATION_OPS', "compliance" = 'CHAIRMAN_LOG' WHERE "title" ILIKE '%leader%' OR "title" ILIKE '%chairman%';
UPDATE "payroll_payees" SET "verified_at" = "created_at";
ALTER TABLE "payroll_payees" ALTER COLUMN "worker_code" SET NOT NULL;
CREATE UNIQUE INDEX "payroll_payees_mamcos_id_worker_code_key" ON "payroll_payees" ("mamcos_id", "worker_code");
CREATE UNIQUE INDEX "payroll_payees_mamcos_id_phone_key" ON "payroll_payees" ("mamcos_id", "phone");

-- A run is only required to have a payment method and date once it is posted (not while it is submitted or approved).
ALTER TABLE "payroll_runs" DROP CONSTRAINT "payroll_runs_posted_has_method";
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_posted_has_method" CHECK ("status" IN ('DRAFT', 'SUBMITTED', 'APPROVED') OR ("pay_method" IS NOT NULL AND "paid_on" IS NOT NULL AND "posted_at" IS NOT NULL));

ALTER TABLE "payroll_runs"
  ADD COLUMN "submitted_by_id" TEXT, ADD COLUMN "submitted_at" TIMESTAMP(3),
  ADD COLUMN "approved_by_id" TEXT, ADD COLUMN "approved_at" TIMESTAMP(3), ADD COLUMN "approve_note" TEXT,
  ADD COLUMN "approved_cash_account_id" TEXT;

ALTER TABLE "payroll_lines"
  ADD COLUMN "tier" "PayrollTier" NOT NULL DEFAULT 'CORE_ADMIN',
  ADD COLUMN "cost_center" "CostCenter" NOT NULL DEFAULT 'ADMIN_OVERHEAD',
  ADD COLUMN "wage_type" "WageType" NOT NULL DEFAULT 'MONTHLY',
  ADD COLUMN "units" DECIMAL(12,2),
  ADD COLUMN "rate" DECIMAL(14,2),
  ADD COLUMN "basis" TEXT,
  ADD COLUMN "compliance_factor" DECIMAL(5,4);
-- Lines of runs that are already paid sit behind a lock; it is lifted only for this one backfill and put straight back.
ALTER TABLE "payroll_lines" DISABLE TRIGGER "payroll_lines_posted_lock";
UPDATE "payroll_lines" l SET "tier" = p."tier", "cost_center" = p."cost_center" FROM "payroll_payees" p WHERE p."id" = l."payee_id";
ALTER TABLE "payroll_lines" ENABLE TRIGGER "payroll_lines_posted_lock";

CREATE TABLE "payroll_attendance" (
  "id" TEXT NOT NULL,
  "mamcos_id" TEXT NOT NULL,
  "payee_id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "fraction" DECIMAL(3,2) NOT NULL DEFAULT 1,
  "note" TEXT,
  "recorded_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_attendance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_attendance_fraction" CHECK ("fraction" IN (0.5, 1)),
  CONSTRAINT "payroll_attendance_payee_fkey" FOREIGN KEY ("payee_id") REFERENCES "payroll_payees"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "payroll_attendance_payee_id_date_key" ON "payroll_attendance" ("payee_id", "date");
CREATE INDEX "payroll_attendance_mamcos_id_date_idx" ON "payroll_attendance" ("mamcos_id", "date");

CREATE TABLE "payroll_outputs" (
  "id" TEXT NOT NULL,
  "mamcos_id" TEXT NOT NULL,
  "payee_id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "quantity" DECIMAL(12,2) NOT NULL,
  "note" TEXT,
  "recorded_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_outputs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_outputs_quantity" CHECK ("quantity" > 0),
  CONSTRAINT "payroll_outputs_payee_fkey" FOREIGN KEY ("payee_id") REFERENCES "payroll_payees"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "payroll_outputs_payee_id_date_idx" ON "payroll_outputs" ("payee_id", "date");
CREATE INDEX "payroll_outputs_mamcos_id_date_idx" ON "payroll_outputs" ("mamcos_id", "date");

CREATE TABLE "payroll_budgets" (
  "mamcos_id" TEXT NOT NULL,
  "cost_center" "CostCenter" NOT NULL,
  "monthly_limit" DECIMAL(14,2) NOT NULL,
  "updated_by_id" TEXT,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_budgets_pkey" PRIMARY KEY ("mamcos_id", "cost_center"),
  CONSTRAINT "payroll_budgets_limit" CHECK ("monthly_limit" >= 0)
);

CREATE TABLE "water_schedules" (
  "id" TEXT NOT NULL,
  "mamcos_id" TEXT NOT NULL,
  "canal_id" TEXT NOT NULL,
  "block_id" TEXT,
  "weekdays" INTEGER[],
  "starts_on" DATE NOT NULL,
  "ends_on" DATE,
  "gate_opener_payee_id" TEXT,
  "note" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "water_schedules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "water_schedules_canal_fkey" FOREIGN KEY ("canal_id") REFERENCES "irrigation_canals"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "water_schedules_mamcos_id_canal_id_idx" ON "water_schedules" ("mamcos_id", "canal_id");

CREATE TABLE "water_logs" (
  "id" TEXT NOT NULL,
  "mamcos_id" TEXT NOT NULL,
  "canal_id" TEXT NOT NULL,
  "block_id" TEXT,
  "date" DATE NOT NULL,
  "opened_at" TIMESTAMP(3),
  "closed_at" TIMESTAMP(3),
  "gate_opener_payee_id" TEXT,
  "logged_by_id" TEXT NOT NULL,
  "schedule_id" TEXT,
  "note" TEXT,
  "issue_type" TEXT,
  "issue_note" TEXT,
  "issue_status" TEXT,
  "resolved_by_id" TEXT,
  "resolved_at" TIMESTAMP(3),
  "resolution" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "water_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "water_logs_canal_fkey" FOREIGN KEY ("canal_id") REFERENCES "irrigation_canals"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "water_logs_mamcos_id_date_idx" ON "water_logs" ("mamcos_id", "date");
CREATE INDEX "water_logs_canal_id_date_idx" ON "water_logs" ("canal_id", "date");
CREATE INDEX "water_logs_gate_opener_payee_id_date_idx" ON "water_logs" ("gate_opener_payee_id", "date");

-- Permissions
INSERT INTO "resources" ("id", "key", "label") VALUES
  (gen_random_uuid()::text, 'payroll_approval', 'Payroll Approval and Budgets'),
  (gen_random_uuid()::text, 'payroll_attendance', 'Staff Attendance and Output'),
  (gen_random_uuid()::text, 'water', 'Water Log'),
  (gen_random_uuid()::text, 'water_schedules', 'Water Schedules')
ON CONFLICT ("key") DO NOTHING;
INSERT INTO "role_permissions" ("id", "role_id", "resource_id", "action", "created_at")
SELECT gen_random_uuid()::text, r."id", res."id", g."action"::"PermissionAction", now()
FROM "roles" r
JOIN (VALUES
  ('Manager', 'payroll_approval', 'EDIT'), ('Manager', 'water', 'VIEW'), ('Manager', 'water_schedules', 'VIEW'),
  ('Accountant', 'payroll_attendance', 'VIEW'), ('Accountant', 'water', 'VIEW'), ('Accountant', 'water_schedules', 'VIEW'),
  ('Procurement Officer', 'payroll_attendance', 'VIEW'), ('Procurement Officer', 'payroll_attendance', 'CREATE'), ('Procurement Officer', 'payroll_attendance', 'EDIT'),
  ('Block Leader', 'payroll_attendance', 'VIEW'), ('Block Leader', 'payroll_attendance', 'CREATE'), ('Block Leader', 'payroll_attendance', 'EDIT'),
  ('Block Leader', 'water', 'VIEW'), ('Block Leader', 'water', 'CREATE'), ('Block Leader', 'water', 'EDIT'), ('Block Leader', 'water_schedules', 'VIEW'),
  ('Canal Leader', 'payroll_attendance', 'VIEW'), ('Canal Leader', 'payroll_attendance', 'CREATE'), ('Canal Leader', 'payroll_attendance', 'EDIT'),
  ('Canal Leader', 'water', 'VIEW'), ('Canal Leader', 'water', 'CREATE'), ('Canal Leader', 'water', 'EDIT'), ('Canal Leader', 'water_schedules', 'VIEW'),
  ('Field Officer', 'water', 'VIEW'), ('Field Officer', 'water', 'CREATE'),
  ('Cooperative Admin', 'payroll_approval', 'EDIT'), ('Cooperative Admin', 'payroll_attendance', 'VIEW'), ('Cooperative Admin', 'payroll_attendance', 'CREATE'), ('Cooperative Admin', 'payroll_attendance', 'EDIT'),
  ('Cooperative Admin', 'water', 'VIEW'), ('Cooperative Admin', 'water', 'CREATE'), ('Cooperative Admin', 'water', 'EDIT'),
  ('Cooperative Admin', 'water_schedules', 'VIEW'), ('Cooperative Admin', 'water_schedules', 'CREATE'), ('Cooperative Admin', 'water_schedules', 'EDIT')
) AS g("role_name", "resource_key", "action") ON r."name" = g."role_name"
JOIN "resources" res ON res."key" = g."resource_key"
WHERE r."mamcos_id" IS NOT NULL
ON CONFLICT ("role_id", "resource_id", "action") DO NOTHING;
-- The Manager and the Accountant both keep the schedules view; setting schedules is the office's (Cooperative Admin and any role granted it).
