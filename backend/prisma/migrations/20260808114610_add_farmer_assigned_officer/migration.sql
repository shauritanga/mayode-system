-- AlterTable
ALTER TABLE "farmer_questionnaires" ALTER COLUMN "photo_urls" DROP DEFAULT;

-- AlterTable
ALTER TABLE "farmers" ADD COLUMN     "assigned_officer_id" TEXT;

-- AlterTable
ALTER TABLE "rice_calendar_tasks" ALTER COLUMN "photo_urls" DROP DEFAULT;
