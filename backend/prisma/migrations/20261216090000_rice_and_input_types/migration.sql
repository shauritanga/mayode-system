-- Rice types can belong to one cooperative (added in its settings); the existing ones stay platform-wide.
ALTER TABLE "rice_varieties" ADD COLUMN "mamcos_id" TEXT;
DROP INDEX IF EXISTS "rice_varieties_name_key";
CREATE UNIQUE INDEX "rice_varieties_mamcos_id_name_key" ON "rice_varieties"("mamcos_id", "name");
-- NULLs are distinct in a unique index, so platform-wide names are kept unique separately.
CREATE UNIQUE INDEX "rice_varieties_platform_name_key" ON "rice_varieties"(LOWER("name")) WHERE "mamcos_id" IS NULL;
ALTER TABLE "rice_varieties" ADD CONSTRAINT "rice_varieties_mamcos_id_fkey" FOREIGN KEY ("mamcos_id") REFERENCES "mamcos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Input categories a cooperative sets up itself.
CREATE TABLE "input_types" (
  "id" TEXT NOT NULL,
  "mamcos_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "input_types_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "input_types_mamcos_id_name_key" ON "input_types"("mamcos_id", "name");
ALTER TABLE "input_types" ADD CONSTRAINT "input_types_mamcos_id_fkey" FOREIGN KEY ("mamcos_id") REFERENCES "mamcos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "farm_input_items" ADD COLUMN "input_type_id" TEXT;
ALTER TABLE "farm_input_items" ADD CONSTRAINT "farm_input_items_input_type_id_fkey" FOREIGN KEY ("input_type_id") REFERENCES "input_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Settings access is already held by Cooperative Admin (every grantable permission); nothing to grant here.
