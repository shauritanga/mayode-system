-- Infrastructure tenders: contractors, sealed bids, anonymous scoring, two-step award, milestone sign-off and payment.
CREATE TYPE "ContractorKind" AS ENUM ('COMPANY', 'INDIVIDUAL', 'MEMBER_GROUP');
CREATE TYPE "ContractorStatus" AS ENUM ('PENDING', 'VETTED', 'REJECTED', 'SUSPENDED');
CREATE TYPE "TenderCategory" AS ENUM ('CANAL_CLEARING', 'DESILTING', 'ROAD_GRADING', 'DRAINAGE_REPAIR', 'OTHER');
CREATE TYPE "TenderStatus" AS ENUM ('DRAFT', 'OPEN', 'EVALUATION', 'AWARDED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "BidStatus" AS ENUM ('SUBMITTED', 'WITHDRAWN');
CREATE TYPE "MilestoneStatus" AS ENUM ('PENDING', 'SUBMITTED', 'SIGNED_OFF', 'APPROVED', 'PAID');

CREATE TABLE "contractors" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "kind" "ContractorKind" NOT NULL,
  "name" TEXT NOT NULL,
  "contact_person" TEXT,
  "phone" TEXT NOT NULL,
  "email" TEXT,
  "tin" TEXT,
  "business_reg_no" TEXT,
  "member_number" TEXT,
  "address" TEXT,
  "equipment" TEXT,
  "equipment_count" INTEGER NOT NULL DEFAULT 0,
  "years_experience" INTEGER NOT NULL DEFAULT 0,
  "payout_method" TEXT,
  "payout_account" TEXT,
  "payout_name" TEXT,
  "status" "ContractorStatus" NOT NULL DEFAULT 'PENDING',
  "vetted_by_id" TEXT,
  "vetted_at" TIMESTAMP(3),
  "vetting_note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "contractors_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contractors_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "contractors_user_id_key" ON "contractors" ("user_id");
CREATE INDEX "contractors_status_idx" ON "contractors" ("status");

CREATE TABLE "tenders" (
  "id" TEXT NOT NULL,
  "mamcos_id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "category" "TenderCategory" NOT NULL,
  "canal_id" TEXT,
  "block_ids" TEXT[],
  "budget_ceiling" DECIMAL(14,2) NOT NULL,
  "opens_at" TIMESTAMP(3) NOT NULL,
  "closes_at" TIMESTAMP(3) NOT NULL,
  "required_equipment" INTEGER NOT NULL DEFAULT 1,
  "w_price" INTEGER NOT NULL,
  "w_equipment" INTEGER NOT NULL,
  "w_experience" INTEGER NOT NULL,
  "w_performance" INTEGER NOT NULL,
  "status" "TenderStatus" NOT NULL DEFAULT 'DRAFT',
  "published_at" TIMESTAMP(3),
  "bids_opened_at" TIMESTAMP(3),
  "bids_opened_by_id" TEXT,
  "recommended_bid_id" TEXT,
  "recommended_by_id" TEXT,
  "recommended_at" TIMESTAMP(3),
  "recommend_note" TEXT,
  "approved_by_id" TEXT,
  "approved_at" TIMESTAMP(3),
  "awarded_bid_id" TEXT,
  "contractor_id" TEXT,
  "contract_price" DECIMAL(14,2),
  "rating" INTEGER,
  "completed_at" TIMESTAMP(3),
  "cancel_reason" TEXT,
  "created_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tenders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenders_window" CHECK ("closes_at" > "opens_at"),
  CONSTRAINT "tenders_weights" CHECK ("w_price" + "w_equipment" + "w_experience" + "w_performance" = 100 AND "w_price" >= 0 AND "w_equipment" >= 0 AND "w_experience" >= 0 AND "w_performance" >= 0),
  CONSTRAINT "tenders_rating" CHECK ("rating" IS NULL OR "rating" BETWEEN 1 AND 5),
  CONSTRAINT "tenders_mamcos_fkey" FOREIGN KEY ("mamcos_id") REFERENCES "mamcos"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "tenders_contractor_fkey" FOREIGN KEY ("contractor_id") REFERENCES "contractors"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "tenders_mamcos_id_reference_key" ON "tenders" ("mamcos_id", "reference");
CREATE INDEX "tenders_status_closes_at_idx" ON "tenders" ("status", "closes_at");

CREATE TABLE "tender_bids" (
  "id" TEXT NOT NULL,
  "tender_id" TEXT NOT NULL,
  "contractor_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "price" DECIMAL(14,2) NOT NULL,
  "technical_proposal" TEXT NOT NULL,
  "equipment_offered" INTEGER NOT NULL,
  "completion_days" INTEGER NOT NULL,
  "document_urls" TEXT[],
  "status" "BidStatus" NOT NULL DEFAULT 'SUBMITTED',
  "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tender_bids_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tender_bids_price" CHECK ("price" > 0),
  CONSTRAINT "tender_bids_tender_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "tender_bids_contractor_fkey" FOREIGN KEY ("contractor_id") REFERENCES "contractors"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "tender_bids_tender_id_contractor_id_key" ON "tender_bids" ("tender_id", "contractor_id");
CREATE UNIQUE INDEX "tender_bids_tender_id_code_key" ON "tender_bids" ("tender_id", "code");

CREATE TABLE "tender_milestones" (
  "id" TEXT NOT NULL,
  "tender_id" TEXT NOT NULL,
  "number" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "percent" INTEGER NOT NULL,
  "amount" DECIMAL(14,2),
  "status" "MilestoneStatus" NOT NULL DEFAULT 'PENDING',
  "submitted_at" TIMESTAMP(3),
  "submit_note" TEXT,
  "evidence_urls" TEXT[],
  "rework_note" TEXT,
  "signed_off_by_id" TEXT,
  "signed_off_at" TIMESTAMP(3),
  "sign_off_note" TEXT,
  "approved_by_id" TEXT,
  "approved_at" TIMESTAMP(3),
  "paid_by_id" TEXT,
  "paid_at" TIMESTAMP(3),
  "paid_method" TEXT,
  "paid_reference" TEXT,
  CONSTRAINT "tender_milestones_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tender_milestones_percent" CHECK ("percent" BETWEEN 1 AND 100),
  CONSTRAINT "tender_milestones_tender_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "tender_milestones_tender_id_number_key" ON "tender_milestones" ("tender_id", "number");

CREATE TABLE "tender_events" (
  "id" TEXT NOT NULL,
  "tender_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "actor_id" TEXT,
  "detail" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tender_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tender_events_tender_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "tender_events_tender_id_created_at_idx" ON "tender_events" ("tender_id", "created_at");
CREATE FUNCTION "tender_events_locked"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'tender_events are append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "tender_events_no_change" BEFORE UPDATE OR DELETE ON "tender_events" FOR EACH ROW EXECUTE FUNCTION "tender_events_locked"();

-- Permissions
INSERT INTO "resources" ("id", "key", "label") VALUES
  (gen_random_uuid()::text, 'tenders', 'Infrastructure Tenders'),
  (gen_random_uuid()::text, 'tender_approval', 'Tender Award and Payment Approval'),
  (gen_random_uuid()::text, 'tender_payments', 'Tender Milestone Payments'),
  (gen_random_uuid()::text, 'tender_milestones', 'Tender Milestone Sign-off'),
  (gen_random_uuid()::text, 'tender_contractors', 'Contractor Vetting'),
  (gen_random_uuid()::text, 'tender_bidding', 'Contractor Bidding')
ON CONFLICT ("key") DO NOTHING;
INSERT INTO "role_permissions" ("id", "role_id", "resource_id", "action", "created_at")
SELECT gen_random_uuid()::text, r."id", res."id", g."action"::"PermissionAction", now()
FROM "roles" r
JOIN (VALUES
  ('Procurement Officer', 'tenders', 'VIEW'), ('Procurement Officer', 'tenders', 'CREATE'), ('Procurement Officer', 'tenders', 'EDIT'),
  ('Procurement Officer', 'tender_contractors', 'VIEW'), ('Procurement Officer', 'tender_contractors', 'EDIT'),
  ('Manager', 'tenders', 'VIEW'), ('Manager', 'tender_approval', 'EDIT'), ('Manager', 'tender_contractors', 'VIEW'), ('Manager', 'tender_contractors', 'EDIT'),
  ('Accountant', 'tenders', 'VIEW'), ('Accountant', 'tender_payments', 'EDIT'),
  ('Cashier', 'tenders', 'VIEW'),
  ('Block Leader', 'tenders', 'VIEW'), ('Block Leader', 'tender_milestones', 'VIEW'), ('Block Leader', 'tender_milestones', 'EDIT'),
  ('Canal Leader', 'tenders', 'VIEW'), ('Canal Leader', 'tender_milestones', 'VIEW'), ('Canal Leader', 'tender_milestones', 'EDIT'),
  ('Cooperative Admin', 'tenders', 'VIEW'), ('Cooperative Admin', 'tenders', 'CREATE'), ('Cooperative Admin', 'tenders', 'EDIT'), ('Cooperative Admin', 'tenders', 'DELETE'),
  ('Cooperative Admin', 'tender_approval', 'EDIT'), ('Cooperative Admin', 'tender_payments', 'EDIT'),
  ('Cooperative Admin', 'tender_milestones', 'VIEW'), ('Cooperative Admin', 'tender_milestones', 'EDIT'),
  ('Cooperative Admin', 'tender_contractors', 'VIEW'), ('Cooperative Admin', 'tender_contractors', 'EDIT')
) AS g("role_name", "resource_key", "action") ON r."name" = g."role_name"
JOIN "resources" res ON res."key" = g."resource_key"
WHERE r."mamcos_id" IS NOT NULL
ON CONFLICT ("role_id", "resource_id", "action") DO NOTHING;
