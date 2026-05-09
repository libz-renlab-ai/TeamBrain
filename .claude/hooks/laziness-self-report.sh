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

# B-092: jq is a hard dependency for parsing the hook payload and emitting a
# decision JSON. On Windows (Git Bash) jq is not in PATH by default, which
# would otherwise make every jq pipe silently produce empty output and let
# Claude Code see "no decision" → approve. That makes the entire laziness
# guard a silent no-op without anyone noticing. Detect the missing tool up
# front, log one warning to stderr, and approve the turn safely.
if ! command -v jq >/dev/null 2>&1; then
  printf 'laziness-self-report: jq not found on PATH; laziness guard disabled (install jq to enable)\n' >&2
  printf '{"continue": true, "suppressOutput": true}\n'
  exit 0
fi

# Read hook input from stdin (Claude Code feeds JSON here)
input=$(cat)

transcript_path=$(echo "$input" | jq -r '.transcript_path // empty')
session_id=$(echo "$input" | jq -r '.session_id // "unknown"')
ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)

if [[ -z "$transcript_path" || ! -f "$transcript_path" ]]; then
  if [[ -n "${CLAUDE_TRANSCRIPT:-}" && -f "${CLAUDE_TRANSCRIPT}" ]]; then
    transcript_path="${CLAUDE_TRANSCRIPT}"
  fi
fi

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
            else "" end) | map(select(length > 0)) | join("\n")
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
  tail -n 200 "$transcript_path" 2>/dev/null | jq -sr '
    def text_content:
      if type == "string" then .
      elif type == "array" then
        map(if type == "string" then .
            elif type == "object" and .type == "text" then (.text // "")
            else "" end) | map(select(length > 0)) | join("\n")
      else "" end;
    [ .[]
      | select(.type == "assistant")
      | (.message.content // [])
      | text_content
      | select(length > 0)
    ] | last // ""
  ' 2>/dev/null
}

extract_last_user_text_once() {
  [[ -n "$transcript_path" && -f "$transcript_path" ]] || return 0
  tail -n "${CLAUDE_TRIGGER_TRANSCRIPT_TAIL_LINES:-2000}" "$transcript_path" 2>/dev/null | jq -c '
    def text_content:
      if type == "string" then .
      elif type == "array" then
        map(if type == "string" then .
            elif type == "object" and .type == "text" then (.text // "")
            else "" end) | map(select(length > 0)) | join("\n")
      elif type == "object" and (.content? | type) == "string" then .content
      elif type == "object" and (.content? | type) == "array" then
        (.content | map(if type == "string" then .
                        elif type == "object" and .type == "text" then (.text // "")
                        else "" end) | map(select(length > 0)) | join("\n"))
      else "" end;
    if .type == "user" and (.isMeta // false | not) and (.isSynthetic // false | not) then
      (.message.content // empty) as $content
      | $content | text_content
    elif .type == "queue-operation" and .operation == "enqueue" then
      (.content // "") | text_content
    else empty end
    | select(length > 0)
  ' 2>/dev/null | tail -n 1 | jq -r . 2>/dev/null
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

last_user_text="$(extract_last_user_text_once || echo "")"
response_language_prompt="based on this project rule, what language agent uses when talk with users and asked in english"
work_intent_pattern='(^|[^[:alnum:]_])(run|execute|start|launch|invoke|update|edit|change|modify|fix|implement|write|commit|push|docs?|scripts?|examples?)([^[:alnum:]_]|$)|跑|执行|开始|启动|更新|修改|修复|文档|脚本'
fastprobe_answer_intent=false
if echo "$last_user_text" | grep -Eqi '(^|[^[:alnum:]_])(what|explain|list|show|answer)([^[:alnum:]_]).*FASTPROBE|FASTPROBE[[:space:]]+about|PR[[:space:]]+conflict[[:space:]]+resolve[[:space:]]+with[[:space:]]+FASTPROBE|FASTPROBE.*(PR|pull request|合并请求).*(conflict|resolve|冲突).*(怎么|如何|处理|\?)'; then
  fastprobe_answer_intent=true
fi
work_intent=false
if echo "$last_user_text" | grep -Eqi "$work_intent_pattern"; then
  work_intent=true
fi
if echo "$last_user_text" | grep -qi 'FASTPROBE' \
  && echo "$last_user_text" | grep -Eqi '(^|[^[:alnum:]_])PR([^[:alnum:]_]|$)|pull request|合并请求' \
  && echo "$last_user_text" | grep -qiE 'conflict|resolve|冲突' \
  && [[ "$fastprobe_answer_intent" == "true" ]] \
  && [[ "$work_intent" != "true" ]]; then
  if ! echo "$last_text" | grep -q "claudefast -h" || ! echo "$last_text" | grep -q "PR opened"; then
    jq -n \
      --arg reason "The user asked the high-priority trigger 'FASTPROBE about PR+conflict resolve'. Do not return an empty answer or only <laziness-self-report>. Re-emit the required Chinese rule answer with: claudefast -h; max 8 claudefast -p probes; stream-json; conflict classes merge/review-finding/rule-doc; forbidden actions; and the PR opened -> CI + /review skill -> conflict? -> classify -> resolve locally -> rerun verification -> push -> POSTPR loop -> merge ASCII line." \
      --arg sysmsg "[laziness-guard] BLOCKED: missing FASTPROBE PR conflict rule answer" \
      '{decision:"block", reason:$reason, systemMessage:$sysmsg}'
    exit 0
  fi
  jq -cn \
    --arg ts "$ts" --arg sid "$session_id" \
    '{ts:$ts, session_id:$sid, report_present:false, any_lazy:false, action:"approve_fastprobe_pr_conflict_answer"}' \
    | write_log
  printf '{"continue": true, "suppressOutput": true}\n'
  exit 0
fi

# POSTPR trigger enforcement removed per ADR-0007: the cloud Codex bot review
# loop has been replaced by the local /review skill, and the gate is the
# self-discipline-via-matcher semantic probe (claudefast -p) — no canned-answer
# block in CLAUDE.md/AGENTS.md and no grep anchor in this hook are permitted as
# substitutes. See docs/POSTPR.md and docs/CONTEXT.md.

# The response-language rule has a mechanical verifier that requires the exact
# user-visible answer to be Chinese-only. Gate this bypass to that exact prompt
# so unrelated turns cannot skip the laziness guard by returning the same text.
if [[ "$last_user_text" == "$response_language_prompt" && "$last_text" == "中文。" ]]; then
  jq -cn \
    --arg ts "$ts" --arg sid "$session_id" \
    '{ts:$ts, session_id:$sid, report_present:false, any_lazy:false, action:"approve_response_language_sentinel"}' \
    | write_log
  printf '{"continue": true, "suppressOutput": true}\n'
  exit 0
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
