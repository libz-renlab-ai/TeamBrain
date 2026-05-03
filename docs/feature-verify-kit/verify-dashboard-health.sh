#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT_DIR="$ROOT/docs/feature-verify-kit/runs"
mkdir -p "$OUT_DIR"

HTML_PATH="$ROOT/docs/dashboard.html"
RESTORE_HTML=""
if [ -f "$HTML_PATH" ]; then
  RESTORE_HTML="$(mktemp)"
  cp "$HTML_PATH" "$RESTORE_HTML"
  trap 'if [ -n "$RESTORE_HTML" ] && [ -f "$RESTORE_HTML" ]; then cp "$RESTORE_HTML" "$HTML_PATH"; rm -f "$RESTORE_HTML"; fi' EXIT
fi

pnpm --dir "$ROOT" teamagent dashboard --once > "$OUT_DIR/dashboard-once.log"

node - "$HTML_PATH" "$OUT_DIR/dashboard-health.json" <<'NODE'
const fs = require("fs");
const htmlPath = process.argv[2];
const outPath = process.argv[3];
const html = fs.readFileSync(htmlPath, "utf8");
const anchors = [
  "TeamAgent 知识库看板",
  "系统健康总结",
  "规则主动防护",
  "Retrieval Health",
];
const missing = anchors.filter((anchor) => !html.includes(anchor));
const payload = {
  service: "teamagent-dashboard",
  status: missing.length === 0 ? "ok" : "missing_anchor",
  stableHealthSignal: "teamagent-dashboard-health",
  stable_health_signal: "系统健康总结",
  anchors,
  missing,
  html_path: htmlPath,
};
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n");
if (missing.length > 0) {
  console.error(`Missing dashboard anchors: ${missing.join(", ")}`);
  process.exit(1);
}
NODE

echo "Wrote: $OUT_DIR/dashboard-health.json"
