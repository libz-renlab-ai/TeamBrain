#!/usr/bin/env bash
# Judge harness: two-stage warmup (issue #91)
#
# Checks:
#   1. The dedicated `warmup-state` unit suite passes (file format,
#      atomic write, readiness states, pid liveness).
#   2. The state-file integration suite passes (runWarmup writes
#      downloading → ready / failed correctly).
#   3. init.test.ts still passes (ensures detach refactor did not
#      break existing init flow).
#   4. doctor.test.ts still passes (ensures the new vector_model row
#      did not break existing checks).
#
# Output: .judge/two-stage-install/<run_id>/judge.json + verdict.txt

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
EVIDENCE_DIR="${REPO_ROOT}/.judge/two-stage-install/${RUN_ID}"
mkdir -p "${EVIDENCE_DIR}"

STDOUT_LOG="${EVIDENCE_DIR}/stdout.log"
exec > >(tee -a "${STDOUT_LOG}") 2>&1

echo "=== two-stage-install judge harness run_id=${RUN_ID} ==="
cd "${REPO_ROOT}"

run_vitest() {
  local label="$1"; shift
  local out_path="$1"; shift
  local exit_code=0
  pnpm vitest run "$@" \
    --reporter=json --outputFile="${out_path}" 2>&1 || exit_code=$?
  echo "${label} exit=${exit_code}"
  return ${exit_code}
}

# 1. warmup-state unit suite
SUITE1_EXIT=0
run_vitest "suite1:warmup-state" "${EVIDENCE_DIR}/vitest-suite1.json" \
  packages/cli/src/__tests__/warmup-state.test.ts || SUITE1_EXIT=$?

# 2. warmup-state integration suite
SUITE2_EXIT=0
run_vitest "suite2:warmup-state-integration" "${EVIDENCE_DIR}/vitest-suite2.json" \
  packages/cli/src/__tests__/warmup-state-integration.test.ts || SUITE2_EXIT=$?

# 3. init regression
SUITE3_EXIT=0
run_vitest "suite3:init" "${EVIDENCE_DIR}/vitest-suite3.json" \
  packages/cli/src/__tests__/init.test.ts || SUITE3_EXIT=$?

# 4. doctor regression
SUITE4_EXIT=0
run_vitest "suite4:doctor" "${EVIDENCE_DIR}/vitest-suite4.json" \
  packages/cli/src/__tests__/doctor.test.ts || SUITE4_EXIT=$?

count_pass() {
  node -e "const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf-8'));console.log(j.numPassedTests??0)" "$1" 2>/dev/null || echo 0
}
count_fail() {
  node -e "const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf-8'));console.log(j.numFailedTests??0)" "$1" 2>/dev/null || echo 0
}

S1_PASS=$(count_pass "${EVIDENCE_DIR}/vitest-suite1.json"); S1_FAIL=$(count_fail "${EVIDENCE_DIR}/vitest-suite1.json")
S2_PASS=$(count_pass "${EVIDENCE_DIR}/vitest-suite2.json"); S2_FAIL=$(count_fail "${EVIDENCE_DIR}/vitest-suite2.json")
S3_PASS=$(count_pass "${EVIDENCE_DIR}/vitest-suite3.json"); S3_FAIL=$(count_fail "${EVIDENCE_DIR}/vitest-suite3.json")
S4_PASS=$(count_pass "${EVIDENCE_DIR}/vitest-suite4.json"); S4_FAIL=$(count_fail "${EVIDENCE_DIR}/vitest-suite4.json")

OVERALL_PASS=false
if [ "${SUITE1_EXIT}" -eq 0 ] && [ "${SUITE2_EXIT}" -eq 0 ] && [ "${SUITE3_EXIT}" -eq 0 ] && [ "${SUITE4_EXIT}" -eq 0 ]; then
  OVERALL_PASS=true
fi

cat > "${EVIDENCE_DIR}/judge.json" <<ENDJSON
{
  "run_id": "${RUN_ID}",
  "exit_code": $([ "${OVERALL_PASS}" = "true" ] && echo 0 || echo 1),
  "warmup_state_unit_ok": $([ "${SUITE1_EXIT}" -eq 0 ] && echo true || echo false),
  "warmup_state_unit_pass": ${S1_PASS},
  "warmup_state_unit_fail": ${S1_FAIL},
  "warmup_state_integration_ok": $([ "${SUITE2_EXIT}" -eq 0 ] && echo true || echo false),
  "warmup_state_integration_pass": ${S2_PASS},
  "warmup_state_integration_fail": ${S2_FAIL},
  "init_regression_ok": $([ "${SUITE3_EXIT}" -eq 0 ] && echo true || echo false),
  "init_regression_pass": ${S3_PASS},
  "init_regression_fail": ${S3_FAIL},
  "doctor_regression_ok": $([ "${SUITE4_EXIT}" -eq 0 ] && echo true || echo false),
  "doctor_regression_pass": ${S4_PASS},
  "doctor_regression_fail": ${S4_FAIL},
  "overall_pass": ${OVERALL_PASS},
  "evidence_dir": "${EVIDENCE_DIR}",
  "stdout_path": "${STDOUT_LOG}"
}
ENDJSON

echo "=== Mechanical results ==="
echo "warmup_state_unit:        $([ "${SUITE1_EXIT}" -eq 0 ] && echo PASS || echo FAIL) (pass=${S1_PASS}, fail=${S1_FAIL})"
echo "warmup_state_integration: $([ "${SUITE2_EXIT}" -eq 0 ] && echo PASS || echo FAIL) (pass=${S2_PASS}, fail=${S2_FAIL})"
echo "init_regression:          $([ "${SUITE3_EXIT}" -eq 0 ] && echo PASS || echo FAIL) (pass=${S3_PASS}, fail=${S3_FAIL})"
echo "doctor_regression:        $([ "${SUITE4_EXIT}" -eq 0 ] && echo PASS || echo FAIL) (pass=${S4_PASS}, fail=${S4_FAIL})"
echo "overall_pass: ${OVERALL_PASS}"
echo "judge.json: ${EVIDENCE_DIR}/judge.json"

if [ "${OVERALL_PASS}" = "true" ]; then
  echo "PASS" | tee "${EVIDENCE_DIR}/verdict.txt"
  exit 0
else
  echo "FAIL" | tee "${EVIDENCE_DIR}/verdict.txt"
  exit 1
fi
