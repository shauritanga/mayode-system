-- Starting back-office roles for every existing AMCOS (new AMCOSes get them from the role templates). Existing roles of the same name are left alone. Safe to re-run.

INSERT INTO "roles" ("id","name","description","system_role","mamcos_id","created_at","updated_at")
SELECT gen_random_uuid()::text, t."name", t."description", 'CUSTOM', m."id", now(), now()
FROM "mamcos" m
CROSS JOIN (VALUES
  ('Cashier','Collects and records member payments and charges. Cannot change accounts, pay salaries or manage staff.'),
  ('Accountant','Keeps the books: ledger, charges, assets and the monthly payroll. Cannot manage users or roles.'),
  ('Manager','Oversees the whole AMCOS with read access to operations, finance and payroll; changes nothing.'),
  ('Procurement Officer','Buys for the AMCOS: manages suppliers and stock coming in. No payments, payroll or accounts.')
) AS t("name","description")
WHERE NOT EXISTS (SELECT 1 FROM "roles" r WHERE r."mamcos_id" = m."id" AND r."name" = t."name");

INSERT INTO "role_permissions" ("id","role_id","resource_id","action","created_at")
SELECT gen_random_uuid()::text, r."id", res."id", g."action"::"PermissionAction", now()
FROM (VALUES
  ('Cashier','workspace','VIEW'),
  ('Cashier','farmers','VIEW'),
  ('Cashier','dues','VIEW'),
  ('Cashier','dues','CREATE'),
  ('Cashier','dues','EDIT'),
  ('Cashier','accounting','VIEW'),
  ('Accountant','workspace','VIEW'),
  ('Accountant','farmers','VIEW'),
  ('Accountant','accounting','VIEW'),
  ('Accountant','accounting','CREATE'),
  ('Accountant','accounting','EDIT'),
  ('Accountant','finance','VIEW'),
  ('Accountant','finance','CREATE'),
  ('Accountant','finance','EDIT'),
  ('Accountant','dues','VIEW'),
  ('Accountant','dues','CREATE'),
  ('Accountant','dues','EDIT'),
  ('Accountant','payroll','VIEW'),
  ('Accountant','payroll','CREATE'),
  ('Accountant','payroll','EDIT'),
  ('Accountant','assets','VIEW'),
  ('Accountant','assets','EDIT'),
  ('Accountant','loans','VIEW'),
  ('Accountant','suppliers','VIEW'),
  ('Accountant','reports','VIEW'),
  ('Accountant','audit_logs','VIEW'),
  ('Manager','workspace','VIEW'),
  ('Manager','farmers','VIEW'),
  ('Manager','accounting','VIEW'),
  ('Manager','finance','VIEW'),
  ('Manager','dues','VIEW'),
  ('Manager','payroll','VIEW'),
  ('Manager','assets','VIEW'),
  ('Manager','machinery','VIEW'),
  ('Manager','irrigation','VIEW'),
  ('Manager','irrigation_allocations','VIEW'),
  ('Manager','irrigation_leadership','VIEW'),
  ('Manager','communication','VIEW'),
  ('Manager','governance','VIEW'),
  ('Manager','suppliers','VIEW'),
  ('Manager','inventory','VIEW'),
  ('Manager','warehouses','VIEW'),
  ('Manager','reports','VIEW'),
  ('Manager','audit_logs','VIEW'),
  ('Procurement Officer','workspace','VIEW'),
  ('Procurement Officer','suppliers','VIEW'),
  ('Procurement Officer','suppliers','CREATE'),
  ('Procurement Officer','suppliers','EDIT'),
  ('Procurement Officer','inventory','VIEW'),
  ('Procurement Officer','inventory','CREATE'),
  ('Procurement Officer','inventory','EDIT'),
  ('Procurement Officer','warehouses','VIEW'),
  ('Procurement Officer','assets','VIEW'),
  ('Procurement Officer','reports','VIEW')
) AS g("role_name","resource_key","action")
JOIN "roles" r ON r."name" = g."role_name" AND r."mamcos_id" IS NOT NULL
JOIN "resources" res ON res."key" = g."resource_key"
WHERE r."created_at" >= now() - interval '1 minute' OR NOT EXISTS (SELECT 1 FROM "role_permissions" rp WHERE rp."role_id" = r."id")
ON CONFLICT ("role_id","resource_id","action") DO NOTHING;
