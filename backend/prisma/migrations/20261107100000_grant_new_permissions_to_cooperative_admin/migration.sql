-- A "Cooperative Admin" role is built to hold every grantable permission, but it only receives the permissions that existed
-- when the AMCOS administrator was created, and an administrator cannot grant themselves what they do not hold. Give every
-- existing Cooperative Admin role the irrigation and machinery permissions added since. Safe to re-run.
INSERT INTO "role_permissions" ("id", "role_id", "resource_id", "action", "created_at")
SELECT gen_random_uuid()::text, r."id", res."id", a."action"::"PermissionAction", now()
FROM "roles" r
CROSS JOIN "resources" res
CROSS JOIN (VALUES ('VIEW'), ('CREATE'), ('EDIT'), ('DELETE')) AS a("action")
WHERE r."name" = 'Cooperative Admin'
  AND r."mamcos_id" IS NOT NULL
  AND res."key" IN ('irrigation', 'irrigation_allocations', 'irrigation_leadership', 'machinery')
ON CONFLICT ("role_id", "resource_id", "action") DO NOTHING;
