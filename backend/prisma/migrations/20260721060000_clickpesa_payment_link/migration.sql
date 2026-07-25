-- AlterTable
ALTER TABLE "memberships" ADD COLUMN     "order_reference" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "membership_id" TEXT,
ADD COLUMN     "order_reference" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "memberships_order_reference_key" ON "memberships"("order_reference");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

