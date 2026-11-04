-- Charges the AMCOS admin sets on the Settings page (milling, storage, delivery, late penalty).
CREATE TYPE "ChargeBasis" AS ENUM ('FLAT', 'PER_HECTARE', 'PER_KG', 'PERCENT');
CREATE TYPE "ChargeCategory" AS ENUM ('WAREHOUSE', 'PENALTY');

CREATE TABLE "amcos_charges" (
  "id" TEXT NOT NULL,
  "mamcos_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" "ChargeCategory" NOT NULL,
  "basis" "ChargeBasis" NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "grace_days" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT false,
  "updated_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "amcos_charges_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "amcos_charges_amount_check" CHECK ("amount" >= 0),
  CONSTRAINT "amcos_charges_percent_check" CHECK ("basis" <> 'PERCENT' OR "amount" <= 100),
  CONSTRAINT "amcos_charges_grace_check" CHECK ("grace_days" >= 0 AND "grace_days" <= 365)
);
CREATE UNIQUE INDEX "amcos_charges_mamcos_id_code_key" ON "amcos_charges"("mamcos_id", "code");
ALTER TABLE "amcos_charges" ADD CONSTRAINT "amcos_charges_mamcos_id_fkey" FOREIGN KEY ("mamcos_id") REFERENCES "mamcos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Permission resource, granted to every existing Cooperative Admin role (same reasoning as 20261107100000).
INSERT INTO "resources" ("id", "key", "label") VALUES (gen_random_uuid()::text, 'amcos_settings', 'AMCOS Charges & Settings') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "role_permissions" ("id", "role_id", "resource_id", "action", "created_at")
SELECT gen_random_uuid()::text, r."id", res."id", a."action"::"PermissionAction", now()
FROM "roles" r
CROSS JOIN "resources" res
CROSS JOIN (VALUES ('VIEW'), ('CREATE'), ('EDIT'), ('DELETE')) AS a("action")
WHERE r."name" = 'Cooperative Admin' AND r."mamcos_id" IS NOT NULL AND res."key" = 'amcos_settings'
ON CONFLICT ("role_id", "resource_id", "action") DO NOTHING;
