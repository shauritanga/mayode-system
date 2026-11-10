-- Archive of generated accounting statements (PDF / Word / Excel), kept so they can be downloaded again.
CREATE TABLE "accounting_report_archive" (
  "id" TEXT NOT NULL,
  "mamcos_id" TEXT,
  "report_type" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "period_from" TEXT,
  "period_to" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "content" BYTEA NOT NULL,
  "prepared_by" TEXT,
  "approved_by" TEXT,
  "generated_by_id" TEXT,
  "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "accounting_report_archive_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "accounting_report_archive_mamcos_id_generated_at_idx" ON "accounting_report_archive"("mamcos_id", "generated_at");
