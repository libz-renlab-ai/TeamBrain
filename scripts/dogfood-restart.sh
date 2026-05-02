#!/usr/bin/env bash
# dogfood-restart — kill the active dogfood tmux session, remove its sandbox
# worktree, relaunch a fresh `bash scripts/dogfood.sh`, pop a Terminal window.
#
# Use when: you want a clean slate but on the same tier / same defaults.
# Use scripts/dogfood-fresh.sh for a more aggressive purge (probe artifacts,
# all dogfood-* worktrees on disk, not just the active one).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

OLD_SESSION="$(cat .dogfood/active-session 2>/dev/null || true)"
OLD_SANDBOX="$(cat .dogfood/active-sandbox 2>/dev/null || true)"

if [[ -n "$OLD_SESSION" ]]; then
  echo "[restart] killing tmux session: $OLD_SESSION"
  tmux kill-session -t "$OLD_SESSION" 2>/dev/null || echo "  (already gone)"
fi
if [[ -n "$OLD_SANDBOX" && -d "$OLD_SANDBOX" ]]; then
  echo "[restart] removing sandbox worktree: $OLD_SANDBOX"
  git worktree remove --force "$OLD_SANDBOX" 2>/dev/null || echo "  (failed; may need manual cleanup)"
fi

rm -f .dogfood/active-sandbox .dogfood/active-session

echo "[restart] launching fresh dogfood..."
bash scripts/dogfood.sh || true

NEW_SESSION="$(cat .dogfood/active-session 2>/dev/null || true)"
if [[ -z "$NEW_SESSION" ]] || ! tmux has-session -t "$NEW_SESSION" 2>/dev/null; then
  echo "[restart] FAIL: no new session after relaunch" >&2
  exit 1
fi

echo "[restart] popping Terminal window for $NEW_SESSION"
osascript <<EOF
tell application "Terminal"
  activate
  do script "clear; echo '== DOGFOOD restart → $NEW_SESSION =='; tmux attach -t $NEW_SESSION"
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

echo "[restart] DONE — session $NEW_SESSION"
