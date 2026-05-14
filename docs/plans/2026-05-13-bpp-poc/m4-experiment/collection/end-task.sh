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
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/daily" && pwd)"
FILE="$ROOT/$TODAY/$MEMBER.jsonl"

# Look back for the most recent task-start for this task, compute duration_ms
START_TS="$(grep -E "\"type\":\"task-start\".*\"task_slug\":\"$TASK\"" "$FILE" | tail -1 \
  | sed -E 's/.*"ts":"([^"]+)".*/\1/' || true)"
if [[ -z "$START_TS" ]]; then
  echo "no matching task-start for $TASK in $FILE" >&2; exit 3
fi
DURATION_MS="$(python3 -c "
import sys, datetime as dt
a=dt.datetime.fromisoformat('$START_TS'.replace('Z','+00:00'))
b=dt.datetime.fromisoformat('$TS'.replace('Z','+00:00'))
print(int((b-a).total_seconds()*1000))
")"

QSCORE_SH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/quality-score.sh"
QSCORE="null"
if [[ -x "$QSCORE_SH" ]]; then
  if score="$("$QSCORE_SH" "$TASK" 2>/dev/null)"; then
    if [[ "$score" =~ ^[0-9.]+$ ]]; then QSCORE="$score"; fi
  fi
fi

RATING_JSON="null"
[[ -n "$RATING" ]] && RATING_JSON="$RATING"

printf '{"type":"task-end","ts":"%s","member_id":"%s","task_slug":"%s","group":"%s","result":"%s","duration_ms":%s,"subjective_rating":%s,"code_quality_score":%s}\n' \
  "$TS" "$MEMBER" "$TASK" "$GROUP" "$RESULT" "$DURATION_MS" "$RATING_JSON" "$QSCORE" >> "$FILE"
echo "task-end logged → $FILE"
