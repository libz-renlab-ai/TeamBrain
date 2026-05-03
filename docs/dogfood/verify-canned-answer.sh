#!/usr/bin/env bash
# Verify the DOGFOOD canned answer by running claudefast -p and grepping
# for canonical anchors. PASS = exit 0, FAIL = exit 1.

set -euo pipefail

# cd to repo root
cd "$(git rev-parse --show-toplevel)"

# Define output files
OUT="docs/dogfood/.last-verify.out"
STREAM_OUT="docs/dogfood/.last-verify.stream.jsonl"
PROMPT="explain what would happen when we say DOGFOOD"

# Run claudefast as stream-json and extract the final result. Plain stdout is
# vulnerable to Stop-hook follow-up turns that can leave only hook feedback in
# the captured output.
if command -v zsh >/dev/null 2>&1; then
    zsh -i -c "claudefast -p --output-format stream-json --include-partial-messages --verbose --permission-mode acceptEdits \"$PROMPT\"" > "$STREAM_OUT" 2>&1 || {
        echo "DOGFOOD VERIFY: FAIL"
        echo "failed to run claudefast via zsh -i -c"
        exit 1
    }
elif command -v claudefast >/dev/null 2>&1; then
    claudefast -p --output-format stream-json --include-partial-messages --verbose --permission-mode acceptEdits "$PROMPT" > "$STREAM_OUT" 2>&1 || {
        echo "DOGFOOD VERIFY: FAIL"
        echo "failed to run claudefast directly"
        exit 1
    }
else
    echo "DOGFOOD VERIFY: FAIL"
    echo "neither zsh nor claudefast found on PATH"
    exit 1
fi

node -e '
const fs = require("fs");
const input = process.argv[1];
const output = process.argv[2];
let result = "";
for (const line of fs.readFileSync(input, "utf8").split(/\n/)) {
  if (!line.trim()) continue;
  try {
    const event = JSON.parse(line);
    if (event.type === "result" && typeof event.result === "string") {
      result = event.result;
    }
  } catch {}
}
if (!result) {
  process.stderr.write("No result field found in stream-json output\n");
  process.exit(1);
}
fs.writeFileSync(output, result);
' "$STREAM_OUT" "$OUT" || {
    echo "DOGFOOD VERIFY: FAIL"
    echo "failed to extract result from stream-json"
    exit 1
}

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
