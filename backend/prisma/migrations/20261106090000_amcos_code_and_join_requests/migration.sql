-- CreateEnum
CREATE TYPE "JoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
-- AlterTable
ALTER TABLE "mamcos" ADD COLUMN     "code" TEXT;
-- CreateTable
CREATE TABLE "amcos_join_requests" (
    "id" TEXT NOT NULL,
    "farmer_id" TEXT NOT NULL,
    "mamcos_id" TEXT NOT NULL,
    "status" "JoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decided_by_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "rejected_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "amcos_join_requests_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "amcos_join_requests_mamcos_id_status_idx" ON "amcos_join_requests"("mamcos_id", "status");
-- CreateIndex
CREATE INDEX "amcos_join_requests_farmer_id_idx" ON "amcos_join_requests"("farmer_id");
-- CreateIndex
CREATE UNIQUE INDEX "mamcos_code_key" ON "mamcos"("code");
-- AddForeignKey
ALTER TABLE "amcos_join_requests" ADD CONSTRAINT "amcos_join_requests_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "amcos_join_requests" ADD CONSTRAINT "amcos_join_requests_mamcos_id_fkey" FOREIGN KEY ("mamcos_id") REFERENCES "mamcos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One pending request per farmer.
CREATE UNIQUE INDEX "amcos_join_requests_one_pending_per_farmer" ON "amcos_join_requests" ("farmer_id") WHERE "status" = 'PENDING';

-- Give every existing AMCOS a code: first three letters of its name plus six characters derived from its id.
UPDATE "mamcos"
SET "code" = upper(left(coalesce(nullif(regexp_replace("name", '[^A-Za-z]', '', 'g'), ''), 'AMC'), 3)) || '-' || upper(substr(md5("id"), 1, 6))
WHERE "code" IS NULL;
