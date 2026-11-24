#!/usr/bin/env bash
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
for name in gateway postgrest auth; do
  f="$ROOT/.dev-stack/$name.pid"
  [ -f "$f" ] && kill "$(cat "$f")" 2>/dev/null
  rm -f "$f"
done
echo "dev-stack 중지"
