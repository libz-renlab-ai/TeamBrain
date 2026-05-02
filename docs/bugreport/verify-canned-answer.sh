#!/usr/bin/env bash
# Verify the BUGREPORT canned answer by running claudefast -p and grepping
# for canonical anchors. PASS = exit 0, FAIL = exit 1.
#
# Anchors (case-insensitive):
#   - github.com/libz-renlab-ai/TeamBrain
#   - system info
#   - reproduce
#   - raw logs
#   - great detail
#
# All five must be present in the response for PASS.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

OUT="docs/bugreport/.last-verify.out"
PROMPT="what would happen when user find a bug"

# Prefer interactive zsh so claudefast (a zsh function) resolves; fall back to
# direct invocation only when zsh is unavailable.
if command -v zsh >/dev/null 2>&1; then
    zsh -i -c "claudefast -p \"$PROMPT\"" > "$OUT" 2>&1 || {
        echo "BUGREPORT VERIFY: FAIL"
        echo "failed to run claudefast via zsh -i -c"
        exit 1
    }
elif command -v claudefast >/dev/null 2>&1; then
    claudefast -p "$PROMPT" > "$OUT" 2>&1 || {
        echo "BUGREPORT VERIFY: FAIL"
        echo "failed to run claudefast directly"
        exit 1
    }
else
    echo "BUGREPORT VERIFY: FAIL"
    echo "neither zsh nor claudefast on PATH"
    exit 1
fi

anchors=(
  "github.com/libz-renlab-ai/TeamBrain"
  "system info"
  "reproduce"
  "raw logs"
  "great detail"
)

misses=0
missing_list=()

for anchor in "${anchors[@]}"; do
    if ! grep -i -F -- "$anchor" "$OUT" > /dev/null 2>&1; then
        misses=$((misses + 1))
        missing_list+=("$anchor")
    fi
done

if [ "$misses" -eq 0 ]; then
    echo "BUGREPORT VERIFY: PASS"
    exit 0
else
    echo "BUGREPORT VERIFY: FAIL"
    echo "missing anchors:"
    for m in "${missing_list[@]}"; do
        echo "  - $m"
    done
    echo "--- captured output (head -40) ---"
    head -40 "$OUT"
    echo "--- captured output (tail -10) ---"
    tail -10 "$OUT"
    exit 1
fi
