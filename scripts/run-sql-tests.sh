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

# This script applies migrations and seeds fixtures, and fixtures.sql grants a
# platform owner role. Those writes are not transactional and would be real if
# aimed at a live project, so refuse anything that is not a local throwaway.
# The suites themselves are begin/rollback and remain safe to paste into the
# Supabase SQL editor by hand against a populated database.
case "$DATABASE_URL" in
  *@localhost:*|*@127.0.0.1:*|*@postgres:*) ;;
  *)
    # Report only the host: the URL carries a password.
    echo "Refusing to run against a non-local database:" >&2
    echo "  host ${DATABASE_URL##*@}" >&2
    echo "This harness seeds fixtures (including a platform owner) and is meant" >&2
    echo "for a disposable Postgres. Point DATABASE_URL at localhost." >&2
    exit 1
    ;;
esac

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
