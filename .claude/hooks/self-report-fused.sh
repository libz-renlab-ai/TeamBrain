#!/bin/bash
# self-report-fused.sh — single Stop hook enforcing the 12-field <self-report> block.
#
# Historical context: replaced an earlier two-hook chain (a 6-field laziness
# self-report + a separate blocker self-check) that caused ping-pong loops,
# because each could block independently. The fused single-decision design is
# the only Stop self-report hook in the project. Companion docs:
# docs/STOP-HOOKS.md (contract) and docs/features/hooks-status.md (full lifecycle).
#
# Required block at end of every assistant message (uniform "true = bad"):
#
# <self-report>
# premature_stopping: <true|false>
# permission_seeking: <true|false>
# ownership_dodging: <true|false>
# simplest_fix: <true|false>
# reasoning_loop: <true|false>
# known_limitation: <true|false>
# skipped_repo_search: <true|false>
# fabricated_value: <true|false>
# placeholder_used: <true|false>
# ambiguity_unresolved: <true|false>
# contradiction_unresolved: <true|false>
# silent_fallback: <true|false>
# </self-report>
#
# Logic:
#   A) Missing <self-report> block             -> block, emit template
#   B) Block present but missing/bad fields    -> block, emit template + which field
#   C) Any of 12 bools = true                  -> block, list signals
#   D) All 12 = false                          -> approve (silent)
#
# Side effects: appends one JSON line to ~/.claude/self-report/log.jsonl per Stop.

set -uo pipefail

# B-092: gracefully degrade when jq is missing (Windows Git Bash users
# rarely have jq pre-installed). Without this guard the hook produced
# empty stdout and Claude Code defaulted to approve, silently disabling
# the entire self-report guard. Now we explicitly approve and exit so the
# user is not surprised, and emit a one-line stderr nudge.
if ! command -v jq >/dev/null 2>&1; then
  echo '{"continue":true,"suppressOutput":true}'
  printf 'self-report-fused.sh: jq not found on PATH; self-report guard disabled this turn. Install jq to re-enable.\n' >&2
  exit 0
fi

LOG_DIR="$HOME/.claude/self-report"
LOG_FILE="$LOG_DIR/log.jsonl"
mkdir -p "$LOG_DIR"

input=$(cat)

transcript_path=$(echo "$input" | jq -r '.transcript_path // empty' 2>/dev/null)
session_id=$(echo "$input" | jq -r '.session_id // "unknown"' 2>/dev/null)
ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Single source of truth for field list. Order matters for template + parsing.
FIELDS=(
  premature_stopping
  permission_seeking
  ownership_dodging
  simplest_fix
  reasoning_loop
  known_limitation
  skipped_repo_search
  fabricated_value
  placeholder_used
  ambiguity_unresolved
  contradiction_unresolved
  silent_fallback
)

build_template() {
  echo "<self-report>"
  for f in "${FIELDS[@]}"; do
    echo "$f: <true|false>"
  done
  echo "</self-report>"
}
TEMPLATE="$(build_template)"

emit_block_missing() {
  local detail="$1"
  jq -cn \
    --arg ts "$ts" --arg sid "$session_id" \
    --arg detail "$detail" \
    '{ts:$ts, session_id:$sid, report_present:false, action:"block_missing_report", detail:$detail}' \
    >> "$LOG_FILE"

  jq -n \
    --arg reason "Your last message is missing (or has a malformed) <self-report> block ($detail). Append this exact 12-field block to the END of every message before stopping:

${TEMPLATE}

For each of the 12 categories, honestly evaluate whether your last work hit that pattern (uniform: true = bad). Re-emit your message with the report appended. If any bool is true, do NOT just flip it — fix the underlying behavior in the same turn (run one more concrete search, ask one targeted question, or finish the partial work). Then re-attest." \
    --arg sysmsg "[self-report-fused] BLOCKED: missing or malformed self-report ($detail)" \
    '{decision:"block", reason:$reason, systemMessage:$sysmsg}'
  exit 0
}

emit_block_lazy() {
  local signals_csv="$1"
  local signals_jq="$2"

  jq -cn \
    --arg ts "$ts" --arg sid "$session_id" \
    --argjson sig "$signals_jq" \
    --arg signals "$signals_csv" \
    '{ts:$ts, session_id:$sid, report_present:true, signals:$sig, any_alarm:true, action:"block_alarm", true_signals:$signals}' \
    >> "$LOG_FILE"

  jq -n \
    --arg reason "Your self-report admits problems in: $signals_csv. Reject your last message — do not stop. Pick the right response per signal IN THE SAME TURN:

  premature_stopping / simplest_fix / reasoning_loop / known_limitation
    -> Continue the work; finish what you started or name a hard, specific blocker.
  permission_seeking / ownership_dodging
    -> Stop asking for permission; investigate root cause and act.
  skipped_repo_search
    -> Run the concrete grep / read / find you skipped, then re-attest.
  fabricated_value / placeholder_used / silent_fallback
    -> Replace the invented / placeholder / default value with a real one (search) OR ask the user a targeted question naming the exact missing fact.
  ambiguity_unresolved / contradiction_unresolved
    -> Ask the user one specific question that resolves the ambiguity / picks between the conflicting sources.

Do not flip the bools to false without doing one of the above. Re-emit with the fix + re-attestation." \
    --arg sysmsg "[self-report-fused] BLOCKED: self-confessed problems ($signals_csv)" \
    '{decision:"block", reason:$reason, systemMessage:$sysmsg}'
  exit 0
}

emit_approve() {
  local signals_jq="$1"
  jq -cn \
    --arg ts "$ts" --arg sid "$session_id" \
    --argjson sig "$signals_jq" \
    '{ts:$ts, session_id:$sid, report_present:true, signals:$sig, any_alarm:false, action:"approve"}' \
    >> "$LOG_FILE"

  printf '{"continue": true, "suppressOutput": true}\n'
  exit 0
}

# --- Extract last assistant message text ---
extract_from_json() {
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

extract_last_text() {
  jq -rs '
    [.[] | select(.type == "assistant")
          | select((.message.content // []) | any(.type == "text"))]
    | last
    | (.message.content // [])
    | map(select(.type == "text") | .text)
    | join("\n")
  ' "$transcript_path" 2>/dev/null
}

last_text="$(extract_from_json || echo "")"

if [[ -z "$last_text" ]]; then
  if [[ -z "$transcript_path" || ! -f "$transcript_path" ]]; then
    if [[ -n "${CLAUDE_TRANSCRIPT:-}" && -f "${CLAUDE_TRANSCRIPT}" ]]; then
      transcript_path="${CLAUDE_TRANSCRIPT}"
    fi
  fi
  if [[ -z "$transcript_path" || ! -f "$transcript_path" ]]; then
    emit_block_missing "transcript_path missing or unreadable"
  fi
  last_text="$(extract_last_text || echo "")"
fi

if [[ -z "$last_text" ]]; then
  emit_block_missing "no text content in last assistant message"
fi

# --- Find self-report block (keep LAST complete one) ---
report_body=$(echo "$last_text" | awk '
  /^[[:space:]]*<self-report>[[:space:]]*$/  { state=1; buf=""; next }
  /^[[:space:]]*<\/self-report>[[:space:]]*$/ {
    if (state==1) { last_buf=buf; have=1 }
    state=0; next
  }
  state==1 { buf = buf $0 "\n" }
  END { if (have) printf "%s", last_buf }
')

if [[ -z "$report_body" ]]; then
  emit_block_missing "no <self-report> block found"
fi

# --- Parse all 12 fields ---
parse_field() {
  local name="$1"
  echo "$report_body" \
    | grep -iE "^[[:space:]]*${name}[[:space:]]*:" \
    | head -1 \
    | sed -E 's/^[^:]*:[[:space:]]*([A-Za-z]+).*/\1/' \
    | tr '[:upper:]' '[:lower:]'
}

# Parallel arrays — names + values, indexed by FIELDS order.
VALUES=()
for f in "${FIELDS[@]}"; do
  v="$(parse_field "$f")"
  VALUES+=("$v")
done

# Validate every field is true|false
for i in "${!FIELDS[@]}"; do
  fname="${FIELDS[$i]}"
  fval="${VALUES[$i]}"
  if [[ "$fval" != "true" && "$fval" != "false" ]]; then
    emit_block_missing "field '$fname' missing or value not true|false"
  fi
done

# --- Build true_signals + signals object ---
true_signals=""
for i in "${!FIELDS[@]}"; do
  fname="${FIELDS[$i]}"
  fval="${VALUES[$i]}"
  if [[ "$fval" == "true" ]]; then
    if [[ -z "$true_signals" ]]; then true_signals="$fname"
    else true_signals="$true_signals,$fname"
    fi
  fi
done

# Build signals JSON via jq (12 args)
signals_jq=$(jq -n \
  --arg v0  "${VALUES[0]}"  --arg v1  "${VALUES[1]}"  --arg v2  "${VALUES[2]}" \
  --arg v3  "${VALUES[3]}"  --arg v4  "${VALUES[4]}"  --arg v5  "${VALUES[5]}" \
  --arg v6  "${VALUES[6]}"  --arg v7  "${VALUES[7]}"  --arg v8  "${VALUES[8]}" \
  --arg v9  "${VALUES[9]}"  --arg v10 "${VALUES[10]}" --arg v11 "${VALUES[11]}" \
  '{
     premature_stopping:        ($v0  == "true"),
     permission_seeking:        ($v1  == "true"),
     ownership_dodging:         ($v2  == "true"),
     simplest_fix:              ($v3  == "true"),
     reasoning_loop:            ($v4  == "true"),
     known_limitation:          ($v5  == "true"),
     skipped_repo_search:       ($v6  == "true"),
     fabricated_value:          ($v7  == "true"),
     placeholder_used:          ($v8  == "true"),
     ambiguity_unresolved:      ($v9  == "true"),
     contradiction_unresolved:  ($v10 == "true"),
     silent_fallback:           ($v11 == "true")
   }')

if [[ -n "$true_signals" ]]; then
  emit_block_lazy "$true_signals" "$signals_jq"
else
  emit_approve "$signals_jq"
fi
