#!/bin/bash
# laziness-self-report.sh — Stop hook that forces Claude to self-attest 6 laziness bools.
#
# Logic:
#   A) Last assistant message has no <laziness-self-report> block         → block + template hint
#   B) Block present but malformed (missing field / bad value)            → block + template hint
#   C) Block parses cleanly, any of the 6 bools = true                    → block + list signals
#   D) Block parses cleanly, all 6 = false                                → approve (silent)
#
# Side effects: best-effort append of one JSON line per Stop event.
# Inspired by: https://github.com/anthropics/claude-code/issues/42796

set -uo pipefail

# Read hook input from stdin (Claude Code feeds JSON here)
input=$(cat)

transcript_path=$(echo "$input" | jq -r '.transcript_path // empty')
session_id=$(echo "$input" | jq -r '.session_id // "unknown"')
ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Logging must never break hook enforcement. Use an explicit override when
# provided; otherwise keep logs project-local instead of under user-global $HOME.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
LOG_FILE="${CLAUDE_LAZINESS_LOG_FILE:-}"
if [[ -z "$LOG_FILE" ]]; then
  LOG_DIR="$PROJECT_DIR/.claude/laziness"
  LOG_FILE="$LOG_DIR/log.jsonl"
else
  LOG_DIR="$(dirname "$LOG_FILE")"
fi
if ! mkdir -p "$LOG_DIR" 2>/dev/null; then
  LOG_FILE=""
fi

write_log() {
  [[ -n "$LOG_FILE" ]] || return 0
  cat >> "$LOG_FILE" 2>/dev/null || true
}

# Required template — emitted verbatim in block reasons so Claude can self-correct.
read -r -d '' TEMPLATE <<'EOF' || true
<laziness-self-report>
premature_stopping: <true|false>
permission_seeking: <true|false>
ownership_dodging: <true|false>
simplest_fix: <true|false>
reasoning_loop: <true|false>
known_limitation: <true|false>
</laziness-self-report>
EOF

emit_block_missing() {
  local detail="$1"
  jq -cn \
    --arg ts "$ts" --arg sid "$session_id" \
    --arg detail "$detail" \
    '{ts:$ts, session_id:$sid, report_present:false, action:"block_missing_report", detail:$detail}' \
    | write_log

  jq -n \
    --arg reason "Your last message is missing (or has a malformed) <laziness-self-report> block ($detail). Append this exact block to the END of every message before stopping:

<laziness-self-report>
premature_stopping: <true|false>
permission_seeking: <true|false>
ownership_dodging: <true|false>
simplest_fix: <true|false>
reasoning_loop: <true|false>
known_limitation: <true|false>
</laziness-self-report>

For each of the 6 categories, honestly evaluate whether your last work exhibited that pattern. Re-emit your message with the report appended. If any bool is true, you must continue the work in the same turn instead of stopping." \
    --arg sysmsg "[laziness-guard] BLOCKED: missing or malformed self-report ($detail)" \
    '{decision:"block", reason:$reason, systemMessage:$sysmsg}'
  exit 0
}

emit_block_lazy() {
  local signals_csv="$1"  # e.g. "premature_stopping,ownership_dodging"
  local signals_jq="$2"   # JSON object string

  jq -cn \
    --arg ts "$ts" --arg sid "$session_id" \
    --argjson sig "$signals_jq" \
    --arg signals "$signals_csv" \
    '{ts:$ts, session_id:$sid, report_present:true, lazy_signals:$sig, any_lazy:true, action:"block_lazy", true_signals:$signals}' \
    | write_log

  jq -n \
    --arg reason "Your self-report admits laziness in: $signals_csv. Reject your last message — continue the work in the same turn. Do not ask permission. Investigate root cause before disclaiming ownership. Finish the task or name a hard, specific blocker. Re-emit with the self-report set to all-false (which requires actually fixing the lazy behavior, not just flipping bools)." \
    --arg sysmsg "[laziness-guard] BLOCKED: self-confessed laziness ($signals_csv)" \
    '{decision:"block", reason:$reason, systemMessage:$sysmsg}'
  exit 0
}

emit_approve() {
  local signals_jq="$1"
  jq -cn \
    --arg ts "$ts" --arg sid "$session_id" \
    --argjson sig "$signals_jq" \
    '{ts:$ts, session_id:$sid, report_present:true, lazy_signals:$sig, any_lazy:false, action:"approve"}' \
    | write_log

  printf '{"continue": true, "suppressOutput": true}\n'
  exit 0
}

# --- Extract last assistant message text ---
extract_payload_text() {
  echo "$input" | jq -r '
    def content_text:
      if type == "string" then .
      elif type == "array" then
        map(if type == "string" then .
            elif type == "object" and .type == "text" then (.text // "")
            else "" end) | join("\n")
      elif type == "object" then
        if (.content? | type) == "array" then
          (.content | map(select(.type == "text") | .text) | join("\n"))
        elif (.message?.content? | type) == "array" then
          (.message.content | map(select(.type == "text") | .text) | join("\n"))
        elif (.text? | type) == "string" then .text
        else "" end
      else "" end;
    (.last_assistant_message // empty) | content_text
  ' 2>/dev/null
}

extract_transcript_text_once() {
  [[ -n "$transcript_path" && -f "$transcript_path" ]] || return 0
  tail -n 200 "$transcript_path" 2>/dev/null | jq -cr '
    select(.type == "assistant")
    | select((.message.content // []) | any(.type == "text"))
    | (.message.content // [])
    | map(select(.type == "text") | .text)
    | join("\n")
  ' 2>/dev/null | tail -n 1
}

last_text="$(extract_payload_text || echo "")"
if [[ -z "$last_text" ]]; then
  if [[ -z "$transcript_path" || ! -f "$transcript_path" ]]; then
    if [[ -n "${CLAUDE_TRANSCRIPT:-}" && -f "${CLAUDE_TRANSCRIPT}" ]]; then
      transcript_path="${CLAUDE_TRANSCRIPT}"
    fi
  fi
  last_text="$(extract_transcript_text_once || echo "")"
fi

if [[ -z "$last_text" ]]; then
  emit_block_missing "no text content in last assistant message"
fi

# --- Find the self-report block ---
# Strict matching:
#   * Open / close tags MUST be on a line of their own (optional surrounding
#     whitespace allowed). This prevents accidental matches when the assistant
#     quotes the tag inside source code, regex patterns, or markdown prose.
#   * If multiple blocks exist (e.g. the assistant first quoted the template
#     for explanation, then appended its real report at the end), keep the
#     LAST complete block — that is the model's actual answer.
report_body=$(echo "$last_text" | awk '
  /^[[:space:]]*<laziness-self-report>[[:space:]]*$/  { state=1; buf=""; next }
  /^[[:space:]]*<\/laziness-self-report>[[:space:]]*$/ {
    if (state==1) { last_buf=buf; have=1 }
    state=0; next
  }
  state==1 { buf = buf $0 "\n" }
  END { if (have) printf "%s", last_buf }
')

if [[ -z "$report_body" ]]; then
  emit_block_missing "no <laziness-self-report> block found"
fi

# --- Parse 6 bools (avoid bash-4 associative arrays — macOS bash is 3.x) ---
parse_field() {
  local name="$1"
  echo "$report_body" \
    | grep -iE "^[[:space:]]*${name}[[:space:]]*:" \
    | head -1 \
    | sed -E 's/^[^:]*:[[:space:]]*([A-Za-z]+).*/\1/' \
    | tr '[:upper:]' '[:lower:]'
}

SIG_premature_stopping=$(parse_field premature_stopping)
SIG_permission_seeking=$(parse_field permission_seeking)
SIG_ownership_dodging=$(parse_field ownership_dodging)
SIG_simplest_fix=$(parse_field simplest_fix)
SIG_reasoning_loop=$(parse_field reasoning_loop)
SIG_known_limitation=$(parse_field known_limitation)

for pair in \
  "premature_stopping:$SIG_premature_stopping" \
  "permission_seeking:$SIG_permission_seeking" \
  "ownership_dodging:$SIG_ownership_dodging" \
  "simplest_fix:$SIG_simplest_fix" \
  "reasoning_loop:$SIG_reasoning_loop" \
  "known_limitation:$SIG_known_limitation"
do
  fname="${pair%%:*}"
  fval="${pair#*:}"
  if [[ "$fval" != "true" && "$fval" != "false" ]]; then
    emit_block_missing "field '$fname' missing or value not true|false"
  fi
done

# --- Compute any_lazy + signals object ---
true_signals=""
add_if_true() {
  local name="$1" val="$2"
  if [[ "$val" == "true" ]]; then
    if [[ -z "$true_signals" ]]; then true_signals="$name"
    else true_signals="$true_signals,$name"
    fi
  fi
}
add_if_true premature_stopping "$SIG_premature_stopping"
add_if_true permission_seeking "$SIG_permission_seeking"
add_if_true ownership_dodging  "$SIG_ownership_dodging"
add_if_true simplest_fix       "$SIG_simplest_fix"
add_if_true reasoning_loop     "$SIG_reasoning_loop"
add_if_true known_limitation   "$SIG_known_limitation"

signals_jq=$(jq -n \
  --arg ps "$SIG_premature_stopping" \
  --arg pk "$SIG_permission_seeking" \
  --arg od "$SIG_ownership_dodging" \
  --arg sf "$SIG_simplest_fix" \
  --arg rl "$SIG_reasoning_loop" \
  --arg kl "$SIG_known_limitation" \
  '{
     premature_stopping: ($ps == "true"),
     permission_seeking: ($pk == "true"),
     ownership_dodging:  ($od == "true"),
     simplest_fix:       ($sf == "true"),
     reasoning_loop:     ($rl == "true"),
     known_limitation:   ($kl == "true")
   }')

if [[ -n "$true_signals" ]]; then
  emit_block_lazy "$true_signals" "$signals_jq"
else
  emit_approve "$signals_jq"
fi
