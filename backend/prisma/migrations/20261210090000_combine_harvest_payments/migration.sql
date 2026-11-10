-- Combine harvesters, harvest payments collected by leaders, and the baskets-per-bag setting.

CREATE TYPE "HarvestCollectionStatus" AS ENUM ('PENDING', 'COLLECTED');

CREATE TABLE "combine_harvesters" (
  "id" TEXT NOT NULL,
  "mamcos_id" TEXT NOT NULL,
  "registration_number" TEXT NOT NULL,
  "make" TEXT,
  "model" TEXT,
  "owner_name" TEXT NOT NULL,
  "owner_phone" TEXT,
  "operator_name" TEXT,
  "operator_phone" TEXT,
  "note" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "combine_harvesters_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "combine_harvesters_mamcos_id_registration_number_key" ON "combine_harvesters"("mamcos_id", "registration_number");

CREATE TABLE "harvest_settings" (
  "mamcos_id" TEXT NOT NULL,
  "baskets_per_bag" DECIMAL(8,3) NOT NULL DEFAULT 2,
  "price_per_bag" DECIMAL(14,2),
  "updated_by_id" TEXT,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "harvest_settings_pkey" PRIMARY KEY ("mamcos_id"),
  CONSTRAINT "harvest_settings_baskets_positive" CHECK ("baskets_per_bag" > 0)
);

CREATE TABLE "harvest_collections" (
  "id" TEXT NOT NULL,
  "mamcos_id" TEXT NOT NULL,
  "receipt_no" TEXT NOT NULL,
  "hectare_id" TEXT NOT NULL,
  "block_id" TEXT NOT NULL,
  "farmer_id" TEXT,
  "combine_id" TEXT NOT NULL,
  "harvested_on" DATE NOT NULL,
  "quantity_kg" DECIMAL(12,2),
  "bags_counted" INTEGER NOT NULL DEFAULT 0,
  "baskets_counted" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "baskets_per_bag" DECIMAL(8,3) NOT NULL,
  "total_bags" DECIMAL(12,3) NOT NULL,
  "price_per_bag" DECIMAL(14,2),
  "amount" DECIMAL(14,2) NOT NULL,
  "status" "HarvestCollectionStatus" NOT NULL DEFAULT 'PENDING',
  "collected_at" TIMESTAMP(3),
  "collected_by_farmer_id" TEXT,
  "collected_by_name" TEXT,
  "collected_by_position" TEXT,
  "note" TEXT,
  "recorded_by_id" TEXT NOT NULL,
  "voided_at" TIMESTAMP(3),
  "void_reason" TEXT,
  "voided_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "harvest_collections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "harvest_collections_combine_fkey" FOREIGN KEY ("combine_id") REFERENCES "combine_harvesters"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "harvest_collections_amount_nonneg" CHECK ("amount" >= 0),
  CONSTRAINT "harvest_collections_counts_nonneg" CHECK ("bags_counted" >= 0 AND "baskets_counted" >= 0 AND "total_bags" >= 0),
  CONSTRAINT "harvest_collections_collected_has_collector" CHECK ("status" <> 'COLLECTED' OR ("collected_at" IS NOT NULL AND "collected_by_name" IS NOT NULL)),
  CONSTRAINT "harvest_collections_void_has_reason" CHECK ("voided_at" IS NULL OR "void_reason" IS NOT NULL)
);
CREATE UNIQUE INDEX "harvest_collections_mamcos_id_receipt_no_key" ON "harvest_collections"("mamcos_id", "receipt_no");
CREATE INDEX "harvest_collections_hectare_id_idx" ON "harvest_collections"("hectare_id");
CREATE INDEX "harvest_collections_block_id_status_idx" ON "harvest_collections"("block_id", "status");
CREATE INDEX "harvest_collections_combine_id_idx" ON "harvest_collections"("combine_id");

-- Permissions
INSERT INTO "resources" ("id", "key", "label") VALUES
  (gen_random_uuid()::text, 'combine_harvesters', 'Combine harvester register'),
  (gen_random_uuid()::text, 'harvest_collections', 'Combine harvest payments')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("id", "role_id", "resource_id", "action", "created_at")
SELECT gen_random_uuid()::text, r."id", res."id", g."action"::"PermissionAction", now()
FROM "roles" r
JOIN (VALUES
  ('Cooperative Admin', 'combine_harvesters', 'VIEW'), ('Cooperative Admin', 'combine_harvesters', 'CREATE'), ('Cooperative Admin', 'combine_harvesters', 'EDIT'),
  ('Cooperative Admin', 'harvest_collections', 'VIEW'), ('Cooperative Admin', 'harvest_collections', 'CREATE'), ('Cooperative Admin', 'harvest_collections', 'EDIT'),
  ('Manager', 'combine_harvesters', 'VIEW'), ('Manager', 'combine_harvesters', 'CREATE'), ('Manager', 'combine_harvesters', 'EDIT'), ('Manager', 'harvest_collections', 'VIEW'),
  ('Accountant', 'combine_harvesters', 'VIEW'), ('Accountant', 'harvest_collections', 'VIEW'),
  ('Canal Leader', 'combine_harvesters', 'VIEW'), ('Canal Leader', 'harvest_collections', 'VIEW'), ('Canal Leader', 'harvest_collections', 'CREATE'), ('Canal Leader', 'harvest_collections', 'EDIT'),
  ('Block Leader', 'combine_harvesters', 'VIEW'), ('Block Leader', 'harvest_collections', 'VIEW'), ('Block Leader', 'harvest_collections', 'CREATE'), ('Block Leader', 'harvest_collections', 'EDIT')
) AS g("role_name", "resource_key", "action") ON r."name" = g."role_name"
JOIN "resources" res ON res."key" = g."resource_key"
WHERE r."mamcos_id" IS NOT NULL
ON CONFLICT ("role_id", "resource_id", "action") DO NOTHING;
