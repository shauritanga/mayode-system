-- AMCOS board: farmers (members) who sit on the board, with a position and a term.
CREATE TYPE "BoardPosition" AS ENUM ('CHAIRPERSON', 'VICE_CHAIRPERSON', 'SECRETARY', 'TREASURER', 'MEMBER');
CREATE TYPE "BoardMemberStatus" AS ENUM ('ACTIVE', 'ENDED');

CREATE TABLE "board_members" (
  "id" TEXT NOT NULL,
  "mamcos_id" TEXT NOT NULL,
  "farmer_id" TEXT NOT NULL,
  "position" "BoardPosition" NOT NULL DEFAULT 'MEMBER',
  "term_start" DATE NOT NULL,
  "term_end" DATE,
  "status" "BoardMemberStatus" NOT NULL DEFAULT 'ACTIVE',
  "notes" TEXT,
  "ended_on" DATE,
  "end_reason" TEXT,
  "created_by_id" TEXT,
  "ended_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "board_members_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "board_members_term_order" CHECK ("term_end" IS NULL OR "term_end" >= "term_start"),
  CONSTRAINT "board_members_mamcos_fkey" FOREIGN KEY ("mamcos_id") REFERENCES "mamcos"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "board_members_farmer_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "board_members_mamcos_id_status_idx" ON "board_members" ("mamcos_id", "status");
CREATE INDEX "board_members_farmer_id_idx" ON "board_members" ("farmer_id");
-- A farmer sits on the board once at a time; the officer posts (everything except plain member) have one holder.
CREATE UNIQUE INDEX "board_members_one_active_per_farmer" ON "board_members" ("mamcos_id", "farmer_id") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "board_members_one_active_per_post" ON "board_members" ("mamcos_id", "position") WHERE "status" = 'ACTIVE' AND "position" <> 'MEMBER';

INSERT INTO "resources" ("id", "key", "label") VALUES (gen_random_uuid()::text, 'board_members', 'Board Members') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "role_permissions" ("id", "role_id", "resource_id", "action", "created_at")
SELECT gen_random_uuid()::text, r."id", res."id", a."action"::"PermissionAction", now()
FROM "roles" r
CROSS JOIN "resources" res
CROSS JOIN (VALUES ('VIEW'), ('CREATE'), ('EDIT'), ('DELETE')) AS a("action")
WHERE r."name" = 'Cooperative Admin' AND r."mamcos_id" IS NOT NULL AND res."key" = 'board_members'
ON CONFLICT ("role_id", "resource_id", "action") DO NOTHING;
