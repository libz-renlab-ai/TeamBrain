#!/usr/bin/env bash
set -euo pipefail

tmp="$(mktemp "${TMPDIR:-/tmp}/teamagent-ci-strict-permission-shim.XXXXXX")"
trap 'rm -f "$tmp"' EXIT
cat >"$tmp"

node - "$tmp" <<'NODE'
const fs = require("fs");
const path = process.argv[2];
const text = fs.readFileSync(path, "utf8");
const events = [];
let askCount = 0;
for (const [index, line] of text.split(/\r?\n/).entries()) {
  if (!line.trim()) continue;
  let parsed = null;
  try {
    parsed = JSON.parse(line);
  } catch {}
  const decision = parsed?.hookSpecificOutput?.permissionDecision ?? parsed?.permissionDecision;
  const reason = parsed?.hookSpecificOutput?.permissionDecisionReason ?? parsed?.permissionDecisionReason ?? null;
  if (decision === "ask" || (!parsed && line.includes('"permissionDecision":"ask"'))) {
    askCount += 1;
    events.push({ line: index + 1, permissionDecision: "ask", permissionDecisionReason: reason });
  }
}
const pass = askCount <= 1;
console.log(JSON.stringify({
  check: "strict-permission-shim",
  pass,
  ask_count: askCount,
  auto_answered_first: askCount >= 1,
  blocked_second: askCount > 1,
  events
}));
process.exit(pass ? 0 : 1);
NODE
