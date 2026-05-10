#!/usr/bin/env bash
set -euo pipefail

dry_arg=""
if [ "${1:-}" = "--dry-run" ]; then
  dry_arg="--dry-run"
fi

run_id="${TEAMAGENT_JUDGE_RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-install-verify}"
evidence_dir=".judge/$run_id"
stdout_path="$evidence_dir/stdout.log"
mkdir -p "$evidence_dir"
: >"$stdout_path"

run_check() {
  local name="$1"
  local script="$2"
  local out="$evidence_dir/$name.json"
  echo "== $name ==" | tee -a "$stdout_path" >/dev/null
  set +e
  bash "$script" $dry_arg >"$out" 2>>"$stdout_path"
  local code=$?
  set -e
  cat "$out" >>"$stdout_path"
  printf '\n' >>"$stdout_path"
  echo "$code" >"$evidence_dir/$name.exit_code"
}

run_check v1a scripts/ci-install-v1a.sh
run_check v1b scripts/ci-install-v1b.sh
run_check v2 scripts/ci-install-v2.sh
run_check v3 scripts/ci-install-v3.sh
run_check v4 scripts/ci-install-v4-timing.sh

node - "$run_id" "$evidence_dir" "$stdout_path" <<'NODE'
const fs = require("fs");
const runId = process.argv[2];
const evidenceDir = process.argv[3];
const stdoutPath = process.argv[4];
const names = ["v1a", "v1b", "v2", "v3", "v4"];
const readJson = (name) => {
  const path = `${evidenceDir}/${name}.json`;
  try {
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch (error) {
    return { check: name, pass: false, error: String(error) };
  }
};
const readCode = (name) => {
  try {
    return Number(fs.readFileSync(`${evidenceDir}/${name}.exit_code`, "utf8").trim());
  } catch {
    return 1;
  }
};
const results = Object.fromEntries(names.map((name) => [name, readJson(name)]));
const exitCodes = Object.fromEntries(names.map((name) => [name, readCode(name)]));
const v1aCount = results.v1a.v1a_terminal_confirm_count ?? null;
const v1bCount = results.v1b.v1b_claude_code_ask_count ?? null;
const v1aPass = exitCodes.v1a === 0 && results.v1a.pass === true && v1aCount === 1;
const v1bPass = exitCodes.v1b === 0 && results.v1b.pass === true && v1bCount === 1;
const judge = {
  run_id: runId,
  v1a_pass: v1aPass,
  v1a_terminal_confirm_count: v1aCount,
  v1b_pass: v1bPass,
  v1b_claude_code_ask_count: v1bCount,
  v1_pass: v1aPass && v1bPass,
  v2_pass: exitCodes.v2 === 0 && results.v2.pass === true,
  v3_pass: exitCodes.v3 === 0 && results.v3.pass === true,
  v4_timing_pass: exitCodes.v4 === 0 && results.v4.v4_timing_pass === true,
  v4_ux_noise_deferred: true,
  container_isolated: process.env.GITHUB_ACTIONS === "true",
  v2_manifest_sections_preview: results.v2.v2_manifest_sections_preview ?? [],
  v2_manifest_sections_install: results.v2.v2_manifest_sections_install ?? [],
  v3_resume_health_pass: results.v3.v3_resume_health_pass === true,
  v4_baseline_ms: results.v4.v4_baseline_ms ?? null,
  v4_measured_ms: results.v4.v4_measured_ms ?? null,
  v4_delta_pct: results.v4.v4_delta_pct ?? null,
  evidence_dir: `${evidenceDir}/`,
  stdout_path: stdoutPath,
  exit_codes: exitCodes,
  raw_results: results
};
const pass = judge.v1_pass && judge.v2_pass && judge.v3_pass && judge.v4_timing_pass;
judge.pass = pass;
fs.writeFileSync(`${evidenceDir}/judge.json`, `${JSON.stringify(judge, null, 2)}\n`);
console.log(JSON.stringify(judge, null, 2));
process.exit(pass ? 0 : 1);
NODE
