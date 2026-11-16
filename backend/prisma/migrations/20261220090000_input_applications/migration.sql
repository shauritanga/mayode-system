ALTER TABLE "input_issues" ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'OFFICE', ADD COLUMN "application_id" TEXT;
CREATE INDEX "input_issues_application_id_idx" ON "input_issues"("application_id");

CREATE TABLE "input_applications" (
  "id" TEXT NOT NULL,
  "mamcos_id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "farmer_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
  "farm_ids" TEXT[],
  "note" TEXT,
  "terms_version" TEXT NOT NULL,
  "terms_text" TEXT NOT NULL,
  "consent_at" TIMESTAMP(3) NOT NULL,
  "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decided_by_id" TEXT,
  "decided_at" TIMESTAMP(3),
  "reject_reason" TEXT,
  CONSTRAINT "input_applications_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "input_applications_mamcos_id_reference_key" ON "input_applications"("mamcos_id", "reference");
CREATE INDEX "input_applications_mamcos_id_status_idx" ON "input_applications"("mamcos_id", "status");
CREATE INDEX "input_applications_farmer_id_idx" ON "input_applications"("farmer_id");

CREATE TABLE "input_application_lines" (
  "id" TEXT NOT NULL,
  "application_id" TEXT NOT NULL,
  "item_id" TEXT NOT NULL,
  "item_name" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL,
  "unit_price" DECIMAL(14,2) NOT NULL,
  "issue_id" TEXT,
  CONSTRAINT "input_application_lines_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "input_application_lines_application_id_idx" ON "input_application_lines"("application_id");
ALTER TABLE "input_application_lines" ADD CONSTRAINT "input_application_lines_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "input_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
