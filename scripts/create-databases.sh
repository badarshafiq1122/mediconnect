#!/usr/bin/env bash
# Creates the local Postgres databases MediConnect uses (idempotent). Override PGHOST/PGPORT/PGUSER as needed.
set -euo pipefail
HOST="${PGHOST:-localhost}"; PORT="${PGPORT:-5432}"; USER_NAME="${PGUSER:-$(whoami)}"
for db in mediconnect mediconnect_test mediconnect_e2e; do
  if psql -h "$HOST" -p "$PORT" -U "$USER_NAME" -d postgres -Atc "select 1 from pg_database where datname='$db'" | grep -q 1; then
    echo "exists:  $db"
  else
    psql -h "$HOST" -p "$PORT" -U "$USER_NAME" -d postgres -c "create database $db" >/dev/null
    echo "created: $db"
  fi
done
