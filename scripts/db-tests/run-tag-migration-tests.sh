#!/usr/bin/env bash
# End-to-end test of scripts/tag-migration against a throwaway local Postgres
# database (wn_test): dry run, commit, re-run (idempotent, keeps app edits)
# and rollback. Needs Node and a local Postgres 15+ superuser.
#   bash scripts/db-tests/run-tag-migration-tests.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -U "${PGUSER:-postgres}")
T=scripts/db-tests/tag-migration
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
node scripts/tag-migration/tag-migration.mjs check "$T/mapping.csv"
node scripts/tag-migration/tag-migration.mjs apply "$T/mapping.csv" > "$TMP/dry.sql"
node scripts/tag-migration/tag-migration.mjs apply "$T/mapping.csv" --commit > "$TMP/commit.sql"

"${PSQL[@]}" -d postgres < scripts/db-tests/supabase_shim.sql
"${PSQL[@]}" -d wn_test < src/lib/supabase/migrations/add_topics.sql 2>/dev/null
"${PSQL[@]}" -d wn_test < "$T/seed.sql"

"${PSQL[@]}" -d wn_test < "$TMP/dry.sql" > /dev/null
[ "$("${PSQL[@]}" -d wn_test -tAc 'SELECT count(*) FROM note_topics')" = 0 ] || { echo 'dry run changed data'; exit 1; }
echo 'OK dry run changes nothing'

run() { "${PSQL[@]}" -d wn_test "$@" 2>&1 | grep -E '^(psql:.*)?(NOTICE|ERROR)' | sed 's/^psql:[^ ]* //' || true; }
"${PSQL[@]}" -d wn_test < "$TMP/commit.sql" > /dev/null
run < "$T/checks.sql"
"${PSQL[@]}" -d wn_test < "$TMP/commit.sql" > /dev/null
run < "$T/checks-rerun.sql"
sed 's/^ROLLBACK;.*/COMMIT;/' scripts/tag-migration/rollback.sql | "${PSQL[@]}" -d wn_test > /dev/null
run < "$T/checks-rollback.sql"
echo "All tag migration checks passed."
