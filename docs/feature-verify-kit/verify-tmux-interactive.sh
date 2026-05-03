#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT_DIR="$ROOT/docs/feature-verify-kit/runs"
SESSION="teamagent-feature-verify"
EXPORT_FILE="$OUT_DIR/tmux-export.md"
EXPORT_REL="docs/feature-verify-kit/runs/tmux-export"
EXPORT_TXT="$ROOT/$EXPORT_REL.txt"
EXPORT_MD="$ROOT/$EXPORT_REL.md"
PANE_FILE="$OUT_DIR/tmux-pane.txt"
mkdir -p "$OUT_DIR"

PROMPT='EXPLAIN ONLY: how do we use claude stream json and tmux + interactive claude to verify if our features work ?'

fail() {
  tmux capture-pane -t "$SESSION" -p > "$PANE_FILE" 2>/dev/null || true
  tmux kill-session -t "$SESSION" 2>/dev/null || true
  echo "FAIL: $*" >&2
  echo "See pane capture: $PANE_FILE" >&2
  exit 1
}

rm -f "$EXPORT_FILE" "$EXPORT_TXT" "$EXPORT_MD"
tmux kill-session -t "$SESSION" 2>/dev/null || true
tmux new-session -d -s "$SESSION" -x 220 -y 60 -c "$ROOT" "claudefast"

ready=0
for _i in $(seq 1 30); do
  sleep 2
  pane="$(tmux capture-pane -t "$SESSION" -p 2>/dev/null || true)"
  if printf '%s\n' "$pane" | grep -q "Claude Code"; then
    ready=1
    break
  fi
done
if [[ "$ready" -ne 1 ]]; then
  fail "claudefast interactive UI did not become ready within 60s"
fi

tmux send-keys -t "$SESSION" C-u
tmux send-keys -t "$SESSION" "$PROMPT"
tmux send-keys -t "$SESSION" C-m

# Wait for the LLM response to fully stream. Poll every 3s for up to 180s,
# break as soon as the bottom of the pane no longer shows "esc to interrupt"
# (claude's streaming-active marker) and no longer shows "queued messages".
for _i in $(seq 1 60); do
  sleep 3
  pane_tail=$(tmux capture-pane -t "$SESSION" -p | tail -8)
  if echo "$pane_tail" | grep -q "Do you want to proceed?"; then
    tmux send-keys -t "$SESSION" "1"
    sleep 1
    tmux send-keys -t "$SESSION" C-m
    continue
  fi
  if echo "$pane_tail" | grep -qE "esc to interrupt|queued messages"; then
    continue
  fi
  break
done

# Give Stop-hook follow-up turns time to settle before submitting a slash
# command. Otherwise /export can be queued behind a still-active turn.
sleep 10

tmux send-keys -t "$SESSION" C-u
# Current Claude Code resolves absolute /export paths incorrectly in this
# environment (it strips the leading slash and appends .txt). Use a repo-
# relative stem, then normalize whichever file the CLI creates to the expected
# PR artifact path.
tmux send-keys -t "$SESSION" "/export $EXPORT_REL"
tmux send-keys -t "$SESSION" C-m
# /export is a slash command and may also queue if claude is mid-turn; poll
# for the file to actually appear on disk before continuing.
for _j in $(seq 1 30); do
  sleep 2
  if [[ -s "$EXPORT_FILE" || -s "$EXPORT_TXT" || -s "$EXPORT_MD" ]]; then
    break
  fi
done

tmux capture-pane -t "$SESSION" -p > "$PANE_FILE"
tmux send-keys -t "$SESSION" "/exit" C-m
sleep 1
tmux kill-session -t "$SESSION" 2>/dev/null || true

if [[ ! -s "$EXPORT_FILE" ]]; then
  if [[ -s "$EXPORT_TXT" ]]; then
    mv "$EXPORT_TXT" "$EXPORT_FILE"
  elif [[ -s "$EXPORT_MD" ]]; then
    mv "$EXPORT_MD" "$EXPORT_FILE"
  fi
fi

if [[ ! -s "$EXPORT_FILE" ]]; then
  export_error="$(grep -A2 -E "Failed to export conversation|Conversation exported to|/export" "$PANE_FILE" | tail -20 || true)"
  echo "FAIL: /export did not create $EXPORT_FILE, $EXPORT_TXT, or $EXPORT_MD" >&2
  if [[ -n "$export_error" ]]; then
    echo "Export-related pane output:" >&2
    printf '%s\n' "$export_error" >&2
  fi
  echo "See pane capture: $PANE_FILE" >&2
  exit 1
fi

echo "Wrote: $EXPORT_FILE"
echo "Wrote: $PANE_FILE"
