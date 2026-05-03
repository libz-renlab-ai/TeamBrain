#!/usr/bin/env bash
# Verify the multi-tool-adaptation canned answer through claudefast.
# PASS = all 7 grep anchors hit. Exit 0 on PASS, 1 on FAIL.

set -u

PROMPT="Read docs/features/multi-tool.md and answer: list PreToolUse, UserPromptSubmit, Stop analyze, AttributionBus, MCP Server status, Cursor status, and at least one packages/ file path."
LOG="/tmp/multitool-verify-$(date +%s).out"

echo "[verify] running claudefast..." >&2
# Pick available timeout binary; macOS often has only gtimeout (after `brew install coreutils`).
# Fall back to no timeout if neither is present so the script still runs (just unbounded).
TIMEOUT_BIN="$(command -v timeout || command -v gtimeout || true)"
if [ -n "$TIMEOUT_BIN" ]; then
  "$TIMEOUT_BIN" 180 claudefast -p "$PROMPT" > "$LOG" 2>&1
else
  echo "[verify] warning: no timeout/gtimeout found; running unbounded" >&2
  claudefast -p "$PROMPT" > "$LOG" 2>&1
fi
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

# Anchors 1-4: 4 channels
check "PreToolUse channel"        "PreToolUse"
check "UserPromptSubmit channel"  "UserPromptSubmit"
check "Stop analyze channel"      "Stop( analyze| hook| 钩子)?"
check "AttributionBus channel"    "[Aa]ttribution([- ]?[Bb]us)?"
# Anchor 5: MCP must be mentioned AND a NOT-YET marker must be present.
# We grep for them independently rather than co-occurring on one line — markdown
# layouts often put "### MCP Server" on one line and "❌ NOT YET" on the next.
check "MCP mentioned"             "(MCP|mcp)"
check "NOT YET marker"            "(NOT YET|未实现|not implemented|尚未|Phase 2)"
# Anchor 6: Cursor labeled NOT YET / importer-only / 不支持 — same line OK because
# the doc puts cursor + status in the same row.
check "Cursor NOT YET"            "[Cc]ursor.*(NOT YET|未实现|importer only|no compiler|尚未|不支持)"
# Anchor 7: at least one packages/ file path
check "packages/ file path"       "packages/(cli|adapters|ports|core)/"

if [ "$PASS" -eq 1 ]; then
  echo "[verify] PASS"
  exit 0
else
  echo "[verify] FAIL — see $LOG"
  exit 1
fi
