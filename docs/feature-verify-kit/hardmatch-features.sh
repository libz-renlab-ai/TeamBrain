#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT_DIR="$ROOT/docs/feature-verify-kit/runs"
A="$OUT_DIR/claude-features.json"
B="$ROOT/fixtures/expected-product-features.json"

jq -S . "$A" > "$OUT_DIR/claude-features.sorted.json"
jq -S . "$B" > "$OUT_DIR/expected-features.sorted.json"

jq -S 'keys' "$A" > "$OUT_DIR/claude-feature-keys.json"
jq -S 'keys' "$B" > "$OUT_DIR/expected-feature-keys.json"

diff -u "$OUT_DIR/expected-feature-keys.json" "$OUT_DIR/claude-feature-keys.json"

jq -e 'to_entries | all(.value | type == "string" and length > 0)' "$A" >/dev/null

echo "PASS: feature key hard-match + non-empty evidence"
