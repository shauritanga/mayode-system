-- Remembers that the "due today" reminder was sent, so a restart or a second run never texts the farmer twice.
ALTER TABLE "farmer_dues" ADD COLUMN "due_reminder_sent_at" TIMESTAMP(3);
