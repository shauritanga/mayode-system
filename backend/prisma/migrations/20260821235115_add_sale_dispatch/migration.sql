-- CreateEnum
CREATE TYPE "DispatchTransportMode" AS ENUM ('BUYER_OWN_VEHICLE', 'MAYODE_ARRANGED');

-- CreateTable
CREATE TABLE "dispatches" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "transport_mode" "DispatchTransportMode" NOT NULL,
    "transport_fee" DOUBLE PRECISION,
    "vehicle_plate_number" TEXT NOT NULL,
    "driver_name" TEXT NOT NULL,
    "driver_phone" TEXT NOT NULL,
    "released_by_user_id" TEXT NOT NULL,
    "released_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dispatches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dispatches_sale_id_key" ON "dispatches"("sale_id");

-- AddForeignKey
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_released_by_user_id_fkey" FOREIGN KEY ("released_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
