#!/usr/bin/env bash
# Usage: start-task.sh <task-slug>
# Writes a task-start event to today's JSONL for the current member.
set -euo pipefail
TASK="${1:?task slug required (e.g. 01-parse-duration)}"
MEMBER="${BPP_MEMBER_ID:?BPP_MEMBER_ID env var required}"
GROUP="${BPP_GROUP:?BPP_GROUP env var required (mining-enabled|mining-disabled)}"
TODAY="$(date -u +%Y-%m-%d)"
TS="$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/daily" && pwd)"
mkdir -p "$ROOT/$TODAY"
FILE="$ROOT/$TODAY/$MEMBER.jsonl"
printf '{"type":"task-start","ts":"%s","member_id":"%s","task_slug":"%s","group":"%s"}\n' \
  "$TS" "$MEMBER" "$TASK" "$GROUP" >> "$FILE"
echo "task-start logged → $FILE"
