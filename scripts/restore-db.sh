#!/usr/bin/env bash
# 데이터베이스 복원. 대상 DB 의 public 데이터를 백업 시점으로 되돌린다.
#   SUPABASE_DB_URL="postgresql://..." scripts/restore-db.sh backups/culiver-db-YYYYMMDD-HHMMSS.dump [--data-only]
# 기본: public 스키마를 지우고 구조+데이터를 복원한다(같은 프로젝트의 사고 복구용).
# --data-only: 마이그레이션이 적용된 새 프로젝트에 계정(auth)과 데이터만 넣는다(이전·복제용).
set -euo pipefail
: "${SUPABASE_DB_URL:?SUPABASE_DB_URL 환경변수에 DB 접속 주소를 지정하세요}"
FILE="${1:?복원할 백업 파일을 지정하세요}"
MODE="${2:-}"
[ -f "$FILE" ] || { echo "파일이 없습니다: $FILE" >&2; exit 1; }
read -r -p "대상 DB 의 데이터를 '$FILE' 내용으로 덮어씁니다. 계속하려면 RESTORE 를 입력하세요: " answer
[ "$answer" = "RESTORE" ] || { echo "취소했습니다."; exit 1; }

if [ "$MODE" = "--data-only" ]; then
  # 트리거(이력 기록·상태 보호)를 끄고 데이터만 넣는다
  pg_restore --dbname="$SUPABASE_DB_URL" --data-only --disable-triggers --no-owner --no-privileges \
    --schema=auth --schema=public --schema=storage --single-transaction "$FILE"
else
  pg_restore --dbname="$SUPABASE_DB_URL" --clean --if-exists --no-owner --no-privileges \
    --schema=public --single-transaction "$FILE"
fi
echo "복원 완료"
