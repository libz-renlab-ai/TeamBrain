#!/usr/bin/env bash
# Usage: end-task.sh <task-slug> --result=pass|fail [--rating=<1-5>]
# Writes a task-end event. duration_ms is computed from last task-start in the file.
set -euo pipefail
TASK=""
RESULT=""
RATING=""
for arg in "$@"; do
  case "$arg" in
    --result=*) RESULT="${arg#--result=}" ;;
    --rating=*) RATING="${arg#--rating=}" ;;
    -*)         echo "unknown flag: $arg" >&2; exit 2 ;;
    *)          TASK="$arg" ;;
  esac
done
[[ -n "$TASK" ]]   || { echo "task slug required" >&2; exit 2; }
# Task slug must be a safe identifier: it is later used in grep patterns,
# file paths, and JSON. Reject anything outside [a-z0-9-] to close regex-
# injection / path-traversal vectors before they reach grep / printf.
[[ "$TASK" =~ ^[a-z0-9][a-z0-9-]*$ ]] || { echo "task slug must match ^[a-z0-9][a-z0-9-]*$" >&2; exit 2; }
[[ -n "$RESULT" ]] || { echo "--result=pass|fail required" >&2; exit 2; }
[[ "$RESULT" == "pass" || "$RESULT" == "fail" ]] || { echo "result must be pass|fail" >&2; exit 2; }

if [[ -z "$RATING" ]]; then
  read -r -p "Subjective rating for this task (1-5, blank = skip): " RATING || true
fi
if [[ -n "$RATING" ]] && [[ ! "$RATING" =~ ^[1-5]$ ]]; then
  echo "rating must be 1-5 (or blank)" >&2; exit 2
fi

MEMBER="${BPP_MEMBER_ID:?BPP_MEMBER_ID env var required}"
GROUP="${BPP_GROUP:?BPP_GROUP env var required}"
TODAY="$(date -u +%Y-%m-%d)"
TS="$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=jsonl-lib.sh
source "$HERE/jsonl-lib.sh"
require_safe_member "$MEMBER"
require_safe_group "$GROUP"
FILE="$HERE/daily/$TODAY/$MEMBER.jsonl"

# Look back for the most recent task-start for this task, compute duration_ms.
# $TASK is validated to ^[a-z0-9-]+$ above, so it is safe as a literal grep -F
# needle; we match the exact JSON fragment rather than an -E regex.
START_TS="$(grep -F "\"task_slug\":\"$TASK\"" "$FILE" | grep -F '"type":"task-start"' | tail -1 \
  | sed -E 's/.*"ts":"([^"]+)".*/\1/' || true)"
if [[ -z "$START_TS" ]]; then
  echo "no matching task-start for $TASK in $FILE" >&2; exit 3
fi
# Pass timestamps through argv, not string interpolation, so a corrupted
# JSONL line cannot inject Python.
DURATION_MS="$(python3 -c "
import sys, datetime as dt
a=dt.datetime.fromisoformat(sys.argv[1].replace('Z','+00:00'))
b=dt.datetime.fromisoformat(sys.argv[2].replace('Z','+00:00'))
print(int((b-a).total_seconds()*1000))
" "$START_TS" "$TS")"

QSCORE_SH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/quality-score.sh"
QSCORE="null"
if [[ -x "$QSCORE_SH" ]]; then
  if score="$("$QSCORE_SH" "$TASK" 2>/dev/null)"; then
    if [[ "$score" =~ ^[0-9.]+$ ]]; then QSCORE="$score"; fi
  fi
fi

RATING_JSON="null"
[[ -n "$RATING" ]] && RATING_JSON="$RATING"

LINE="$(printf '{"type":"task-end","ts":"%s","member_id":"%s","task_slug":"%s","group":"%s","result":"%s","duration_ms":%s,"subjective_rating":%s,"code_quality_score":%s}' \
  "$TS" "$MEMBER" "$TASK" "$GROUP" "$RESULT" "$DURATION_MS" "$RATING_JSON" "$QSCORE")"
append_jsonl "$FILE" "$LINE"
echo "task-end logged → $FILE"
