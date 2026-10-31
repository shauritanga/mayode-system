-- CreateEnum
CREATE TYPE "IrrigationStatus" AS ENUM ('PLANNED', 'ACTIVE', 'UNDER_MAINTENANCE', 'INACTIVE');
-- CreateEnum
CREATE TYPE "HectareAllocationStatus" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'ENDED', 'REJECTED');
-- CreateEnum
CREATE TYPE "IrrigationTransferStatus" AS ENUM ('PENDING_APPROVAL', 'COMPLETED', 'REJECTED', 'CANCELLED');
-- CreateEnum
CREATE TYPE "IrrigationLeadershipPosition" AS ENUM ('CANAL_LEADER', 'BLOCK_LEADER');
-- CreateEnum
CREATE TYPE "IrrigationLeadershipStatus" AS ENUM ('ACTIVE', 'ENDED');
-- CreateEnum
CREATE TYPE "IrrigationDocumentType" AS ENUM ('REGISTRATION', 'SURVEY_MAP', 'ALLOCATION_LETTER', 'TRANSFER_SUPPORT', 'APPOINTMENT_LETTER', 'INFRASTRUCTURE', 'OTHER');
-- AlterTable
ALTER TABLE "irrigation_schemes" ADD COLUMN     "code" TEXT,
ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "district" TEXT,
ADD COLUMN     "established_on" DATE,
ADD COLUMN     "hectares_per_block" DECIMAL(8,2) NOT NULL DEFAULT 30,
ADD COLUMN     "max_blocks_per_canal" INTEGER NOT NULL DEFAULT 16,
ADD COLUMN     "max_hectares_per_farmer" INTEGER,
ADD COLUMN     "min_blocks_per_canal" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "planned_canal_count" INTEGER NOT NULL DEFAULT 6,
ADD COLUMN     "region" TEXT,
ADD COLUMN     "require_allocation_approval" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "status" "IrrigationStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_by_id" TEXT,
ADD COLUMN     "village" TEXT,
ADD COLUMN     "ward" TEXT;
-- CreateTable
CREATE TABLE "irrigation_canals" (
    "id" TEXT NOT NULL,
    "scheme_id" TEXT NOT NULL,
    "canal_number" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "IrrigationStatus" NOT NULL DEFAULT 'ACTIVE',
    "description" TEXT,
    "length_km" DECIMAL(8,2),
    "headworks" TEXT,
    "infrastructure_notes" TEXT,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "irrigation_canals_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "irrigation_blocks" (
    "id" TEXT NOT NULL,
    "canal_id" TEXT NOT NULL,
    "block_number" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "area_hectares" DECIMAL(10,2) NOT NULL,
    "hectare_count" INTEGER NOT NULL,
    "status" "IrrigationStatus" NOT NULL DEFAULT 'ACTIVE',
    "description" TEXT,
    "boundary_coordinates" JSONB,
    "center_latitude" DOUBLE PRECISION,
    "center_longitude" DOUBLE PRECISION,
    "boundary_notes" TEXT,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "irrigation_blocks_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "irrigation_hectares" (
    "id" TEXT NOT NULL,
    "block_id" TEXT NOT NULL,
    "hectare_number" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "area_hectares" DECIMAL(8,2) NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "irrigation_hectares_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "irrigation_hectare_allocations" (
    "id" TEXT NOT NULL,
    "hectare_id" TEXT NOT NULL,
    "farmer_id" TEXT NOT NULL,
    "status" "HectareAllocationStatus" NOT NULL,
    "allocated_on" DATE NOT NULL,
    "ended_on" DATE,
    "end_reason" TEXT,
    "notes" TEXT,
    "requested_by_id" TEXT,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejected_reason" TEXT,
    "ended_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "irrigation_hectare_allocations_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "irrigation_allocation_transfers" (
    "id" TEXT NOT NULL,
    "hectare_id" TEXT NOT NULL,
    "from_allocation_id" TEXT NOT NULL,
    "to_allocation_id" TEXT,
    "from_farmer_id" TEXT NOT NULL,
    "to_farmer_id" TEXT NOT NULL,
    "transfer_date" DATE NOT NULL,
    "effective_date" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "IrrigationTransferStatus" NOT NULL,
    "requested_by_id" TEXT,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "processed_by_id" TEXT,
    "processed_at" TIMESTAMP(3),
    "rejected_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "irrigation_allocation_transfers_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "irrigation_leaderships" (
    "id" TEXT NOT NULL,
    "position" "IrrigationLeadershipPosition" NOT NULL,
    "canal_id" TEXT NOT NULL,
    "block_id" TEXT,
    "farmer_id" TEXT NOT NULL,
    "appointed_on" DATE NOT NULL,
    "term_start" DATE NOT NULL,
    "term_end" DATE,
    "status" "IrrigationLeadershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "ended_on" DATE,
    "end_reason" TEXT,
    "replaced_by_id" TEXT,
    "recorded_by_id" TEXT,
    "ended_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "irrigation_leaderships_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "irrigation_documents" (
    "id" TEXT NOT NULL,
    "scheme_id" TEXT NOT NULL,
    "canal_id" TEXT,
    "block_id" TEXT,
    "transfer_id" TEXT,
    "leadership_id" TEXT,
    "type" "IrrigationDocumentType" NOT NULL DEFAULT 'OTHER',
    "title" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT,
    "size_bytes" INTEGER,
    "uploaded_by_id" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "irrigation_documents_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "irrigation_canals_scheme_id_canal_number_key" ON "irrigation_canals"("scheme_id", "canal_number");
-- CreateIndex
CREATE UNIQUE INDEX "irrigation_canals_scheme_id_code_key" ON "irrigation_canals"("scheme_id", "code");
-- CreateIndex
CREATE UNIQUE INDEX "irrigation_blocks_canal_id_block_number_key" ON "irrigation_blocks"("canal_id", "block_number");
-- CreateIndex
CREATE UNIQUE INDEX "irrigation_blocks_canal_id_code_key" ON "irrigation_blocks"("canal_id", "code");
-- CreateIndex
CREATE UNIQUE INDEX "irrigation_hectares_block_id_hectare_number_key" ON "irrigation_hectares"("block_id", "hectare_number");
-- CreateIndex
CREATE INDEX "irrigation_hectare_allocations_hectare_id_status_idx" ON "irrigation_hectare_allocations"("hectare_id", "status");
-- CreateIndex
CREATE INDEX "irrigation_hectare_allocations_farmer_id_status_idx" ON "irrigation_hectare_allocations"("farmer_id", "status");
-- CreateIndex
CREATE INDEX "irrigation_allocation_transfers_hectare_id_status_idx" ON "irrigation_allocation_transfers"("hectare_id", "status");
-- CreateIndex
CREATE INDEX "irrigation_leaderships_canal_id_status_idx" ON "irrigation_leaderships"("canal_id", "status");
-- CreateIndex
CREATE INDEX "irrigation_leaderships_block_id_status_idx" ON "irrigation_leaderships"("block_id", "status");
-- CreateIndex
CREATE INDEX "irrigation_leaderships_farmer_id_idx" ON "irrigation_leaderships"("farmer_id");
-- CreateIndex
CREATE INDEX "irrigation_documents_scheme_id_idx" ON "irrigation_documents"("scheme_id");
-- CreateIndex
CREATE INDEX "irrigation_documents_canal_id_idx" ON "irrigation_documents"("canal_id");
-- CreateIndex
CREATE INDEX "irrigation_documents_block_id_idx" ON "irrigation_documents"("block_id");
-- CreateIndex
CREATE INDEX "irrigation_documents_transfer_id_idx" ON "irrigation_documents"("transfer_id");
-- CreateIndex
CREATE UNIQUE INDEX "irrigation_schemes_code_key" ON "irrigation_schemes"("code");
-- CreateIndex
CREATE INDEX "irrigation_schemes_mamcos_id_idx" ON "irrigation_schemes"("mamcos_id");
-- AddForeignKey
ALTER TABLE "irrigation_canals" ADD CONSTRAINT "irrigation_canals_scheme_id_fkey" FOREIGN KEY ("scheme_id") REFERENCES "irrigation_schemes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "irrigation_blocks" ADD CONSTRAINT "irrigation_blocks_canal_id_fkey" FOREIGN KEY ("canal_id") REFERENCES "irrigation_canals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "irrigation_hectares" ADD CONSTRAINT "irrigation_hectares_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "irrigation_blocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "irrigation_hectare_allocations" ADD CONSTRAINT "irrigation_hectare_allocations_hectare_id_fkey" FOREIGN KEY ("hectare_id") REFERENCES "irrigation_hectares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "irrigation_hectare_allocations" ADD CONSTRAINT "irrigation_hectare_allocations_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "irrigation_allocation_transfers" ADD CONSTRAINT "irrigation_allocation_transfers_hectare_id_fkey" FOREIGN KEY ("hectare_id") REFERENCES "irrigation_hectares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "irrigation_allocation_transfers" ADD CONSTRAINT "irrigation_allocation_transfers_from_allocation_id_fkey" FOREIGN KEY ("from_allocation_id") REFERENCES "irrigation_hectare_allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "irrigation_allocation_transfers" ADD CONSTRAINT "irrigation_allocation_transfers_to_allocation_id_fkey" FOREIGN KEY ("to_allocation_id") REFERENCES "irrigation_hectare_allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "irrigation_allocation_transfers" ADD CONSTRAINT "irrigation_allocation_transfers_from_farmer_id_fkey" FOREIGN KEY ("from_farmer_id") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "irrigation_allocation_transfers" ADD CONSTRAINT "irrigation_allocation_transfers_to_farmer_id_fkey" FOREIGN KEY ("to_farmer_id") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "irrigation_leaderships" ADD CONSTRAINT "irrigation_leaderships_canal_id_fkey" FOREIGN KEY ("canal_id") REFERENCES "irrigation_canals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "irrigation_leaderships" ADD CONSTRAINT "irrigation_leaderships_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "irrigation_blocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "irrigation_leaderships" ADD CONSTRAINT "irrigation_leaderships_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "irrigation_leaderships" ADD CONSTRAINT "irrigation_leaderships_replaced_by_id_fkey" FOREIGN KEY ("replaced_by_id") REFERENCES "irrigation_leaderships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "irrigation_documents" ADD CONSTRAINT "irrigation_documents_scheme_id_fkey" FOREIGN KEY ("scheme_id") REFERENCES "irrigation_schemes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "irrigation_documents" ADD CONSTRAINT "irrigation_documents_canal_id_fkey" FOREIGN KEY ("canal_id") REFERENCES "irrigation_canals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "irrigation_documents" ADD CONSTRAINT "irrigation_documents_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "irrigation_blocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "irrigation_documents" ADD CONSTRAINT "irrigation_documents_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "irrigation_allocation_transfers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "irrigation_documents" ADD CONSTRAINT "irrigation_documents_leadership_id_fkey" FOREIGN KEY ("leadership_id") REFERENCES "irrigation_leaderships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing stub rows: carry the legacy is_active flag into the new status column.
UPDATE "irrigation_schemes" SET "status" = 'INACTIVE' WHERE "is_active" = false;

-- ---------------------------------------------------------------------------
-- Integrity rules enforced by the database (Prisma's schema DSL cannot express these)
-- ---------------------------------------------------------------------------

-- Scheme code is unique but optional for legacy rows; compare case-insensitively.
CREATE UNIQUE INDEX "irrigation_schemes_code_lower_key" ON "irrigation_schemes" (lower("code")) WHERE "code" IS NOT NULL;

ALTER TABLE "irrigation_canals" ADD CONSTRAINT "irrigation_canals_number_positive" CHECK ("canal_number" >= 1);
ALTER TABLE "irrigation_blocks" ADD CONSTRAINT "irrigation_blocks_number_positive" CHECK ("block_number" >= 1);
ALTER TABLE "irrigation_blocks" ADD CONSTRAINT "irrigation_blocks_area_positive" CHECK ("area_hectares" > 0 AND "hectare_count" >= 1);
ALTER TABLE "irrigation_hectares" ADD CONSTRAINT "irrigation_hectares_number_positive" CHECK ("hectare_number" >= 1 AND "area_hectares" > 0);

-- A block may never hold more hectare units than its configured hectare_count, and unit numbers
-- must fall inside 1..hectare_count. Locks the block row so concurrent inserts cannot both pass.
CREATE FUNCTION irrigation_hectare_limit() RETURNS trigger AS $$
DECLARE
  allowed integer;
  existing integer;
BEGIN
  SELECT "hectare_count" INTO allowed FROM "irrigation_blocks" WHERE "id" = NEW."block_id" FOR UPDATE;
  IF NEW."hectare_number" > allowed THEN
    RAISE EXCEPTION 'Hectare number % exceeds the % hectares of this block', NEW."hectare_number", allowed
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT count(*) INTO existing FROM "irrigation_hectares" WHERE "block_id" = NEW."block_id";
  IF existing >= allowed THEN
    RAISE EXCEPTION 'Block already has its % hectares', allowed USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "irrigation_hectares_limit" BEFORE INSERT ON "irrigation_hectares"
  FOR EACH ROW EXECUTE FUNCTION irrigation_hectare_limit();

-- One open (pending or active) allocation per hectare.
CREATE UNIQUE INDEX "irrigation_hectare_allocations_one_open_per_hectare"
  ON "irrigation_hectare_allocations" ("hectare_id") WHERE "status" IN ('PENDING_APPROVAL', 'ACTIVE');
ALTER TABLE "irrigation_hectare_allocations" ADD CONSTRAINT "irrigation_allocations_end_after_start"
  CHECK ("ended_on" IS NULL OR "ended_on" >= "allocated_on");
ALTER TABLE "irrigation_hectare_allocations" ADD CONSTRAINT "irrigation_allocations_ended_has_date"
  CHECK (("status" <> 'ENDED') OR ("ended_on" IS NOT NULL));

-- One pending transfer per hectare.
CREATE UNIQUE INDEX "irrigation_transfers_one_pending_per_hectare"
  ON "irrigation_allocation_transfers" ("hectare_id") WHERE "status" = 'PENDING_APPROVAL';
ALTER TABLE "irrigation_allocation_transfers" ADD CONSTRAINT "irrigation_transfers_different_farmers"
  CHECK ("from_farmer_id" <> "to_farmer_id");

-- One active canal leader per canal, one active block leader per block.
CREATE UNIQUE INDEX "irrigation_leaderships_one_active_canal_leader"
  ON "irrigation_leaderships" ("canal_id") WHERE "position" = 'CANAL_LEADER' AND "status" = 'ACTIVE';
CREATE UNIQUE INDEX "irrigation_leaderships_one_active_block_leader"
  ON "irrigation_leaderships" ("block_id") WHERE "position" = 'BLOCK_LEADER' AND "status" = 'ACTIVE';
ALTER TABLE "irrigation_leaderships" ADD CONSTRAINT "irrigation_leaderships_position_scope"
  CHECK (("position" = 'CANAL_LEADER' AND "block_id" IS NULL) OR ("position" = 'BLOCK_LEADER' AND "block_id" IS NOT NULL));
ALTER TABLE "irrigation_leaderships" ADD CONSTRAINT "irrigation_leaderships_term_order"
  CHECK ("term_end" IS NULL OR "term_end" >= "term_start");

-- History is append-only: allocation, transfer and leadership rows can be closed but never deleted.
CREATE FUNCTION irrigation_forbid_history_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% records are historical and cannot be deleted', TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "irrigation_allocations_no_delete" BEFORE DELETE ON "irrigation_hectare_allocations"
  FOR EACH ROW EXECUTE FUNCTION irrigation_forbid_history_delete();
CREATE TRIGGER "irrigation_transfers_no_delete" BEFORE DELETE ON "irrigation_allocation_transfers"
  FOR EACH ROW EXECUTE FUNCTION irrigation_forbid_history_delete();
CREATE TRIGGER "irrigation_leaderships_no_delete" BEFORE DELETE ON "irrigation_leaderships"
  FOR EACH ROW EXECUTE FUNCTION irrigation_forbid_history_delete();

-- Permission resources (Roles & Permissions matrix).
INSERT INTO "resources" ("id", "key", "label") VALUES (gen_random_uuid()::text, 'irrigation', 'Irrigation Scheme Structure') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "resources" ("id", "key", "label") VALUES (gen_random_uuid()::text, 'irrigation_allocations', 'Irrigation Hectare Allocation') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "resources" ("id", "key", "label") VALUES (gen_random_uuid()::text, 'irrigation_leadership', 'Irrigation Leadership') ON CONFLICT ("key") DO NOTHING;
