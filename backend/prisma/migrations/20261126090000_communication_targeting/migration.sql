-- Messages can now go to a canal, a block, board members or staff, not only to all/selected farmers.
ALTER TYPE "CommunicationAudience" ADD VALUE IF NOT EXISTS 'CANAL';
ALTER TYPE "CommunicationAudience" ADD VALUE IF NOT EXISTS 'BLOCK';
ALTER TYPE "CommunicationAudience" ADD VALUE IF NOT EXISTS 'BOARD';
ALTER TYPE "CommunicationAudience" ADD VALUE IF NOT EXISTS 'STAFF';
