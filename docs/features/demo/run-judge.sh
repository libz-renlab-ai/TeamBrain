#!/usr/bin/env bash
# Judge harness: teamagent demo (issue #93)
#
# Checks:
#   1. The dedicated vitest suite passes (parseDemoArgs, render, inline,
#      record-tape generation, default-mode events.db poll).
#   2. The legacy `teamagent demo hook` subcommand still routes correctly
#      (regression guard against the new dispatcher).
#
# Output: .judge/demo/<run_id>/judge.json + verdict.txt

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
EVIDENCE_DIR="${REPO_ROOT}/.judge/demo/${RUN_ID}"
mkdir -p "${EVIDENCE_DIR}"

STDOUT_LOG="${EVIDENCE_DIR}/stdout.log"
exec > >(tee -a "${STDOUT_LOG}") 2>&1

echo "=== teamagent demo judge harness run_id=${RUN_ID} ==="
cd "${REPO_ROOT}"

# 1. Run dedicated vitest suite
DEMO_VITEST_EXIT=0
pnpm vitest run \
  packages/cli/src/__tests__/demo.test.ts \
  --reporter=json --outputFile="${EVIDENCE_DIR}/vitest-demo.json" 2>&1 || DEMO_VITEST_EXIT=$?

DEMO_PASS=0
DEMO_FAIL=0
if [ -f "${EVIDENCE_DIR}/vitest-demo.json" ]; then
  DEMO_PASS=$(node -e "const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf-8'));console.log(j.numPassedTests??0)" "${EVIDENCE_DIR}/vitest-demo.json" 2>/dev/null || echo 0)
  DEMO_FAIL=$(node -e "const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf-8'));console.log(j.numFailedTests??0)" "${EVIDENCE_DIR}/vitest-demo.json" 2>/dev/null || echo 0)
fi

DEMO_OK=false
[ "${DEMO_VITEST_EXIT}" -eq 0 ] && DEMO_OK=true

# 2. Run the existing demo-hook regression suite (legacy subcommand)
HOOK_VITEST_EXIT=0
pnpm vitest run \
  packages/cli/src/__tests__/demo-hook.test.ts \
  --reporter=json --outputFile="${EVIDENCE_DIR}/vitest-demo-hook.json" 2>&1 || HOOK_VITEST_EXIT=$?

HOOK_PASS=0
HOOK_FAIL=0
if [ -f "${EVIDENCE_DIR}/vitest-demo-hook.json" ]; then
  HOOK_PASS=$(node -e "const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf-8'));console.log(j.numPassedTests??0)" "${EVIDENCE_DIR}/vitest-demo-hook.json" 2>/dev/null || echo 0)
  HOOK_FAIL=$(node -e "const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf-8'));console.log(j.numFailedTests??0)" "${EVIDENCE_DIR}/vitest-demo-hook.json" 2>/dev/null || echo 0)
fi

HOOK_OK=false
[ "${HOOK_VITEST_EXIT}" -eq 0 ] && HOOK_OK=true

OVERALL_PASS=false
if [ "${DEMO_OK}" = "true" ] && [ "${HOOK_OK}" = "true" ]; then
  OVERALL_PASS=true
fi

cat > "${EVIDENCE_DIR}/judge.json" <<ENDJSON
{
  "run_id": "${RUN_ID}",
  "exit_code": $([ "${OVERALL_PASS}" = "true" ] && echo 0 || echo 1),
  "demo_vitest_ok": ${DEMO_OK},
  "demo_vitest_pass": ${DEMO_PASS},
  "demo_vitest_fail": ${DEMO_FAIL},
  "demo_hook_legacy_ok": ${HOOK_OK},
  "demo_hook_legacy_pass": ${HOOK_PASS},
  "demo_hook_legacy_fail": ${HOOK_FAIL},
  "overall_pass": ${OVERALL_PASS},
  "evidence_dir": "${EVIDENCE_DIR}",
  "stdout_path": "${STDOUT_LOG}"
}
ENDJSON

echo "=== Mechanical results ==="
echo "demo_vitest_ok: ${DEMO_OK} (pass=${DEMO_PASS}, fail=${DEMO_FAIL})"
echo "demo_hook_legacy_ok: ${HOOK_OK} (pass=${HOOK_PASS}, fail=${HOOK_FAIL})"
echo "overall_pass: ${OVERALL_PASS}"
echo "judge.json: ${EVIDENCE_DIR}/judge.json"

if [ "${OVERALL_PASS}" = "true" ]; then
  echo "PASS" | tee "${EVIDENCE_DIR}/verdict.txt"
  exit 0
else
  echo "FAIL" | tee "${EVIDENCE_DIR}/verdict.txt"
  exit 1
fi
