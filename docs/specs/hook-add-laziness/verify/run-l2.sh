#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
VERIFY_DIR="$ROOT/docs/specs/hook-add-laziness/verify"
HOOK="$ROOT/.claude/hooks/laziness-self-report.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

run_case() {
  name="$1"
  expected="$2"
  message="$3"
  out="$TMP/$name.json"
  err="$TMP/$name.err"
  jq -n --arg sid "l2-$name" --arg msg "$message" \
    '{session_id:$sid,last_assistant_message:$msg}' |
    CLAUDE_LAZINESS_LOG_FILE="$TMP/log.jsonl" bash "$HOOK" >"$out" 2>"$err"
  test ! -s "$err"
  jq -e -n --slurpfile a "$VERIFY_DIR/$expected" --slurpfile b "$out" '$a[0] == $b[0]' >/dev/null
  printf 'PASS %s\n' "$name"
}

all_false='<laziness-self-report>
premature_stopping: false
permission_seeking: false
ownership_dodging: false
simplest_fix: false
reasoning_loop: false
known_limitation: false
</laziness-self-report>'

run_case A-missing-block L2-A-missing-block.json 'OK'
run_case B-lazy-true L2-B-lazy-true.json '<laziness-self-report>
premature_stopping: false
permission_seeking: true
ownership_dodging: false
simplest_fix: false
reasoning_loop: false
known_limitation: false
</laziness-self-report>'
run_case C-all-false L2-C-all-false.json "$all_false"
run_case D-template-then-real L2-D-template-then-real.json "Template:
<laziness-self-report>
premature_stopping: <true|false>
permission_seeking: <true|false>
ownership_dodging: <true|false>
simplest_fix: <true|false>
reasoning_loop: <true|false>
known_limitation: <true|false>
</laziness-self-report>

Actual:
$all_false"
run_case E-quoted-source L2-E-quoted-source.json 'awk source: /^[[:space:]]*<laziness-self-report>[[:space:]]*$/'
