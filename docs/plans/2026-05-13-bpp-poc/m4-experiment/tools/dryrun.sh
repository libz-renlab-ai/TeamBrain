#!/usr/bin/env bash
# End-to-end dry-run of the M4 harness against synthetic example data.
# Validates the wiring without recruiting real humans.
#
# Output: /tmp/m4-dryrun/ contains groups.json, rollup.json, verdict.json.
# The verdict is NOT a real M4 verdict — it's a smoke test.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="${TMP:-/tmp/m4-dryrun}"
mkdir -p "$TMP"

echo "=== Step 1 · random-split ==="
python3 "$HERE/tools/random-split.py" \
  --members "$HERE/recruitment/example-roster.json" \
  --seed 20260513 \
  --out "$TMP/groups.json"

echo "=== Step 2 · aggregate ==="
python3 "$HERE/analysis/aggregate.py" \
  --input "$HERE/collection/example-daily/" \
  --groups "$TMP/groups.json" \
  --out "$TMP/rollup.json"

echo "=== Step 3 · judge ==="
python3 "$HERE/analysis/judge.py" \
  --rollup "$TMP/rollup.json" \
  --out "$TMP/verdict.json"

echo "=== Step 4 · summary ==="
echo "Groups:"
cat "$TMP/groups.json" | python3 -m json.tool | head -30
echo
echo "Verdict overall_pass:"
python3 -c "import json; print(json.load(open('$TMP/verdict.json'))['overall_pass'])"
echo
echo "All artifacts written under $TMP/"
echo "NOTE: this is a SMOKE TEST. Real M4 verdict requires real human data."
