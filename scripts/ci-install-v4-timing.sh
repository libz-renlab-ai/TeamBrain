#!/usr/bin/env bash
set -euo pipefail

dry_run=0
if [ "${1:-}" = "--dry-run" ]; then
  dry_run=1
fi

baseline_ms="${TEAMAGENT_INSTALL_BASELINE_MS:-12000}"

if [ "$dry_run" -eq 1 ]; then
  node - "$baseline_ms" <<'NODE'
const baseline = Number(process.argv[2]);
console.log(JSON.stringify({
  check: "v4",
  pass: true,
  v4_timing_pass: true,
  v4_baseline_ms: baseline,
  v4_measured_ms: baseline,
  v4_delta_pct: 0,
  v4_ux_noise_deferred: true,
  mode: "dry-run"
}));
NODE
  exit 0
fi

start_ms="$(node -e 'process.stdout.write(String(Date.now()))')"
pnpm vitest run packages/cli/src/__tests__/install-merge.test.ts --reporter=dot >/tmp/teamagent-ci-install-v4.log
end_ms="$(node -e 'process.stdout.write(String(Date.now()))')"
measured_ms=$((end_ms - start_ms))

node - "$baseline_ms" "$measured_ms" <<'NODE'
const baseline = Number(process.argv[2]);
const measured = Number(process.argv[3]);
const delta = baseline === 0 ? 0 : ((measured - baseline) / baseline) * 100;
const pass = measured <= baseline * 1.2;
console.log(JSON.stringify({
  check: "v4",
  pass,
  v4_timing_pass: pass,
  v4_baseline_ms: baseline,
  v4_measured_ms: measured,
  v4_delta_pct: Math.round(delta * 10) / 10,
  v4_ux_noise_deferred: true,
  mode: "vitest",
  stdout_path: "/tmp/teamagent-ci-install-v4.log"
}));
process.exit(pass ? 0 : 1);
NODE
