-- CreateEnum
CREATE TYPE "CommunicationChannel" AS ENUM ('SMS', 'EMAIL', 'BOTH');
-- CreateEnum
CREATE TYPE "CommunicationAudience" AS ENUM ('ALL', 'SELECTED');
-- CreateEnum
CREATE TYPE "CommunicationStatus" AS ENUM ('SENDING', 'COMPLETED', 'INTERRUPTED');
-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('SMS', 'EMAIL');
-- CreateEnum
CREATE TYPE "MessageDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'SIMULATED', 'FAILED', 'SKIPPED');
-- CreateTable
CREATE TABLE "communications" (
    "id" TEXT NOT NULL,
    "mamcos_id" TEXT NOT NULL,
    "channel" "CommunicationChannel" NOT NULL,
    "audience" "CommunicationAudience" NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" "CommunicationStatus" NOT NULL DEFAULT 'SENDING',
    "total_recipients" INTEGER NOT NULL DEFAULT 0,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "simulated_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "sent_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    CONSTRAINT "communications_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "communication_recipients" (
    "id" TEXT NOT NULL,
    "communication_id" TEXT NOT NULL,
    "farmer_id" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "address" TEXT,
    "status" "MessageDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "sent_at" TIMESTAMP(3),
    CONSTRAINT "communication_recipients_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "communications_mamcos_id_created_at_idx" ON "communications"("mamcos_id", "created_at");
-- CreateIndex
CREATE INDEX "communication_recipients_communication_id_status_idx" ON "communication_recipients"("communication_id", "status");
-- CreateIndex
CREATE INDEX "communication_recipients_farmer_id_idx" ON "communication_recipients"("farmer_id");
-- AddForeignKey
ALTER TABLE "communications" ADD CONSTRAINT "communications_mamcos_id_fkey" FOREIGN KEY ("mamcos_id") REFERENCES "mamcos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "communication_recipients" ADD CONSTRAINT "communication_recipients_communication_id_fkey" FOREIGN KEY ("communication_id") REFERENCES "communications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "communication_recipients" ADD CONSTRAINT "communication_recipients_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One result row per farmer and channel for a message.
CREATE UNIQUE INDEX "communication_recipients_unique_per_channel" ON "communication_recipients" ("communication_id", "farmer_id", "channel");

-- Permission resource, granted to every existing Cooperative Admin role (they are built to hold every grantable permission).
INSERT INTO "resources" ("id", "key", "label") VALUES (gen_random_uuid()::text, 'communication', 'Communication with Farmers') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "role_permissions" ("id", "role_id", "resource_id", "action", "created_at")
SELECT gen_random_uuid()::text, r."id", res."id", a."action"::"PermissionAction", now()
FROM "roles" r
CROSS JOIN "resources" res
CROSS JOIN (VALUES ('VIEW'), ('CREATE'), ('EDIT'), ('DELETE')) AS a("action")
WHERE r."name" = 'Cooperative Admin' AND r."mamcos_id" IS NOT NULL AND res."key" = 'communication'
ON CONFLICT ("role_id", "resource_id", "action") DO NOTHING;
