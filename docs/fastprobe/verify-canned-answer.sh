#!/usr/bin/env bash
# Semantic verifier for the FASTPROBE rule.
#
# Flow:
#   1. Ask a fresh claudefast session the real trigger prompt.
#   2. Ask claudefast again to judge the answer against the source rule doc.
#   3. Parse the judge's structured JSON and use `.pass` for PASS / FAIL.
#
# USE_WHEN: user asks "what would happen if we say word 'FASTPROBE' ?"
#           or message contains the bareword FASTPROBE.
# Source rule: docs/FASTPROBE.md plus CLAUDE.md "Project tools / FASTPROBE".

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

OUT_DIR="docs/fastprobe"
ANSWER_OUT="$OUT_DIR/.last-verify.out"
JUDGE_OUT="$OUT_DIR/.last-judge.out"
JUDGE_JSON="$OUT_DIR/.last-judge.json"
JUDGE_PROMPT_FILE="$OUT_DIR/.last-judge-prompt.txt"

PROMPT="what would happen if we say word 'FASTPROBE' ?"
EXPECTED_DOC=$(
    {
        sed -n '/^## Project tools \/ FASTPROBE$/,/^## Bug report canned answer$/p' CLAUDE.md | sed '$d'
        printf '\n--- docs/FASTPROBE.md ---\n'
        cat docs/FASTPROBE.md
    }
)

run_claudefast() {
    local prompt="$1"
    local output="$2"

    if command -v zsh >/dev/null 2>&1; then
        PROMPT_FOR_CLAUDEFAST="$prompt" zsh -i -c 'claudefast -p "$PROMPT_FOR_CLAUDEFAST"' > "$output" 2>&1
    elif command -v claudefast >/dev/null 2>&1; then
        claudefast -p "$prompt" > "$output" 2>&1
    else
        echo "FASTPROBE VERIFY: FAIL"
        echo "neither zsh nor claudefast on PATH"
        exit 1
    fi
}

run_claudefast "$PROMPT" "$ANSWER_OUT" || {
    echo "FASTPROBE VERIFY: FAIL"
    echo "failed to run answer probe"
    exit 1
}

cat > "$JUDGE_PROMPT_FILE" <<EOF
You are a strict third-party judge for a project rule verifier.

Evaluate whether ACTUAL_ANSWER follows EXPECTED_DOC for the USER_TRIGGER.
CLAUDE.md now requires semantic coverage of the three FASTPROBE steps, not word-for-word replay. Judge whether the recipe is correct and complete.

Return ONLY valid minified JSON with this exact shape:
{"pass":true,"rule":"fastprobe","summary":"...","missing":[],"wrong":[]}

Rules:
- pass must be true only if the answer covers the three FASTPROBE steps: first run claudefast -h, then use claudefast -p for heavy/conclusion work with parallel dispatch up to 8 independent prompts, then use claudefast -p with stream-json flags for audit scenarios.
- pass must be false if it omits the help probe, omits claudefast -p, omits stream-json audit mode, or gives the wrong parallel limit.
- pass must be false if the number 8 appears only incidentally and not as the maximum parallel dispatch limit.
- missing and wrong must be arrays of short strings.

USER_TRIGGER:
$PROMPT

EXPECTED_DOC:
$EXPECTED_DOC

ACTUAL_ANSWER:
$(cat "$ANSWER_OUT")
EOF

run_claudefast "$(cat "$JUDGE_PROMPT_FILE")" "$JUDGE_OUT" || {
    echo "FASTPROBE VERIFY: FAIL"
    echo "failed to run semantic judge"
    exit 1
}

set +e
node - "$JUDGE_OUT" "$JUDGE_JSON" <<'NODE'
const fs = require('fs');
const inputPath = process.argv[2];
const outputPath = process.argv[3];
const raw = fs.readFileSync(inputPath, 'utf8').trim();

function extractFirstJudgeJson(text) {
  for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escape) escape = false;
        else if (ch === '\\') escape = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          try {
            const parsed = JSON.parse(text.slice(start, i + 1));
            if (parsed && Object.prototype.hasOwnProperty.call(parsed, 'pass')) return parsed;
          } catch {}
          break;
        }
      }
    }
  }
  return null;
}

const parsed = extractFirstJudgeJson(raw);
if (!parsed) {
  console.error('judge did not return a parseable JSON object with a pass field');
  process.exit(2);
}
fs.writeFileSync(outputPath, `${JSON.stringify(parsed, null, 2)}\n`);
process.exit(parsed.pass === true ? 0 : 1);
NODE
status=$?
set -e

if [ "$status" -eq 0 ]; then
    echo "FASTPROBE VERIFY: PASS"
    cat "$JUDGE_JSON"
    exit 0
fi

echo "FASTPROBE VERIFY: FAIL"
cat "$JUDGE_JSON" 2>/dev/null || cat "$JUDGE_OUT"
exit "$status"
