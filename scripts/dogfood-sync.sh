#!/usr/bin/env bash
# dogfood-sync — push uncommitted edits from LEFT (current worktree) into
# the active DOGFOOD sandbox so RIGHT pane sees them after a /clear or
# session restart.
#
# Discovers sandbox path from $LEFT/.dogfood/active-sandbox (written by
# scripts/dogfood.sh on launch). Use --sandbox <path> to override.
#
# After running, the RIGHT pane should /clear and re-trigger; claudefast
# rereads CLAUDE.md / skills / .claude/ on next prompt.

set -euo pipefail

LEFT_DIR="$(git rev-parse --show-toplevel)"
STATE_FILE="$LEFT_DIR/.dogfood/active-sandbox"
SANDBOX_DIR=""
QUIET=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --sandbox)
      SANDBOX_DIR="$2"; shift 2 ;;
    --quiet|-q)
      QUIET=1; shift ;;
    --help|-h)
      cat <<'USAGE'
Usage: bash scripts/dogfood-sync.sh [--sandbox <path>] [--quiet]

Push LEFT (current worktree) -> RIGHT (active dogfood sandbox) via rsync.
Discovers sandbox automatically from .dogfood/active-sandbox.
USAGE
      exit 0 ;;
    *)
      echo "dogfood-sync: unknown arg $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$SANDBOX_DIR" ]]; then
  if [[ ! -f "$STATE_FILE" ]]; then
    echo "dogfood-sync: no active sandbox ($STATE_FILE missing)." >&2
    echo "  Launch one first: bash scripts/dogfood.sh" >&2
    exit 1
  fi
  SANDBOX_DIR="$(<"$STATE_FILE")"
fi

if [[ ! -d "$SANDBOX_DIR" ]]; then
  echo "dogfood-sync: sandbox dir gone — $SANDBOX_DIR" >&2
  echo "  Stale .dogfood/active-sandbox; relaunch with: bash scripts/dogfood.sh" >&2
  exit 1
fi

[[ "$QUIET" == "1" ]] || echo "dogfood-sync: $LEFT_DIR -> $SANDBOX_DIR"

RSYNC_FLAGS=(-a --delete)
[[ "$QUIET" == "1" ]] || RSYNC_FLAGS+=(-v)

EXCLUDES_FILE="$LEFT_DIR/scripts/dogfood-rsync-excludes.txt"

rsync "${RSYNC_FLAGS[@]}" \
  --exclude-from="$EXCLUDES_FILE" \
  "$LEFT_DIR/" "$SANDBOX_DIR/" \
  ${QUIET:+>/dev/null} || {
    echo "dogfood-sync: rsync failed (exit $?)" >&2
    exit 1
  }

[[ "$QUIET" == "1" ]] || cat <<TIP
dogfood-sync: done.

In the RIGHT pane:
  /clear                # drop in-memory chat history
  (re-prompt)           # claudefast rereads CLAUDE.md, skills, .claude/

To clean up the sandbox itself:
  git worktree remove '$SANDBOX_DIR'
TIP
