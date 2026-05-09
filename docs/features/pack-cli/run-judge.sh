#!/usr/bin/env bash
# Judge harness: teamagent pack CLI + init prompt v1 contract
#
# Per docs/HOWTO-PLAN-PR.md § 3b — third-party judge harness:
#   RUN  : run a fixed shell pipeline against fixture pack registry
#   DUMP : write evidence + judge.json with mechanical boolean checks
#   READ : a separate LLM (`claudefast -p`) grades from judge.json
#
# All anchors are mechanical greps over canonical command outputs. None of the
# judgments below depend on free-form LLM output — the LLM grader only reads
# the rendered judge.json + evidence files.
#
# Exit 0 = PASS, exit 1 = FAIL.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
EVIDENCE_DIR="${REPO_ROOT}/.judge/pack-cli/${RUN_ID}"
mkdir -p "${EVIDENCE_DIR}"

STDOUT_LOG="${EVIDENCE_DIR}/stdout.log"
exec > >(tee -a "${STDOUT_LOG}") 2>&1

echo "=== pack-cli judge harness run_id=${RUN_ID} ==="
cd "${REPO_ROOT}"

# Set up isolated registry + HOME
TMP="$(mktemp -d "${TMPDIR:-/tmp}/pack-cli-judge.XXXXXX")"
trap 'rm -rf "${TMP}"' EXIT
PACKS_DIR="${TMP}/packs"
HOME_DIR="${TMP}/home"
PROJ="${TMP}/proj"
mkdir -p "${PACKS_DIR}" "${HOME_DIR}/.teamagent" "${PROJ}"
cp -R "${REPO_ROOT}/packages/cli/src/__tests__/fixtures/packs/." "${PACKS_DIR}/"
# Project signal: package.json present, others absent
echo '{"name":"judge-proj"}' > "${PROJ}/package.json"

# Run via tsx so the dev source is hit directly without a build.
TSX="${REPO_ROOT}/node_modules/.bin/tsx"
if [ ! -x "${TSX}" ]; then
  echo "[FAIL] tsx not installed — run pnpm install first" >&2
  echo "FAIL" > "${EVIDENCE_DIR}/verdict.txt"
  exit 1
fi
TEAMAGENT_BIN="${REPO_ROOT}/packages/cli/src/bin.ts"

run_cli() {
  TEAMAGENT_PACKS_DIR="${PACKS_DIR}" \
    HOME="${HOME_DIR}" \
    TEAMAGENT_SKIP_WARMUP=1 \
    NODE_ENV=test \
    "${TSX}" "${TEAMAGENT_BIN}" "$@"
}

# ── Probe A: pack list --json (empty installed)
echo "[Probe A] pack list --json (empty)"
run_cli pack list --json > "${EVIDENCE_DIR}/list-empty.json" || true

# ── Probe B: pack add frontend-js
echo "[Probe B] pack add frontend-js"
run_cli pack add frontend-js > "${EVIDENCE_DIR}/add.txt" || true

# ── Probe C: pack list --json (frontend-js installed)
echo "[Probe C] pack list --json (after add)"
run_cli pack list --json > "${EVIDENCE_DIR}/list-after-add.json" || true

# ── Probe D: init default → stdout contains v1 prompt block
echo "[Probe D] init (no --pack)"
run_cli init --skip-import --skip-hook --skip-warmup --skip-seed > "${EVIDENCE_DIR}/init-stdout.txt" 2>/dev/null || true

# ── Probe E: init --pack all → bypass prompt
echo "[Probe E] init --pack all"
# Fresh home so installed-pack state does not collide with Probe B.
HOME_DIR2="${TMP}/home2"
mkdir -p "${HOME_DIR2}/.teamagent"
TEAMAGENT_PACKS_DIR="${PACKS_DIR}" \
  HOME="${HOME_DIR2}" \
  TEAMAGENT_SKIP_WARMUP=1 \
  NODE_ENV=test \
  "${TSX}" "${TEAMAGENT_BIN}" init --skip-import --skip-hook --skip-warmup --skip-seed --pack all \
    > "${EVIDENCE_DIR}/init-pack-all.txt" 2>/dev/null || true

# Mechanical checks
bool() { if eval "$1" >/dev/null 2>&1; then echo true; else echo false; fi; }

LIST_EMPTY_INSTALLED=$(bool 'jq -e ".installed | length == 0" "${EVIDENCE_DIR}/list-empty.json"')
LIST_AVAILABLE_GE_2=$(bool 'jq -e ".available | length >= 2" "${EVIDENCE_DIR}/list-empty.json"')
ADD_OK=$(bool 'grep -Eq "Installed 1 pack" "${EVIDENCE_DIR}/add.txt"')
LIST_AFTER_ADD_HAS_FE=$(bool 'jq -e ".installed[] | select(.name == \"frontend-js\")" "${EVIDENCE_DIR}/list-after-add.json"')
INIT_HAS_OPEN=$(bool 'grep -Fq "<!-- teamagent-pack-prompt v1 -->" "${EVIDENCE_DIR}/init-stdout.txt"')
INIT_HAS_CLOSE=$(bool 'grep -Fq "<!-- /teamagent-pack-prompt v1 -->" "${EVIDENCE_DIR}/init-stdout.txt"')
INIT_HAS_OBSERVED_PKG=$(bool 'grep -Eq "✓.*package\.json" "${EVIDENCE_DIR}/init-stdout.txt"')
INIT_HAS_RECOMMENDED=$(bool 'grep -Fq "teamagent pack add" "${EVIDENCE_DIR}/init-stdout.txt"')
INIT_HAS_POWERUSER=$(bool 'grep -Fq -- "--pack all" "${EVIDENCE_DIR}/init-stdout.txt"')
INIT_PACK_ALL_NO_MARKER=$(bool '! grep -Fq "<!-- teamagent-pack-prompt v1 -->" "${EVIDENCE_DIR}/init-pack-all.txt"')

OVERALL=true
for v in \
    "${LIST_EMPTY_INSTALLED}" \
    "${LIST_AVAILABLE_GE_2}" \
    "${ADD_OK}" \
    "${LIST_AFTER_ADD_HAS_FE}" \
    "${INIT_HAS_OPEN}" \
    "${INIT_HAS_CLOSE}" \
    "${INIT_HAS_OBSERVED_PKG}" \
    "${INIT_HAS_RECOMMENDED}" \
    "${INIT_HAS_POWERUSER}" \
    "${INIT_PACK_ALL_NO_MARKER}"; do
  if [ "$v" != "true" ]; then OVERALL=false; fi
done

EXIT_CODE=$([ "${OVERALL}" = "true" ] && echo 0 || echo 1)

cat > "${EVIDENCE_DIR}/judge.json" <<ENDJSON
{
  "run_id": "${RUN_ID}",
  "exit_code": ${EXIT_CODE},
  "checks": {
    "list_empty_installed": ${LIST_EMPTY_INSTALLED},
    "list_available_count_ge_2": ${LIST_AVAILABLE_GE_2},
    "add_success": ${ADD_OK},
    "list_after_add_installed_eq_frontend_js": ${LIST_AFTER_ADD_HAS_FE},
    "init_stdout_has_open_marker": ${INIT_HAS_OPEN},
    "init_stdout_has_close_marker": ${INIT_HAS_CLOSE},
    "init_stdout_has_observed_package_json": ${INIT_HAS_OBSERVED_PKG},
    "init_stdout_has_recommended_action": ${INIT_HAS_RECOMMENDED},
    "init_stdout_has_poweruser_path": ${INIT_HAS_POWERUSER},
    "init_pack_all_no_marker": ${INIT_PACK_ALL_NO_MARKER}
  },
  "overall_pass": ${OVERALL},
  "evidence_dir": "${EVIDENCE_DIR}",
  "stdout_path": "${STDOUT_LOG}"
}
ENDJSON

echo "=== Summary ==="
jq . "${EVIDENCE_DIR}/judge.json"

if [ "${OVERALL}" = "true" ]; then
  echo "PASS" > "${EVIDENCE_DIR}/verdict.txt"
  exit 0
else
  echo "FAIL" > "${EVIDENCE_DIR}/verdict.txt"
  exit 1
fi
