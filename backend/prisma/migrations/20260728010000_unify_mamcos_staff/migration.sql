-- Unify FieldOfficer + MamcosSecretary into a single MamcosStaff table.
-- Data-preserving: ids are carried over unchanged so the four existing FK
-- columns (farm_verifications, farmer_verifications, activity_logs,
-- field_officer_visits) can simply be retargeted at the new table instead
-- of needing a value remap. Old tables are renamed, not dropped, as a
-- rollback safety net — drop them in a later follow-up migration once this
-- has run cleanly in production for a while.

-- CreateEnum
CREATE TYPE "MamcosStaffRole" AS ENUM ('SECRETARY', 'FIELD_OFFICER');

-- CreateTable
CREATE TABLE "mamcos_staff" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "mamcos_id" TEXT,
    "role" "MamcosStaffRole" NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "employee_code" TEXT,
    "assigned_area" TEXT,
    "stability_bonus" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mamcos_staff_pkey" PRIMARY KEY ("id")
);

-- Backfill, preserving ids
INSERT INTO "mamcos_staff" (id, user_id, mamcos_id, role, first_name, last_name, employee_code, assigned_area, stability_bonus, created_at, updated_at)
SELECT id, user_id, mamcos_id, 'FIELD_OFFICER', first_name, last_name, employee_code, assigned_area, 0, created_at, updated_at
FROM "field_officers";

INSERT INTO "mamcos_staff" (id, user_id, mamcos_id, role, first_name, last_name, employee_code, assigned_area, stability_bonus, created_at, updated_at)
SELECT id, user_id, mamcos_id, 'SECRETARY', first_name, last_name, NULL, NULL, stability_bonus, created_at, updated_at
FROM "mamcos_secretaries";

-- CreateIndex
CREATE UNIQUE INDEX "mamcos_staff_user_id_key" ON "mamcos_staff"("user_id");
CREATE UNIQUE INDEX "mamcos_staff_employee_code_key" ON "mamcos_staff"("employee_code");
CREATE INDEX "mamcos_staff_mamcos_id_idx" ON "mamcos_staff"("mamcos_id");

-- One SECRETARY per AMCOS (partial index — Prisma schema DSL can't express
-- this, so it isn't declared in schema.prisma, but it's still enforced here).
CREATE UNIQUE INDEX "mamcos_staff_secretary_per_mamcos" ON "mamcos_staff"("mamcos_id") WHERE "role" = 'SECRETARY';

-- AddForeignKey
ALTER TABLE "mamcos_staff" ADD CONSTRAINT "mamcos_staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mamcos_staff" ADD CONSTRAINT "mamcos_staff_mamcos_id_fkey" FOREIGN KEY ("mamcos_id") REFERENCES "mamcos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Retarget existing FKs from field_officers to mamcos_staff, restating each
-- constraint's original ON DELETE behavior exactly (it is not inherited
-- across DROP + ADD).
ALTER TABLE "farm_verifications" DROP CONSTRAINT "farm_verifications_field_officer_id_fkey";
ALTER TABLE "farm_verifications" ADD CONSTRAINT "farm_verifications_field_officer_id_fkey" FOREIGN KEY ("field_officer_id") REFERENCES "mamcos_staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "farmer_verifications" DROP CONSTRAINT "farmer_verifications_field_officer_id_fkey";
ALTER TABLE "farmer_verifications" ADD CONSTRAINT "farmer_verifications_field_officer_id_fkey" FOREIGN KEY ("field_officer_id") REFERENCES "mamcos_staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "activity_logs" DROP CONSTRAINT "activity_logs_field_officer_id_fkey";
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_field_officer_id_fkey" FOREIGN KEY ("field_officer_id") REFERENCES "mamcos_staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "field_officer_visits" DROP CONSTRAINT "field_officer_visits_field_officer_id_fkey";
ALTER TABLE "field_officer_visits" ADD CONSTRAINT "field_officer_visits_field_officer_id_fkey" FOREIGN KEY ("field_officer_id") REFERENCES "mamcos_staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rollback safety net: rename rather than drop.
ALTER TABLE "field_officers" RENAME TO "_deprecated_field_officers";
ALTER TABLE "mamcos_secretaries" RENAME TO "_deprecated_mamcos_secretaries";
