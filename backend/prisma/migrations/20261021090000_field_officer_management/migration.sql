-- Field officer management: structured region/district, registration attribution,
-- farm assignment and last mobile sync.
ALTER TABLE "mamcos_staff" ADD COLUMN "region" TEXT, ADD COLUMN "district" TEXT;
ALTER TABLE "farmers" ADD COLUMN "registered_by_officer_id" TEXT;
ALTER TABLE "farms" ADD COLUMN "registered_by_officer_id" TEXT, ADD COLUMN "assigned_officer_id" TEXT;
ALTER TABLE "users" ADD COLUMN "last_sync_at" TIMESTAMP(3);

CREATE INDEX "farmers_registered_by_officer_id_idx" ON "farmers"("registered_by_officer_id");
CREATE INDEX "farmers_assigned_officer_id_idx" ON "farmers"("assigned_officer_id");
CREATE INDEX "farms_registered_by_officer_id_idx" ON "farms"("registered_by_officer_id");
CREATE INDEX "farms_assigned_officer_id_idx" ON "farms"("assigned_officer_id");

-- Best-effort history: the first officer to verify a farm mapped it; a farmer's assigned officer
-- is treated as the registering officer where nothing better is recorded.
UPDATE "farms" f SET "registered_by_officer_id" = v."field_officer_id", "assigned_officer_id" = v."field_officer_id"
FROM (
  SELECT DISTINCT ON ("farm_id") "farm_id", "field_officer_id"
  FROM "farm_verifications" ORDER BY "farm_id", "verified_at" ASC
) v WHERE v."farm_id" = f."id";
UPDATE "farmers" SET "registered_by_officer_id" = "assigned_officer_id" WHERE "assigned_officer_id" IS NOT NULL;
UPDATE "mamcos_staff" s SET "district" = m."district"
FROM "mamcos" m WHERE s."mamcos_id" = m."id" AND s."role" = 'FIELD_OFFICER';
