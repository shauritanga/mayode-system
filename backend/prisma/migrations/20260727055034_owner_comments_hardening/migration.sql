-- CreateEnum
CREATE TYPE "OfficerVerificationMethod" AS ENUM ('PHONE_CALL', 'IN_PERSON', 'VIDEO_CALL', 'DOCUMENT_REVIEW', 'BLOCK_LEADER', 'CANAL_LEADER', 'COOPERATIVE_LEADER', 'NEIGHBOR');

-- CreateEnum
CREATE TYPE "ConfirmationChannel" AS ENUM ('SMS', 'USSD', 'APP', 'OFFICER');

-- CreateEnum
CREATE TYPE "ConfirmationRequestStatus" AS ENUM ('SENT', 'CONFIRMED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SuggestedUpdateStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'MERGED');

-- CreateEnum
CREATE TYPE "DisputeType" AS ENUM ('OWNER_REJECTS_RENTER', 'DUPLICATE_RENTER_CLAIM', 'COOPERATIVE_OWNER_CONFLICT', 'UNKNOWN_OWNER', 'INCORRECT_PLOT_NUMBER', 'BOUNDARY_OVERLAP', 'NEIGHBOR_CONFLICT', 'PREVIOUS_RENTER_CLAIM', 'OWNERSHIP_TRANSFER_DISPUTE', 'OTHER');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'FIELD_VERIFICATION_REQUIRED', 'RESOLVED', 'REJECTED', 'ESCALATED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "VerificationStatus" ADD VALUE 'NEEDS_MORE_INFO';
ALTER TYPE "VerificationStatus" ADD VALUE 'DISPUTED';

-- AlterTable
ALTER TABLE "farm_leases" ADD COLUMN     "agreement_document_url" TEXT,
ADD COLUMN     "officer_contacted_name" TEXT,
ADD COLUMN     "officer_contacted_phone" TEXT,
ADD COLUMN     "officer_decided_at" TIMESTAMP(3),
ADD COLUMN     "officer_decided_by_user_id" TEXT,
ADD COLUMN     "officer_evidence_urls" TEXT[],
ADD COLUMN     "officer_verification_method" "OfficerVerificationMethod";

-- CreateTable
CREATE TABLE "owner_confirmation_requests" (
    "id" TEXT NOT NULL,
    "farm_id" TEXT,
    "registry_record_id" TEXT,
    "phone" TEXT NOT NULL,
    "channel" "ConfirmationChannel" NOT NULL DEFAULT 'SMS',
    "message" TEXT NOT NULL,
    "status" "ConfirmationRequestStatus" NOT NULL DEFAULT 'SENT',
    "response" TEXT,
    "resend_count" INTEGER NOT NULL DEFAULT 0,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_confirmation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suggested_farm_updates" (
    "id" TEXT NOT NULL,
    "farm_id" TEXT NOT NULL,
    "submitted_by_user_id" TEXT,
    "field_name" TEXT NOT NULL,
    "current_value" TEXT,
    "suggested_value" TEXT NOT NULL,
    "evidence_urls" TEXT[],
    "review_status" "SuggestedUpdateStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by_user_id" TEXT,
    "review_notes" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suggested_farm_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farm_data_values" (
    "id" TEXT NOT NULL,
    "farm_id" TEXT NOT NULL,
    "field_name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "source_type" "FarmDataSource" NOT NULL,
    "source_id" TEXT,
    "confidence_level" INTEGER,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "has_conflict" BOOLEAN NOT NULL DEFAULT false,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_at" TIMESTAMP(3),
    "superseded_by_id" TEXT,

    CONSTRAINT "farm_data_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" TEXT NOT NULL,
    "farm_id" TEXT,
    "lease_id" TEXT,
    "farming_season_id" TEXT,
    "type" "DisputeType" NOT NULL,
    "description" TEXT NOT NULL,
    "claimant_ids" TEXT[],
    "evidence_urls" TEXT[],
    "raised_by_user_id" TEXT,
    "assigned_officer_id" TEXT,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolved_by_user_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "owner_confirmation_requests_phone_status_idx" ON "owner_confirmation_requests"("phone", "status");

-- CreateIndex
CREATE INDEX "owner_confirmation_requests_farm_id_idx" ON "owner_confirmation_requests"("farm_id");

-- CreateIndex
CREATE INDEX "owner_confirmation_requests_registry_record_id_idx" ON "owner_confirmation_requests"("registry_record_id");

-- CreateIndex
CREATE INDEX "suggested_farm_updates_farm_id_review_status_idx" ON "suggested_farm_updates"("farm_id", "review_status");

-- CreateIndex
CREATE UNIQUE INDEX "farm_data_values_superseded_by_id_key" ON "farm_data_values"("superseded_by_id");

-- CreateIndex
CREATE INDEX "farm_data_values_farm_id_field_name_idx" ON "farm_data_values"("farm_id", "field_name");

-- CreateIndex
CREATE INDEX "disputes_farm_id_status_idx" ON "disputes"("farm_id", "status");

-- AddForeignKey
ALTER TABLE "owner_confirmation_requests" ADD CONSTRAINT "owner_confirmation_requests_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_confirmation_requests" ADD CONSTRAINT "owner_confirmation_requests_registry_record_id_fkey" FOREIGN KEY ("registry_record_id") REFERENCES "farm_registry_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suggested_farm_updates" ADD CONSTRAINT "suggested_farm_updates_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_data_values" ADD CONSTRAINT "farm_data_values_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_data_values" ADD CONSTRAINT "farm_data_values_superseded_by_id_fkey" FOREIGN KEY ("superseded_by_id") REFERENCES "farm_data_values"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "farm_leases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_farming_season_id_fkey" FOREIGN KEY ("farming_season_id") REFERENCES "farming_seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
