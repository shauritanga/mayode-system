-- Boundaries are overlap-checked when saved, so a mapped farm needs no separate approval.
UPDATE "farms" SET "is_verified" = true WHERE "boundary_coordinates" IS NOT NULL AND "is_verified" = false;
