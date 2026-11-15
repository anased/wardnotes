#!/usr/bin/env bash
# Runs the topic migration and its tests against a throwaway local Postgres
# database (wn_test). Needs a local Postgres 15+ and a "postgres" superuser.
#   bash scripts/db-tests/run-topics-tests.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -U "${PGUSER:-postgres}")
"${PSQL[@]}" -d postgres < scripts/db-tests/supabase_shim.sql
"${PSQL[@]}" -d wn_test < src/lib/supabase/migrations/add_topics.sql 2>/dev/null
"${PSQL[@]}" -d wn_test < src/lib/supabase/migrations/add_topics.sql 2>/dev/null   # re-run is safe
"${PSQL[@]}" -d wn_test < scripts/db-tests/topics_test.sql 2>&1 | grep -E '^(psql:.*)?(NOTICE|ERROR)' | sed 's/^psql:[^ ]* //'
echo "All topic migration checks passed."
