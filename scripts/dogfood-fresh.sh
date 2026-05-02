#!/usr/bin/env bash
# dogfood-fresh — aggressive clean slate.
#
#   1. Kill the active dogfood tmux session.
#   2. Remove ALL dogfood-* git worktrees under <main-repo>/.codex/worktrees/
#      (not just the active one — useful when previous restarts crashed and
#      left orphaned worktrees behind).
#   3. Purge .dogfood/probe-* probe artifacts.
#   4. Close any Terminal.app windows whose tab title contains 'DOGFOOD'.
#   5. Relaunch `bash scripts/dogfood.sh` and pop a new Terminal window.
#
# Use when: things feel stuck, you've accumulated multiple sandboxes, or you
# want a totally pristine start. Honors DOGFOOD_TIER=N to pick a tier on
# relaunch.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

MAIN_REPO_ROOT="$(cd "$(git rev-parse --git-common-dir)/.." && pwd)"

# 1. kill all dogfood-* tmux sessions
mapfile_compat() { while IFS= read -r line; do printf '%s\n' "$line"; done; }
for s in $(tmux ls 2>/dev/null | awk -F: '/^dogfood-/ {print $1}'); do
  echo "[fresh] killing tmux session: $s"
  tmux kill-session -t "$s" 2>/dev/null || true
done

# 2. remove all dogfood-* git worktrees in parallel (each remove is git I/O bound)
if [[ -d "$MAIN_REPO_ROOT/.codex/worktrees" ]]; then
  remove_pids=()
  while IFS= read -r wt_path; do
    [[ -n "$wt_path" ]] || continue
    [[ -d "$wt_path" ]] || continue
    echo "[fresh] removing sandbox worktree: $wt_path"
    ( git worktree remove --force "$wt_path" 2>/dev/null || rm -rf "$wt_path" ) &
    remove_pids+=("$!")
  done < <(find "$MAIN_REPO_ROOT/.codex/worktrees" -maxdepth 1 -type d -name 'dogfood-*' 2>/dev/null)
  for pid in "${remove_pids[@]}"; do wait "$pid" 2>/dev/null || true; done
  git worktree prune 2>/dev/null || true
fi

# 3. purge probe artifacts
if [[ -d .dogfood ]]; then
  echo "[fresh] purging probe artifacts under .dogfood/"
  find .dogfood -maxdepth 1 -type d -name 'probe-*' -exec rm -rf {} + 2>/dev/null || true
fi
rm -f .dogfood/active-sandbox .dogfood/active-session

# 4. close Terminal windows that look like dogfood attaches
osascript <<'EOF' 2>/dev/null || true
tell application "Terminal"
  set toClose to {}
  repeat with w in windows
    repeat with t in tabs of w
      try
        if (custom title of t as text) contains "DOGFOOD" then
          set end of toClose to w
        end if
      end try
    end repeat
  end repeat
  repeat with w in toClose
    try
      close w saving no
    end try
  end repeat
end tell
EOF

# 5. relaunch
echo "[fresh] launching fresh dogfood (DOGFOOD_TIER=${DOGFOOD_TIER:-2})..."
bash scripts/dogfood.sh || true

NEW_SESSION="$(cat .dogfood/active-session 2>/dev/null || true)"
if [[ -z "$NEW_SESSION" ]] || ! tmux has-session -t "$NEW_SESSION" 2>/dev/null; then
  echo "[fresh] FAIL: no new session after relaunch" >&2
  exit 1
fi

echo "[fresh] popping Terminal window for $NEW_SESSION"
osascript <<EOF
tell application "Terminal"
  activate
  do script "clear; echo '== DOGFOOD fresh → $NEW_SESSION =='; tmux attach -t $NEW_SESSION"
end tell
EOF
sleep 1
osascript <<'EOF' 2>/dev/null || true
tell application "Terminal"
  activate
  set miniaturized of every window to false
  set index of front window to 1
end tell
tell application "System Events"
  set frontmost of process "Terminal" to true
end tell
EOF

echo "[fresh] DONE — session $NEW_SESSION"
