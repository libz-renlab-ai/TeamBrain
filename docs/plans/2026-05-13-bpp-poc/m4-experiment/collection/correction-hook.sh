#!/usr/bin/env bash
# Hook intended to be wired into Claude Code's UserPromptSubmit event so any
# user message containing a "correction keyword" emits an ai-correction event
# to the day's JSONL.
#
# Wire-up: settings.json hook entry pointing to this script.
# Reads $CLAUDE_PROMPT (user message text) from env or first arg.
set -euo pipefail
TEXT="${CLAUDE_PROMPT:-${1:-}}"
[[ -n "$TEXT" ]] || exit 0

MEMBER="${BPP_MEMBER_ID:-}"
[[ -n "$MEMBER" ]] || exit 0
TASK="${BPP_CURRENT_TASK:-unknown}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=jsonl-lib.sh
source "$HERE/jsonl-lib.sh"
# This runs from a UserPromptSubmit hook — env vars are not fully trusted.
# Validate before either value reaches printf-built JSON. A bad value here
# means "skip silently" (exit 0), not "crash the user's prompt".
[[ "$MEMBER" =~ ^[A-Za-z0-9._@-]+$ ]] || exit 0
[[ "$TASK" == "unknown" || "$TASK" =~ ^[a-z0-9][a-z0-9-]*$ ]] || TASK="unknown"

KEYWORDS_FILE="$HERE/correction-keywords.txt"
[[ -f "$KEYWORDS_FILE" ]] || exit 0

matched=""
while IFS= read -r kw; do
  [[ -n "$kw" ]] || continue
  if printf '%s' "$TEXT" | grep -q -F -- "$kw"; then
    matched="$kw"
    break
  fi
done < "$KEYWORDS_FILE"

[[ -n "$matched" ]] || exit 0

TODAY="$(date -u +%Y-%m-%d)"
TS="$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)"
FILE="$HERE/daily/$TODAY/$MEMBER.jsonl"
HASH="$(printf '%s' "$TEXT" | sha256sum | cut -c1-16)"
LINE="$(printf '{"type":"ai-correction","ts":"%s","member_id":"%s","task_slug":"%s","transcript_snippet_hash":"sha256:%s","matched_keyword":"%s"}' \
  "$TS" "$MEMBER" "$TASK" "$HASH" "$matched")"
append_jsonl "$FILE" "$LINE"
