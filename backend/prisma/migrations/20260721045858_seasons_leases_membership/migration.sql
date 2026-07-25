/*
  Warnings:

  - Made the column `name` on table `farms` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "FarmingSeasonStatus" AS ENUM ('DRAFT', 'REGISTRATION_OPEN', 'VERIFICATION_IN_PROGRESS', 'ACTIVE', 'HARVESTING', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OwnershipSource" AS ENUM ('AMCOS', 'OWNER', 'RENTER', 'MAYODE_OFFICER', 'IMPORT');

-- CreateEnum
CREATE TYPE "AssignmentType" AS ENUM ('OWNER_OPERATED', 'RENTED', 'NOT_CULTIVATED');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('PENDING', 'PAYMENT_PENDING', 'ACTIVE', 'EXPIRED', 'CANCELLED', 'SUSPENDED', 'WAIVED', 'SPONSORED');

-- CreateEnum
CREATE TYPE "MembershipDurationType" AS ENUM ('SEASON', 'ANNUAL', 'CUSTOM');

-- AlterEnum
ALTER TYPE "PaymentType" ADD VALUE 'MEMBERSHIP';

-- Backfill: farms without a name fall back to their unique farm code
UPDATE "farms" SET "name" = "farm_code" WHERE "name" IS NULL OR "name" = '';

-- AlterTable
ALTER TABLE "farms" ALTER COLUMN "name" SET NOT NULL;

-- CreateTable
CREATE TABLE "farming_seasons" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mamcos_id" TEXT,
    "region" TEXT,
    "crop" TEXT,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "registration_open_date" TIMESTAMP(3),
    "registration_close_date" TIMESTAMP(3),
    "verification_deadline" TIMESTAMP(3),
    "status" "FarmingSeasonStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "farming_seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farm_ownerships" (
    "id" TEXT NOT NULL,
    "farm_id" TEXT NOT NULL,
    "owner_farmer_id" TEXT,
    "owner_name" TEXT,
    "owner_phone" TEXT,
    "source" "OwnershipSource" NOT NULL DEFAULT 'OWNER',
    "confirmation_status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "confirmed_at" TIMESTAMP(3),
    "verified_by_user_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "farm_ownerships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farm_leases" (
    "id" TEXT NOT NULL,
    "farm_id" TEXT NOT NULL,
    "owner_farmer_id" TEXT,
    "renter_farmer_id" TEXT,
    "renter_name" TEXT,
    "renter_phone" TEXT NOT NULL,
    "farming_season_id" TEXT NOT NULL,
    "lease_start_date" TIMESTAMP(3) NOT NULL,
    "lease_end_date" TIMESTAMP(3) NOT NULL,
    "owner_confirmation_status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "renter_confirmation_status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "officer_confirmation_status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "status" "LeaseStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "farm_leases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seasonal_farm_assignments" (
    "id" TEXT NOT NULL,
    "farm_id" TEXT NOT NULL,
    "farming_season_id" TEXT NOT NULL,
    "active_farmer_id" TEXT NOT NULL,
    "lease_id" TEXT,
    "assignment_type" "AssignmentType" NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seasonal_farm_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price_tzs" DOUBLE PRECISION NOT NULL,
    "duration_type" "MembershipDurationType" NOT NULL DEFAULT 'SEASON',
    "features" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "farmer_id" TEXT,
    "plan_id" TEXT NOT NULL,
    "farming_season_id" TEXT,
    "status" "MembershipStatus" NOT NULL DEFAULT 'PAYMENT_PENDING',
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "payment_reference" TEXT,
    "amount_tzs" DOUBLE PRECISION,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "activated_at" TIMESTAMP(3),
    "approved_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "farming_seasons_name_key" ON "farming_seasons"("name");

-- CreateIndex
CREATE INDEX "farm_ownerships_farm_id_idx" ON "farm_ownerships"("farm_id");

-- CreateIndex
CREATE INDEX "farm_leases_farm_id_farming_season_id_idx" ON "farm_leases"("farm_id", "farming_season_id");

-- CreateIndex
CREATE INDEX "farm_leases_renter_phone_idx" ON "farm_leases"("renter_phone");

-- CreateIndex
CREATE UNIQUE INDEX "seasonal_farm_assignments_farm_id_farming_season_id_key" ON "seasonal_farm_assignments"("farm_id", "farming_season_id");

-- CreateIndex
CREATE UNIQUE INDEX "membership_plans_name_key" ON "membership_plans"("name");

-- CreateIndex
CREATE INDEX "memberships_user_id_status_idx" ON "memberships"("user_id", "status");

-- AddForeignKey
ALTER TABLE "farming_seasons" ADD CONSTRAINT "farming_seasons_mamcos_id_fkey" FOREIGN KEY ("mamcos_id") REFERENCES "mamcos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_ownerships" ADD CONSTRAINT "farm_ownerships_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_ownerships" ADD CONSTRAINT "farm_ownerships_owner_farmer_id_fkey" FOREIGN KEY ("owner_farmer_id") REFERENCES "farmers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_leases" ADD CONSTRAINT "farm_leases_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_leases" ADD CONSTRAINT "farm_leases_owner_farmer_id_fkey" FOREIGN KEY ("owner_farmer_id") REFERENCES "farmers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_leases" ADD CONSTRAINT "farm_leases_renter_farmer_id_fkey" FOREIGN KEY ("renter_farmer_id") REFERENCES "farmers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_leases" ADD CONSTRAINT "farm_leases_farming_season_id_fkey" FOREIGN KEY ("farming_season_id") REFERENCES "farming_seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seasonal_farm_assignments" ADD CONSTRAINT "seasonal_farm_assignments_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seasonal_farm_assignments" ADD CONSTRAINT "seasonal_farm_assignments_farming_season_id_fkey" FOREIGN KEY ("farming_season_id") REFERENCES "farming_seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seasonal_farm_assignments" ADD CONSTRAINT "seasonal_farm_assignments_active_farmer_id_fkey" FOREIGN KEY ("active_farmer_id") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seasonal_farm_assignments" ADD CONSTRAINT "seasonal_farm_assignments_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "farm_leases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "membership_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_farming_season_id_fkey" FOREIGN KEY ("farming_season_id") REFERENCES "farming_seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
