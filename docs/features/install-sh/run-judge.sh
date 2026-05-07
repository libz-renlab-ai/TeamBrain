#!/usr/bin/env bash
# Third-party judge harness for release/install.sh — issue #92
#
# Six scenarios. The harness runs fixed tools, dumps fixed JSON,
# and writes raw evidence (stdout/stderr/exit/captured-argv) so a
# downstream LLM judge can verify without trusting prose.
#
#   A: syntax            sh -n release/install.sh                       → exit 0
#   B: node_missing      stub PATH (sed only, no node)                  → exit 10
#   C: node_old          stub node prints v21.5.0                       → exit 11
#   D: node_ok_install   stub node v22 + stub npm capturing argv        → exit 0;
#                        argv contains tarball URL substring
#   E: idempotent_rerun  scenario D run twice                           → both exit 0
#   F: dash_portability  scenario D under `dash` (skipped if absent)    → exit 0 or skipped
#
# Output:
#   tmp/.judge/install-sh/<run_id>/judge.json   — verdict source-of-truth
#   tmp/.judge/install-sh/<run_id>/<label>.{stdout,stderr,exit}
#   tmp/.judge/install-sh/<run_id>/D.npm-args   — captured argv from stub npm
#
# Usage:
#   bash docs/features/install-sh/run-judge.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
EVIDENCE_DIR="${REPO_ROOT}/tmp/.judge/install-sh/${RUN_ID}"
mkdir -p "${EVIDENCE_DIR}"

STDOUT_LOG="${EVIDENCE_DIR}/stdout.log"
exec > >(tee -a "${STDOUT_LOG}") 2>&1

echo "=== install.sh judge harness run_id=${RUN_ID} ==="
echo "evidence_dir: ${EVIDENCE_DIR}"

INSTALL_SH="${REPO_ROOT}/release/install.sh"
[ -f "${INSTALL_SH}" ] || { echo "FAIL: ${INSTALL_SH} not found"; exit 1; }

# Locate sed once on host PATH; install.sh needs it for version parsing
SED_PATH="$(command -v sed || true)"
[ -n "${SED_PATH}" ] || { echo "FAIL: sed not found on host PATH"; exit 1; }

# ── Build stub PATH directories ─────────────────────────────────────────────────
EMPTY_DIR="${EVIDENCE_DIR}/stub-empty"
OLD_NODE_DIR="${EVIDENCE_DIR}/stub-old-node"
OK_DIR="${EVIDENCE_DIR}/stub-ok"
mkdir -p "${EMPTY_DIR}" "${OLD_NODE_DIR}" "${OK_DIR}"

# Symlink real sed into each stub dir so install.sh can parse version
for dir in "${EMPTY_DIR}" "${OLD_NODE_DIR}" "${OK_DIR}"; do
  ln -sf "${SED_PATH}" "${dir}/sed"
done

# stub-old-node/node — prints v21.5.0
cat > "${OLD_NODE_DIR}/node" <<'STUB'
#!/bin/sh
printf 'v21.5.0\n'
STUB
chmod 0755 "${OLD_NODE_DIR}/node"

# stub-ok/node — prints v22.5.0
cat > "${OK_DIR}/node" <<'STUB'
#!/bin/sh
printf 'v22.5.0\n'
STUB
chmod 0755 "${OK_DIR}/node"

# stub-ok/npm — capture argv to TEAMAGENT_NPM_LOG, exit 0
cat > "${OK_DIR}/npm" <<'STUB'
#!/bin/sh
log_file="${TEAMAGENT_NPM_LOG:-/dev/null}"
{
  printf 'argv:'
  for a in "$@"; do printf ' %s' "$a"; done
  printf '\n'
} >> "${log_file}"
exit 0
STUB
chmod 0755 "${OK_DIR}/npm"

# Locate /bin/sh (absolute) so `env -i` doesn't need to resolve it via PATH.
SH_BIN="/bin/sh"
[ -x "${SH_BIN}" ] || { echo "FAIL: ${SH_BIN} not executable"; exit 1; }

# ── Helper: run install.sh with isolated env ────────────────────────────────────
run_install() {
  local label="$1"
  local path_value="$2"
  local extra_env_kv="${3:-}"   # optional KEY=VALUE
  local stdout_file="${EVIDENCE_DIR}/${label}.stdout"
  local stderr_file="${EVIDENCE_DIR}/${label}.stderr"
  local exit_file="${EVIDENCE_DIR}/${label}.exit"
  echo "[${label}] PATH=${path_value} env=${extra_env_kv}"
  set +e
  if [ -n "${extra_env_kv}" ]; then
    env -i PATH="${path_value}" HOME="${EVIDENCE_DIR}" "${extra_env_kv}" \
      "${SH_BIN}" "${INSTALL_SH}" > "${stdout_file}" 2> "${stderr_file}"
  else
    env -i PATH="${path_value}" HOME="${EVIDENCE_DIR}" \
      "${SH_BIN}" "${INSTALL_SH}" > "${stdout_file}" 2> "${stderr_file}"
  fi
  local code=$?
  set -e
  echo "${code}" > "${exit_file}"
  echo "[${label}] exit=${code}"
}

# ── Scenario A: syntax ──────────────────────────────────────────────────────────
echo ""
echo "━━ A: syntax (sh -n) ━━"
A_EXIT=0
sh -n "${INSTALL_SH}" > "${EVIDENCE_DIR}/A.stdout" 2> "${EVIDENCE_DIR}/A.stderr" || A_EXIT=$?
echo "${A_EXIT}" > "${EVIDENCE_DIR}/A.exit"
echo "[A:syntax] exit=${A_EXIT}"

# ── Scenario B: node missing ────────────────────────────────────────────────────
echo ""
echo "━━ B: node_missing ━━"
run_install "B" "${EMPTY_DIR}"
B_EXIT="$(cat "${EVIDENCE_DIR}/B.exit")"

# ── Scenario C: node v21 (too old) ──────────────────────────────────────────────
echo ""
echo "━━ C: node_old (v21.5.0) ━━"
run_install "C" "${OLD_NODE_DIR}"
C_EXIT="$(cat "${EVIDENCE_DIR}/C.exit")"

# ── Scenario D: node v22 + stub npm ─────────────────────────────────────────────
echo ""
echo "━━ D: node_ok_install ━━"
D_NPM_LOG="${EVIDENCE_DIR}/D.npm-args"
: > "${D_NPM_LOG}"
run_install "D" "${OK_DIR}" "TEAMAGENT_NPM_LOG=${D_NPM_LOG}"
D_EXIT="$(cat "${EVIDENCE_DIR}/D.exit")"
D_NPM_ARGS="$(cat "${D_NPM_LOG}" 2>/dev/null || true)"
echo "[D] npm-args captured: ${D_NPM_ARGS}"

# ── Scenario E: idempotent rerun ────────────────────────────────────────────────
echo ""
echo "━━ E: idempotent_rerun ━━"
E_NPM_LOG="${EVIDENCE_DIR}/E.npm-args"
: > "${E_NPM_LOG}"
run_install "E1" "${OK_DIR}" "TEAMAGENT_NPM_LOG=${E_NPM_LOG}"
run_install "E2" "${OK_DIR}" "TEAMAGENT_NPM_LOG=${E_NPM_LOG}"
E1_EXIT="$(cat "${EVIDENCE_DIR}/E1.exit")"
E2_EXIT="$(cat "${EVIDENCE_DIR}/E2.exit")"

# ── Scenario F: dash portability (best-effort) ──────────────────────────────────
echo ""
echo "━━ F: dash_portability ━━"
F_EXIT="skipped"
F_PASS=true
if command -v dash > /dev/null 2>&1; then
  F_NPM_LOG="${EVIDENCE_DIR}/F.npm-args"
  : > "${F_NPM_LOG}"
  DASH_BIN="$(command -v dash)"
  set +e
  env -i PATH="${OK_DIR}" HOME="${EVIDENCE_DIR}" \
    "TEAMAGENT_NPM_LOG=${F_NPM_LOG}" \
    "${DASH_BIN}" "${INSTALL_SH}" \
    > "${EVIDENCE_DIR}/F.stdout" 2> "${EVIDENCE_DIR}/F.stderr"
  F_EXIT=$?
  set -e
  echo "${F_EXIT}" > "${EVIDENCE_DIR}/F.exit"
  echo "[F:dash] exit=${F_EXIT}"
  if [ "${F_EXIT}" != "0" ]; then F_PASS=false; fi
else
  echo "[F:dash] dash not on host PATH — scenario skipped (passed=true)"
fi

# ── Verdict computation ─────────────────────────────────────────────────────────
A_PASS=$([ "${A_EXIT}" = "0" ] && echo true || echo false)
B_PASS=$([ "${B_EXIT}" = "10" ] && echo true || echo false)
C_PASS=$([ "${C_EXIT}" = "11" ] && echo true || echo false)
D_PASS=true
[ "${D_EXIT}" = "0" ] || D_PASS=false
case "${D_NPM_ARGS}" in
  *archive/refs/heads/release.tar.gz*) ;;
  *) D_PASS=false ;;
esac
E_PASS=true
[ "${E1_EXIT}" = "0" ] || E_PASS=false
[ "${E2_EXIT}" = "0" ] || E_PASS=false

ALL_PASSED=true
for v in "${A_PASS}" "${B_PASS}" "${C_PASS}" "${D_PASS}" "${E_PASS}" "${F_PASS}"; do
  [ "${v}" = "true" ] || ALL_PASSED=false
done

# ── Emit judge.json ─────────────────────────────────────────────────────────────
echo ""
echo "━━ Writing judge.json ━━"
JUDGE_JSON="${EVIDENCE_DIR}/judge.json"

export RUN_ID EVIDENCE_DIR STDOUT_LOG JUDGE_JSON \
       A_EXIT B_EXIT C_EXIT D_EXIT E1_EXIT E2_EXIT F_EXIT \
       A_PASS B_PASS C_PASS D_PASS E_PASS F_PASS ALL_PASSED \
       D_NPM_ARGS

node --no-warnings -e "
const fs = require('fs');
const e = process.env;
const num = (k) => Number(e[k]);
const bool = (k) => e[k] === 'true';
const fExitRaw = e.F_EXIT;
const fExit = /^[0-9]+$/.test(fExitRaw) ? Number(fExitRaw) : fExitRaw;
const j = {
  run_id: e.RUN_ID,
  evidence_dir: e.EVIDENCE_DIR,
  stdout_path: e.STDOUT_LOG,
  scenarios: {
    syntax:           { expected_exit: 0,  actual_exit: num('A_EXIT'), passed: bool('A_PASS') },
    node_missing:     { expected_exit: 10, actual_exit: num('B_EXIT'), passed: bool('B_PASS') },
    node_old:         { expected_exit: 11, actual_exit: num('C_EXIT'), passed: bool('C_PASS') },
    node_ok_install:  {
      expected_exit: 0,
      actual_exit: num('D_EXIT'),
      passed: bool('D_PASS'),
      npm_args_captured: (e.D_NPM_ARGS || '').trim()
    },
    idempotent_rerun: {
      expected_exit_1: 0,
      expected_exit_2: 0,
      actual_exit_1: num('E1_EXIT'),
      actual_exit_2: num('E2_EXIT'),
      passed: bool('E_PASS')
    },
    dash_portability: { expected_exit: 0, actual_exit: fExit, passed: bool('F_PASS') }
  },
  all_passed: bool('ALL_PASSED')
};
fs.writeFileSync(e.JUDGE_JSON, JSON.stringify(j, null, 2) + '\n');
console.log(JSON.stringify(j, null, 2));
"

echo ""
echo "=== DONE ==="
echo "evidence_dir : ${EVIDENCE_DIR}"
echo "judge.json   : ${JUDGE_JSON}"
echo "all_passed   : ${ALL_PASSED}"

if [ "${ALL_PASSED}" = "true" ]; then
  echo "RESULT: PASS — all scenarios met expectations"
  exit 0
else
  echo "RESULT: FAIL — see judge.json for failing scenarios"
  exit 1
fi
