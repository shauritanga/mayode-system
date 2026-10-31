-- Blocks whose side was recorded before the <canal>.<block><L|R> naming existed: rename them and their hectares to match.
UPDATE "irrigation_blocks" b
SET "code" = c."canal_number" || '.' || b."block_number" || CASE b."side" WHEN 'LEFT' THEN 'L' ELSE 'R' END
FROM "irrigation_canals" c
WHERE c."id" = b."canal_id" AND b."side" IS NOT NULL
  AND b."code" <> c."canal_number" || '.' || b."block_number" || CASE b."side" WHEN 'LEFT' THEN 'L' ELSE 'R' END
  AND NOT EXISTS (
    SELECT 1 FROM "irrigation_blocks" o
    WHERE o."canal_id" = b."canal_id" AND o."id" <> b."id"
      AND o."code" = c."canal_number" || '.' || b."block_number" || CASE b."side" WHEN 'LEFT' THEN 'L' ELSE 'R' END);

UPDATE "irrigation_hectares" h
SET "code" = b."code" || h."hectare_number"
FROM "irrigation_blocks" b
WHERE b."id" = h."block_id" AND b."side" IS NOT NULL AND h."code" <> b."code" || h."hectare_number";
