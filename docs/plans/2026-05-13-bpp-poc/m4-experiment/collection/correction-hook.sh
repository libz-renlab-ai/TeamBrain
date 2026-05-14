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

KEYWORDS_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/correction-keywords.txt"
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
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/daily" && pwd)"
mkdir -p "$ROOT/$TODAY"
FILE="$ROOT/$TODAY/$MEMBER.jsonl"
HASH="$(printf '%s' "$TEXT" | sha256sum | cut -c1-16)"
printf '{"type":"ai-correction","ts":"%s","member_id":"%s","task_slug":"%s","transcript_snippet_hash":"sha256:%s","matched_keyword":"%s"}\n' \
  "$TS" "$MEMBER" "$TASK" "$HASH" "$matched" >> "$FILE"
