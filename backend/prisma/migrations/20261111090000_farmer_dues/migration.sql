-- CreateEnum
CREATE TYPE "DueCategory" AS ENUM ('LEVY', 'MEMBERSHIP_FEE', 'CANAL_CLEANING', 'FERTILISER', 'OTHER');

-- CreateEnum
CREATE TYPE "DueBasis" AS ENUM ('PER_HECTARE', 'FLAT');

-- CreateEnum
CREATE TYPE "DuePaymentMethod" AS ENUM ('CASH', 'MOBILE_MONEY', 'BANK', 'HARVEST_DEDUCTION');

-- CreateEnum
CREATE TYPE "DueStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateTable
CREATE TABLE "farmer_due_types" (
    "id" TEXT NOT NULL,
    "mamcos_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "DueCategory" NOT NULL,
    "basis" "DueBasis" NOT NULL,
    "rate" DECIMAL(14,2) NOT NULL,
    "season" TEXT,
    "due_date" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

CONSTRAINT "farmer_due_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farmer_dues" (
    "id" TEXT NOT NULL,
    "mamcos_id" TEXT NOT NULL,
    "type_id" TEXT,
    "farmer_id" TEXT NOT NULL,
    "category" "DueCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "hectares" DECIMAL(8,2),
    "item_name" TEXT,
    "quantity" DECIMAL(12,2),
    "unit" TEXT,
    "unit_price" DECIMAL(14,2),
    "amount" DECIMAL(14,2) NOT NULL,
    "waived_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "waived_reason" TEXT,
    "status" "DueStatus" NOT NULL DEFAULT 'ACTIVE',
    "cancel_reason" TEXT,
    "issued_on" DATE NOT NULL,
    "due_date" DATE,
    "posted_issue" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

CONSTRAINT "farmer_dues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "due_payments" (
    "id" TEXT NOT NULL,
    "mamcos_id" TEXT NOT NULL,
    "due_id" TEXT NOT NULL,
    "farmer_id" TEXT NOT NULL,
    "receipt_no" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paid_on" DATE NOT NULL,
    "method" "DuePaymentMethod" NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "recorded_by_id" TEXT,
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "voided_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "due_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "farmer_due_types_mamcos_id_name_key" ON "farmer_due_types"("mamcos_id", "name");

-- CreateIndex
CREATE INDEX "farmer_dues_mamcos_id_status_idx" ON "farmer_dues"("mamcos_id", "status");

-- CreateIndex
CREATE INDEX "farmer_dues_farmer_id_idx" ON "farmer_dues"("farmer_id");

-- CreateIndex
CREATE INDEX "farmer_dues_mamcos_id_due_date_idx" ON "farmer_dues"("mamcos_id", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "farmer_dues_type_id_farmer_id_key" ON "farmer_dues"("type_id", "farmer_id");

-- CreateIndex
CREATE INDEX "due_payments_due_id_idx" ON "due_payments"("due_id");

-- CreateIndex
CREATE INDEX "due_payments_mamcos_id_paid_on_idx" ON "due_payments"("mamcos_id", "paid_on");

-- CreateIndex
CREATE UNIQUE INDEX "due_payments_mamcos_id_receipt_no_key" ON "due_payments"("mamcos_id", "receipt_no");

-- AddForeignKey
ALTER TABLE "farmer_due_types" ADD CONSTRAINT "farmer_due_types_mamcos_id_fkey" FOREIGN KEY ("mamcos_id") REFERENCES "mamcos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farmer_dues" ADD CONSTRAINT "farmer_dues_mamcos_id_fkey" FOREIGN KEY ("mamcos_id") REFERENCES "mamcos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farmer_dues" ADD CONSTRAINT "farmer_dues_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "farmer_due_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farmer_dues" ADD CONSTRAINT "farmer_dues_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "due_payments" ADD CONSTRAINT "due_payments_mamcos_id_fkey" FOREIGN KEY ("mamcos_id") REFERENCES "mamcos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "due_payments" ADD CONSTRAINT "due_payments_due_id_fkey" FOREIGN KEY ("due_id") REFERENCES "farmer_dues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "due_payments" ADD CONSTRAINT "due_payments_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Money must make sense.
ALTER TABLE "farmer_due_types" ADD CONSTRAINT "farmer_due_types_rate_not_negative" CHECK ("rate" >= 0);
ALTER TABLE "farmer_dues" ADD CONSTRAINT "farmer_dues_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "farmer_dues" ADD CONSTRAINT "farmer_dues_waived_within_amount" CHECK ("waived_amount" >= 0 AND "waived_amount" <= "amount");
ALTER TABLE "due_payments" ADD CONSTRAINT "due_payments_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "due_payments" ADD CONSTRAINT "due_payments_void_consistent" CHECK (("voided_at" IS NULL) = ("void_reason" IS NULL));

-- Permission resource, granted to every existing Cooperative Admin role (same reasoning as 20261107100000).
INSERT INTO "resources" ("id", "key", "label") VALUES (gen_random_uuid()::text, 'dues', 'Farmer Dues & Payments') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "role_permissions" ("id", "role_id", "resource_id", "action", "created_at")
SELECT gen_random_uuid()::text, r."id", res."id", a."action"::"PermissionAction", now()
FROM "roles" r
CROSS JOIN "resources" res
CROSS JOIN (VALUES ('VIEW'), ('CREATE'), ('EDIT'), ('DELETE')) AS a("action")
WHERE r."name" = 'Cooperative Admin' AND r."mamcos_id" IS NOT NULL AND res."key" = 'dues'
ON CONFLICT ("role_id", "resource_id", "action") DO NOTHING;

