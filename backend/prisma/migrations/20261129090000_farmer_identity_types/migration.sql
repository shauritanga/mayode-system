-- A farmer is identified by NIDA, a voter ID or a driver's license (NIDA is optional; a phone number is always on file).
CREATE TYPE "FarmerIdType" AS ENUM ('NIDA', 'VOTER_ID', 'DRIVER_LICENSE');
ALTER TYPE "DocumentType" ADD VALUE 'DRIVER_LICENSE';

ALTER TABLE "farmers" ADD COLUMN "id_type" "FarmerIdType";
ALTER TABLE "farmers" ADD COLUMN "id_number" TEXT;

-- Existing numbers were all stored in national_id. A farmer whose submitted ID document was a voter ID had their
-- voter number saved there by mistake: move it to the new fields. Everyone else with a national_id is on NIDA.
UPDATE "farmers" f SET "id_type" = 'VOTER_ID', "id_number" = f."national_id", "national_id" = NULL
WHERE f."national_id" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "documents" d WHERE d."farmer_id" = f."id" AND d."type" = 'VOTER_ID')
  AND NOT EXISTS (SELECT 1 FROM "documents" d WHERE d."farmer_id" = f."id" AND d."type" = 'NIDA_ID');
UPDATE "farmers" SET "id_type" = 'NIDA', "id_number" = "national_id"
WHERE "national_id" IS NOT NULL AND "id_type" IS NULL;

ALTER TABLE "farmers" ADD CONSTRAINT "farmers_id_type_and_number_together"
  CHECK (("id_type" IS NULL) = ("id_number" IS NULL));
CREATE UNIQUE INDEX "farmers_id_type_number_key" ON "farmers" ("id_type", "id_number") WHERE "id_type" IS NOT NULL;
