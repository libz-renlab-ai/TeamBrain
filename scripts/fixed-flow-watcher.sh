#!/usr/bin/env bash
# fixed-flow-watcher.sh — local poller for the FIXEDFLOW pipeline.
#
# Polls the GitHub issue tracker for issues with `grill-ready` label,
# dispatches mainpi + fixed-flow-driver skill on each new one, writes a
# heartbeat file the cloud heartbeat Action reads.
#
# Gated behind FIXEDFLOW_DRIVER_ENABLED (default 0). When 0, watcher
# logs intent but skips actual mainpi dispatch (safe to run in dev).
#
# Usage:
#   bash scripts/fixed-flow-watcher.sh                      # daemon loop
#   bash scripts/fixed-flow-watcher.sh --once               # one poll, exit
#   bash scripts/fixed-flow-watcher.sh --dry-run --issue N  # dry-run for one issue
#
# See docs/FIXEDFLOW.md, docs/plans/2026-05-09-fixed-flow/plan.md.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

STATE_DIR=".fixedflow"
PROCESSED_FILE="${STATE_DIR}/processed.json"
HEARTBEAT_FILE="${STATE_DIR}/heartbeat.json"
POLL_INTERVAL_SEC="${FIXEDFLOW_POLL_INTERVAL:-30}"
DRIVER_ENABLED="${FIXEDFLOW_DRIVER_ENABLED:-0}"
HOST="$(hostname -s 2>/dev/null || echo unknown)"

DRY_RUN=0
ONCE=0
DRY_RUN_ISSUE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --once)    ONCE=1; shift ;;
    --issue)   DRY_RUN_ISSUE="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,18p' "$0"
      exit 0
      ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

for tool in jq gh; do
  command -v "$tool" >/dev/null 2>&1 || {
    echo "[FATAL] required tool not in PATH: $tool" >&2
    exit 127
  }
done

mkdir -p "$STATE_DIR"
[ -f "$PROCESSED_FILE" ] || echo '[]' > "$PROCESSED_FILE"

ts_iso() { date -u +%Y-%m-%dT%H:%M:%SZ; }

write_heartbeat() {
  local status="${1:-running}"
  local last_seen="${2:-}"
  local tmp; tmp=$(mktemp "${HEARTBEAT_FILE}.XXXXXX")
  jq -n \
    --arg ts "$(ts_iso)" \
    --arg host "$HOST" \
    --arg status "$status" \
    --arg last_seen "$last_seen" \
    --arg driver_enabled "$DRIVER_ENABLED" \
    '{timestamp:$ts, host:$host, status:$status, last_seen_issue:$last_seen, driver_enabled:$driver_enabled}' \
    > "$tmp" && mv "$tmp" "$HEARTBEAT_FILE"
}

is_processed() {
  local num="$1"
  jq -e --argjson n "$num" 'index($n)' "$PROCESSED_FILE" >/dev/null 2>&1
}

mark_processed() {
  local num="$1"
  local tmp; tmp=$(mktemp)
  jq --argjson n "$num" '. + [$n] | unique' "$PROCESSED_FILE" > "$tmp"
  mv "$tmp" "$PROCESSED_FILE"
}

dispatch_mainpi() {
  local num="$1"
  if [ "$DRIVER_ENABLED" != "1" ]; then
    echo "[GATED] FIXEDFLOW_DRIVER_ENABLED=0; would invoke mainpi for issue ${num}"
    return 0
  fi
  if ! command -v mainpi >/dev/null 2>&1; then
    echo "[ERROR] mainpi not in PATH; cannot dispatch issue ${num}" >&2
    return 1
  fi
  echo "[DISPATCH] mainpi -> fixed-flow-driver skill, issue ${num}"
  mainpi "Use the fixed-flow-driver skill to implement issue #${num} per docs/FIXEDFLOW.md. The grill comment on the issue is your plan." &
  echo "[DISPATCHED] PID=$!"
}

# Dry-run path: emit single line, do nothing else
if [ "$DRY_RUN" = "1" ]; then
  if [ -z "$DRY_RUN_ISSUE" ]; then
    echo "[DRY] --dry-run requires --issue N" >&2
    exit 2
  fi
  echo "[DRY] would invoke mainpi for issue ${DRY_RUN_ISSUE}"
  write_heartbeat "dry-run" "$DRY_RUN_ISSUE"
  exit 0
fi

# Real polling loop
poll_once() {
  local issues
  issues=$(gh issue list \
              --label grill-ready \
              --state open \
              --limit 100 \
              --json number,title \
              --jq '.[] | .number' 2>/dev/null) || {
    echo "[WARN] gh issue list failed; will retry next tick" >&2
    write_heartbeat "gh-error" ""
    return 0
  }
  local last_seen=""
  for num in $issues; do
    last_seen="$num"
    if is_processed "$num"; then
      continue
    fi
    echo "[NEW] issue #${num} grill-ready"
    if dispatch_mainpi "$num"; then
      mark_processed "$num"
    fi
  done
  write_heartbeat "running" "$last_seen"
}

echo "[START] fixed-flow-watcher poll_interval=${POLL_INTERVAL_SEC}s driver_enabled=${DRIVER_ENABLED} host=${HOST}"
write_heartbeat "starting" ""

if [ "$ONCE" = "1" ]; then
  poll_once
  exit 0
fi

trap 'echo "[STOP] watcher exiting"; write_heartbeat "stopped" ""; exit 0' INT TERM

while true; do
  poll_once
  sleep "$POLL_INTERVAL_SEC"
done
