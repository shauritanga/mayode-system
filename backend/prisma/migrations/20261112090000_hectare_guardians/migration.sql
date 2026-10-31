-- CreateTable
CREATE TABLE "irrigation_hectare_guardians" (
    "id" TEXT NOT NULL,
    "allocation_id" TEXT NOT NULL,
    "guardian_id" TEXT NOT NULL,
    "started_on" DATE NOT NULL,
    "ended_on" DATE,
    "end_reason" TEXT,
    "note" TEXT,
    "created_by_id" TEXT,
    "ended_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "irrigation_hectare_guardians_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "irrigation_hectare_guardians_allocation_id_idx" ON "irrigation_hectare_guardians"("allocation_id");

-- CreateIndex
CREATE INDEX "irrigation_hectare_guardians_guardian_id_ended_on_idx" ON "irrigation_hectare_guardians"("guardian_id", "ended_on");

-- AddForeignKey
ALTER TABLE "irrigation_hectare_guardians" ADD CONSTRAINT "irrigation_hectare_guardians_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "irrigation_hectare_allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "irrigation_hectare_guardians" ADD CONSTRAINT "irrigation_hectare_guardians_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- At most one current guardian per allocation.
CREATE UNIQUE INDEX "irrigation_hectare_guardians_one_open_per_allocation" ON "irrigation_hectare_guardians"("allocation_id") WHERE "ended_on" IS NULL;
ALTER TABLE "irrigation_hectare_guardians" ADD CONSTRAINT "irrigation_hectare_guardians_period_order" CHECK ("ended_on" IS NULL OR "ended_on" >= "started_on");
ALTER TABLE "irrigation_hectare_guardians" ADD CONSTRAINT "irrigation_hectare_guardians_end_consistent" CHECK (("ended_on" IS NULL) = ("end_reason" IS NULL));

-- History is append-only, like allocations, transfers and leadership.
CREATE TRIGGER "irrigation_guardians_no_delete" BEFORE DELETE ON "irrigation_hectare_guardians"
  FOR EACH ROW EXECUTE FUNCTION irrigation_forbid_history_delete();

