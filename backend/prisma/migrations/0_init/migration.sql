-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."ActivityType" AS ENUM ('LAND_PREPARATION', 'PLANTING', 'FERTILIZING', 'WEEDING', 'PEST_CONTROL', 'IRRIGATION', 'HARVESTING', 'DRYING', 'STORAGE', 'TRANSPORT');

-- CreateEnum
CREATE TYPE "public"."BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."CostCategory" AS ENUM ('SEEDS', 'FERTILIZER', 'PESTICIDE', 'HERBICIDE', 'LABOR', 'TILLAGE', 'IRRIGATION', 'TRANSPORT', 'MISCELLANEOUS');

-- CreateEnum
CREATE TYPE "public"."CropCycleStatus" AS ENUM ('PLANNED', 'ACTIVE', 'HARVESTED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "public"."DealType" AS ENUM ('STANDARD', 'FLASH_DEAL', 'RELATIONSHIP');

-- CreateEnum
CREATE TYPE "public"."FarmGrade" AS ENUM ('A', 'B', 'C');

-- CreateEnum
CREATE TYPE "public"."Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."InventoryStatus" AS ENUM ('RECEIVED', 'IN_STORAGE', 'BATCHED', 'SHIPPED', 'SOLD');

-- CreateEnum
CREATE TYPE "public"."LeaseStatus" AS ENUM ('DRAFT', 'PENDING_VERIFICATION', 'ACTIVE', 'COMPLETED', 'TERMINATED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "public"."PaymentStatus" AS ENUM ('PENDING', 'IN_ESCROW', 'RELEASED', 'CLEARED', 'REFUNDED', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."PaymentType" AS ENUM ('RICE_PURCHASE', 'LAND_RENT', 'TRACTOR_SERVICE', 'INPUT_CREDIT', 'LOAN_REPAYMENT', 'COMMISSION', 'FAIRTRADE_PREMIUM');

-- CreateEnum
CREATE TYPE "public"."RevenueType" AS ENUM ('FAIRTRADE_SALE', 'CONVENTIONAL_SALE');

-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'FIELD_OFFICER', 'FARMER', 'MAMCOS_SECRETARY', 'AUDITOR', 'BUYER', 'FINANCIAL_PROVIDER');

-- CreateTable
CREATE TABLE "public"."activity_logs" (
    "id" TEXT NOT NULL,
    "crop_cycle_id" TEXT NOT NULL,
    "field_officer_id" TEXT,
    "activity_type" "public"."ActivityType" NOT NULL,
    "activity_date" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "inputs_used" JSONB,
    "labor_workers" INTEGER,
    "labor_hours" DOUBLE PRECISION,
    "photo_urls" TEXT[],
    "gps_latitude" DOUBLE PRECISION,
    "gps_longitude" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "old_data" JSONB,
    "new_data" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."buyers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fairtrade_cert_number" TEXT,
    "contact_person" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "is_certified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buyers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."crop_cycles" (
    "id" TEXT NOT NULL,
    "farm_id" TEXT NOT NULL,
    "farmer_id" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "rice_variety" TEXT,
    "planting_date" TIMESTAMP(3),
    "expected_harvest" TIMESTAMP(3),
    "harvest_date" TIMESTAMP(3),
    "estimated_yield_kg" DOUBLE PRECISION,
    "actual_yield_kg" DOUBLE PRECISION,
    "status" "public"."CropCycleStatus" NOT NULL DEFAULT 'PLANNED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crop_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."districts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region_id" TEXT NOT NULL,

    CONSTRAINT "districts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."escrow_payments" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" "public"."PaymentStatus" NOT NULL,
    "mpesa_ref" TEXT,
    "deposited_at" TIMESTAMP(3),
    "released_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "escrow_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."farm_verifications" (
    "id" TEXT NOT NULL,
    "farm_id" TEXT NOT NULL,
    "field_officer_id" TEXT NOT NULL,
    "verified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gps_verified" BOOLEAN NOT NULL DEFAULT false,
    "neighbor_left" TEXT,
    "neighbor_right" TEXT,
    "mamcos_approved" BOOLEAN NOT NULL DEFAULT false,
    "photo_proof_url" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "farm_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."farmers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "control_number" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "date_of_birth" TIMESTAMP(3),
    "gender" "public"."Gender",
    "national_id" TEXT,
    "photo_url" TEXT,
    "village" TEXT,
    "ward" TEXT,
    "district" TEXT DEFAULT 'Mbarali',
    "region" TEXT DEFAULT 'Mbeya',
    "family_size" INTEGER,
    "membership_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "credit_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "is_blacklisted" BOOLEAN NOT NULL DEFAULT false,
    "blacklist_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "mamcos_id" TEXT,

    CONSTRAINT "farmers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."farms" (
    "id" TEXT NOT NULL,
    "farm_code" TEXT NOT NULL,
    "farmer_id" TEXT NOT NULL,
    "mamcos_id" TEXT,
    "name" TEXT,
    "village" TEXT,
    "social_hectares" DOUBLE PRECISION NOT NULL,
    "actual_acres" DOUBLE PRECISION,
    "grade" "public"."FarmGrade" NOT NULL DEFAULT 'B',
    "vichuguu_count" INTEGER NOT NULL DEFAULT 0,
    "has_irrigation" BOOLEAN NOT NULL DEFAULT false,
    "near_road" BOOLEAN NOT NULL DEFAULT false,
    "soil_condition" TEXT,
    "photo_urls" TEXT[],
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_available_for_rent" BOOLEAN NOT NULL DEFAULT false,
    "is_leased" BOOLEAN NOT NULL DEFAULT false,
    "lease_locked_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "boundary_coordinates" JSONB,
    "center_latitude" DOUBLE PRECISION,
    "center_longitude" DOUBLE PRECISION,

    CONSTRAINT "farms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."field_officers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "employee_code" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "assigned_area" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_officers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."input_costs" (
    "id" TEXT NOT NULL,
    "crop_cycle_id" TEXT NOT NULL,
    "category" "public"."CostCategory" NOT NULL,
    "item_name" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "unit_price" DOUBLE PRECISION,
    "total_cost" DOUBLE PRECISION NOT NULL,
    "supplier" TEXT,
    "receipt_url" TEXT,
    "date_incurred" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "input_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."inventory_records" (
    "id" TEXT NOT NULL,
    "farm_id" TEXT NOT NULL,
    "farmer_id" TEXT NOT NULL,
    "lot_number" TEXT,
    "weight_kg" DOUBLE PRECISION NOT NULL,
    "quality_grade" TEXT,
    "tracking_code" TEXT NOT NULL,
    "warehouse_location" TEXT,
    "received_date" TIMESTAMP(3) NOT NULL,
    "status" "public"."InventoryStatus" NOT NULL DEFAULT 'RECEIVED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."land_listings" (
    "id" TEXT NOT NULL,
    "farm_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "renter_id" TEXT,
    "asking_price" DOUBLE PRECISION NOT NULL,
    "suggested_price" DOUBLE PRECISION,
    "final_price" DOUBLE PRECISION,
    "deal_type" "public"."DealType" NOT NULL DEFAULT 'STANDARD',
    "commission_rate" DOUBLE PRECISION NOT NULL,
    "commission_amount" DOUBLE PRECISION,
    "lease_status" "public"."LeaseStatus" NOT NULL DEFAULT 'DRAFT',
    "lease_duration_months" INTEGER NOT NULL,
    "lease_start_date" TIMESTAMP(3),
    "lease_end_date" TIMESTAMP(3),
    "is_flash_deal" BOOLEAN NOT NULL DEFAULT false,
    "preferred_renter_code" TEXT,
    "is_multi_year" BOOLEAN NOT NULL DEFAULT false,
    "pricing_model" TEXT,
    "auto_drop_price" DOUBLE PRECISION,
    "auto_drop_days" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "land_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."loan_records" (
    "id" TEXT NOT NULL,
    "farmer_id" TEXT NOT NULL,
    "lender_name" TEXT NOT NULL,
    "original_amount" DOUBLE PRECISION NOT NULL,
    "amount_owed" DOUBLE PRECISION NOT NULL,
    "repayment_schedule" TEXT,
    "auto_deduct_percent" DOUBLE PRECISION,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loan_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."lots" (
    "id" TEXT NOT NULL,
    "lot_number" TEXT NOT NULL,
    "total_weight_kg" DOUBLE PRECISION NOT NULL,
    "rice_variety" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."mamcos" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "district" TEXT DEFAULT 'Mbarali',
    "total_hectares" DOUBLE PRECISION,
    "chairman_name" TEXT,
    "chairman_phone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mamcos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."mamcos_secretaries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "mamcos_id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "stability_bonus" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mamcos_secretaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."market_prices" (
    "id" TEXT NOT NULL,
    "commodity" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "market" TEXT,
    "source" TEXT,
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."payments" (
    "id" TEXT NOT NULL,
    "farmer_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "payment_type" "public"."PaymentType" NOT NULL,
    "status" "public"."PaymentStatus" NOT NULL,
    "mpesa_ref" TEXT,
    "loan_deduction" DOUBLE PRECISION,
    "net_amount" DOUBLE PRECISION,
    "description" TEXT,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."refresh_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."regions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."revenues" (
    "id" TEXT NOT NULL,
    "crop_cycle_id" TEXT NOT NULL,
    "revenue_type" "public"."RevenueType" NOT NULL,
    "quantity_kg" DOUBLE PRECISION NOT NULL,
    "price_per_kg" DOUBLE PRECISION NOT NULL,
    "total_revenue" DOUBLE PRECISION NOT NULL,
    "fairtrade_premium" DOUBLE PRECISION,
    "buyer_id" TEXT,
    "sale_date" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revenues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."sales" (
    "id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "buyer_id" TEXT NOT NULL,
    "lot_id" TEXT NOT NULL,
    "rice_variety" TEXT,
    "quantity_kg" DOUBLE PRECISION NOT NULL,
    "packaging" TEXT,
    "price_per_kg" DOUBLE PRECISION NOT NULL,
    "fairtrade_premium" DOUBLE PRECISION,
    "total_revenue" DOUBLE PRECISION NOT NULL,
    "payment_received" BOOLEAN NOT NULL DEFAULT false,
    "payment_date" TIMESTAMP(3),
    "sale_date" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."sms_logs" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tractor_bookings" (
    "id" TEXT NOT NULL,
    "tractor_id" TEXT NOT NULL,
    "farmer_id" TEXT NOT NULL,
    "hectares" DOUBLE PRECISION NOT NULL,
    "terrain_grade" "public"."FarmGrade" NOT NULL,
    "base_price" DOUBLE PRECISION NOT NULL,
    "terrain_surcharge" DOUBLE PRECISION,
    "total_price" DOUBLE PRECISION NOT NULL,
    "commission_rate" DOUBLE PRECISION NOT NULL,
    "commission_amount" DOUBLE PRECISION NOT NULL,
    "status" "public"."BookingStatus" NOT NULL DEFAULT 'PENDING',
    "scheduled_date" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "farmer_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tractor_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tractor_owners" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "location" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tractor_owners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tractors" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "registration_no" TEXT NOT NULL,
    "model" TEXT,
    "horse_power" INTEGER,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "location" TEXT,
    "price_per_hectare" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tractors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."users" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "public"."UserRole" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "language" TEXT NOT NULL DEFAULT 'sw',
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."wards" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "district_id" TEXT NOT NULL,

    CONSTRAINT "wards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "public"."audit_logs"("entity_type" ASC, "entity_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "buyers_fairtrade_cert_number_key" ON "public"."buyers"("fairtrade_cert_number" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "districts_name_region_id_key" ON "public"."districts"("name" ASC, "region_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "farmers_control_number_key" ON "public"."farmers"("control_number" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "farmers_national_id_key" ON "public"."farmers"("national_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "farmers_user_id_key" ON "public"."farmers"("user_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "farms_farm_code_key" ON "public"."farms"("farm_code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "field_officers_employee_code_key" ON "public"."field_officers"("employee_code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "field_officers_user_id_key" ON "public"."field_officers"("user_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_records_tracking_code_key" ON "public"."inventory_records"("tracking_code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "lots_lot_number_key" ON "public"."lots"("lot_number" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "mamcos_name_key" ON "public"."mamcos"("name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "mamcos_secretaries_mamcos_id_key" ON "public"."mamcos_secretaries"("mamcos_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "mamcos_secretaries_user_id_key" ON "public"."mamcos_secretaries"("user_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "public"."refresh_tokens"("token" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "regions_name_key" ON "public"."regions"("name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoice_number_key" ON "public"."sales"("invoice_number" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "tractors_registration_no_key" ON "public"."tractors"("registration_no" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "public"."users"("phone" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "wards_name_district_id_key" ON "public"."wards"("name" ASC, "district_id" ASC);

-- AddForeignKey
ALTER TABLE "public"."activity_logs" ADD CONSTRAINT "activity_logs_crop_cycle_id_fkey" FOREIGN KEY ("crop_cycle_id") REFERENCES "public"."crop_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."activity_logs" ADD CONSTRAINT "activity_logs_field_officer_id_fkey" FOREIGN KEY ("field_officer_id") REFERENCES "public"."field_officers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."crop_cycles" ADD CONSTRAINT "crop_cycles_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."crop_cycles" ADD CONSTRAINT "crop_cycles_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "public"."farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."districts" ADD CONSTRAINT "districts_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."escrow_payments" ADD CONSTRAINT "escrow_payments_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."land_listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."farm_verifications" ADD CONSTRAINT "farm_verifications_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."farm_verifications" ADD CONSTRAINT "farm_verifications_field_officer_id_fkey" FOREIGN KEY ("field_officer_id") REFERENCES "public"."field_officers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."farmers" ADD CONSTRAINT "farmers_mamcos_id_fkey" FOREIGN KEY ("mamcos_id") REFERENCES "public"."mamcos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."farmers" ADD CONSTRAINT "farmers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."farms" ADD CONSTRAINT "farms_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "public"."farmers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."farms" ADD CONSTRAINT "farms_mamcos_id_fkey" FOREIGN KEY ("mamcos_id") REFERENCES "public"."mamcos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."field_officers" ADD CONSTRAINT "field_officers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."input_costs" ADD CONSTRAINT "input_costs_crop_cycle_id_fkey" FOREIGN KEY ("crop_cycle_id") REFERENCES "public"."crop_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."inventory_records" ADD CONSTRAINT "inventory_records_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."inventory_records" ADD CONSTRAINT "inventory_records_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "public"."farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."inventory_records" ADD CONSTRAINT "inventory_records_lot_number_fkey" FOREIGN KEY ("lot_number") REFERENCES "public"."lots"("lot_number") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."land_listings" ADD CONSTRAINT "land_listings_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."land_listings" ADD CONSTRAINT "land_listings_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."land_listings" ADD CONSTRAINT "land_listings_renter_id_fkey" FOREIGN KEY ("renter_id") REFERENCES "public"."farmers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."loan_records" ADD CONSTRAINT "loan_records_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "public"."farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."mamcos_secretaries" ADD CONSTRAINT "mamcos_secretaries_mamcos_id_fkey" FOREIGN KEY ("mamcos_id") REFERENCES "public"."mamcos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."mamcos_secretaries" ADD CONSTRAINT "mamcos_secretaries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."payments" ADD CONSTRAINT "payments_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "public"."farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."revenues" ADD CONSTRAINT "revenues_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."buyers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."revenues" ADD CONSTRAINT "revenues_crop_cycle_id_fkey" FOREIGN KEY ("crop_cycle_id") REFERENCES "public"."crop_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."sales" ADD CONSTRAINT "sales_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."buyers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."sales" ADD CONSTRAINT "sales_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tractor_bookings" ADD CONSTRAINT "tractor_bookings_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "public"."farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tractor_bookings" ADD CONSTRAINT "tractor_bookings_tractor_id_fkey" FOREIGN KEY ("tractor_id") REFERENCES "public"."tractors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tractors" ADD CONSTRAINT "tractors_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."tractor_owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."wards" ADD CONSTRAINT "wards_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
