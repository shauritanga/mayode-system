ALTER TABLE "sales" ADD COLUMN "buyer_order_reference" TEXT;
ALTER TABLE "sales" ADD COLUMN "buyer_payment_reference" TEXT;
CREATE UNIQUE INDEX "sales_buyer_order_reference_key" ON "sales"("buyer_order_reference");
