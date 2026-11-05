ALTER TABLE "communications"
  ADD COLUMN "canal_id" TEXT,
  ADD COLUMN "block_id" TEXT,
  ADD COLUMN "audience_label" TEXT;

ALTER TABLE "communication_recipients"
  ALTER COLUMN "farmer_id" DROP NOT NULL,
  ADD COLUMN "user_id" TEXT,
  ADD COLUMN "recipient_name" TEXT,
  ADD COLUMN "recipient_kind" TEXT NOT NULL DEFAULT 'FARMER';

-- Existing rows are all farmers: keep a readable name on the record.
UPDATE "communication_recipients" r SET "recipient_name" = trim(f."first_name" || ' ' || f."last_name")
  FROM "farmers" f WHERE f."id" = r."farmer_id";

ALTER TABLE "communication_recipients"
  ADD CONSTRAINT "communication_recipients_has_person" CHECK ("farmer_id" IS NOT NULL OR "user_id" IS NOT NULL);

CREATE UNIQUE INDEX "communication_recipients_unique_user_per_channel"
  ON "communication_recipients" ("communication_id", "user_id", "channel") WHERE "user_id" IS NOT NULL;
