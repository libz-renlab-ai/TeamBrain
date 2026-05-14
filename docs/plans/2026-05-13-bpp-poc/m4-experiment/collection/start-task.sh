#!/usr/bin/env bash
# Usage: start-task.sh <task-slug>
# Writes a task-start event to today's JSONL for the current member.
set -euo pipefail
TASK="${1:?task slug required (e.g. 01-parse-duration)}"
# Task slug must be a safe identifier (used in grep patterns / file paths / JSON downstream).
[[ "$TASK" =~ ^[a-z0-9][a-z0-9-]*$ ]] || { echo "task slug must match ^[a-z0-9][a-z0-9-]*$" >&2; exit 2; }
MEMBER="${BPP_MEMBER_ID:?BPP_MEMBER_ID env var required}"
GROUP="${BPP_GROUP:?BPP_GROUP env var required (mining-enabled|mining-disabled)}"
TODAY="$(date -u +%Y-%m-%d)"
TS="$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=jsonl-lib.sh
source "$HERE/jsonl-lib.sh"
require_safe_member "$MEMBER"
require_safe_group "$GROUP"
FILE="$HERE/daily/$TODAY/$MEMBER.jsonl"
LINE="$(printf '{"type":"task-start","ts":"%s","member_id":"%s","task_slug":"%s","group":"%s"}' \
  "$TS" "$MEMBER" "$TASK" "$GROUP")"
append_jsonl "$FILE" "$LINE"
echo "task-start logged → $FILE"
