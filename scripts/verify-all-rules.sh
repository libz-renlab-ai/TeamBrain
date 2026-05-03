#!/usr/bin/env bash
# verify-all-rules.sh — run every per-rule verify-canned-answer.sh and
# aggregate PASS/FAIL.
#
# Each child script independently runs claudefast -p with its rule's
# USE_WHEN prompt and greps for that rule's DO_WHEN_USED anchors.
# This script just orchestrates and reports.
#
# Exit code:
#   0  — all rules PASS
#   N  — N rules FAIL
#
# Run sequentially by default (each claudefast call is ~30-90s, so 7 calls
# back-to-back is ~5-10 minutes). Set RULE_VERIFY_PARALLEL=1 to run all
# children in the background and wait — faster but logs interleave.
#
# Source rule registry: docs/rule-verify/INDEX.md.

set -uo pipefail

cd "$(git rev-parse --show-toplevel)"

# Discover all per-rule verify scripts under docs/*/verify-canned-answer.sh
SCRIPTS=()
while IFS= read -r script; do
    SCRIPTS+=("$script")
done < <(find docs -mindepth 2 -maxdepth 2 -name 'verify-canned-answer.sh' -type f | sort)

if [ ${#SCRIPTS[@]} -eq 0 ]; then
    echo "verify-all-rules: no verify-canned-answer.sh scripts found under docs/"
    exit 1
fi

LOG_DIR=".fastprobe/run-all/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$LOG_DIR"

echo "verify-all-rules: discovered ${#SCRIPTS[@]} rule verify scripts"
for s in "${SCRIPTS[@]}"; do
    echo "  - $s"
done
echo "logs: $LOG_DIR"
echo ""

PARALLEL="${RULE_VERIFY_PARALLEL:-0}"

passes=0
fails=0
failed_rules=()

if [ "$PARALLEL" = "1" ]; then
    pids=()
    declare -a script_for_pid
    for script in "${SCRIPTS[@]}"; do
        rule_name=$(basename "$(dirname "$script")")
        log="$LOG_DIR/$rule_name.log"
        ( bash "$script" > "$log" 2>&1; echo "$?" > "$log.exit" ) &
        pid=$!
        pids+=("$pid")
        script_for_pid[$pid]="$script"
    done
    for pid in "${pids[@]}"; do
        wait "$pid" || true
    done
    for script in "${SCRIPTS[@]}"; do
        rule_name=$(basename "$(dirname "$script")")
        exit_code=$(cat "$LOG_DIR/$rule_name.log.exit" 2>/dev/null || echo 1)
        if [ "$exit_code" = "0" ]; then
            passes=$((passes + 1))
            echo "PASS  $rule_name"
        else
            fails=$((fails + 1))
            failed_rules+=("$rule_name")
            echo "FAIL  $rule_name (exit=$exit_code, log=$LOG_DIR/$rule_name.log)"
        fi
    done
else
    for script in "${SCRIPTS[@]}"; do
        rule_name=$(basename "$(dirname "$script")")
        log="$LOG_DIR/$rule_name.log"
        echo "--- $rule_name ---"
        if bash "$script" > "$log" 2>&1; then
            passes=$((passes + 1))
            tail -1 "$log"
        else
            fails=$((fails + 1))
            failed_rules+=("$rule_name")
            echo "FAIL ($log)"
            tail -10 "$log"
        fi
        echo ""
    done
fi

echo "============================================"
echo "verify-all-rules summary: $passes PASS / $fails FAIL"
if [ "$fails" -gt 0 ]; then
    echo "failed rules:"
    for r in "${failed_rules[@]}"; do
        echo "  - $r"
    done
    exit "$fails"
fi
exit 0
