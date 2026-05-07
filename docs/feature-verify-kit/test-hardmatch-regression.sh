#!/usr/bin/env bash
# test-hardmatch-regression.sh
#
# Regression guard for docs/feature-verify-kit/hardmatch-features.sh.
#
# Issue:   https://github.com/libz-renlab-ai/TeamBrain/issues/64
# Commits:
#   39e81ea — downgrade that weakened hardmatch to keys-only equality (the pattern
#             this guard protects against being re-introduced)
#   9c78f99 — fix that restored full canonical JSON equality + non-blank check
#
# Purpose:
#   Verifies that hardmatch-features.sh performs a full *value* comparison, not
#   merely a keys-only check.  Two branches are exercised:
#
#   POS — fixture copied verbatim → hardmatch must exit 0
#   NEG — fixture mutated (one metric value changed) → hardmatch must exit non-zero
#
#   If the NEG branch returns 0, it means the script was downgraded back to
#   keys-only equality and no longer catches value mutations.
#
# Dependencies: bash, jq, diff (all standard in CI / macOS / Linux).
# No network, no LLM, no claudefast.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FIXTURE="$ROOT/fixtures/expected-product-features.json"
HARDMATCH="$ROOT/docs/feature-verify-kit/hardmatch-features.sh"
RUNS_DIR="$ROOT/docs/feature-verify-kit/runs"
CLAUDE_JSON="$RUNS_DIR/claude-features.json"

# ---------------------------------------------------------------------------
# Sanity checks
# ---------------------------------------------------------------------------
if [[ ! -f "$FIXTURE" ]]; then
  echo "ERROR: fixture not found: $FIXTURE" >&2
  exit 1
fi
if [[ ! -f "$HARDMATCH" ]]; then
  echo "ERROR: hardmatch script not found: $HARDMATCH" >&2
  exit 1
fi
command -v jq >/dev/null 2>&1 || { echo "ERROR: jq not found in PATH" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Ensure runs/ directory exists
# ---------------------------------------------------------------------------
mkdir -p "$RUNS_DIR"

# ---------------------------------------------------------------------------
# Back up pre-existing claude-features.json (if any) and clean up sorted
# artefacts after each run so we never leave stale files behind.
# ---------------------------------------------------------------------------
BACKUP_FILE=""
if [[ -f "$CLAUDE_JSON" ]]; then
  BACKUP_FILE="$(mktemp)"
  cp "$CLAUDE_JSON" "$BACKUP_FILE"
fi

cleanup() {
  # Restore original claude-features.json (or remove if it didn't exist before)
  if [[ -n "$BACKUP_FILE" ]]; then
    cp "$BACKUP_FILE" "$CLAUDE_JSON"
    rm -f "$BACKUP_FILE"
  else
    rm -f "$CLAUDE_JSON"
  fi
  # Remove sorted artefacts produced by hardmatch-features.sh
  rm -f "$RUNS_DIR/claude-features.sorted.json"
  rm -f "$RUNS_DIR/expected-features.sorted.json"
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# POS branch — fixture verbatim → hardmatch must pass (exit 0)
# ---------------------------------------------------------------------------
cp "$FIXTURE" "$CLAUDE_JSON"

set +e
POS_OUTPUT="$(bash "$HARDMATCH" 2>&1)"
POS_EXIT=$?
set -e

# Clean sorted artefacts between branches
rm -f "$RUNS_DIR/claude-features.sorted.json" "$RUNS_DIR/expected-features.sorted.json"

if [[ $POS_EXIT -ne 0 ]]; then
  echo "FAIL [POS]: hardmatch-features.sh returned non-zero ($POS_EXIT) on unmodified fixture." >&2
  echo "Output:" >&2
  echo "$POS_OUTPUT" >&2
  echo "The fixture or hardmatch script may be broken independently of the regression." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# NEG branch — mutated fixture → hardmatch must fail (exit non-zero)
# The mutation changes the 'metrics' value: replaces '2,432' with '2,433'.
# A keys-only diff would NOT catch this; a full value diff WILL.
# ---------------------------------------------------------------------------
jq '.metrics |= gsub("2,432"; "2,433")' "$FIXTURE" > "$CLAUDE_JSON"

set +e
NEG_OUTPUT="$(bash "$HARDMATCH" 2>&1)"
NEG_EXIT=$?
set -e

# Clean sorted artefacts again (trap will also run but belt-and-suspenders)
rm -f "$RUNS_DIR/claude-features.sorted.json" "$RUNS_DIR/expected-features.sorted.json"

if [[ $NEG_EXIT -eq 0 ]]; then
  echo "FAIL [NEG]: hardmatch-features.sh returned 0 on a mutated fixture." >&2
  echo "This means hardmatch may have been downgraded to keys-only equality." >&2
  echo "(Guard is protecting against commit 39e81ea pattern.)" >&2
  echo "Output:" >&2
  echo "$NEG_OUTPUT" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Both branches passed their assertions
# ---------------------------------------------------------------------------
echo "PASS: hardmatch regression guard intact"
exit 0
