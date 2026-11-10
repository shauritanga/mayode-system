-- Governance meetings with SMS invitations, check-in, quorum, minutes and resolutions; emancipation requests; recipient acceptance on by default.
CREATE TYPE "MeetingKind" AS ENUM ('BOARD', 'AGM');
CREATE TYPE "MeetingStatus" AS ENUM ('SCHEDULED', 'CHECK_IN', 'IN_SESSION', 'CLOSED', 'CANCELLED');
CREATE TYPE "EmancipationStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "amcos_meetings" (
  "id" TEXT NOT NULL,
  "mamcos_id" TEXT NOT NULL,
  "kind" "MeetingKind" NOT NULL,
  "title" TEXT NOT NULL,
  "agenda" TEXT NOT NULL,
  "venue" TEXT NOT NULL,
  "scheduled_at" TIMESTAMP(3) NOT NULL,
  "quorum_percent" INTEGER NOT NULL,
  "invited_count" INTEGER NOT NULL,
  "status" "MeetingStatus" NOT NULL DEFAULT 'SCHEDULED',
  "started_at" TIMESTAMP(3),
  "closed_at" TIMESTAMP(3),
  "minutes" TEXT,
  "cancel_reason" TEXT,
  "reminder_sent_at" TIMESTAMP(3),
  "created_by_id" TEXT,
  "closed_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "amcos_meetings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "amcos_meetings_quorum_range" CHECK ("quorum_percent" BETWEEN 1 AND 100),
  CONSTRAINT "amcos_meetings_mamcos_fkey" FOREIGN KEY ("mamcos_id") REFERENCES "mamcos"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "amcos_meetings_mamcos_id_scheduled_at_idx" ON "amcos_meetings" ("mamcos_id", "scheduled_at");

CREATE TABLE "meeting_attendances" (
  "id" TEXT NOT NULL,
  "meeting_id" TEXT NOT NULL,
  "farmer_id" TEXT NOT NULL,
  "checked_in_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "method" TEXT NOT NULL,
  "recorded_by_id" TEXT,
  CONSTRAINT "meeting_attendances_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "meeting_attendances_meeting_fkey" FOREIGN KEY ("meeting_id") REFERENCES "amcos_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "meeting_attendances_farmer_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "meeting_attendances_meeting_id_farmer_id_key" ON "meeting_attendances" ("meeting_id", "farmer_id");

CREATE TABLE "meeting_resolutions" (
  "id" TEXT NOT NULL,
  "meeting_id" TEXT NOT NULL,
  "number" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "outcome" TEXT NOT NULL DEFAULT 'PASSED',
  "votes_for" INTEGER,
  "votes_against" INTEGER,
  "recorded_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "meeting_resolutions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "meeting_resolutions_meeting_fkey" FOREIGN KEY ("meeting_id") REFERENCES "amcos_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "meeting_resolutions_meeting_id_number_key" ON "meeting_resolutions" ("meeting_id", "number");
-- A logged resolution is never edited or deleted.
CREATE FUNCTION "meeting_resolutions_locked"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM "amcos_meetings" WHERE "id" = OLD."meeting_id") THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'meeting_resolutions are append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "meeting_resolutions_no_change" BEFORE UPDATE OR DELETE ON "meeting_resolutions" FOR EACH ROW EXECUTE FUNCTION "meeting_resolutions_locked"();

CREATE TABLE "irrigation_emancipation_requests" (
  "id" TEXT NOT NULL,
  "allocation_id" TEXT NOT NULL,
  "hectare_id" TEXT NOT NULL,
  "holder_id" TEXT NOT NULL,
  "guardian_id" TEXT NOT NULL,
  "status" "EmancipationStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
  "note" TEXT,
  "requested_by_id" TEXT,
  "decided_by_id" TEXT,
  "decided_at" TIMESTAMP(3),
  "decision_note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "irrigation_emancipation_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "emancipation_allocation_fkey" FOREIGN KEY ("allocation_id") REFERENCES "irrigation_hectare_allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "emancipation_hectare_fkey" FOREIGN KEY ("hectare_id") REFERENCES "irrigation_hectares"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "emancipation_holder_fkey" FOREIGN KEY ("holder_id") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "emancipation_guardian_fkey" FOREIGN KEY ("guardian_id") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "irrigation_emancipation_requests_holder_id_idx" ON "irrigation_emancipation_requests" ("holder_id");
CREATE INDEX "irrigation_emancipation_requests_guardian_id_idx" ON "irrigation_emancipation_requests" ("guardian_id");
CREATE UNIQUE INDEX "emancipation_one_pending_per_allocation" ON "irrigation_emancipation_requests" ("allocation_id") WHERE "status" = 'PENDING_APPROVAL';

-- A plot transfer always needs the receiving member's answer: on for every scheme from now on.
ALTER TABLE "irrigation_schemes" ALTER COLUMN "require_recipient_acceptance" SET DEFAULT true;
UPDATE "irrigation_schemes" SET "require_recipient_acceptance" = true;

-- Meetings: the cooperative admin role gets the new permission (others can be granted it in Roles).
INSERT INTO "resources" ("id", "key", "label") VALUES (gen_random_uuid()::text, 'board_meetings', 'Board and general meetings') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "role_permissions" ("id", "role_id", "resource_id", "action", "created_at")
SELECT gen_random_uuid()::text, r."id", res."id", a."action"::"PermissionAction", now()
FROM "roles" r
CROSS JOIN "resources" res
CROSS JOIN (VALUES ('VIEW'), ('CREATE'), ('EDIT'), ('DELETE')) AS a("action")
WHERE r."name" = 'Cooperative Admin' AND r."mamcos_id" IS NOT NULL AND res."key" = 'board_meetings'
ON CONFLICT ("role_id", "resource_id", "action") DO NOTHING;
