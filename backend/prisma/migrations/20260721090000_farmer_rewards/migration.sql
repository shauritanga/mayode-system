-- CreateEnum
CREATE TYPE "RewardType" AS ENUM ('FERTILIZER', 'SEEDS', 'MACHINE_SERVICE', 'IRRIGATION_SUPPORT', 'TRAINING', 'INPUT_VOUCHER', 'CERTIFICATE', 'OTHER');

-- CreateEnum
CREATE TYPE "SelectionMethod" AS ENUM ('RANDOM', 'PERFORMANCE', 'PARTICIPATION', 'NEED_BASED', 'HYBRID', 'MANUAL');

-- CreateEnum
CREATE TYPE "RewardCampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SELECTION_PENDING', 'WINNERS_SELECTED', 'ANNOUNCED', 'FULFILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RewardWinnerStatus" AS ENUM ('SELECTED', 'APPROVED', 'NOTIFIED', 'ACCEPTED', 'DECLINED', 'DISTRIBUTION_PENDING', 'DISTRIBUTED', 'CONFIRMED', 'CANCELLED');

-- CreateTable
CREATE TABLE "reward_campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sponsor" TEXT,
    "reward_type" "RewardType" NOT NULL,
    "reward_quantity" INTEGER NOT NULL DEFAULT 1,
    "number_of_winners" INTEGER NOT NULL DEFAULT 1,
    "farming_season_id" TEXT,
    "eligible_cooperatives" TEXT[],
    "eligibility_start_date" TIMESTAMP(3),
    "eligibility_end_date" TIMESTAMP(3),
    "selection_method" "SelectionMethod" NOT NULL DEFAULT 'RANDOM',
    "status" "RewardCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "selection_seed" TEXT,
    "selection_algorithm_version" TEXT,
    "eligible_snapshot" JSONB,
    "selected_at" TIMESTAMP(3),
    "created_by_user_id" TEXT,
    "approved_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reward_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_winners" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "farmer_id" TEXT NOT NULL,
    "farm_id" TEXT,
    "reward_type" "RewardType" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" "RewardWinnerStatus" NOT NULL DEFAULT 'SELECTED',
    "notified_at" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reward_winners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reward_winners_farmer_id_idx" ON "reward_winners"("farmer_id");

-- CreateIndex
CREATE UNIQUE INDEX "reward_winners_campaign_id_farmer_id_key" ON "reward_winners"("campaign_id", "farmer_id");

-- AddForeignKey
ALTER TABLE "reward_campaigns" ADD CONSTRAINT "reward_campaigns_farming_season_id_fkey" FOREIGN KEY ("farming_season_id") REFERENCES "farming_seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_winners" ADD CONSTRAINT "reward_winners_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "reward_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_winners" ADD CONSTRAINT "reward_winners_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

