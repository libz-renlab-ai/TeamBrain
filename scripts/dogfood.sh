#!/usr/bin/env bash
# DOGFOOD launcher — left = dev claude (current worktree),
#                    right = sandbox claudefast in an isolated git worktree.
#
# Sandbox semantics:
#   - RIGHT pane runs in $MAIN_REPO/.codex/worktrees/dogfood-<epoch>, a fresh
#     `git worktree add --detach HEAD` of the repo. Sandbox files are
#     PHYSICALLY SEPARATE from LEFT — edits on LEFT do NOT immediately leak
#     to RIGHT. This makes it a real sandbox, not just a second view.
#   - At launch, uncommitted edits in LEFT are rsync'd into the sandbox so
#     in-progress work is visible. After launch, push more edits LEFT->RIGHT
#     with: bash scripts/dogfood-sync.sh
#   - When done, clean up with: git worktree remove <SANDBOX_DIR>
#
# Mechanics:
#   - `claudefast` is a zsh shell function in ~/.zshrc, NOT a binary. We
#     never use tmux's command-string (which runs commands via a
#     non-interactive shell that does not source ~/.zshrc); instead we let
#     tmux spawn its default interactive shell in each pane and use
#     `tmux send-keys` to type the launcher.
#   - Pane targeting uses tmux pane_id ("%N"), captured before/after each
#     split, so the script is robust to `pane-base-index` in user's
#     .tmux.conf.
#
# See docs/DOGFOOD.md for the full rule.

set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: bash scripts/dogfood.sh [--help]

Pops two tmux panes in left/right split:
  LEFT  = dev claude in your current worktree (edit-side).
  RIGHT = sandbox claudefast in an isolated git worktree (live-preview).

Env overrides:
  DOGFOOD_LEFT_CMD       command for left pane     (default: claude)
  DOGFOOD_RIGHT_CMD      command for right pane    (default: claudefast)
  DOGFOOD_SESSION_NAME   tmux session name         (default: dogfood-<epoch>)
  DOGFOOD_SANDBOX_NAME   sandbox worktree name     (default: dogfood-<epoch>)
USAGE
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

if ! command -v tmux >/dev/null 2>&1; then
  echo "DOGFOOD: tmux not found. Please install tmux first." >&2
  exit 1
fi

LEFT_CMD="${DOGFOOD_LEFT_CMD:-claude}"
RIGHT_CMD="${DOGFOOD_RIGHT_CMD:-claudefast}"
EPOCH="$(date +%s)"
SESSION_NAME="${DOGFOOD_SESSION_NAME:-dogfood-$EPOCH}"
SANDBOX_NAME="${DOGFOOD_SANDBOX_NAME:-dogfood-$EPOCH}"

LEFT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
# Resolve MAIN repo root (parent of common .git) so sandbox worktrees land
# in main repo's .codex/worktrees/, not nested under the current worktree.
MAIN_REPO_ROOT="$(cd "$(git rev-parse --git-common-dir)/.." && pwd)"
SANDBOX_DIR="$MAIN_REPO_ROOT/.codex/worktrees/$SANDBOX_NAME"

SANDBOX_REUSED=0
if [[ -d "$SANDBOX_DIR" ]]; then
  SANDBOX_REUSED=1
  echo "DOGFOOD: reusing existing sandbox $SANDBOX_DIR" >&2
else
  mkdir -p "$MAIN_REPO_ROOT/.codex/worktrees"
  echo "DOGFOOD: creating sandbox worktree (detached HEAD) at $SANDBOX_DIR..."
  git worktree add --detach "$SANDBOX_DIR" HEAD >/dev/null
fi

# Push LEFT edits into the sandbox. On a fresh worktree we do a full rsync so
# uncommitted work-in-progress is visible. On reuse we limit the sync to
# tracked-but-modified + untracked files so warm relaunches stay cheap.
EXCLUDES_FILE="$LEFT_DIR/scripts/dogfood-rsync-excludes.txt"
if [[ "$SANDBOX_REUSED" == "1" ]]; then
  echo "DOGFOOD: incremental rsync (only changed files) LEFT -> SANDBOX..."
  ( cd "$LEFT_DIR" && \
    { git diff --name-only HEAD; git ls-files --others --exclude-standard; } | sort -u
  ) | rsync -a --files-from=- \
        --exclude-from="$EXCLUDES_FILE" \
        "$LEFT_DIR/" "$SANDBOX_DIR/" >/dev/null
else
  echo "DOGFOOD: full rsync LEFT -> SANDBOX..."
  rsync -a --delete \
    --exclude-from="$EXCLUDES_FILE" \
    "$LEFT_DIR/" "$SANDBOX_DIR/" >/dev/null
fi

# Stamp active sandbox path so dogfood-sync.sh and tooling can find it.
mkdir -p "$LEFT_DIR/.dogfood"
echo "$SANDBOX_DIR" > "$LEFT_DIR/.dogfood/active-sandbox"
echo "$SESSION_NAME"  > "$LEFT_DIR/.dogfood/active-session"

# Isolation tier (1=worktree only, 2=+CLAUDE_CONFIG_DIR/CODEX_HOME,
# 3=+private HOME, 4=container). Default = 2. Opt-down or up via env.
DOGFOOD_TIER="${DOGFOOD_TIER:-2}"
SANDBOX_ISOLATED_DIR="$SANDBOX_DIR/.dogfood-isolated"
SANDBOX_CLAUDE_CFG="$SANDBOX_ISOLATED_DIR/claude-config"
SANDBOX_CODEX_HOME="$SANDBOX_ISOLATED_DIR/codex-home"
SANDBOX_HOME="$SANDBOX_ISOLATED_DIR/home"
mkdir -p "$SANDBOX_CLAUDE_CFG" "$SANDBOX_CODEX_HOME"

# For Tier 3 (private HOME): write a sandbox .zshrc that sources the user's
# real ~/.zshrc (to inherit PATH + the `claudefast` shell function — note
# the API token stays in the original file and is NEVER copied into the
# sandbox), then layers our Tier 2 shim on top with HOME-aware paths.
# Side effects of the user's zshrc (e.g. `cd ~/projects`) are wrapped in a
# best-effort block; failures are silenced so the new shell still starts.
if [[ "$DOGFOOD_TIER" == "3" ]]; then
  ORIGINAL_HOME="$HOME"
  USER_ZSHRC="$ORIGINAL_HOME/.zshrc"
  mkdir -p "$SANDBOX_HOME"

  # Sandbox .zshrc — generated, references absolute paths. No token here.
  cat > "$SANDBOX_HOME/.zshrc" <<ZSHRC
# Auto-generated by scripts/dogfood.sh (DOGFOOD Tier 3).
# DO NOT commit. The sandbox is meant to be discarded.

# Pull the user's real shell init for PATH + the claudefast function.
# Side effects (cd, exports referencing real \$HOME paths) are silenced.
if [ -f "$USER_ZSHRC" ]; then
  {
    setopt no_err_exit 2>/dev/null || true
    source "$USER_ZSHRC"
  } 2>/dev/null || true
fi

# Tier 2 shim env (CLAUDE_CONFIG_DIR / CODEX_HOME redirect for the spawned
# claude binary, applied via subshell-shadowed \`claude\` in dogfood-shim.sh).
export DOGFOOD_CLAUDE_CONFIG_DIR="$SANDBOX_CLAUDE_CFG"
export DOGFOOD_CODEX_HOME="$SANDBOX_CODEX_HOME"
export DOGFOOD_TIER=3
export DOGFOOD_SHIM_QUIET=1

# Source the shim from the sandbox copy (rsync'd by dogfood.sh on launch).
SHIM="$SANDBOX_DIR/scripts/dogfood-shim.sh"
if [ -f "\$SHIM" ]; then
  source "\$SHIM"
fi

# Banner so the operator can see they're in Tier 3.
echo "[DOGFOOD Tier 3]"
echo "  HOME              = \$HOME"
echo "  CLAUDE_CONFIG_DIR -> \$DOGFOOD_CLAUDE_CONFIG_DIR"
echo "  CODEX_HOME        -> \$DOGFOOD_CODEX_HOME"
echo "  Note: auto-memory at ~/.claude/projects/* is now redirected too."
ZSHRC
fi

cat <<INFO
Spawning DOGFOOD (tier $DOGFOOD_TIER):
  LEFT  pane = $LEFT_CMD     in $LEFT_DIR
  RIGHT pane = $RIGHT_CMD    in $SANDBOX_DIR
  session    = $SESSION_NAME
  isolation overrides for the right pane (Tier 2):
    CLAUDE_CONFIG_DIR -> $SANDBOX_CLAUDE_CFG
    CODEX_HOME        -> $SANDBOX_CODEX_HOME
    HOME (claude only)-> $SANDBOX_HOME            (env override on spawn; right-pane shell HOME unchanged)
$([[ "$DOGFOOD_TIER" == "3" ]] && echo "    HOME (full shell) -> $SANDBOX_HOME            (Tier 3 — exec env HOME=… zsh -i)")
$([[ "$DOGFOOD_TIER" == "4" ]] && echo "    container image   -> see scripts/dogfood-tier4.sh")
  resync:      bash scripts/dogfood-sync.sh
  probe:       bash scripts/dogfood-probe.sh   (verify isolation via stream-json)
  cleanup:     git worktree remove '$SANDBOX_DIR'
INFO

# apply_dogfood_options — enable mouse (click-to-focus + scroll-wheel
# scrollback) and bump history-limit so the rollable scrollback is
# meaningful. Server-global tmux options; idempotent.
apply_dogfood_options() {
  tmux set -gq mouse on            2>/dev/null || true
  tmux set -gq history-limit 50000 2>/dev/null || true
}

# Build the right-pane launch command per tier. printf %q for safe quoting.
case "$DOGFOOD_TIER" in
  3)
    # Tier 3: exec a fresh zsh with private HOME. The sandbox .zshrc
    # already loads claudefast + dogfood-shim and sets the override env;
    # caller just types `claudefast` once shell is up. We auto-launch
    # claudefast for ergonomics — same as Tier 2.
    printf -v RIGHT_LAUNCH \
      'exec env HOME=%q zsh -i -c %q' \
      "$SANDBOX_HOME" \
      ". \"$SANDBOX_HOME/.zshrc\" && exec zsh -i"
    # Note: -c sources zshrc then re-execs interactive zsh so the user
    # lands in a real interactive session with all the tier-3 env applied.
    ;;
  2)
    if [[ "$RIGHT_CMD" == "claudefast" ]]; then
      mkdir -p "$SANDBOX_HOME"
      printf -v RIGHT_LAUNCH \
        'export DOGFOOD_CLAUDE_CONFIG_DIR=%q DOGFOOD_CODEX_HOME=%q DOGFOOD_HOME=%q && source ./scripts/dogfood-shim.sh && %s' \
        "$SANDBOX_CLAUDE_CFG" "$SANDBOX_CODEX_HOME" "$SANDBOX_HOME" "$RIGHT_CMD"
    else
      RIGHT_LAUNCH="$RIGHT_CMD"
    fi
    ;;
  4)
    if [[ -x "$LEFT_DIR/scripts/dogfood-tier4.sh" ]]; then
      printf -v RIGHT_LAUNCH 'bash %q' "$LEFT_DIR/scripts/dogfood-tier4.sh"
    else
      echo "DOGFOOD: Tier 4 selected but scripts/dogfood-tier4.sh not executable; falling back to Tier 2." >&2
      printf -v RIGHT_LAUNCH \
        'export DOGFOOD_CLAUDE_CONFIG_DIR=%q DOGFOOD_CODEX_HOME=%q && source ./scripts/dogfood-shim.sh && %s' \
        "$SANDBOX_CLAUDE_CFG" "$SANDBOX_CODEX_HOME" "$RIGHT_CMD"
    fi
    ;;
  1)
    RIGHT_LAUNCH="$RIGHT_CMD"
    ;;
  *)
    echo "DOGFOOD: unknown DOGFOOD_TIER=$DOGFOOD_TIER (valid: 1-4)" >&2
    exit 1
    ;;
esac

if [[ -n "${TMUX:-}" ]]; then
  # Inside an existing tmux session — split current window.
  apply_dogfood_options
  ORIG_PANE_ID="$(tmux display-message -p '#{pane_id}')"
  tmux split-window -h -c "$SANDBOX_DIR"
  NEW_PANE_ID="$(tmux display-message -p '#{pane_id}')"
  tmux send-keys -t "$ORIG_PANE_ID" "cd '$LEFT_DIR' && $LEFT_CMD" Enter
  tmux send-keys -t "$NEW_PANE_ID"  "$RIGHT_LAUNCH" Enter
  tmux select-pane -t "$ORIG_PANE_ID"
  echo "DOGFOOD: split current tmux window."
  echo "  LEFT=$LEFT_DIR  RIGHT=$SANDBOX_DIR"
  echo "  Mouse: click any pane to focus; scroll-wheel = scrollback."
else
  # No tmux yet — create a session, send-keys into each pane.
  tmux new-session -d -s "$SESSION_NAME" -c "$LEFT_DIR"
  apply_dogfood_options
  ORIG_PANE_ID="$(tmux display-message -p -t "$SESSION_NAME" '#{pane_id}')"
  tmux send-keys -t "$ORIG_PANE_ID" "$LEFT_CMD" Enter
  tmux split-window -h -t "$SESSION_NAME" -c "$SANDBOX_DIR"
  NEW_PANE_ID="$(tmux display-message -p -t "$SESSION_NAME" '#{pane_id}')"
  tmux send-keys -t "$NEW_PANE_ID" "$RIGHT_LAUNCH" Enter
  tmux select-pane -t "$ORIG_PANE_ID"
  echo "DOGFOOD: created tmux session '$SESSION_NAME'. Attaching..."
  echo "  Mouse: click any pane to focus; scroll-wheel = scrollback."
  exec tmux attach -t "$SESSION_NAME"
fi
