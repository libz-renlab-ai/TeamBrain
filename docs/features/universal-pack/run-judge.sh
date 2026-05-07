#!/usr/bin/env bash
# Judge harness: universal pack (issue #88)
#
# Checks:
#   1. packages/teamagent/seed/packs/universal.jsonl exists and parses as JSONL
#      with 12–18 entries
#   2. Every entry validates against KnowledgeEntrySchema and has the AC-required
#      fields: channel="tool-action", enforcement="block", confidence=0.85,
#      source="preset", scope.level="global", status="active", non-empty
#      wrong_pattern of length >= 3
#   3. vitest passes for the dedicated contract+matcher test
#      (packages/cli/src/__tests__/seed-pack-universal.test.ts)
#   4. vitest passes for the init.ts pack-loading regression tests inside
#      packages/cli/src/__tests__/init.test.ts
#
# Output: .judge/universal-pack/<run_id>/judge.json + verdict.txt

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
EVIDENCE_DIR="${REPO_ROOT}/.judge/universal-pack/${RUN_ID}"
mkdir -p "${EVIDENCE_DIR}"

STDOUT_LOG="${EVIDENCE_DIR}/stdout.log"
exec > >(tee -a "${STDOUT_LOG}") 2>&1

echo "=== universal-pack judge harness run_id=${RUN_ID} ==="
cd "${REPO_ROOT}"

PACK_PATH="packages/teamagent/seed/packs/universal.jsonl"

# 1. Mechanical pack file inspection
PACK_CHECK_EXIT=0
node --input-type=module <<EOF > "${EVIDENCE_DIR}/pack-check.json" 2>&1 || PACK_CHECK_EXIT=\$?
import fs from 'node:fs';
import path from 'node:path';
const packPath = path.resolve('${PACK_PATH}');
if (!fs.existsSync(packPath)) {
  process.stdout.write(JSON.stringify({ ok: false, reason: 'missing_file', path: packPath }, null, 2) + '\n');
  process.exit(2);
}
const text = fs.readFileSync(packPath, 'utf-8');
const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
const result = {
  ok: true,
  count: lines.length,
  count_in_range: lines.length >= 12 && lines.length <= 18,
  ids: [],
  problems: [],
};
const seen = new Set();
for (const [i, line] of lines.entries()) {
  let e;
  try { e = JSON.parse(line); }
  catch (err) { result.problems.push(\`line \${i+1}: parse error\`); continue; }
  if (seen.has(e.id)) result.problems.push(\`duplicate id \${e.id}\`);
  seen.add(e.id);
  result.ids.push(e.id);
  const ch = e.channel ?? 'tool-action';
  if (ch !== 'tool-action') result.problems.push(\`\${e.id}: channel must be tool-action, got \${ch}\`);
  if (e.enforcement !== 'block') result.problems.push(\`\${e.id}: enforcement must be block, got \${e.enforcement}\`);
  if (e.confidence !== 0.85) result.problems.push(\`\${e.id}: confidence must be 0.85, got \${e.confidence}\`);
  if (e.source !== 'preset') result.problems.push(\`\${e.id}: source must be preset, got \${e.source}\`);
  if (e.scope?.level !== 'global') result.problems.push(\`\${e.id}: scope.level must be global\`);
  if (e.status !== 'active') result.problems.push(\`\${e.id}: status must be active, got \${e.status}\`);
  if (!e.wrong_pattern || e.wrong_pattern.trim().length < 3)
    result.problems.push(\`\${e.id}: wrong_pattern empty or < 3 chars\`);
}
result.ok = result.count_in_range && result.problems.length === 0;
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
EOF

PACK_OK=false
PACK_COUNT=0
if [ -f "${EVIDENCE_DIR}/pack-check.json" ]; then
  # Use fs.readFileSync (accepts POSIX paths on Windows Git Bash).
  PACK_OK=$(node -e "const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf-8'));console.log(j.ok===true)" "${EVIDENCE_DIR}/pack-check.json" 2>/dev/null || echo "false")
  PACK_COUNT=$(node -e "const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf-8'));console.log(j.count??0)" "${EVIDENCE_DIR}/pack-check.json" 2>/dev/null || echo 0)
fi

# 2. Run dedicated vitest suite for the universal pack
PACK_VITEST_EXIT=0
pnpm vitest run \
  packages/cli/src/__tests__/seed-pack-universal.test.ts \
  --reporter=json --outputFile="${EVIDENCE_DIR}/vitest-pack.json" 2>&1 || PACK_VITEST_EXIT=$?

PACK_VITEST_PASS=0
PACK_VITEST_FAIL=0
if [ -f "${EVIDENCE_DIR}/vitest-pack.json" ]; then
  PACK_VITEST_PASS=$(node -e "const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf-8'));console.log(j.numPassedTests??0)" "${EVIDENCE_DIR}/vitest-pack.json" 2>/dev/null || echo 0)
  PACK_VITEST_FAIL=$(node -e "const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf-8'));console.log(j.numFailedTests??0)" "${EVIDENCE_DIR}/vitest-pack.json" 2>/dev/null || echo 0)
fi

# 3. Run init.ts pack-loading regression tests (full init.test.ts file)
INIT_VITEST_EXIT=0
pnpm vitest run \
  packages/cli/src/__tests__/init.test.ts \
  --reporter=json --outputFile="${EVIDENCE_DIR}/vitest-init.json" 2>&1 || INIT_VITEST_EXIT=$?

INIT_VITEST_PASS=0
INIT_VITEST_FAIL=0
if [ -f "${EVIDENCE_DIR}/vitest-init.json" ]; then
  INIT_VITEST_PASS=$(node -e "const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf-8'));console.log(j.numPassedTests??0)" "${EVIDENCE_DIR}/vitest-init.json" 2>/dev/null || echo 0)
  INIT_VITEST_FAIL=$(node -e "const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf-8'));console.log(j.numFailedTests??0)" "${EVIDENCE_DIR}/vitest-init.json" 2>/dev/null || echo 0)
fi

PACK_VITEST_OK=false
[ "${PACK_VITEST_EXIT}" -eq 0 ] && PACK_VITEST_OK=true

INIT_VITEST_OK=false
[ "${INIT_VITEST_EXIT}" -eq 0 ] && INIT_VITEST_OK=true

OVERALL_PASS=false
if [ "${PACK_OK}" = "true" ] && [ "${PACK_VITEST_OK}" = "true" ] && [ "${INIT_VITEST_OK}" = "true" ]; then
  OVERALL_PASS=true
fi

cat > "${EVIDENCE_DIR}/judge.json" <<ENDJSON
{
  "run_id": "${RUN_ID}",
  "exit_code": $([ "${OVERALL_PASS}" = "true" ] && echo 0 || echo 1),
  "pack_path": "${PACK_PATH}",
  "pack_count": ${PACK_COUNT},
  "pack_check_ok": ${PACK_OK},
  "pack_vitest_ok": ${PACK_VITEST_OK},
  "pack_vitest_pass": ${PACK_VITEST_PASS},
  "pack_vitest_fail": ${PACK_VITEST_FAIL},
  "init_vitest_ok": ${INIT_VITEST_OK},
  "init_vitest_pass": ${INIT_VITEST_PASS},
  "init_vitest_fail": ${INIT_VITEST_FAIL},
  "overall_pass": ${OVERALL_PASS},
  "evidence_dir": "${EVIDENCE_DIR}",
  "stdout_path": "${STDOUT_LOG}"
}
ENDJSON

echo "=== Mechanical results ==="
echo "pack_check_ok: ${PACK_OK} (count=${PACK_COUNT})"
echo "pack_vitest_ok: ${PACK_VITEST_OK} (pass=${PACK_VITEST_PASS}, fail=${PACK_VITEST_FAIL})"
echo "init_vitest_ok: ${INIT_VITEST_OK} (pass=${INIT_VITEST_PASS}, fail=${INIT_VITEST_FAIL})"
echo "overall_pass: ${OVERALL_PASS}"
echo "judge.json: ${EVIDENCE_DIR}/judge.json"

if [ "${OVERALL_PASS}" = "true" ]; then
  echo "PASS" | tee "${EVIDENCE_DIR}/verdict.txt"
  exit 0
else
  echo "FAIL" | tee "${EVIDENCE_DIR}/verdict.txt"
  exit 1
fi
