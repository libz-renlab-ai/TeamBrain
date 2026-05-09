#!/bin/bash
# issue #204: digital-twin Stop hook tap shim — mirrors the B-103 pattern
# already established by .claude/hooks/teamagent-stop.sh, plus two extra
# safeguards added in PR #205 review per adversarial findings:
#
# (1) SIGNAL FORWARDING. Claude Code SIGTERMs the bash wrapper at the 5s hook
#     timeout. A naive `... | node "$BIN"` pipeline gets bash killed and
#     leaves the node child reparented to launchd/init, where it keeps
#     running after the hook "completed". The wrapper instead spawns node
#     in the background, traps SIGTERM/SIGINT, and forwards the signal so
#     node dies cleanly within the hook's lifetime.
#
# (2) BROKEN-BIN STDERR CAPTURE. issue #204 was about MODULE_NOT_FOUND when
#     dist/bin-digital-twin-tap.cjs is missing. But node ALSO prints loader
#     traces when the bin EXISTS yet throws (corrupted .cjs, SyntaxError,
#     missing native dep). To honor the spirit of #204 (no Stop trace spam
#     in the session), node's stderr is redirected to a per-user error log
#     ~/.teamagent/digital-twin-tap.err.log. Falls back to /dev/null if the
#     log path isn't writable so the wrapper itself never spams stderr.
#
# Why a shell wrapper at all:
# - .claude/settings.json references packages/cli/dist/bin-digital-twin-tap.cjs
# - That .cjs is built by `pnpm -C packages/cli build:hook` and lives under
#   the gitignored dist/ tree, so any user with a stale dist (parent checkout
#   right after PR #198 was merged, fresh worktree pre-build, etc.) hits
#   MODULE_NOT_FOUND and the Stop hook chain spams a node loader trace.
# - bin-digital-twin-tap.ts's own contract says "NEVER exits non-zero. Stop
#   hook must not block session close." — but node loader fails before that
#   source ever runs, so the guarantee must live one layer up, in the shell.
#
# Behaviour summary:
#   - bin missing  -> silent exit 0
#   - bin present  -> forward stdin to `node $BIN`, swallow stderr to err log,
#                     trap signals to avoid orphaning, exit 0 either way
#
# When the bin reappears (after the next `pnpm -C packages/cli build:hook`)
# the hook starts working again automatically with no settings change.

set -uo pipefail

# Read hook payload up front so we can forward it intact to the chosen binary.
INPUT=$(cat)

resolve_project_dir() {
  if [[ -n "${CLAUDE_PROJECT_DIR:-}" ]]; then
    printf '%s' "$CLAUDE_PROJECT_DIR"
    return
  fi
  cd "$(dirname "${BASH_SOURCE[0]}")/../.." 2>/dev/null && pwd
}

PROJECT_DIR="$(resolve_project_dir)"

if [[ -z "$PROJECT_DIR" ]]; then
  exit 0
fi

BIN="$PROJECT_DIR/packages/cli/dist/bin-digital-twin-tap.cjs"

if [[ ! -f "$BIN" ]]; then
  # Bin not built yet (gitignored dist/ has no bin-digital-twin-tap.cjs).
  # Silent exit 0 keeps the Stop hook chain quiet; rebuilding the cli package
  # wakes the hook back up automatically.
  exit 0
fi

# Resolve a writable stderr destination. Default: ~/.teamagent/<log>.
# Falls back to /dev/null if the dir can't be created or the file can't be
# appended to (read-only $HOME, missing $HOME, sandboxed, etc.) so the
# wrapper itself never re-introduces the spam it was added to suppress.
ERR_LOG="${HOME:-/tmp}/.teamagent/digital-twin-tap.err.log"
if ! mkdir -p "$(dirname "$ERR_LOG")" 2>/dev/null; then
  ERR_LOG=/dev/null
fi
if ! { : >>"$ERR_LOG"; } 2>/dev/null; then
  ERR_LOG=/dev/null
fi

# Background spawn so SIGTERM at the 5s hook timeout reaches us before
# node finishes; trap forwards the signal so node dies in-tree instead of
# being orphaned to launchd/init.
printf '%s' "$INPUT" | node "$BIN" 2>>"$ERR_LOG" &
NODE_PID=$!
trap 'kill -TERM "$NODE_PID" 2>/dev/null; wait "$NODE_PID" 2>/dev/null; exit 0' TERM INT
wait "$NODE_PID" 2>/dev/null || true
exit 0
