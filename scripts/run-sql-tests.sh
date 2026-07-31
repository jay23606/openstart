#!/usr/bin/env bash
#
# Apply every migration to a throwaway Postgres, then run the transactional SQL
# tests against it. These cover the database-side rules the browser cannot be
# trusted with — capacity, duplicate registrations, lottery draws, suspension,
# and server-side discovery — none of which the JavaScript suite can reach.
#
# Usage: DATABASE_URL=postgres://... scripts/run-sql-tests.sh
set -euo pipefail

DATABASE_URL="${DATABASE_URL:-postgres://postgres:postgres@localhost:5432/postgres}"
psql_run() { psql -v ON_ERROR_STOP=1 -q --no-psqlrc "$DATABASE_URL" -f "$1"; }

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

echo "==> Bootstrapping Supabase-provided objects"
psql_run supabase/tests/bootstrap.sql

echo "==> Applying migrations"
for migration in supabase/migrations/*.sql; do
  echo "    $(basename "$migration")"
  psql_run "$migration"
done

echo "==> Seeding fixtures"
psql_run supabase/tests/fixtures.sql

echo "==> Running SQL tests"
failed=0
for suite in supabase/tests/*.sql; do
  case "$(basename "$suite")" in
    bootstrap.sql|fixtures.sql) continue ;;
  esac
  printf '    %-36s' "$(basename "$suite")"
  if psql_run "$suite" >/dev/null 2>/tmp/sql-test-error; then
    echo "ok"
  else
    echo "FAILED"
    sed 's/^/        /' /tmp/sql-test-error
    failed=1
  fi
done

if [ "$failed" -ne 0 ]; then
  echo "==> SQL tests failed"
  exit 1
fi
echo "==> All SQL tests passed"
