CREATE TABLE "member_contributions" (
    "id" TEXT NOT NULL,
    "mamcos_id" TEXT NOT NULL,
    "farmer_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "contribution_date" TIMESTAMP(3) NOT NULL,
    "payment_method" TEXT,
    "reference" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "member_contributions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "member_contributions_mamcos_id_contribution_date_idx"
ON "member_contributions"("mamcos_id", "contribution_date");

CREATE INDEX "member_contributions_farmer_id_contribution_date_idx"
ON "member_contributions"("farmer_id", "contribution_date");

ALTER TABLE "member_contributions"
ADD CONSTRAINT "member_contributions_mamcos_id_fkey"
FOREIGN KEY ("mamcos_id") REFERENCES "mamcos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "member_contributions"
ADD CONSTRAINT "member_contributions_farmer_id_fkey"
FOREIGN KEY ("farmer_id") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
