#!/usr/bin/env bash
# 데이터베이스 복원. docs/BACKUP_RESTORE.md 참고.
#   SUPABASE_DB_URL="postgresql://..." scripts/restore-db.sh <백업 파일> [--with-accounts]
#
# 기본: 앱 데이터(public 스키마)를 백업 시점으로 되돌린다. 같은 프로젝트의 사고 복구용.
#       테이블 구조·권한 정책은 건드리지 않고 데이터만 교체하며, 전체가 한 트랜잭션이라 실패하면 아무것도 바뀌지 않는다.
# --with-accounts: 로그인 계정(auth.users, auth.identities)까지 함께 넣는다.
#       마이그레이션만 적용된 "비어 있는 새 프로젝트"로 이전·복제할 때 쓴다.
set -euo pipefail
: "${SUPABASE_DB_URL:?SUPABASE_DB_URL 환경변수에 DB 접속 주소를 지정하세요}"
FILE="${1:?복원할 백업 파일을 지정하세요}"
MODE="${2:-}"
[ -f "$FILE" ] || { echo "파일이 없습니다: $FILE" >&2; exit 1; }
[ -z "$MODE" ] || [ "$MODE" = "--with-accounts" ] || { echo "알 수 없는 옵션: $MODE" >&2; exit 1; }

if [ "$MODE" = "--with-accounts" ]; then
  USERS="$(psql "$SUPABASE_DB_URL" -Atc "select count(*) from auth.users")"
  [ "$USERS" = "0" ] || { echo "대상 DB 에 이미 계정이 $USERS 개 있습니다. --with-accounts 는 비어 있는 새 프로젝트에만 사용합니다." >&2; exit 1; }
fi
read -r -p "대상 DB 의 앱 데이터를 '$FILE' 내용으로 교체합니다. 계속하려면 RESTORE 를 입력하세요: " answer
[ "$answer" = "RESTORE" ] || { echo "취소했습니다."; exit 1; }

TABLES="$(psql "$SUPABASE_DB_URL" -Atc "select string_agg(format('%I.%I', schemaname, tablename), ', ') from pg_tables where schemaname = 'public'")"
[ -n "$TABLES" ] || { echo "대상 DB 에 테이블이 없습니다. 먼저 마이그레이션을 적용하세요." >&2; exit 1; }

{
  echo "begin;"
  # 복원 중에는 트리거(이력 기록, 상태 보호, 알림)와 외래키 검사를 끈다
  echo "set local session_replication_role = replica;"
  echo "truncate table $TABLES;"
  if [ "$MODE" = "--with-accounts" ]; then
    pg_restore --data-only --schema=auth --table=users --table=identities --file=- "$FILE"
  fi
  pg_restore --data-only --schema=public --file=- "$FILE"
  echo "commit;"
} | psql "$SUPABASE_DB_URL" --quiet --set ON_ERROR_STOP=1 >/dev/null
echo "복원 완료"
