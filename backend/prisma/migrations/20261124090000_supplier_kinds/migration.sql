-- Suppliers belong to a cooperative, and are either an individual or a company.
CREATE TYPE "SupplierKind" AS ENUM ('INDIVIDUAL', 'COMPANY');

ALTER TABLE "suppliers" ADD COLUMN "mamcos_id" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "kind" "SupplierKind" NOT NULL DEFAULT 'COMPANY';
ALTER TABLE "suppliers" ADD COLUMN "tin" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "id_number" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "business_reg_no" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "address" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "notes" TEXT;
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_mamcos_id_fkey" FOREIGN KEY ("mamcos_id") REFERENCES "mamcos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "suppliers_mamcos_id_idx" ON "suppliers"("mamcos_id");

-- Existing suppliers are attributed to the one cooperative that uses them, from the farm costs and supplier bills that reference them.
-- A supplier used by no one, or by several cooperatives, stays unattributed (null): a shared entry every cooperative can see and only
-- Super Admin can change.
UPDATE "suppliers" s SET "mamcos_id" = u."mamcos_id"
FROM (
  SELECT x."supplier_id", MIN(x."mamcos_id") AS "mamcos_id"
  FROM (
    SELECT ic."supplier_id", f."mamcos_id"
    FROM "input_costs" ic
    JOIN "crop_cycles" cc ON cc."id" = ic."crop_cycle_id"
    JOIN "farms" f ON f."id" = cc."farm_id"
    WHERE ic."supplier_id" IS NOT NULL AND f."mamcos_id" IS NOT NULL
    UNION ALL
    SELECT b."supplier_id", b."mamcos_id" FROM "bills" b WHERE b."supplier_id" IS NOT NULL AND b."mamcos_id" IS NOT NULL
  ) x
  GROUP BY x."supplier_id"
  HAVING COUNT(DISTINCT x."mamcos_id") = 1
) u
WHERE s."id" = u."supplier_id";
