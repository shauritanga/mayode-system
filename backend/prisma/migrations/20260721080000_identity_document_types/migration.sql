-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentType" ADD VALUE 'NIDA_ID';
ALTER TYPE "DocumentType" ADD VALUE 'VOTER_ID';
ALTER TYPE "DocumentType" ADD VALUE 'PROFILE_PHOTO';
ALTER TYPE "DocumentType" ADD VALUE 'FACE_CAPTURE';

