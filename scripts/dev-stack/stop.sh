#!/usr/bin/env bash
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
for name in gateway postgrest auth; do
  f="$ROOT/.dev-stack/$name.pid"
  [ -f "$f" ] && kill "$(cat "$f")" 2>/dev/null
  rm -f "$f"
done
# pid 파일 없이 남은 프로세스 정리
pkill -f "^./auth serve$" 2>/dev/null
pkill -f "$ROOT/.dev-stack/bin/postgrest" 2>/dev/null
pkill -f "$ROOT/scripts/dev-stack/gateway.mjs" 2>/dev/null
sleep 1
echo "dev-stack 중지"
