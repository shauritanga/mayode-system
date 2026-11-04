-- Machine types each AMCOS keeps in its own Settings (instead of a fixed list in the code).
CREATE TABLE "amcos_equipment_types" (
  "id" TEXT NOT NULL,
  "mamcos_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "amcos_equipment_types_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "amcos_equipment_types_name_check" CHECK (char_length(btrim("name")) BETWEEN 2 AND 60)
);
CREATE UNIQUE INDEX "amcos_equipment_types_mamcos_name_key" ON "amcos_equipment_types"("mamcos_id", lower("name"));
ALTER TABLE "amcos_equipment_types" ADD CONSTRAINT "amcos_equipment_types_mamcos_id_fkey" FOREIGN KEY ("mamcos_id") REFERENCES "mamcos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "amcos_equipment" ADD COLUMN "type_id" TEXT;
ALTER TABLE "amcos_equipment" ADD CONSTRAINT "amcos_equipment_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "amcos_equipment_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "amcos_equipment_type_id_idx" ON "amcos_equipment"("type_id");

-- Machines already registered keep their type: one entry per kind each AMCOS actually has.
INSERT INTO "amcos_equipment_types" ("id", "mamcos_id", "name", "updated_at")
SELECT gen_random_uuid()::text, e."mamcos_id",
       upper(left(replace(e."type"::text, '_', ' '), 1)) || lower(substr(replace(e."type"::text, '_', ' '), 2)), now()
FROM (SELECT DISTINCT "mamcos_id", "type" FROM "amcos_equipment") e;

UPDATE "amcos_equipment" q SET "type_id" = t."id"
FROM "amcos_equipment_types" t
WHERE t."mamcos_id" = q."mamcos_id"
  AND lower(t."name") = lower(replace(q."type"::text, '_', ' '));
