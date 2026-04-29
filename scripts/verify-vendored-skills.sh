#!/usr/bin/env bash
# Verifies the vendored design-shotgun and design-html mirrors are loaded and
# parsed identically: claudefast reads `.claude/skills/...`, codex reads
# `.codex/skills/...`, then the canonical JSON is hard-matched. It also
# captures interactive-mode evidence via tmux + `/export`.
#
# Three phases per skill, all must pass:
#   1. claudefast -p --bare --output-format json --json-schema  (.claude mirror)
#   2. codex exec --output-schema --output-last-message         (.codex mirror)
#   3. claudefast (interactive) inside tmux, with `/export`     (Claude Code)
#
# Phase 1 and Phase 2 are hard-matched as canonical JSON via `jq -S`.
# Phase 3 captures the tmux pane and the `/export` file as PR evidence.
#
# Usage:
#   bash scripts/verify-vendored-skills.sh                  # all skills
#   bash scripts/verify-vendored-skills.sh design-shotgun   # one skill
#   SKIP_PHASE3=1 bash scripts/verify-vendored-skills.sh    # skip tmux phase
#
# Evidence is written to: docs/vendored-skills-verification/evidence/<skill>/
# Exit non-zero on any phase failure.

set -uo pipefail

ROOT="$(git rev-parse --show-toplevel)"
EVIDENCE_ROOT="$ROOT/docs/vendored-skills-verification/evidence"
SCHEMA_FILE="$ROOT/docs/vendored-skills-verification/skill-metadata.schema.json"
mkdir -p "$EVIDENCE_ROOT"

SKILLS=("${@:-design-shotgun design-html}")
[[ "${1:-}" == "" ]] && SKILLS=(design-shotgun design-html)

run_with_timeout() {
  local seconds="$1"
  shift

  if command -v timeout >/dev/null 2>&1; then
    timeout "$seconds" "$@"
    return $?
  fi

  if command -v gtimeout >/dev/null 2>&1; then
    gtimeout "$seconds" "$@"
    return $?
  fi

  echo "FAIL: GNU timeout is required; on macOS install coreutils for gtimeout." >&2
  return 127
}

build_prompt() {
  local skill="$1"
  local mirror="$2"
  cat <<EOF
Read the file ${mirror}/skills/${skill}/SKILL.md from the current working directory.
Parse only its YAML frontmatter (the block between the first two --- lines).
For trigger_count, count only items under the YAML key named "triggers"; ignore
quoted phrases in the description field.
Emit ONLY this JSON, no commentary, no markdown fences:
{
  "name": <frontmatter "name" string>,
  "version": <frontmatter "version" string>,
  "preamble_tier": <frontmatter "preamble-tier" as integer>,
  "trigger_count": <length of "triggers" array>,
  "allowed_tool_count": <length of "allowed-tools" array>,
  "first_trigger": <triggers[0]>,
  "first_allowed_tool": <allowed-tools[0]>
}
EOF
}

phase1_claudefast() {
  local skill="$1" out_dir="$2"
  local prompt="$(build_prompt "$skill" ".claude")"
  local envelope="$out_dir/01-claudefast-envelope.json"
  local result="$out_dir/01-claudefast-result.json"

  echo "  [1/3] claudefast reads .claude mirror as JSON ..."
  echo "$prompt" | run_with_timeout 180 claudefast -p --bare \
    --output-format json \
    --json-schema "$(cat "$SCHEMA_FILE")" \
    --add-dir "$ROOT" \
    > "$envelope" 2>"$out_dir/01-claudefast-stderr.log"
  local rc=$?
  if [[ $rc -ne 0 ]]; then
    echo "    FAIL exit=$rc; see $out_dir/01-claudefast-stderr.log" >&2
    return 1
  fi
  jq -r '.result' "$envelope" | jq -S '.' > "$result" 2>"$out_dir/01-claudefast-jq.log"
  if [[ ! -s "$result" ]]; then
    echo "    FAIL: empty/non-JSON result; see $out_dir/01-claudefast-jq.log" >&2
    return 1
  fi
  echo "    OK -> $result"
}

phase2_codex() {
  local skill="$1" out_dir="$2"
  local prompt="$(build_prompt "$skill" ".codex")"
  local last="$out_dir/02-codex-last.json"
  local result="$out_dir/02-codex-result.json"

  echo "  [2/3] codex reads .codex mirror as JSON ..."
  run_with_timeout 240 codex exec \
    --skip-git-repo-check \
    --sandbox read-only \
    -C "$ROOT" \
    -c model_reasoning_effort=low \
    --output-schema "$SCHEMA_FILE" \
    -o "$last" \
    "$prompt" \
    < /dev/null > "$out_dir/02-codex-stdout.log" 2>&1
  local rc=$?
  if [[ $rc -ne 0 ]] || [[ ! -s "$last" ]]; then
    echo "    FAIL exit=$rc; see $out_dir/02-codex-stdout.log" >&2
    return 1
  fi
  jq -S '.' "$last" > "$result" 2>"$out_dir/02-codex-jq.log"
  if [[ ! -s "$result" ]]; then
    echo "    FAIL: empty/non-JSON result; see $out_dir/02-codex-jq.log" >&2
    return 1
  fi
  echo "    OK -> $result"
}

phase3_tmux() {
  local skill="$1" out_dir="$2"
  local export_file="$out_dir/03-tmux-export.md"
  local pane_file="$out_dir/03-tmux-pane.txt"
  local session="verify-${skill}-$$"

  echo "  [3/3] tmux + claudefast interactive + /export ..."
  if [[ "${SKIP_PHASE3:-0}" == "1" ]]; then
    echo "    SKIP (SKIP_PHASE3=1)"
    return 0
  fi

  rm -f "$export_file"
  tmux kill-session -t "$session" 2>/dev/null || true
  tmux new-session -d -s "$session" -x 220 -y 60 -c "$ROOT" "claudefast --add-dir \"$ROOT\""
  local ready_waited=0
  while [[ $ready_waited -lt 60 ]]; do
    sleep 2
    ready_waited=$((ready_waited + 2))
    if tmux capture-pane -t "$session" -p | grep -q "Claude Code"; then
      break
    fi
  done

  # Brief verification prompt — kept short, ASCII-only, no angle brackets.
  # Clear any partially typed text first; then send the prompt and a literal
  # carriage return. The marker appears once in the submitted user prompt, so
  # the wait below requires it to appear at least twice before continuing.
  local marker="VERIFY_$(printf '%s' "$skill" | tr '[:lower:]-' '[:upper:]_')_OK"
  local prompt="Read file .claude/skills/${skill}/SKILL.md then reply with exactly one line: $marker"
  tmux send-keys -t "$session" C-u
  tmux send-keys -t "$session" "$prompt"
  sleep 1
  tmux send-keys -t "$session" C-m

  # Wait up to 240s for the verify line to appear in the pane (Stop-hook
  # iterations can stretch interactive responses well past 90s on this profile).
  local waited=0 found=0
  while [[ $waited -lt 240 ]]; do
    sleep 5
    waited=$((waited + 5))
    local pane
    pane="$(tmux capture-pane -t "$session" -p)"
    if printf '%s\n' "$pane" | grep -q "Do you want to proceed?"; then
      tmux send-keys -t "$session" "1"
      sleep 1
      tmux send-keys -t "$session" C-m
      continue
    fi
    local marker_count
    marker_count="$(printf '%s\n' "$pane" | grep -cF "$marker" || true)"
    if [[ "$marker_count" -ge 2 ]]; then
      found=1
      break
    fi
  done

  if [[ $found -eq 0 ]]; then
    tmux capture-pane -t "$session" -p > "$pane_file"
    tmux kill-session -t "$session" 2>/dev/null || true
    echo "    FAIL: $marker not seen in pane within 240s; see $pane_file" >&2
    return 1
  fi

  # Allow Stop hook iterations to settle so /export captures the full response.
  sleep 12

  # Trigger /export to a file path. The slash command takes the path as the
  # next token; we send the full string so the autocomplete dropdown is
  # bypassed when Enter fires (the path arg makes the suggestion list collapse).
  tmux send-keys -t "$session" C-u
  tmux send-keys -t "$session" "/export $export_file"
  sleep 1
  tmux send-keys -t "$session" C-m

  # Wait up to 60s for "Conversation exported to" confirmation or the file.
  local exported=0
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
    sleep 5
    if [[ -s "$export_file" ]] || tmux capture-pane -t "$session" -p | grep -q "Conversation exported to"; then
      exported=1
      break
    fi
  done

  tmux capture-pane -t "$session" -p > "$pane_file"

  tmux send-keys -t "$session" "/exit" Enter
  sleep 3
  tmux kill-session -t "$session" 2>/dev/null || true

  if [[ -s "$export_file" ]]; then
    echo "    OK -> $export_file ($(wc -c <"$export_file") bytes), exported=$exported"
    return 0
  fi

  echo "    FAIL: /export did not produce $export_file; see $pane_file" >&2
  return 1
}

phase4_match() {
  local skill="$1" out_dir="$2"
  local r1="$out_dir/01-claudefast-result.json"
  local r2="$out_dir/02-codex-result.json"
  echo "  [match] hard-comparing canonical JSON ..."
  if diff -u "$r1" "$r2" > "$out_dir/04-diff.txt"; then
    echo "    OK: claudefast ≡ codex"
    rm -f "$out_dir/04-diff.txt"
    return 0
  else
    echo "    FAIL: see $out_dir/04-diff.txt" >&2
    return 1
  fi
}

mkdir -p "$(dirname "$SCHEMA_FILE")"
cat > "$SCHEMA_FILE" <<'EOF'
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "name",
    "version",
    "preamble_tier",
    "trigger_count",
    "allowed_tool_count",
    "first_trigger",
    "first_allowed_tool"
  ],
  "properties": {
    "name": {"type": "string"},
    "version": {"type": "string"},
    "preamble_tier": {"type": "integer"},
    "trigger_count": {"type": "integer"},
    "allowed_tool_count": {"type": "integer"},
    "first_trigger": {"type": "string"},
    "first_allowed_tool": {"type": "string"}
  }
}
EOF

overall_status=0
declare -a failed=()
for skill in "${SKILLS[@]}"; do
  echo ""
  echo "=== $skill ==="
  out_dir="$EVIDENCE_ROOT/$skill"
  mkdir -p "$out_dir"
  phase1_claudefast "$skill" "$out_dir" || { overall_status=1; failed+=("$skill:phase1"); continue; }
  phase2_codex      "$skill" "$out_dir" || { overall_status=1; failed+=("$skill:phase2"); continue; }
  phase4_match      "$skill" "$out_dir" || { overall_status=1; failed+=("$skill:match"); continue; }
  phase3_tmux       "$skill" "$out_dir" || { overall_status=1; failed+=("$skill:phase3"); continue; }
done

echo ""
if [[ $overall_status -eq 0 ]]; then
  echo "ALL VERIFIED."
else
  echo "FAILURES: ${failed[*]}"
  echo "See evidence under $EVIDENCE_ROOT"
fi
exit $overall_status
