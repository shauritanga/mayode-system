-- CreateEnum
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'POSTED');

-- CreateEnum
CREATE TYPE "PayrollPayMethod" AS ENUM ('CASH', 'MOBILE_MONEY', 'BANK');

-- CreateTable
CREATE TABLE "payroll_payees" (
    "id" TEXT NOT NULL,
    "mamcos_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "monthly_salary" DECIMAL(14,2) NOT NULL,
    "start_date" DATE NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_payees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" TEXT NOT NULL,
    "mamcos_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "total_gross" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_deductions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_net" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pay_method" "PayrollPayMethod",
    "paid_on" DATE,
    "note" TEXT,
    "created_by_id" TEXT,
    "posted_by_id" TEXT,
    "posted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_lines" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "payee_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "gross" DECIMAL(14,2) NOT NULL,
    "deductions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "deduction_note" TEXT,
    "net" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "payroll_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payroll_payees_mamcos_id_user_id_key" ON "payroll_payees"("mamcos_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_mamcos_id_period_key" ON "payroll_runs"("mamcos_id", "period");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_lines_run_id_payee_id_key" ON "payroll_lines"("run_id", "payee_id");

-- AddForeignKey
ALTER TABLE "payroll_payees" ADD CONSTRAINT "payroll_payees_mamcos_id_fkey" FOREIGN KEY ("mamcos_id") REFERENCES "mamcos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_payees" ADD CONSTRAINT "payroll_payees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_mamcos_id_fkey" FOREIGN KEY ("mamcos_id") REFERENCES "mamcos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_payee_id_fkey" FOREIGN KEY ("payee_id") REFERENCES "payroll_payees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Money rules the application also checks, enforced in the database as well.
ALTER TABLE "payroll_payees" ADD CONSTRAINT "payroll_payees_salary_nonneg" CHECK ("monthly_salary" >= 0);
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_period_format" CHECK ("period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_posted_has_method" CHECK ("status" = 'DRAFT' OR ("pay_method" IS NOT NULL AND "paid_on" IS NOT NULL AND "posted_at" IS NOT NULL));
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_amounts" CHECK ("gross" >= 0 AND "deductions" >= 0 AND "deductions" <= "gross" AND "net" = "gross" - "deductions");

-- A posted run is final: its lines and totals cannot change or be removed.
CREATE OR REPLACE FUNCTION payroll_posted_lock() RETURNS trigger AS $$
BEGIN
  IF TG_TABLE_NAME = 'payroll_runs' THEN
    IF OLD."status" = 'POSTED' THEN RAISE EXCEPTION 'A posted pay run cannot be changed'; END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF EXISTS (SELECT 1 FROM "payroll_runs" r WHERE r."id" = OLD."run_id" AND r."status" = 'POSTED') THEN
    RAISE EXCEPTION 'A posted pay run cannot be changed';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER payroll_runs_posted_lock BEFORE UPDATE OR DELETE ON "payroll_runs" FOR EACH ROW EXECUTE FUNCTION payroll_posted_lock();
CREATE TRIGGER payroll_lines_posted_lock BEFORE UPDATE OR DELETE ON "payroll_lines" FOR EACH ROW EXECUTE FUNCTION payroll_posted_lock();

-- Permission resource, granted to every existing Cooperative Admin role (same reasoning as 20261107100000).
INSERT INTO "resources" ("id", "key", "label") VALUES (gen_random_uuid()::text, 'payroll', 'Payroll (salaries & pay runs)') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "role_permissions" ("id", "role_id", "resource_id", "action", "created_at")
SELECT gen_random_uuid()::text, r."id", res."id", a."action"::"PermissionAction", now()
FROM "roles" r
CROSS JOIN "resources" res
CROSS JOIN (VALUES ('VIEW'), ('CREATE'), ('EDIT'), ('DELETE')) AS a("action")
WHERE r."name" = 'Cooperative Admin' AND r."mamcos_id" IS NOT NULL AND res."key" = 'payroll'
ON CONFLICT ("role_id", "resource_id", "action") DO NOTHING;
