#!/usr/bin/env bash
# dogfood-shim — Tier 2 isolation shim for the DOGFOOD right pane.
#
# Source this BEFORE calling `claudefast`. It redefines `claudefast` in the
# current shell so that, although the user's original claudefast still sets
# its model / API / token env vars, the actual claude binary is exec'd with
# CLAUDE_CONFIG_DIR (and CODEX_HOME) pointed at sandbox-private paths.
#
# Mechanism: run claudefast inside a subshell where the `claude` command is
# shadowed by a function that prepends `env CLAUDE_CONFIG_DIR=...
# CODEX_HOME=...` before invoking the real binary via `command claude`.
# claudefast's own `export CLAUDE_CONFIG_DIR=$HOME/.claude-minimax` happens
# normally; our shadow overrides it at exec time only. The token never
# leaves the original function and is never written to disk.
#
# Required env (set by scripts/dogfood.sh before sourcing):
#   DOGFOOD_CLAUDE_CONFIG_DIR   target user-level CLAUDE config dir
# Optional:
#   DOGFOOD_CODEX_HOME          target CODEX_HOME (defaults to existing)
#   DOGFOOD_HOME                target HOME for the spawned claude process
#                               only (does NOT change the surrounding shell's
#                               HOME; redirects ~/.claude/projects auto-memory
#                               and any other ~/.X path the agent reads)

if [[ -z "${DOGFOOD_CLAUDE_CONFIG_DIR:-}" ]]; then
  echo "dogfood-shim: DOGFOOD_CLAUDE_CONFIG_DIR is required" >&2
  return 1 2>/dev/null || exit 1
fi

mkdir -p "$DOGFOOD_CLAUDE_CONFIG_DIR"
[[ -n "${DOGFOOD_CODEX_HOME:-}" ]] && mkdir -p "$DOGFOOD_CODEX_HOME"

# Confirm claudefast is visible in this shell (it must be a zsh function from
# the user's ~/.zshrc).
if ! type claudefast >/dev/null 2>&1; then
  echo "dogfood-shim: claudefast not defined in this shell — run from interactive zsh" >&2
  return 1 2>/dev/null || exit 1
fi

# Preserve original claudefast under a non-conflicting name (idempotent).
# Implementation note: capture the function source into a local var via
# `functions` (zsh) or `declare -f` (bash); replace the leading "claudefast"
# with "claudefast_orig"; eval the result. We never echo the captured source
# anywhere — it contains the API token. Variable goes out of scope after eval.
if ! type claudefast_orig >/dev/null 2>&1; then
  __df_src=""
  if [[ -n "${ZSH_VERSION:-}" ]]; then
    __df_src="$(functions claudefast 2>/dev/null)"
  else
    __df_src="$(declare -f claudefast 2>/dev/null)"
  fi
  if [[ -z "$__df_src" ]]; then
    echo "dogfood-shim: failed to capture claudefast source" >&2
    unset __df_src
    return 1 2>/dev/null || exit 1
  fi
  # Rename the function header on line 1 only — never touch other lines, so
  # any literal "claudefast" inside the function body (in comments or
  # error messages) is preserved unchanged.
  __df_src_renamed="$(printf '%s\n' "$__df_src" | sed '1s/^claudefast/claudefast_orig/')"
  eval "$__df_src_renamed"
  unset __df_src __df_src_renamed
fi

# Redefine claudefast for this shell only. This wrapper subshells the
# original and shadows `claude` inside that subshell so the override
# applies at exec time.
claudefast() {
  (
    # Inside this subshell, define a `claude` function that re-applies our
    # override env then runs the real claude binary via `command claude`.
    claude() {
      env CLAUDE_CONFIG_DIR="$DOGFOOD_CLAUDE_CONFIG_DIR" \
          ${DOGFOOD_CODEX_HOME:+CODEX_HOME="$DOGFOOD_CODEX_HOME"} \
          ${DOGFOOD_HOME:+HOME="$DOGFOOD_HOME"} \
          command claude "$@"
    }
    # Now run the user's original claudefast. It will export its own env
    # (including CLAUDE_CONFIG_DIR=$HOME/.claude-minimax), then call
    # `claude --add-dir "$PWD" "$@"` — which hits OUR shadow, which
    # re-prepends the override env via `env ...`. The shadow also sets
    # HOME if DOGFOOD_HOME is exported, so the spawned claude (and its
    # Bash tool, and ~/.claude/projects auto-memory path) see a sandbox
    # HOME without disturbing the surrounding shell's HOME.
    claudefast_orig "$@"
  )
}

if [[ "${DOGFOOD_SHIM_QUIET:-0}" != "1" ]]; then
  echo "dogfood-shim: claudefast Tier 2 active"
  echo "  CLAUDE_CONFIG_DIR -> $DOGFOOD_CLAUDE_CONFIG_DIR"
  [[ -n "${DOGFOOD_CODEX_HOME:-}" ]] && echo "  CODEX_HOME        -> $DOGFOOD_CODEX_HOME"
  [[ -n "${DOGFOOD_HOME:-}"       ]] && echo "  HOME (claude only)-> $DOGFOOD_HOME"
fi
