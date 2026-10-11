-- The rice calendar farmers see in the mobile app is now one platform calendar, edited by Super
-- Admin (mamcos_id NULL). Cooperatives keep their own calendars (mamcos_id set), which no longer
-- generate the farmers' task schedules.
ALTER TABLE "rice_protocols" ALTER COLUMN "mamcos_id" DROP NOT NULL;

-- Keep today's behaviour on existing installs: promote the most recently updated active
-- cooperative calendar to be the platform calendar, so farmers' schedules do not suddenly stop.
INSERT INTO "rice_protocols" ("id", "mamcos_id", "name", "version", "is_active", "task_definitions", "created_at", "updated_at")
SELECT gen_random_uuid()::text, NULL, "name", 1, true, "task_definitions", now(), now()
FROM "rice_protocols"
WHERE "is_active" = true AND "mamcos_id" IS NOT NULL
ORDER BY "updated_at" DESC
LIMIT 1;
