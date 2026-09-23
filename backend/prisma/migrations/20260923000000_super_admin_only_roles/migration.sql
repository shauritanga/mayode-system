-- Keep historical UserRole values as operational profile discriminators only.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'CUSTOM';

-- Remove the old built-in roles. ON DELETE SET NULL preserves their users;
-- those users need a Super Admin-assigned custom role before their next request.
DELETE FROM "roles" WHERE "is_system" = true
  AND ("system_role" IS NULL OR "system_role" <> 'SUPER_ADMIN');

-- Ensure a fresh database also has the sole built-in role.
INSERT INTO "roles" ("id", "name", "is_system", "system_role", "is_active", "created_at", "updated_at")
VALUES (gen_random_uuid()::text, 'Super Admin', true, 'SUPER_ADMIN', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO UPDATE SET "is_system" = true, "system_role" = 'SUPER_ADMIN', "is_active" = true;

ALTER TABLE "roles" ADD CONSTRAINT "only_super_admin_is_system"
CHECK (NOT "is_system" OR ("system_role" IS NOT NULL AND "system_role" = 'SUPER_ADMIN'));
ALTER TABLE "roles" ADD CONSTRAINT "custom_roles_cannot_be_super_admin"
CHECK ("is_system" OR "system_role" IS NULL OR "system_role" <> 'SUPER_ADMIN');

-- New resource defaults are migrated directly; no full data seed is required.
INSERT INTO "resources" ("id", "key", "label", "created_at")
VALUES (gen_random_uuid()::text, 'workspace', 'Operational Workspace', CURRENT_TIMESTAMP),
       (gen_random_uuid()::text, 'farm_alerts', 'Farm Alerts', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
