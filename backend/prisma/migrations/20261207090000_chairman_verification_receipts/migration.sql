-- Block / canal chairman verification of a new allocation, and the view permissions the permissions matrix asks for.
ALTER TABLE "irrigation_schemes" ADD COLUMN "require_chairman_verification" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "irrigation_hectare_allocations"
  ADD COLUMN "awaiting_chairman" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "chairman_verified_by_id" TEXT,
  ADD COLUMN "chairman_verified_at" TIMESTAMP(3),
  ADD COLUMN "chairman_note" TEXT;

-- Field Officer: sees payment status (view only) and registers plots on the structured Canal / Block / Plot screens.
-- Accountant and Manager: see the overdue-debt farms and the M-LAX rental records (view only).
INSERT INTO "role_permissions" ("id", "role_id", "resource_id", "action", "created_at")
SELECT gen_random_uuid()::text, r."id", res."id", g."action"::"PermissionAction", now()
FROM "roles" r
JOIN (VALUES
  ('Field Officer', 'dues', 'VIEW'),
  ('Field Officer', 'irrigation', 'VIEW'),
  ('Field Officer', 'irrigation_allocations', 'VIEW'), ('Field Officer', 'irrigation_allocations', 'CREATE'),
  ('Accountant', 'farm_administration', 'VIEW'), ('Accountant', 'farm_leases', 'VIEW'),
  ('Manager', 'farm_administration', 'VIEW'), ('Manager', 'farm_leases', 'VIEW')
) AS g("role_name", "resource_key", "action") ON r."name" = g."role_name"
JOIN "resources" res ON res."key" = g."resource_key"
WHERE r."mamcos_id" IS NOT NULL
ON CONFLICT ("role_id", "resource_id", "action") DO NOTHING;

-- The chairmen's right to confirm a farmer registered in their block.
INSERT INTO "resources" ("id", "key", "label") VALUES (gen_random_uuid()::text, 'irrigation_verification', 'Chairman Verification of Cultivators') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "role_permissions" ("id", "role_id", "resource_id", "action", "created_at")
SELECT gen_random_uuid()::text, r."id", res."id", g."action"::"PermissionAction", now()
FROM "roles" r
JOIN (VALUES
  ('Block Leader', 'VIEW'), ('Block Leader', 'EDIT'), ('Canal Leader', 'VIEW'), ('Canal Leader', 'EDIT'),
  ('Cooperative Admin', 'VIEW'), ('Cooperative Admin', 'EDIT')
) AS g("role_name", "action") ON r."name" = g."role_name"
JOIN "resources" res ON res."key" = 'irrigation_verification'
WHERE r."mamcos_id" IS NOT NULL
ON CONFLICT ("role_id", "resource_id", "action") DO NOTHING;
