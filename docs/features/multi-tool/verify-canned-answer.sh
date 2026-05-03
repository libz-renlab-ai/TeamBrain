#!/usr/bin/env bash
# Verify the multi-tool-adaptation canned answer through claudefast.
# PASS = all 7 grep anchors hit. Exit 0 on PASS, 1 on FAIL.

set -u

DOC_CONTENT="$(sed -n '1,180p' docs/features/multi-tool.md)"
PROMPT="Using the docs/features/multi-tool.md content below, answer with these exact labels: PreToolUse, UserPromptSubmit, Stop analyze, AttributionBus, MCP Server status, Cursor status, and at least one packages/ file path.

$DOC_CONTENT"
LOG="/tmp/multitool-verify-$(date +%s).out"

# Pick available timeout binary; macOS often has only gtimeout (after `brew install coreutils`).
# Fall back to no timeout if neither is present so the script still runs (just unbounded).
TIMEOUT_BIN="$(command -v timeout || command -v gtimeout || true)"

run_claudefast() {
  if [ -n "$TIMEOUT_BIN" ]; then
    "$TIMEOUT_BIN" 180 claudefast -p "$PROMPT" > "$LOG" 2>&1
  else
    echo "[verify] warning: no timeout/gtimeout found; running unbounded" >&2
    claudefast -p "$PROMPT" > "$LOG" 2>&1
  fi
}

attempt=1
max_attempts=3
while :; do
  echo "[verify] running claudefast (attempt $attempt/$max_attempts)..." >&2
  run_claudefast
  # claudefast can occasionally return only hook epilogue text. Retry only
  # that non-substantive case; real canned-answer misses still fail below.
  if grep -Eq "PreToolUse|UserPromptSubmit|AttributionBus|packages/" "$LOG"; then
    break
  fi
  if [ "$attempt" -ge "$max_attempts" ]; then
    break
  fi
  echo "[verify] warning: claudefast output had no core anchors; retrying" >&2
  attempt=$((attempt + 1))
done
echo "[verify] log -> $LOG" >&2

PASS=1
check() {
  local name="$1" pattern="$2"
  if grep -Eq "$pattern" "$LOG"; then
    echo "[PASS] $name"
  else
    echo "[FAIL] $name (pattern: $pattern)"
    PASS=0
  fi
}

check_near() {
  local name="$1" anchor="$2" evidence="$3" window="$4"
  if awk -v anchor="$anchor" -v evidence="$evidence" -v window="$window" '
    $0 ~ anchor { remaining = window }
    remaining > 0 && $0 ~ evidence { found = 1; exit }
    remaining > 0 { remaining-- }
    END { exit found ? 0 : 1 }
  ' "$LOG"; then
    echo "[PASS] $name"
  else
    echo "[FAIL] $name (anchor: $anchor, evidence within ${window} lines: $evidence)"
    PASS=0
  fi
}

# Anchors 1-4: 4 channels
check "PreToolUse channel"        "PreToolUse"
check "UserPromptSubmit channel"  "UserPromptSubmit"
check "Stop analyze channel"      "Stop( analyze| hook| 钩子)?"
check "AttributionBus channel"    "[Aa]ttribution([- ]?[Bb]us)?"
# Anchor 5: MCP must be tied to NOT-YET evidence. Markdown answers may put
# "### MCP Server" on one line and "NOT YET" on the next, so allow a short
# local window instead of accepting an unrelated NOT YET elsewhere.
check_near "MCP NOT YET"           "[Mm][Cc][P]" "(NOT YET|未实现|not implemented|尚未|Phase 2)" 4
# Anchor 6: Cursor labeled NOT YET / importer-only / no compiler.
check_near "Cursor NOT YET"        "[Cc]ursor" "(NOT YET|未实现|importer only|[Nn]o compiler|compiler missing|尚未|不支持)" 4
# Anchor 7: at least one packages/ file path
check "packages/ file path"       "packages/(cli|adapters|ports|core)/"

if [ "$PASS" -eq 1 ]; then
  echo "[verify] PASS"
  exit 0
else
  echo "[verify] FAIL — see $LOG"
  exit 1
fi
