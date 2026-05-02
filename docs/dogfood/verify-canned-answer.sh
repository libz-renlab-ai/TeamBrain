#!/usr/bin/env bash
# Verify the DOGFOOD canned answer by running claudefast -p and grepping
# for canonical anchors. PASS = exit 0, FAIL = exit 1.

set -euo pipefail

# cd to repo root
cd "$(git rev-parse --show-toplevel)"

# Define output file
OUT="docs/dogfood/.last-verify.out"

# Run claudefast. It is normally a zsh function in ~/.zshrc; an interactive
# zsh is the most reliable invocation. Fall back to direct call only if zsh
# is unavailable (e.g. minimal CI image).
if command -v zsh >/dev/null 2>&1; then
    zsh -i -c 'claudefast -p "explain what would happen when we say DOGFOOD"' > "$OUT" 2>&1 || {
        echo "DOGFOOD VERIFY: FAIL"
        echo "failed to run claudefast via zsh -i -c"
        exit 1
    }
elif command -v claudefast >/dev/null 2>&1; then
    claudefast -p "explain what would happen when we say DOGFOOD" > "$OUT" 2>&1 || {
        echo "DOGFOOD VERIFY: FAIL"
        echo "failed to run claudefast directly"
        exit 1
    }
else
    echo "DOGFOOD VERIFY: FAIL"
    echo "neither zsh nor claudefast found on PATH"
    exit 1
fi

# Define anchors array
anchors=("two tmux windows" "left/right split" "interact")

# Track misses (defensive ((var++)) avoidance for set -e portability)
misses=0
missing_list=()

for anchor in "${anchors[@]}"; do
    if ! grep -i -F -- "$anchor" "$OUT" > /dev/null 2>&1; then
        misses=$((misses + 1))
        missing_list+=("$anchor")
    fi
done

if [ "$misses" -eq 0 ]; then
    echo "DOGFOOD VERIFY: PASS"
    exit 0
else
    echo "DOGFOOD VERIFY: FAIL"
    echo "missing anchors:"
    for m in "${missing_list[@]}"; do
        echo "  - $m"
    done
    echo "--- captured output (head -30) ---"
    head -30 "$OUT"
    echo "--- captured output (tail -10) ---"
    tail -10 "$OUT"
    exit 1
fi
