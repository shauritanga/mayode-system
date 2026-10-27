CREATE TABLE "reserve_allocations" (
    "id" TEXT NOT NULL,
    "mamcos_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "allocation_date" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reserve_allocations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "reserve_allocations_mamcos_id_allocation_date_idx"
ON "reserve_allocations"("mamcos_id", "allocation_date");

ALTER TABLE "reserve_allocations"
ADD CONSTRAINT "reserve_allocations_mamcos_id_fkey"
FOREIGN KEY ("mamcos_id") REFERENCES "mamcos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
