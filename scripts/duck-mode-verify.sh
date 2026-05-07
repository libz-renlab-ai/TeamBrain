#!/usr/bin/env bash
# duck-mode-verify.sh — judge harness runner for issue #116 (V1–V5).
# Spec: docs/feature-verification/duck-mode-judge-harness.md
# Pattern: RUN (fixed tools) → DUMP (judge.json + raw evidence) → READ
# (independent claudefast LLM grades). The executing agent / code under
# test must NOT grade itself.
set -euo pipefail
RUN_ID="${RUN_ID:-$(date +%s)}"
OUT=".judge/duck-mode-${RUN_ID}"
BASELINE_FILE="docs/baselines/stats-engineer-baseline.txt"
mkdir -p "$OUT"

echo "[duck-mode-verify] run_id=$RUN_ID out=$OUT"

# RUN — capture stats with and without duck mode
TEAMAGENT_EXPLAIN_LIKE_CEO_DUCK=0 pnpm --silent teamagent stats > "$OUT/engineer.txt" 2>"$OUT/engineer.err" || true
TEAMAGENT_EXPLAIN_LIKE_CEO_DUCK=1 pnpm --silent teamagent stats > "$OUT/duck.txt"     2>"$OUT/duck.err"     || true

# RUN — capture postinstall dry-run with and without duck mode
if [ -f packages/teamagent/postinstall.mjs ]; then
  TEAMAGENT_DRY_RUN=1 TEAMAGENT_EXPLAIN_LIKE_CEO_DUCK=1 \
    node packages/teamagent/postinstall.mjs > "$OUT/postinstall-duck.txt" 2>&1 || true
  TEAMAGENT_DRY_RUN=1 TEAMAGENT_EXPLAIN_LIKE_CEO_DUCK=0 \
    node packages/teamagent/postinstall.mjs > "$OUT/postinstall-eng.txt"  2>&1 || true
fi

# DUMP — compute mechanical metrics
JARGON_TERMS=$(grep -Eio 'skills?|hooks?|PreToolUse|Stop hook|RAG|embedding|quantization|canonical|token (budget|预算)|matcher|vector|reload|MCP|tier|confidence|demerit' "$OUT/duck.txt" "$OUT/postinstall-duck.txt" 2>/dev/null | sort -u | wc -l | tr -d ' ')
DUCK_LINES=$(grep -cE '呷呷|鸭鸭|>ω<|🦆' "$OUT/duck.txt" "$OUT/postinstall-duck.txt" 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
DUCK_VIEW_LINES=$(wc -l < "$OUT/duck.txt" 2>/dev/null | tr -d ' ')
ENGINEER_VIEW_LINES=$(wc -l < "$OUT/engineer.txt" 2>/dev/null | tr -d ' ')
BASELINE_LINES=0
if [ -f "$BASELINE_FILE" ]; then
  BASELINE_LINES=$(wc -l < "$BASELINE_FILE" | tr -d ' ')
fi
ENGINEER_VIEW_DIFF=$(awk "BEGIN{printf \"%.4f\", ($ENGINEER_VIEW_LINES - $BASELINE_LINES) / ($BASELINE_LINES + 1)}")

# V5 anchor probe — requires claudefast on PATH (or zsh -i fallback). If
# unavailable, mark v5_probe_attempted=false; reviewer can re-run later.
V5_PROBE="not_attempted"
V5_HAS_FASTPROBE=false
V5_HAS_POSTPR=false
V5_HAS_TEAMWORK=false
if command -v claudefast >/dev/null 2>&1 || zsh -i -c 'command -v claudefast >/dev/null' 2>/dev/null; then
  CMD='claudefast -p "what project tools we have?"'
  if command -v claudefast >/dev/null 2>&1; then
    eval "$CMD" > "$OUT/v5-probe.txt" 2>"$OUT/v5-probe.err" || true
  else
    zsh -i -c "$CMD" > "$OUT/v5-probe.txt" 2>"$OUT/v5-probe.err" || true
  fi
  V5_PROBE="attempted"
  grep -q FASTPROBE "$OUT/v5-probe.txt" 2>/dev/null && V5_HAS_FASTPROBE=true
  grep -q POSTPR    "$OUT/v5-probe.txt" 2>/dev/null && V5_HAS_POSTPR=true
  grep -q TEAMWORK  "$OUT/v5-probe.txt" 2>/dev/null && V5_HAS_TEAMWORK=true
fi

cat > "$OUT/judge.json" <<JSON
{
  "run_id": "$RUN_ID",
  "exit_code": 0,
  "metrics": {
    "jargon_terms_found": $JARGON_TERMS,
    "duck_lines_emitted": $DUCK_LINES,
    "engineer_view_lines": $ENGINEER_VIEW_LINES,
    "duck_view_lines": $DUCK_VIEW_LINES,
    "baseline_engineer_lines": $BASELINE_LINES,
    "engineer_view_diff": $ENGINEER_VIEW_DIFF,
    "v5_probe": "$V5_PROBE",
    "v5_has_fastprobe": $V5_HAS_FASTPROBE,
    "v5_has_postpr": $V5_HAS_POSTPR,
    "v5_has_teamwork": $V5_HAS_TEAMWORK
  },
  "evidence_dir": "$OUT",
  "stdout_path": "$OUT/duck.txt",
  "thresholds": {
    "V1_jargon_coverage_min": 1.0,
    "V2_duck_lines_min": 1,
    "V3_signal_token_per_duck_line_min": 1,
    "V4_engineer_view_diff_max": 0.05,
    "V5_anchors_required": ["FASTPROBE", "POSTPR", "TEAMWORK"]
  }
}
JSON
cat "$OUT/judge.json"
echo "[duck-mode-verify] judge.json written → READ phase: feed this to an independent claudefast probe per docs/feature-verification/duck-mode-judge-harness.md."
