-- Combine harvesters now come from Tools & Equipment: each one is linked to its tool.
ALTER TABLE "combine_harvesters" ADD COLUMN "equipment_id" TEXT;
CREATE UNIQUE INDEX "combine_harvesters_equipment_id_key" ON "combine_harvesters"("equipment_id");
