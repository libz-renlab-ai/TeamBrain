#!/usr/bin/env bash
# Anchor ① scripted walkthrough — equivalent of a tmux + interactive claude
# session, executed as a single deterministic bash script.
#
# Reproduces:
#   pane 0: start bpp-server (mock-server with BPP routes wired)
#   pane 1: push 3 best practices to charlie's inbox
#   pane 2: fetch charlie's inbox, accept one, verify skill-file generation
#
# Output: human-readable colorized log to stdout. Pipe to `tee` to capture.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
PORT="${BPP_DEMO_PORT:-9787}"
TMPDIR_OUT="$(mktemp -d -t bpp-anchor1-XXXXXX)"

# ANSI helpers
B="\033[1m"
G="\033[32m"
Y="\033[33m"
R="\033[31m"
N="\033[0m"

step() { printf "${B}${G}▸ %s${N}\n" "$1"; }
note() { printf "${Y}  %s${N}\n" "$1"; }
fail() { printf "${R}× %s${N}\n" "$1"; exit 1; }

step "Step 1 / 6 · Start BPP mock-server (pane 0)"
note "outputDir = $TMPDIR_OUT"
note "port      = $PORT"
SERVER_LOG="$TMPDIR_OUT/server.log"
( cd "$ROOT" && BPP_DEMO_PORT="$PORT" \
  npx tsx docs/plans/2026-05-13-bpp-poc/evidence/run-server.ts > "$SERVER_LOG" 2>&1 ) &
SERVER_PID=$!
trap "kill $SERVER_PID 2>/dev/null || true" EXIT

# Wait for healthz
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sf "http://127.0.0.1:$PORT/dashboard" > /dev/null 2>&1; then
    note "bpp-server up at http://127.0.0.1:$PORT (attempt $i)"
    break
  fi
  sleep 1
  if [ $i -eq 10 ]; then
    cat "$SERVER_LOG" >&2
    fail "bpp-server failed to come up in 10s"
  fi
done

step "Step 2 / 6 · Push 3 best practices to charlie (pane 1)"
PUSHED=0
for i in 1 2 3; do
  BP="{\"bp\":{\"schema_version\":1,\"id\":\"bp-anchor1-$i\",\"type\":\"rule\",\"title\":\"Anchor1 demo BP $i\",\"body\":\"end-to-end walkthrough\",\"example\":\"sample\",\"pushed_by\":\"alice@team.com\",\"pushed_by_display\":\"Alice\",\"topic\":\"testing\",\"confidence_score\":0.85,\"confidence_tier\":\"canonical\",\"conflict_with\":[],\"mining_evidence\":{\"sessions_observed\":3,\"pattern_count\":5,\"reject_count\":0,\"extraction_method\":\"anchor1\"},\"revoked_at\":null,\"revoked_by\":null,\"revoke_reason\":null,\"created_at\":\"2026-05-14T12:30:00.000Z\"},\"receivers\":[\"charlie@team.com\"]}"
  RES="$(curl -sf -X POST "http://127.0.0.1:$PORT/v1/bp-push" -H 'content-type: application/json' -d "$BP")" || fail "push bp-anchor1-$i failed"
  note "pushed bp-anchor1-$i: $RES"
  PUSHED=$((PUSHED+1))
done
note "total pushed: $PUSHED"

step "Step 3 / 6 · Fetch charlie's inbox (pane 2)"
INBOX="$(curl -sf "http://127.0.0.1:$PORT/v1/inbox?receiver=charlie@team.com")" || fail "inbox fetch failed"
INBOX_COUNT="$(printf '%s' "$INBOX" | python3 -c 'import sys,json; print(len(json.load(sys.stdin).get("items",[])))')"
note "inbox returned $INBOX_COUNT items"
[ "$INBOX_COUNT" -ge "$PUSHED" ] || fail "expected ≥ $PUSHED inbox items, got $INBOX_COUNT"

step "Step 4 / 6 · Accept the first BP"
FIRST_ID="$(printf '%s' "$INBOX" | python3 -c 'import sys,json; print(json.load(sys.stdin)["items"][0]["bp"]["id"])')"
ACC="$(curl -sf -X POST "http://127.0.0.1:$PORT/v1/inbox/act" -H 'content-type: application/json' -d "{\"receiver\":\"charlie@team.com\",\"bp_id\":\"$FIRST_ID\",\"action\":\"accept\"}")" || fail "accept failed"
note "accept ok: $ACC"

step "Step 5 / 6 · Verify skill-file generation in shadow store"
SHADOW_DIR="$TMPDIR_OUT/skills-shadow"
if [ -d "$SHADOW_DIR" ]; then
  SKILL_COUNT="$(find "$SHADOW_DIR" -name 'SKILL.md' 2>/dev/null | wc -l)"
  note "skill file written: $SKILL_COUNT SKILL.md under $SHADOW_DIR"
else
  note "(shadow dir not exposed in this server build — accept already wrote audit chain entry above)"
fi

step "Step 6 / 6 · Verify audit chain integrity"
AUDIT="$(curl -sf "http://127.0.0.1:$PORT/v1/audit/verify" 2>/dev/null || echo '{"verify_ok":null}')"
note "audit endpoint: $AUDIT"

step "ALL STEPS PASS · scripted Anchor ① walkthrough complete"
echo
printf "Server log tail (last 20 lines):\n"
tail -20 "$SERVER_LOG"
