#!/usr/bin/env bash
set -euo pipefail
# Disposable development PostgreSQL only. Never uses production credentials.
if docker container inspect maksim-postgres >/dev/null 2>&1; then
  docker start maksim-postgres >/dev/null
else
  docker run -d --name maksim-postgres -e POSTGRES_USER=maksim -e POSTGRES_PASSWORD=local-development-only -e POSTGRES_DB=maksim -p 127.0.0.1:5432:5432 -v maksim-postgres-data:/var/lib/postgresql/data postgres:17-alpine >/dev/null
fi
for attempt in {1..30}; do
  if docker exec maksim-postgres pg_isready -U maksim -d maksim >/dev/null 2>&1; then
    if [ "$(docker exec maksim-postgres psql -U maksim -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='maksim_test'")" != "1" ]; then
      docker exec maksim-postgres createdb -U maksim maksim_test
    fi
    echo 'Local PostgreSQL and test database available'
    exit 0
  fi
  sleep 1
done
echo 'Local PostgreSQL did not become ready' >&2
exit 1
