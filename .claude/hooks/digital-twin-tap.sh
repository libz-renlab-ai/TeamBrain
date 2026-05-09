#!/bin/bash
# issue #204: digital-twin Stop hook tap shim — mirrors the B-103 pattern
# already established by .claude/hooks/teamagent-stop.sh.
#
# Why a shell wrapper:
# - .claude/settings.json references packages/cli/dist/bin-digital-twin-tap.cjs
# - That .cjs is built by `pnpm -C packages/cli build:hook` and lives under
#   the gitignored dist/ tree, so any user with a stale dist (including a
#   fresh worktree pre-build, or the parent checkout right after PR #198 was
#   merged) hits MODULE_NOT_FOUND and the Stop hook spams a node loader trace.
# - bin-digital-twin-tap.ts's own contract says "NEVER exits non-zero. Stop
#   hook must not block session close." — but node loader fails before that
#   source ever runs, so the guarantee must live one layer up, in the shell.
#
# Behaviour:
#   1. Resolve <repo> from CLAUDE_PROJECT_DIR (else BASH_SOURCE relative path)
#   2. Look for <repo>/packages/cli/dist/bin-digital-twin-tap.cjs
#   3. If found: forward stdin to `node <bin>`, swallow non-zero so Stop never
#      blocks session close
#   4. If missing: silent exit 0 — same as teamagent-stop.sh's "developers
#      should run pnpm build" stance
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

if [[ -f "$BIN" ]]; then
  printf '%s' "$INPUT" | node "$BIN" || true
  exit 0
fi

# Bin not built yet (gitignored dist/ has no bin-digital-twin-tap.cjs).
# Silent exit 0 keeps the Stop hook chain quiet; rebuilding the cli package
# wakes the hook back up automatically.
exit 0
