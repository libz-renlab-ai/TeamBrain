#!/usr/bin/env bash
# hook-prompt-verify.sh — judge harness runner for issue #86 tasks 1 + 4.
# Spec: docs/feature-verification/hook-prompt-judge-harness.md
# Pattern: RUN (fixed tools) → DUMP (judge.json + raw evidence) → READ
# (independent claudefast LLM grades). The executing agent / code under
# test must NOT grade itself.
set -euo pipefail
RUN_ID="${RUN_ID:-$(date +%s)}"
OUT=".judge/hook-prompt-${RUN_ID}"
mkdir -p "$OUT"

echo "[hook-prompt-verify] run_id=$RUN_ID out=$OUT"

# RUN — humane format snapshot tests
pnpm vitest run packages/adapters/src/hook/claude-agent-sdk/__tests__/format-snapshot.test.ts \
  > "$OUT/format-snapshot.txt" 2>&1
FORMAT_PASS=$?

# RUN — meta-command false-positive matcher tests
pnpm vitest run packages/core/src/matcher/legacy/__tests__/keyword-matcher-meta-cmd.test.ts \
  > "$OUT/matcher-fp.txt" 2>&1
MATCHER_PASS=$?

# RUN — synthetic PreToolUse fixture exercise (if fixture present)
FIXTURE=".judge/fixtures/pre-tool-use-meta-cmd.json"
SIM_FIRST_LINE_CHARS=0
SIM_DETAILS_PRESENT=0
SIM_ERROR_LITERAL=0
SIM_META_SKIPPED=0
if [ -f "$FIXTURE" ] && [ -f packages/cli/dist/bin-pre-tool-use.cjs ]; then
  node packages/cli/dist/bin-pre-tool-use.cjs < "$FIXTURE" \
    > "$OUT/sim-out.json" 2>"$OUT/sim-err.txt" || true
  SIM_FIRST_LINE=$(head -1 "$OUT/sim-err.txt" 2>/dev/null || echo "")
  SIM_FIRST_LINE_CHARS=${#SIM_FIRST_LINE}
  if grep -q "^   细节:" "$OUT/sim-err.txt" 2>/dev/null; then SIM_DETAILS_PRESENT=1; fi
  if grep -q "^Error:" "$OUT/sim-err.txt" 2>/dev/null; then SIM_ERROR_LITERAL=1; fi
  # If fixture is gh-issue-create style and no rule fired, count as meta_cmd_skipped=1
  if [ -z "$SIM_FIRST_LINE" ]; then SIM_META_SKIPPED=1; fi
fi

cat > "$OUT/judge.json" <<JSON
{
  "run_id": "$RUN_ID",
  "exit_code": $((FORMAT_PASS + MATCHER_PASS)),
  "metrics": {
    "format_snapshot_pass": $([ "$FORMAT_PASS" -eq 0 ] && echo 1 || echo 0),
    "matcher_fp_pass": $([ "$MATCHER_PASS" -eq 0 ] && echo 1 || echo 0),
    "first_line_chars": $SIM_FIRST_LINE_CHARS,
    "details_line_present": $SIM_DETAILS_PRESENT,
    "error_literal_present": $SIM_ERROR_LITERAL,
    "meta_cmd_skipped": $SIM_META_SKIPPED,
    "fixture_exercised": $([ -f "$FIXTURE" ] && echo true || echo false)
  },
  "evidence_dir": "$OUT",
  "stdout_path": "$OUT/sim-err.txt",
  "thresholds": {
    "first_line_chars_max": 80,
    "details_line_required": 1,
    "error_literal_must_be": 0,
    "format_snapshot_pass_required": 1,
    "matcher_fp_pass_required": 1
  }
}
JSON
cat "$OUT/judge.json"
echo "[hook-prompt-verify] judge.json written → READ phase: feed to independent claudefast probe per docs/feature-verification/hook-prompt-judge-harness.md."
