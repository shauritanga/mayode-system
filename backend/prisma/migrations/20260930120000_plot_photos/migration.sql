ALTER TABLE "plots" ADD COLUMN "photo_urls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
CREATE TABLE "sync_receipts" (
  "key" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "status_code" INTEGER NOT NULL,
  "body" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sync_receipts_pkey" PRIMARY KEY ("key")
);
