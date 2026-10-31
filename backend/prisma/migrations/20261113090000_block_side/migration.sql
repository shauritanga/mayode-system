-- Which side of its canal a block lies on. Nullable: blocks created earlier have none recorded.
CREATE TYPE "IrrigationBlockSide" AS ENUM ('LEFT', 'RIGHT');

ALTER TABLE "irrigation_blocks" ADD COLUMN "side" "IrrigationBlockSide";
