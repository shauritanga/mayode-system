-- Tier 3 registration: farmers with no national ID are vouched for locally.
ALTER TYPE "DocumentType" ADD VALUE 'VILLAGE_LETTER';
CREATE TYPE "LocalVerificationMethod" AS ENUM ('VILLAGE_LETTER', 'LOCAL_VOTER_ID', 'GUARANTOR');

CREATE TABLE "farmer_local_verifications" (
  "id" TEXT NOT NULL,
  "farmer_id" TEXT NOT NULL,
  "method" "LocalVerificationMethod" NOT NULL,
  "reference" TEXT,
  "letter_document_url" TEXT,
  "guarantor_farmer_id" TEXT,
  "guarantor_position" "IrrigationLeadershipPosition",
  "guarantor_leadership_id" TEXT,
  "notes" TEXT,
  "recorded_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMP(3),
  "revoked_by_id" TEXT,
  "revoked_reason" TEXT,
  CONSTRAINT "farmer_local_verifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "farmer_local_verifications_farmer_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "farmer_local_verifications_guarantor_fkey" FOREIGN KEY ("guarantor_farmer_id") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "farmer_local_verifications_not_self" CHECK ("guarantor_farmer_id" IS NULL OR "guarantor_farmer_id" <> "farmer_id"),
  CONSTRAINT "farmer_local_verifications_evidence" CHECK (
    ("method" = 'VILLAGE_LETTER' AND "letter_document_url" IS NOT NULL) OR
    ("method" = 'LOCAL_VOTER_ID' AND "reference" IS NOT NULL) OR
    ("method" = 'GUARANTOR' AND "guarantor_farmer_id" IS NOT NULL)
  )
);
CREATE INDEX "farmer_local_verifications_farmer_id_revoked_at_idx" ON "farmer_local_verifications" ("farmer_id", "revoked_at");
