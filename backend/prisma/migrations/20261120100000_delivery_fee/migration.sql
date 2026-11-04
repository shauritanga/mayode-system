-- Delivery fee on quotations and orders (taken from the AMCOS's Settings when the order is for delivery).
ALTER TABLE "ops_orders" ADD COLUMN "delivery_fee" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "quotations" ADD COLUMN "delivery_fee" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "ops_orders" ADD CONSTRAINT "ops_orders_delivery_fee_check" CHECK ("delivery_fee" >= 0);
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_delivery_fee_check" CHECK ("delivery_fee" >= 0);
