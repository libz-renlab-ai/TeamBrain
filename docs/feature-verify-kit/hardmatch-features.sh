#!/usr/bin/env bash
# CONTRACT: see README.md ## Hardmatch contract — do NOT downgrade to keys-only (issue #64 / 39e81ea / 9c78f99)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT_DIR="$ROOT/docs/feature-verify-kit/runs"
A="$OUT_DIR/claude-features.json"
B="$ROOT/fixtures/expected-product-features.json"

jq -S . "$A" > "$OUT_DIR/claude-features.sorted.json"
jq -S . "$B" > "$OUT_DIR/expected-features.sorted.json"

jq -e 'to_entries | all(.value | type == "string" and (gsub("\\s+"; "") | length > 0))' "$A" >/dev/null

diff -u "$OUT_DIR/expected-features.sorted.json" "$OUT_DIR/claude-features.sorted.json"
echo "PASS: feature JSON hard-match + non-blank values"
