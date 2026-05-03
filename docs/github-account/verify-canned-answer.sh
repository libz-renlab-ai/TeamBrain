#!/usr/bin/env bash
# Semantic verifier for the "GitHub account" rule.
#
# Flow:
#   1. Ask a fresh claudefast session the real trigger prompt.
#   2. Ask claudefast again to judge the answer against the source rule doc.
#   3. Parse the judge's structured JSON and use `.pass` for PASS / FAIL.
#
# USE_WHEN: user asks "what accounts we use for github ?"
# Source rule: CLAUDE.md "GitHub account" section.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

OUT_DIR="docs/github-account"
ANSWER_OUT="$OUT_DIR/.last-verify.out"
JUDGE_OUT="$OUT_DIR/.last-judge.out"
JUDGE_JSON="$OUT_DIR/.last-judge.json"
JUDGE_PROMPT_FILE="$OUT_DIR/.last-judge-prompt.txt"

PROMPT="what accounts we use for github ?"
EXPECTED_DOC=$(sed -n '/^## GitHub account$/,/^## /p' CLAUDE.md | sed '$d')

run_claudefast() {
    local prompt="$1"
    local output="$2"

    if command -v zsh >/dev/null 2>&1; then
        PROMPT_FOR_CLAUDEFAST="$prompt" zsh -i -c 'claudefast -p "$PROMPT_FOR_CLAUDEFAST"' > "$output" 2>&1
    elif command -v claudefast >/dev/null 2>&1; then
        claudefast -p "$prompt" > "$output" 2>&1
    else
        echo "GITHUB-ACCOUNT VERIFY: FAIL"
        echo "neither zsh nor claudefast on PATH"
        exit 1
    fi
}

run_claudefast "$PROMPT" "$ANSWER_OUT" || {
    echo "GITHUB-ACCOUNT VERIFY: FAIL"
    echo "failed to run answer probe"
    exit 1
}

cat > "$JUDGE_PROMPT_FILE" <<EOF
You are a strict third-party judge for a project rule verifier.

Evaluate whether ACTUAL_ANSWER semantically follows EXPECTED_DOC for the USER_TRIGGER.
Do not require word-for-word matching. Judge the selected account, not string anchors.

Return ONLY valid minified JSON with this exact shape:
{"pass":true,"rule":"github-account","summary":"...","missing":[],"wrong":[]}

Rules:
- pass must be true only if the answer clearly says the TeamBrain GitHub account is LiuShiyuMath.
- pass must be false if the answer selects liush2yuxjtu as the account.
- pass may be true if liush2yuxjtu is mentioned only as the account/token not to use.
- missing and wrong must be arrays of short strings.

USER_TRIGGER:
$PROMPT

EXPECTED_DOC:
$EXPECTED_DOC

ACTUAL_ANSWER:
$(cat "$ANSWER_OUT")
EOF

run_claudefast "$(cat "$JUDGE_PROMPT_FILE")" "$JUDGE_OUT" || {
    echo "GITHUB-ACCOUNT VERIFY: FAIL"
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
    echo "GITHUB-ACCOUNT VERIFY: PASS"
    cat "$JUDGE_JSON"
    exit 0
fi

echo "GITHUB-ACCOUNT VERIFY: FAIL"
cat "$JUDGE_JSON" 2>/dev/null || cat "$JUDGE_OUT"
exit "$status"
