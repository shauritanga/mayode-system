-- Farms follow their farmer's field officer unless already assigned to someone.
UPDATE "farms" f SET "assigned_officer_id" = fr."assigned_officer_id"
FROM "farmers" fr
WHERE f."farmer_id" = fr."id" AND f."assigned_officer_id" IS NULL AND fr."assigned_officer_id" IS NOT NULL;
