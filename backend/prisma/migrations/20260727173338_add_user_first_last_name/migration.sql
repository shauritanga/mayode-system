-- DropIndex
DROP INDEX "farm_data_values_superseded_by_id_key";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "first_name" TEXT,
ADD COLUMN     "last_name" TEXT;

-- Backfill from existing role profiles so accounts created before this
-- migration show a real name instead of falling back to phone/email.
UPDATE "users" u
SET "first_name" = f."first_name", "last_name" = f."last_name"
FROM "farmers" f
WHERE f."user_id" = u.id AND u."first_name" IS NULL;

UPDATE "users" u
SET "first_name" = fo."first_name", "last_name" = fo."last_name"
FROM "field_officers" fo
WHERE fo."user_id" = u.id AND u."first_name" IS NULL;

UPDATE "users" u
SET "first_name" = ms."first_name", "last_name" = ms."last_name"
FROM "mamcos_secretaries" ms
WHERE ms."user_id" = u.id AND u."first_name" IS NULL;
