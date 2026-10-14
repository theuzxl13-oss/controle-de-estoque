#!/usr/bin/env bash
# Executa as migrations e os testes SQL em um PostgreSQL temporário.
#   npm run test:db
# Requer os binários do PostgreSQL 15+ (initdb, pg_ctl, psql) no PATH ou em
# /usr/lib/postgresql/<versão>/bin. Se executado como root, usa o usuário
# "postgres" do sistema.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v initdb 2>/dev/null || ls -d /usr/lib/postgresql/*/bin/initdb | sort -V | tail -1)")}"
WORK="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"

run() {
  if [ "$(id -u)" = "0" ]; then runuser -u postgres -- "$@"; else "$@"; fi
}

chmod 777 "$WORK"
cleanup() { run "$PG_BIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

run "$PG_BIN/initdb" -D "$WORK/data" -U postgres --auth=trust -E UTF8 --locale=C.UTF-8 >/dev/null
run "$PG_BIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/log" -w start >/dev/null

PSQL=(run "$PG_BIN/psql" -h "$WORK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)

"${PSQL[@]}" -f "$ROOT/tests/db/_supabase_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "→ migration $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done

status=0
for f in "$ROOT"/tests/db/[0-9]*.sql; do
  echo "→ teste $(basename "$f")"
  if ! "${PSQL[@]}" -t -A -f "$f" 2>&1 | { grep -vE '^$|^[0-9a-f-]{36}$' || true; } | sed -E 's/^psql:[^ ]+ (NOTICE|ERROR): +/  \1: /'; then status=1; fi
done

if [ $status -eq 0 ]; then echo "✔ Todos os testes de banco passaram."; else echo "✘ Falhas nos testes de banco."; fi
exit $status
