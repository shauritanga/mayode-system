-- Cooperative-scoped roles and accounts: a cooperative admin manages the roles and
-- staff of their own AMCOS only. Platform roles/accounts keep mamcos_id NULL.
-- Additive: existing roles and users stay platform-level.

ALTER TABLE "roles" ADD COLUMN "mamcos_id" TEXT;
ALTER TABLE "users" ADD COLUMN "mamcos_id" TEXT;

-- Role names are unique per scope. Platform-level uniqueness (mamcos_id NULL is
-- not constrained by a composite index in Postgres) is enforced in RolesService.
DROP INDEX "roles_name_key";
CREATE UNIQUE INDEX "roles_mamcos_id_name_key" ON "roles"("mamcos_id", "name");
CREATE INDEX "users_mamcos_id_idx" ON "users"("mamcos_id");

ALTER TABLE "roles" ADD CONSTRAINT "roles_mamcos_id_fkey"
  FOREIGN KEY ("mamcos_id") REFERENCES "mamcos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_mamcos_id_fkey"
  FOREIGN KEY ("mamcos_id") REFERENCES "mamcos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Permission-catalog resource guarding the Roles & Permissions endpoints.
INSERT INTO "resources" ("id", "key", "label")
VALUES (gen_random_uuid()::text, 'roles', 'Roles & Permissions')
ON CONFLICT ("key") DO NOTHING;

-- Existing AMCOS staff (secretaries, field officers) already resolve their tenant through
-- mamcos_staff; mirror it onto the account so a cooperative admin can see and manage them.
UPDATE "users" u
SET "mamcos_id" = ms."mamcos_id"
FROM "mamcos_staff" ms
WHERE ms."user_id" = u."id" AND ms."mamcos_id" IS NOT NULL AND u."mamcos_id" IS NULL;
