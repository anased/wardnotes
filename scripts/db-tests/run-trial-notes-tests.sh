#!/usr/bin/env bash
# End-to-end test of scripts/trial-notes against a throwaway local Postgres
# database (wn_test): dry run, commit, re-run (idempotent, keeps app edits)
# and rollback. Needs Node and a local Postgres 15+ superuser.
#   bash scripts/db-tests/run-trial-notes-tests.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -U "${PGUSER:-postgres}")
T=scripts/db-tests/trial-notes
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
node scripts/trial-notes/trial-notes.mjs check "$T/mapping.csv"
node scripts/trial-notes/trial-notes.mjs apply "$T/mapping.csv" > "$TMP/dry.sql"
node scripts/trial-notes/trial-notes.mjs apply "$T/mapping.csv" --commit > "$TMP/commit.sql"

"${PSQL[@]}" -d postgres < scripts/db-tests/supabase_shim.sql
"${PSQL[@]}" -d wn_test < src/lib/supabase/migrations/add_topics.sql 2>/dev/null
"${PSQL[@]}" -d wn_test < "$T/seed.sql"

state() { "${PSQL[@]}" -d wn_test -tAc "SELECT (SELECT count(*) FROM trials) || '/' || (SELECT count(*) FROM trial_topics) || '/' || (SELECT count(*) FROM note_links) || '/' || (SELECT count(*) FROM notes WHERE content_type = 'trial')"; }
before=$(state)
"${PSQL[@]}" -d wn_test -A -F '|' < "$TMP/dry.sql" > "$TMP/dry.out"
[ "$(state)" = "$before" ] || { echo 'dry run changed data'; exit 1; }
[ "$("${PSQL[@]}" -d wn_test -tAc "SELECT to_regclass('backup.trials_pre_trialnotes') IS NULL")" = t ] || { echo 'dry run kept a snapshot'; exit 1; }
echo 'OK dry run changes nothing'
expect() { grep -q "$1" "$TMP/dry.out" || { cat "$TMP/dry.out"; echo "report: missing $1"; exit 1; }; }
expect '^1|summary|trials created|3$'
expect '^1|summary|trials reused|2$'
expect '^1|summary|notes retyped|4$'
expect '^1|summary|notes still typed Trial|1$'
expect '^2|note not found (row ignored)|GHOST / '
expect '^4|still typed Trial|The extended window trials|skipped in the mapping$'
echo 'OK dry run report'

run() {
  local out
  out=$("${PSQL[@]}" -d wn_test "$@" 2>&1 | grep -E '^(psql:.*)?(NOTICE|ERROR)' | grep -v 'already exists, skipping' | sed 's/^psql:[^ ]* //' || true)
  echo "$out"
  if grep -q ERROR <<<"$out"; then echo 'FAILED'; exit 1; fi
}
"${PSQL[@]}" -d wn_test < "$TMP/commit.sql" > /dev/null
run < "$T/checks.sql"
"${PSQL[@]}" -d wn_test < "$TMP/commit.sql" > /dev/null 2>&1
run < "$T/checks-rerun.sql"
sed 's/^ROLLBACK;.*/COMMIT;/' scripts/trial-notes/rollback.sql | "${PSQL[@]}" -d wn_test > /dev/null
run < "$T/checks-rollback.sql"
echo "All trial-notes migration checks passed."
