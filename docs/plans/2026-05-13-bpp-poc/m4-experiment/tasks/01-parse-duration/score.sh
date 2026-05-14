#!/usr/bin/env bash
# Objective scorer for task 01-parse-duration.
# Exit 0 = pass; non-zero = fail.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"
exec npx vitest run --reporter=verbose score.test.ts
