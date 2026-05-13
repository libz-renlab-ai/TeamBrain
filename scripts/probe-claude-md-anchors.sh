#!/usr/bin/env bash
# probe-claude-md-anchors.sh — mechanical anchor-presence probe for CLAUDE.md
#
# Reads docs/plans/2026-05-13-issue-427-claude-md-slim/rules.json (issue #427 spec)
# and for each rule, greps every declared substring_anchor against the live
# CLAUDE.md (or a path passed as $1). Emits JSON of shape:
#
#   {
#     "claude_md_path": "...",
#     "claude_md_bytes": N,
#     "ran_at": "ISO-8601",
#     "rules": [
#       {
#         "rule_id": "...",
#         "cluster": "...",
#         "total_anchors": N,
#         "found_anchors": N,
#         "missing_anchors": [...],
#         "status": "WORKING" | "BROKEN"
#       },
#       ...
#     ],
#     "summary": {
#       "total_rules": N,
#       "working": N,
#       "broken": N
#     }
#   }
#
# Probe semantics: WORKING = every declared anchor substring is present in the
# file (case-sensitive byte-level substring via grep -F). BROKEN = at least
# one anchor missing.
#
# Usage:
#   bash scripts/probe-claude-md-anchors.sh [CLAUDE.md path] > out.json
#
# No external dependencies beyond bash + grep + node (for JSON formatting).

set -euo pipefail

CLAUDE_MD="${1:-CLAUDE.md}"
RULES_JSON="docs/plans/2026-05-13-issue-427-claude-md-slim/rules.json"

if [[ ! -f "$CLAUDE_MD" ]]; then
  echo "probe: ERROR: CLAUDE.md not found at $CLAUDE_MD" >&2
  exit 1
fi
if [[ ! -f "$RULES_JSON" ]]; then
  echo "probe: ERROR: rules.json not found at $RULES_JSON" >&2
  exit 1
fi

# Use node to drive the loop — it reads JSON natively and handles UTF-8 anchors.
node --input-type=module <<NODE_SCRIPT
import fs from "node:fs";
import { execSync } from "node:child_process";

const claudeMdPath = "${CLAUDE_MD}";
const rulesJsonPath = "${RULES_JSON}";

const rules = JSON.parse(fs.readFileSync(rulesJsonPath, "utf8")).rules;
const claudeMd = fs.readFileSync(claudeMdPath, "utf8");
const claudeMdBytes = Buffer.byteLength(claudeMd, "utf8");

const results = [];
let working = 0;
let broken = 0;

for (const rule of rules) {
  const found = [];
  const missing = [];
  for (const anchor of rule.substring_anchors) {
    if (claudeMd.includes(anchor)) {
      found.push(anchor);
    } else {
      missing.push(anchor);
    }
  }
  const status = missing.length === 0 ? "WORKING" : "BROKEN";
  if (status === "WORKING") working++; else broken++;
  results.push({
    rule_id: rule.rule_id,
    cluster: rule.cluster,
    total_anchors: rule.substring_anchors.length,
    found_anchors: found.length,
    missing_anchors: missing,
    status,
  });
}

const ranAt = new Date().toISOString();

const output = {
  claude_md_path: claudeMdPath,
  claude_md_bytes: claudeMdBytes,
  ran_at: ranAt,
  rules: results,
  summary: {
    total_rules: results.length,
    working,
    broken,
  },
};

process.stdout.write(JSON.stringify(output, null, 2) + "\n");
NODE_SCRIPT
