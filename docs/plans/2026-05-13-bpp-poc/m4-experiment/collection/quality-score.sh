#!/usr/bin/env bash
# Usage: quality-score.sh <task-slug>
# Output: a single line number in [0,1] = code quality score.
# Composition: 0.4 * eslint_clean + 0.3 * tsc_clean + 0.3 * (1 - circular_ratio).
# All checks are best-effort; failed sub-check = 0 for that component.
set -euo pipefail
TASK="${1:?task slug}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../tasks/$TASK" && pwd)"
cd "$HERE"

eslint_pass=0
if npx eslint . --no-error-on-unmatched-pattern --max-warnings=0 > /dev/null 2>&1; then eslint_pass=1; fi

tsc_pass=0
if npx tsc --noEmit > /dev/null 2>&1; then tsc_pass=1; fi

circular_ratio=0
if command -v madge > /dev/null 2>&1; then
  count="$(npx --yes madge --circular . 2>/dev/null | grep -c '✖' || true)"
  if [[ "$count" -gt 0 ]]; then circular_ratio=1; fi
fi

python3 -c "
e=$eslint_pass; t=$tsc_pass; c=$circular_ratio
score = 0.4*e + 0.3*t + 0.3*(1-c)
print(f'{score:.4f}')
"
