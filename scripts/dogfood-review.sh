#!/usr/bin/env bash
# dogfood-review — read-only status dashboard for the active dogfood session.
#
# Shows:
#   - Active session + sandbox path (from .dogfood/active-{session,sandbox})
#   - tmux pane layout (which command is running where)
#   - Drift between LEFT and SANDBOX (uncommitted-on-LEFT vs SANDBOX file diff)
#   - Last probe verdict (if any .dogfood/probe-* runs exist)
#   - Tier-2 isolation env vars currently configured for the right pane
#
# Read-only: never modifies or kills anything.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

hr() { printf '%s\n' "------------------------------------------------------------"; }

hr
echo " DOGFOOD review  ($(date '+%Y-%m-%d %H:%M:%S'))"
hr

# --- active session + sandbox ---
SESSION="$(cat .dogfood/active-session 2>/dev/null || true)"
SANDBOX="$(cat .dogfood/active-sandbox 2>/dev/null || true)"

if [[ -z "$SESSION" || -z "$SANDBOX" ]]; then
  echo " state:    no active session  (run scripts/dogfood.sh)"
  hr
  exit 0
fi

if tmux has-session -t "$SESSION" 2>/dev/null; then
  ATTACHED=$(tmux ls 2>/dev/null | awk -v s="$SESSION" '$1 ~ s {if (/attached/) print "yes"; else print "no"}')
  echo " session:  $SESSION  (attached=$ATTACHED)"
else
  echo " session:  $SESSION  (DEAD — stale state file)"
fi
echo " sandbox:  $SANDBOX"
[[ -d "$SANDBOX" ]] || echo "           (DEAD — directory gone)"
echo

# --- tmux panes ---
if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo " panes:"
  tmux list-panes -t "$SESSION" -F '   #{pane_id}  #{pane_current_command}  cwd=#{pane_current_path}'
  echo
fi

# --- LEFT (current worktree) git status ---
LEFT_DIR="$(git rev-parse --show-toplevel)"
echo " LEFT  ($LEFT_DIR)"
LEFT_DIRTY="$(git status --porcelain | wc -l | tr -d ' ')"
echo "   uncommitted entries: $LEFT_DIRTY"
git status --porcelain | head -8 | sed 's/^/     /'
[[ "$LEFT_DIRTY" -gt 8 ]] && echo "     ... (+$((LEFT_DIRTY - 8)) more)"
echo

# --- LEFT vs SANDBOX drift ---
# `diff -rq` returns 1 when dirs differ; with `set -euo pipefail` that would
# kill the script. Run in a subshell that swallows non-zero, then count and
# truncate.
if [[ -d "$SANDBOX" ]]; then
  echo " drift LEFT -> SANDBOX  (files where they differ; up to 12)"
  DIFF_RAW="$(
    diff -rq \
      --exclude=.git \
      --exclude=node_modules \
      --exclude=dist \
      --exclude=.fastprobe \
      --exclude=.judge \
      --exclude=.codex \
      --exclude=.claude/worktrees \
      --exclude=.dogfood \
      --exclude='*.tsbuildinfo' \
      "$LEFT_DIR" "$SANDBOX" 2>/dev/null || true
  )"
  TOTAL_DRIFT="$(printf '%s\n' "$DIFF_RAW" | grep -c '.' || true)"
  if [[ -z "$DIFF_RAW" || "$TOTAL_DRIFT" -eq 0 ]]; then
    echo "   (none — LEFT and SANDBOX in sync)"
  else
    printf '%s\n' "$DIFF_RAW" | head -12 | sed 's/^/   /'
    if [[ "$TOTAL_DRIFT" -gt 12 ]]; then
      echo "   ... (+$((TOTAL_DRIFT - 12)) more drift entries)"
    fi
  fi
  echo "   resync with: bash scripts/dogfood-sync.sh"
  echo
fi

# --- last probe verdict ---
LAST_PROBE="$(find .dogfood -maxdepth 1 -type d -name 'probe-*' 2>/dev/null | sort | tail -1)"
if [[ -n "$LAST_PROBE" ]]; then
  echo " last probe: $LAST_PROBE"
  for f in "$LAST_PROBE"/*.jsonl; do
    [[ -f "$f" ]] || continue
    LINES="$(wc -l < "$f" | tr -d ' ')"
    HITS="$(grep -c '"is_error":false' "$f" 2>/dev/null || echo 0)"
    printf '   %-30s  %4s lines  %s tool_results(ok)\n' "$(basename "$f")" "$LINES" "$HITS"
  done
else
  echo " last probe: (none — run bash scripts/dogfood-probe.sh)"
fi
echo

# --- tier-2 env paths (what the right pane should be using) ---
if [[ -d "$SANDBOX/.dogfood-isolated" ]]; then
  echo " tier-2 isolated dirs in sandbox:"
  for d in "$SANDBOX/.dogfood-isolated"/*; do
    [[ -d "$d" ]] || continue
    SIZE="$(du -sh "$d" 2>/dev/null | awk '{print $1}')"
    printf '   %-15s  %s  %s\n' "$(basename "$d")" "$SIZE" "$d"
  done
  echo
fi

# --- canned-answer verify status (cached, doesn't actually re-run) ---
if [[ -f docs/dogfood/.last-verify.out ]]; then
  echo " last canned-answer verify capture: $(stat -f '%Sm' -t '%Y-%m-%d %H:%M' docs/dogfood/.last-verify.out)"
  if grep -qi 'two tmux windows' docs/dogfood/.last-verify.out 2>/dev/null \
     && grep -qi 'left/right split' docs/dogfood/.last-verify.out 2>/dev/null \
     && grep -qi 'interact' docs/dogfood/.last-verify.out 2>/dev/null; then
    echo "   anchors: ALL HIT"
  else
    echo "   anchors: SOME MISSING — run bash docs/dogfood/verify-canned-answer.sh"
  fi
fi

hr
echo " buttons:"
echo "   bash scripts/dogfood-restart.sh   # kill+relaunch (same defaults)"
echo "   bash scripts/dogfood-fresh.sh     # nuke all dogfood-* state and restart"
echo "   bash scripts/dogfood-probe.sh     # stream-json isolation verification"
echo "   bash scripts/dogfood-sync.sh      # rsync LEFT -> SANDBOX"
hr
