#!/usr/bin/env bash
# Rebuilds the throw-away Postgres schema `irrigation_test` by replaying every Prisma migration into it,
# so the irrigation integration tests run against the real constraints and triggers without touching `public`.
#
#   scripts/irrigation-test-schema.sh            # create / recreate
#   scripts/irrigation-test-schema.sh drop       # remove
#
# Reads DATABASE_URL from the environment or backend/.env. Needs psql. Then run the tests with:
#   IRRIGATION_TEST_DATABASE_URL="$DATABASE_URL" npx jest irrigation.integration
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -z "${DATABASE_URL:-}" ] && [ -f .env ]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"')"
fi
[ -n "${DATABASE_URL:-}" ] || { echo "DATABASE_URL is not set" >&2; exit 1; }
URL="${DATABASE_URL%%\?*}"
SCHEMA=irrigation_test
psql "$URL" -q -c "DROP SCHEMA IF EXISTS $SCHEMA CASCADE" 2>/dev/null
[ "${1:-}" = "drop" ] && { echo "dropped $SCHEMA"; exit 0; }
psql "$URL" -q -c "CREATE SCHEMA $SCHEMA"
for dir in prisma/migrations/*/; do
  sed "s/\"public\"\./\"$SCHEMA\"./g" "$dir/migration.sql" \
    | PGOPTIONS="-c search_path=$SCHEMA" psql "$URL" -q -v ON_ERROR_STOP=1 -o /dev/null \
    || { echo "migration failed: $dir" >&2; exit 1; }
done
echo "$SCHEMA ready ($(psql "$URL" -tAc "select count(*) from information_schema.tables where table_schema='$SCHEMA'") tables)"
