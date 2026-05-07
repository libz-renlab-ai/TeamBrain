#!/usr/bin/env bash
# Probe-grounded verification for the TEAMWORK pattern.
# Asks the model a live question and asserts FIVE semantic elements appear
# naturally in the response. This is NOT grepping a static canned snippet.
set -u

PROBE="what would happen when we say TEAMWORK ? ONLY explain please"

echo "=== TEAMWORK feature verify ==="
echo "Running: claudefast -p \"$PROBE\""
echo ""

output="$(claudefast -p "$PROBE" 2>&1)"

echo "$output"
echo ""

# Check five distinct semantic elements
pass=0
fail=0

check() {
  local label="$1"
  shift
  for pattern in "$@"; do
    if echo "$output" | grep -qi "$pattern"; then
      echo "[PASS] $label"
      pass=$((pass + 1))
      return
    fi
  done
  echo "[FAIL] $label — none of: $*"
  fail=$((fail + 1))
}

check "N+1+(2N) formula"       "N+1+(2N)" "N + 1 + (2N)" "3N+1" "3N + 1"
check "sonnet workers"         "sonnet"
check "claudefast probes"      "claudefast"
check "opus 1M reporter"       "opus"
check "never work in main"     "main"

echo ""
echo "Results: $pass passed, $fail failed"

if [ "$fail" -eq 0 ]; then
  echo "TEAMWORK verify: PASS"
  exit 0
else
  echo "TEAMWORK verify: FAIL"
  exit 1
fi
