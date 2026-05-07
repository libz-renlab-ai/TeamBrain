#!/usr/bin/env bash
# judge-first-run.sh — Third-party judge harness for issue #87 first-run wizard.
#
# Runs checks J1-J6, writes evidence to .judge/<run_id>/, dumps judge.json.
# LLM judge only reads the JSON — it does NOT execute anything.
#
# Usage: bash scripts/judge-first-run.sh
#
# Output:
#   OUT_DIR=.judge/<run_id>
#   OVERALL=PASS|FAIL
#
# Exit code: 0 = PASS, 1 = FAIL

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# ── Run ID + directories ──────────────────────────────────────────────────────
RUN_ID="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
OUT_DIR=".judge/${RUN_ID}"
EVIDENCE_DIR="${OUT_DIR}/evidence"
mkdir -p "$EVIDENCE_DIR"

echo "RUN_ID=${RUN_ID}"
echo "OUT_DIR=${OUT_DIR}"

# ── Backup + restore user state files on exit ────────────────────────────────
STATE_FILE="${HOME}/.teamagent/first-run-state.json"
UPDATE_STATE="${HOME}/.teamagent/update-state.json"
BACKUP_STATE="${EVIDENCE_DIR}/_backup_first-run-state.json"
BACKUP_UPDATE="${EVIDENCE_DIR}/_backup_update-state.json"

[ -f "$STATE_FILE"   ] && cp "$STATE_FILE"   "$BACKUP_STATE"
[ -f "$UPDATE_STATE" ] && cp "$UPDATE_STATE" "$BACKUP_UPDATE"

restore_state() {
  if [ -f "$BACKUP_STATE" ]; then
    cp "$BACKUP_STATE"  "$STATE_FILE"
  else
    rm -f "$STATE_FILE"
  fi
  if [ -f "$BACKUP_UPDATE" ]; then
    cp "$BACKUP_UPDATE" "$UPDATE_STATE"
  fi
}
trap restore_state EXIT

# ── Individual check results (plain vars, bash 3.2 compat) ──────────────────
J1_EXIT=0; J1_PASS="false"
J2_EXIT=0; J2_PASS="false"; J2_TESTS_PASSED=0
J3_EXIT=0; J3_PASS="false"; J3_HIT_COUNT=0; J3_LINE_COUNT=0; J3_HIT_LIST="[]"
J4_EXIT=0; J4_PASS="false"; J4_HIT_COUNT=0; J4_HIT_LIST="[]"; J4_STATE_CREATED="false"
J5_EXIT=0; J5_PASS="false"; J5_HIT_COUNT=0; J5_HIT_LIST="[]"; J5_COMPLETED_STEPS=0
J6_EXIT=0; J6_PASS="false"; J6_DIFF_BYTES=0

# ── Helper: stat file size cross-platform ────────────────────────────────────
file_bytes() {
  stat -f%z "$1" 2>/dev/null || stat -c%s "$1" 2>/dev/null || echo "0"
}

# ── Helper: check one anchor; accumulate to list var ────────────────────────
# Usage: check_anchor <file> <anchor> <current_list> <current_count>
# Prints: new_list|new_count
check_anchor() {
  local file="$1" anchor="$2" list="$3" count="$4"
  if grep -q "$anchor" "$file" 2>/dev/null; then
    count=$((count + 1))
    if [ "$list" = "[]" ]; then
      list="[\"${anchor}\"]"
    else
      # insert before closing ]
      list="${list%]},\"${anchor}\"]"
    fi
  fi
  echo "${list}|${count}"
}

# ── J1: typecheck ─────────────────────────────────────────────────────────────
echo ""
echo "[J1] pnpm typecheck ..."
J1_LOG="${EVIDENCE_DIR}/typecheck.log"
set +e
pnpm typecheck > "$J1_LOG" 2>&1
J1_EXIT=$?
set -e
[ "$J1_EXIT" -eq 0 ] && J1_PASS="true"
echo "[J1] exit=${J1_EXIT} → ${J1_PASS}"

# ── J2: unit tests (first-run filter) ────────────────────────────────────────
echo ""
echo "[J2] pnpm vitest run first-run ..."
J2_LOG="${EVIDENCE_DIR}/vitest.log"
set +e
pnpm vitest run first-run --reporter=verbose > "$J2_LOG" 2>&1
J2_EXIT=$?
set -e

# Parse passed test count from verbose vitest output.
# Vitest verbose output has two "X passed" lines: "Test Files  1 passed (1)" and
# "Tests  6 passed (6)". We want the "Tests" line count, not the file count.
# Count ✓ lines as the reliable fallback.
J2_TESTS_PASSED=0
J2_TESTS_PASSED="$(grep -cE '^\s*✓' "$J2_LOG" 2>/dev/null || echo 0)"
if [ "${J2_TESTS_PASSED:-0}" -eq 0 ]; then
  J2_TESTS_PASSED="$(grep -E '^\s*Tests ' "$J2_LOG" | grep -oE '[0-9]+ passed' | grep -oE '^[0-9]+' | head -1 || echo 0)"
fi
J2_TESTS_PASSED="${J2_TESTS_PASSED:-0}"

if [ "$J2_EXIT" -eq 0 ] && [ "${J2_TESTS_PASSED:-0}" -ge 6 ]; then
  J2_PASS="true"
fi
echo "[J2] exit=${J2_EXIT} tests_passed=${J2_TESTS_PASSED} → ${J2_PASS}"

# ── J3: postinstall stdout ────────────────────────────────────────────────────
echo ""
echo "[J3] node packages/teamagent/postinstall.mjs ..."
J3_LOG="${EVIDENCE_DIR}/postinstall.stdout"
set +e
TEAMAGENT_SKIP_WARMUP=1 node packages/teamagent/postinstall.mjs > "$J3_LOG" 2>&1
J3_EXIT=$?
set -e

J3_LINE_COUNT="$(wc -l < "$J3_LOG" | tr -d ' ')"
r="$(check_anchor "$J3_LOG" "✅" "[]" 0)"; J3_HIT_LIST="${r%|*}"; J3_HIT_COUNT="${r#*|}"
r="$(check_anchor "$J3_LOG" "装好" "$J3_HIT_LIST" "$J3_HIT_COUNT")"; J3_HIT_LIST="${r%|*}"; J3_HIT_COUNT="${r#*|}"
r="$(check_anchor "$J3_LOG" "skeleton-demo" "$J3_HIT_LIST" "$J3_HIT_COUNT")"; J3_HIT_LIST="${r%|*}"; J3_HIT_COUNT="${r#*|}"
r="$(check_anchor "$J3_LOG" "stats" "$J3_HIT_LIST" "$J3_HIT_COUNT")"; J3_HIT_LIST="${r%|*}"; J3_HIT_COUNT="${r#*|}"
r="$(check_anchor "$J3_LOG" "\-\-help" "$J3_HIT_LIST" "$J3_HIT_COUNT")"; J3_HIT_LIST="${r%|*}"; J3_HIT_COUNT="${r#*|}"
r="$(check_anchor "$J3_LOG" "github.com" "$J3_HIT_LIST" "$J3_HIT_COUNT")"; J3_HIT_LIST="${r%|*}"; J3_HIT_COUNT="${r#*|}"

if [ "$J3_HIT_COUNT" -ge 6 ] && [ "$J3_LINE_COUNT" -le 30 ]; then
  J3_PASS="true"
fi
echo "[J3] exit=${J3_EXIT} anchors=${J3_HIT_COUNT}/6 lines=${J3_LINE_COUNT} → ${J3_PASS}"

# ── J4: wizard first run ─────────────────────────────────────────────────────
# Use `expect` to drive a real PTY so process.stdin.isTTY is true in the wizard.
# The wizard takes the TTY branch → shows prompt "选择 1 / 2 / 3".
# State file write requires the spawned subcommand (skeleton-demo/stats/--help)
# to exit 0. defaultSpawn(choice, []) spawns the bare string as an executable
# which fails ("stats" is not a PATH binary). This is tracked as a W1 bug;
# state_file_created reflects actual runtime. J4 passes on TTY branch + anchors;
# state write is fully covered by J2 vitest (spawnImpl injected, exits 0).
echo ""
echo "[J4] wizard first run via PTY (expect) ..."
J4_LOG="${EVIDENCE_DIR}/wizard-1.stdout"
J4_TTY_BRANCH="false"
rm -f "$STATE_FILE"

set +e
if command -v expect >/dev/null 2>&1; then
  expect -c "
    log_file ${J4_LOG}
    spawn pnpm teamagent
    expect {
      \"选择\" { send \"2\\r\"; set tty 1 }
      timeout  { set tty 0 }
    }
    expect eof
    catch wait result
  " > /dev/null 2>&1
  J4_EXIT=$?
else
  # expect not available: fallback to non-TTY pipe
  printf '1\n' | pnpm teamagent > "$J4_LOG" 2>&1
  J4_EXIT=$?
fi
set -e

# Detect whether the TTY branch was entered (prompt appeared)
grep -q "选择" "$J4_LOG" 2>/dev/null && J4_TTY_BRANCH="true"
[ -f "$STATE_FILE" ] && J4_STATE_CREATED="true"

r="$(check_anchor "$J4_LOG" "装好啦" "[]" 0)"; J4_HIT_LIST="${r%|*}"; J4_HIT_COUNT="${r#*|}"
r="$(check_anchor "$J4_LOG" "🎉" "$J4_HIT_LIST" "$J4_HIT_COUNT")"; J4_HIT_LIST="${r%|*}"; J4_HIT_COUNT="${r#*|}"
r="$(check_anchor "$J4_LOG" "skeleton-demo" "$J4_HIT_LIST" "$J4_HIT_COUNT")"; J4_HIT_LIST="${r%|*}"; J4_HIT_COUNT="${r#*|}"
r="$(check_anchor "$J4_LOG" "stats" "$J4_HIT_LIST" "$J4_HIT_COUNT")"; J4_HIT_LIST="${r%|*}"; J4_HIT_COUNT="${r#*|}"
r="$(check_anchor "$J4_LOG" "\-\-help" "$J4_HIT_LIST" "$J4_HIT_COUNT")"; J4_HIT_LIST="${r%|*}"; J4_HIT_COUNT="${r#*|}"

# Pass: anchors present AND TTY branch entered AND wizard subprocess exited 0
# AND state file written. All four required — loosening any condition hides a
# broken first-run flow. Currently fails on state_file_created because W1's
# defaultSpawn(choice,[]) can't find the subcommand binary; will pass once W1
# fixes spawn to use the actual CLI entrypoint.
if [ "$J4_HIT_COUNT" -ge 3 ] && [ "$J4_TTY_BRANCH" = "true" ] && [ "$J4_EXIT" -eq 0 ] && [ "$J4_STATE_CREATED" = "true" ]; then
  J4_PASS="true"
fi
echo "[J4] exit=${J4_EXIT} anchors=${J4_HIT_COUNT}/5 tty_branch=${J4_TTY_BRANCH} state_created=${J4_STATE_CREATED} → ${J4_PASS}"

# ── J5: wizard second run ────────────────────────────────────────────────────
echo ""
echo "[J5] wizard second run (recall previous) ..."
J5_LOG="${EVIDENCE_DIR}/wizard-2.stdout"

# Seed a state file to simulate having run once before (for non-TTY envs)
mkdir -p "$(dirname "$STATE_FILE")"
printf '{"version":1,"completedSteps":["skeleton-demo"],"lastRunAt":%s}\n' "$(date +%s)000" > "$STATE_FILE"

set +e
printf '2\n' | pnpm teamagent > "$J5_LOG" 2>&1
J5_EXIT=$?
set -e

r="$(check_anchor "$J5_LOG" "上次你跑了" "[]" 0)"; J5_HIT_LIST="${r%|*}"; J5_HIT_COUNT="${r#*|}"

if [ -f "$STATE_FILE" ]; then
  if command -v jq >/dev/null 2>&1; then
    J5_COMPLETED_STEPS="$(jq '.completedSteps | length' "$STATE_FILE" 2>/dev/null || echo 0)"
  else
    J5_COMPLETED_STEPS="$(grep -o '"skeleton-demo"\|"stats"\|"--help"' "$STATE_FILE" | wc -l | tr -d ' ' 2>/dev/null || echo 0)"
  fi
fi

if [ "$J5_HIT_COUNT" -ge 1 ] && [ "${J5_COMPLETED_STEPS:-0}" -gt 0 ]; then
  J5_PASS="true"
fi
echo "[J5] exit=${J5_EXIT} anchors=${J5_HIT_COUNT} completed_steps=${J5_COMPLETED_STEPS} → ${J5_PASS}"

# ── J6: --help unchanged (diff vs baseline) ──────────────────────────────────
echo ""
echo "[J6] --help output vs baseline ..."
J6_LOG="${EVIDENCE_DIR}/help-current.stdout"
J6_DIFF="${EVIDENCE_DIR}/help-diff.log"

set +e
pnpm teamagent --help 2>/dev/null | tail -n +5 > "$J6_LOG"
set -e

BASELINE="docs/baselines/help-output.txt"
if [ -f "$BASELINE" ]; then
  diff "$BASELINE" "$J6_LOG" > "$J6_DIFF" 2>&1 || true
  J6_DIFF_BYTES="$(file_bytes "$J6_DIFF")"
  if [ "$J6_DIFF_BYTES" -eq 0 ]; then
    J6_PASS="true"
    J6_EXIT=0
  else
    J6_EXIT=1
  fi
else
  echo "BASELINE MISSING: $BASELINE" > "$J6_DIFF"
  J6_DIFF_BYTES="$(file_bytes "$J6_DIFF")"
  J6_EXIT=1
fi
echo "[J6] diff_bytes=${J6_DIFF_BYTES} → ${J6_PASS}"

# ── Determine OVERALL ─────────────────────────────────────────────────────────
OVERALL="PASS"
for p in "$J1_PASS" "$J2_PASS" "$J3_PASS" "$J4_PASS" "$J5_PASS" "$J6_PASS"; do
  [ "$p" != "true" ] && OVERALL="FAIL"
done

# ── Write judge.json ──────────────────────────────────────────────────────────
JUDGE_JSON="${OUT_DIR}/judge.json"

if command -v jq >/dev/null 2>&1; then
  jq -n \
    --arg run_id "$RUN_ID" \
    --arg overall "$OVERALL" \
    --argjson j1_exit   "$J1_EXIT"   --arg j1_pass "$J1_PASS" \
    --argjson j2_exit   "$J2_EXIT"   --arg j2_pass "$J2_PASS" --argjson j2_tests "$J2_TESTS_PASSED" \
    --argjson j3_exit   "$J3_EXIT"   --arg j3_pass "$J3_PASS" --argjson j3_hits "$J3_HIT_COUNT" --argjson j3_lines "$J3_LINE_COUNT" \
    --argjson j4_exit   "$J4_EXIT"   --arg j4_pass "$J4_PASS" --argjson j4_hits "$J4_HIT_COUNT" --arg j4_state "$J4_STATE_CREATED" --arg j4_tty "$J4_TTY_BRANCH" \
    --argjson j5_exit   "$J5_EXIT"   --arg j5_pass "$J5_PASS" --argjson j5_hits "$J5_HIT_COUNT" --argjson j5_steps "$J5_COMPLETED_STEPS" \
    --argjson j6_exit   "$J6_EXIT"   --arg j6_pass "$J6_PASS" --argjson j6_diff "$J6_DIFF_BYTES" \
    '{
      run_id: $run_id,
      feature: "issue-87-first-run-welcome",
      overall: $overall,
      checks: [
        { id:"J1", tool:"typecheck",            pass:($j1_pass=="true"), exit_code:$j1_exit, stdout_path:"evidence/typecheck.log" },
        { id:"J2", tool:"vitest",               pass:($j2_pass=="true"), exit_code:$j2_exit, tests_passed:$j2_tests, stdout_path:"evidence/vitest.log" },
        { id:"J3", tool:"postinstall",          pass:($j3_pass=="true"), exit_code:$j3_exit, anchors_hit_count:$j3_hits, line_count:$j3_lines, stdout_path:"evidence/postinstall.stdout" },
        { id:"J4", tool:"wizard-noargs-first",  pass:($j4_pass=="true"), exit_code:$j4_exit, anchors_hit_count:$j4_hits, tty_branch_entered:($j4_tty=="true"), state_file_created:($j4_state=="true"), note:"state_file_created=false expected when defaultSpawn(choice) fails; see J2 vitest for state write coverage", stdout_path:"evidence/wizard-1.stdout" },
        { id:"J5", tool:"wizard-noargs-second", pass:($j5_pass=="true"), exit_code:$j5_exit, anchors_hit_count:$j5_hits, completed_steps_count:$j5_steps, stdout_path:"evidence/wizard-2.stdout" },
        { id:"J6", tool:"help-unchanged",       pass:($j6_pass=="true"), exit_code:$j6_exit, diff_bytes:$j6_diff, stdout_path:"evidence/help-diff.log" }
      ]
    }' > "$JUDGE_JSON"
else
  # jq fallback: printf-based JSON construction (bash 3.2 compat)
  printf '{
  "run_id": "%s",
  "feature": "issue-87-first-run-welcome",
  "overall": "%s",
  "checks": [
    { "id":"J1","tool":"typecheck",            "pass":%s,"exit_code":%s,"stdout_path":"evidence/typecheck.log" },
    { "id":"J2","tool":"vitest",               "pass":%s,"exit_code":%s,"tests_passed":%s,"stdout_path":"evidence/vitest.log" },
    { "id":"J3","tool":"postinstall",          "pass":%s,"exit_code":%s,"anchors_hit_count":%s,"line_count":%s,"stdout_path":"evidence/postinstall.stdout" },
    { "id":"J4","tool":"wizard-noargs-first",  "pass":%s,"exit_code":%s,"anchors_hit_count":%s,"tty_branch_entered":%s,"state_file_created":%s,"stdout_path":"evidence/wizard-1.stdout" },
    { "id":"J5","tool":"wizard-noargs-second", "pass":%s,"exit_code":%s,"anchors_hit_count":%s,"completed_steps_count":%s,"stdout_path":"evidence/wizard-2.stdout" },
    { "id":"J6","tool":"help-unchanged",       "pass":%s,"exit_code":%s,"diff_bytes":%s,"stdout_path":"evidence/help-diff.log" }
  ]
}\n' \
  "$RUN_ID" "$OVERALL" \
  "$J1_PASS" "$J1_EXIT" \
  "$J2_PASS" "$J2_EXIT" "$J2_TESTS_PASSED" \
  "$J3_PASS" "$J3_EXIT" "$J3_HIT_COUNT" "$J3_LINE_COUNT" \
  "$J4_PASS" "$J4_EXIT" "$J4_HIT_COUNT" "$J4_TTY_BRANCH" "$J4_STATE_CREATED" \
  "$J5_PASS" "$J5_EXIT" "$J5_HIT_COUNT" "$J5_COMPLETED_STEPS" \
  "$J6_PASS" "$J6_EXIT" "$J6_DIFF_BYTES" > "$JUDGE_JSON"
fi

echo ""
echo "────────────────────────────────────────────────"
echo "Judge results:"
echo "  J1 typecheck:            ${J1_PASS}"
echo "  J2 vitest:               ${J2_PASS} (tests_passed=${J2_TESTS_PASSED})"
echo "  J3 postinstall:          ${J3_PASS} (anchors=${J3_HIT_COUNT}/6 lines=${J3_LINE_COUNT})"
echo "  J4 wizard-first:         ${J4_PASS} (anchors=${J4_HIT_COUNT}/5 tty=${J4_TTY_BRANCH} state=${J4_STATE_CREATED})"
echo "  J5 wizard-second:        ${J5_PASS} (anchors=${J5_HIT_COUNT} steps=${J5_COMPLETED_STEPS})"
echo "  J6 help-unchanged:       ${J6_PASS} (diff_bytes=${J6_DIFF_BYTES})"
echo ""
echo "OVERALL=${OVERALL}"
echo "OUT_DIR=${OUT_DIR}"
echo "────────────────────────────────────────────────"
echo ""
echo "LLM judge invocation:"
echo "  claudefast -p \"你是验收 judge。只读 ${OUT_DIR}/judge.json 和 evidence/ 下文件，不要执行任何工具。对每个 check 给 PASS/FAIL；任一 FAIL → OVERALL FAIL。最后一行输出 OVERALL: PASS|FAIL。\""

[ "$OVERALL" = "PASS" ] && exit 0 || exit 1
