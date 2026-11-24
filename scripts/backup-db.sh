#!/usr/bin/env bash
# 데이터베이스 백업 (앱 데이터 + 계정). 사용법은 docs/BACKUP_RESTORE.md 참고.
#   SUPABASE_DB_URL="postgresql://postgres:[비밀번호]@db.[프로젝트].supabase.co:5432/postgres" scripts/backup-db.sh [저장 폴더]
set -euo pipefail
: "${SUPABASE_DB_URL:?SUPABASE_DB_URL 환경변수에 DB 접속 주소를 지정하세요}"
OUT_DIR="${1:-backups}"
STAMP="$(TZ=Asia/Seoul date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT_DIR"
FILE="$OUT_DIR/culiver-db-$STAMP.dump"
# public: 앱 데이터 / auth: 로그인 계정 / storage: 사진 목록(메타데이터). 사진 파일 자체는 backup-photos.mjs 로 받는다.
pg_dump "$SUPABASE_DB_URL" --format=custom --no-owner --no-privileges \
  --schema=public --schema=auth --schema=storage --file="$FILE"
echo "백업 완료: $FILE ($(du -h "$FILE" | cut -f1))"
