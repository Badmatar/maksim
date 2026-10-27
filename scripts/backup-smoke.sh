#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .local
restore_db="maksim_restore_$(date +%s)_test"
created=false
cleanup() { if [ "$created" = true ]; then docker exec maksim-postgres dropdb -U maksim "$restore_db"; fi; }
trap cleanup EXIT
# Fixed local development container; never takes a production connection string.
docker exec maksim-postgres pg_dump -U maksim -d maksim --format=custom > .local/local-backup.dump
docker exec maksim-postgres createdb -U maksim "$restore_db"
created=true
docker exec -i maksim-postgres pg_restore -U maksim -d "$restore_db" --no-owner --no-acl < .local/local-backup.dump
check_sql='SELECT (SELECT COUNT(*) FROM "Setting"), (SELECT COUNT(*) FROM "AuditLog"), (SELECT COUNT(*) FROM "Product"), (SELECT COUNT(*) FROM "Order"), (SELECT COUNT(*) FROM "Entitlement"), (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '\''public'\'')'
source_counts=$(docker exec maksim-postgres psql -U maksim -d maksim -tAc "$check_sql")
restored_counts=$(docker exec maksim-postgres psql -U maksim -d "$restore_db" -tAc "$check_sql")
if [ "$source_counts" != "$restored_counts" ]; then echo 'Restored counts differ' >&2; exit 1; fi
echo 'Local pg_dump/pg_restore smoke passed; schema and selected entity counts match'
