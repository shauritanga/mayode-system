-- Plot transfers now always need a final sign-off from an AMCOS Manager or Accountant. The sign-off is its own permission.
INSERT INTO "resources" ("id", "key", "label")
VALUES (gen_random_uuid()::text, 'irrigation_transfer_approval', 'Irrigation Transfer Final Approval')
ON CONFLICT ("key") DO NOTHING;

-- Give it to the existing Manager, Accountant and Cooperative Admin roles. Safe to re-run.
INSERT INTO "role_permissions" ("id", "role_id", "resource_id", "action", "created_at")
SELECT gen_random_uuid()::text, r."id", res."id", 'EDIT'::"PermissionAction", now()
FROM "roles" r
CROSS JOIN "resources" res
WHERE r."name" IN ('Manager', 'Accountant', 'Cooperative Admin')
  AND res."key" = 'irrigation_transfer_approval'
ON CONFLICT ("role_id", "resource_id", "action") DO NOTHING;
