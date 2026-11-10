-- A supervisor or guardian who is not an AMCOS member: name and phone, kept on the farmer.
ALTER TABLE "farmers" ADD COLUMN "supervisor_name" TEXT;
ALTER TABLE "farmers" ADD COLUMN "supervisor_phone" TEXT;
