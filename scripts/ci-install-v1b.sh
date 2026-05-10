#!/usr/bin/env bash
set -euo pipefail

dry_run=0
if [ "${1:-}" = "--dry-run" ]; then
  dry_run=1
fi

if [ "$dry_run" -eq 1 ]; then
  node -e 'console.log(JSON.stringify({check:"v1b",pass:true,v1b_claude_code_ask_count:1,mode:"dry-run",llm_call:false}))'
  exit 0
fi

if ! command -v claudefast >/dev/null 2>&1; then
  node -e 'console.log(JSON.stringify({check:"v1b",pass:false,v1b_claude_code_ask_count:null,mode:"live",llm_call:false,error:"claudefast not found"}))'
  exit 1
fi

tmp="${TMPDIR:-/tmp}/teamagent-ci-install-v1b.stream.jsonl"
claudefast -p \
  --output-format stream-json \
  --include-partial-messages \
  --verbose \
  "install TeamBrain please; use pnpm teamagent install" |
  tee "$tmp" |
  bash scripts/ci-strict-permission-shim.sh >/tmp/teamagent-ci-install-v1b-shim.json

node - "$tmp" <<'NODE'
const fs = require("fs");
const path = process.argv[2];
const text = fs.readFileSync(path, "utf8");
let asks = 0;
for (const line of text.split(/\r?\n/)) {
  if (!line.trim()) continue;
  try {
    const event = JSON.parse(line);
    const out = event.hookSpecificOutput ?? event;
    if (out.permissionDecision === "ask") asks += 1;
  } catch {
    if (line.includes('"permissionDecision":"ask"')) asks += 1;
  }
}
console.log(JSON.stringify({
  check: "v1b",
  pass: asks === 1,
  v1b_claude_code_ask_count: asks,
  mode: "live",
  llm_call: true,
  stdout_path: path
}));
process.exit(asks === 1 ? 0 : 1);
NODE
