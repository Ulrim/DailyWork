#!/usr/bin/env bash
# Docker 없이 로컬에서 Supabase 호환 백엔드를 띄운다 (개발·자동화 테스트 전용).
#   PostgreSQL(설치되어 있어야 함) + GoTrue(인증) + PostgREST + 게이트웨이(저장소 대체 구현)
# 사용법: scripts/dev-stack/start.sh [--reset]
#   --reset  개발 DB(culiver_dev)를 지우고 마이그레이션을 처음부터 다시 적용한다.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STACK="$ROOT/.dev-stack"
DB_SUPER_URL="${DEV_DB_SUPER_URL:-postgres://culiver_test:culiver_test@localhost:5432}"
DB_NAME="culiver_dev"
JWT_SECRET="dev-stack-jwt-secret-with-at-least-32-characters"
export PGCONNECT_TIMEOUT=5

[ -x "$STACK/bin/postgrest" ] && [ -x "$STACK/auth/auth" ] || {
  echo "실행 파일이 없습니다. docs/LOCAL_DEV.md 의 '실행 파일 준비'를 참고하세요." >&2; exit 1; }

"$ROOT/scripts/dev-stack/stop.sh" >/dev/null 2>&1 || true
mkdir -p "$STACK/logs" "$STACK/storage"

if [ "${1:-}" = "--reset" ]; then
  psql "$DB_SUPER_URL/postgres" -qc "drop database if exists $DB_NAME with (force)"
  rm -rf "$STACK/storage"/*
fi
FRESH=0
if ! psql "$DB_SUPER_URL/postgres" -Atc "select 1 from pg_database where datname='$DB_NAME'" | grep -q 1; then
  psql "$DB_SUPER_URL/postgres" -qc "create database $DB_NAME"
  FRESH=1
fi
psql "$DB_SUPER_URL/$DB_NAME" -q -v ON_ERROR_STOP=1 -f "$ROOT/scripts/dev-stack/init.sql" >/dev/null

# 1) 인증 서버: 스키마 마이그레이션 후 기동
export GOTRUE_DB_DRIVER=postgres
export GOTRUE_DB_DATABASE_URL="postgres://supabase_auth_admin:devstack@localhost:5432/$DB_NAME?search_path=auth"
export DB_NAMESPACE=auth
export GOTRUE_JWT_SECRET="$JWT_SECRET" GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated
export GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated GOTRUE_JWT_ADMIN_ROLES=service_role
export GOTRUE_SITE_URL="http://localhost:3000" API_EXTERNAL_URL="http://127.0.0.1:54321/auth/v1"
export GOTRUE_API_HOST=127.0.0.1 PORT=9999
export GOTRUE_DISABLE_SIGNUP=true GOTRUE_MAILER_AUTOCONFIRM=true GOTRUE_EXTERNAL_EMAIL_ENABLED=true
export GOTRUE_RATE_LIMIT_TOKEN_REFRESH=10000 GOTRUE_RATE_LIMIT_VERIFY=10000
(cd "$STACK/auth" && ./auth migrate >"$STACK/logs/auth-migrate.log" 2>&1) || {
  echo "인증 서버 마이그레이션 실패: $STACK/logs/auth-migrate.log" >&2; exit 1; }
(cd "$STACK/auth" && nohup ./auth serve >"$STACK/logs/auth.log" 2>&1 & echo $! >"$STACK/auth.pid")

# 2) 앱 마이그레이션 (새 DB 일 때만)
if [ "$FRESH" = 1 ]; then
  for f in "$ROOT"/supabase/migrations/*.sql; do
    psql "$DB_SUPER_URL/$DB_NAME" -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null
    echo "적용: $(basename "$f")"
  done
fi

# 3) PostgREST
PGRST_DB_URI="postgres://authenticator:devstack@localhost:5432/$DB_NAME" \
PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon PGRST_JWT_SECRET="$JWT_SECRET" \
PGRST_SERVER_HOST=127.0.0.1 PGRST_SERVER_PORT=3001 PGRST_DB_POOL=10 \
  nohup "$STACK/bin/postgrest" >"$STACK/logs/postgrest.log" 2>&1 &
echo $! >"$STACK/postgrest.pid"

# 4) 게이트웨이
JWT_SECRET="$JWT_SECRET" STORAGE_DIR="$STACK/storage" DATABASE_URL="$DB_SUPER_URL/$DB_NAME" \
  nohup node "$ROOT/scripts/dev-stack/gateway.mjs" >"$STACK/logs/gateway.log" 2>&1 &
echo $! >"$STACK/gateway.pid"

for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:54321/auth/v1/health >/dev/null 2>&1 \
     && curl -sf http://127.0.0.1:3001/ >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -sf http://127.0.0.1:54321/auth/v1/health >/dev/null || { echo "기동 실패: $STACK/logs 확인" >&2; exit 1; }

node "$ROOT/scripts/dev-stack/keys.mjs" "$JWT_SECRET" | tee "$STACK/env.out"
