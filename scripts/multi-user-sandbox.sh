#!/usr/bin/env bash
set -euo pipefail

#
# scripts/multi-user-sandbox.sh
# =============================
#
# Multi-user companion to docs/sandbox.md's single-user `.sandbox/` layout.
# See docs/MULTI-USER-SANDBOX.md for design + path table.
#
# Subcommands:
#   setup                 build teamagent + npm-install into .sandbox/npm
#   add <user> [<user>…]  create per-user .sandbox/users/<name>/{home,project}
#   init <user>           teamagent init --target=both inside <user>'s project
#   as <user> <cmd>…      exec a teamagent subcommand as <user>
#   list                  show known users + their HOME paths
#   reset                 remove .sandbox/users/ (keeps shared npm + single-user)
#
# All actions are idempotent. Paths are relative to the repo root.
#

# Discover repo root robustly regardless of where script is invoked from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SANDBOX_ROOT="$REPO_ROOT/.sandbox"
SANDBOX_NPM="$SANDBOX_ROOT/npm"
SANDBOX_USERS="$SANDBOX_ROOT/users"
TEAMAGENT_BIN="$SANDBOX_NPM/bin/teamagent"

usage() {
  cat <<'USAGE'
scripts/multi-user-sandbox.sh — multi-user companion to docs/sandbox.md

Subcommands:
  setup                 build teamagent + npm-install into .sandbox/npm
  add <user> [<user>…]  create per-user .sandbox/users/<name>/{home,project}
  init <user>           teamagent init --target=both inside <user>'s project
  as <user> <cmd>…      exec a teamagent subcommand as <user>
  list                  show known users + their HOME paths
  reset                 remove .sandbox/users/ (keeps shared npm + single-user)

User names must match [A-Za-z0-9_-]+ . See docs/MULTI-USER-SANDBOX.md.
USAGE
  exit "${1:-0}"
}

valid_user_name() {
  # Allow letters, digits, dash, underscore. Reject ., /, .. and empty.
  # First character must NOT be `-` (flag-injection guard if a downstream
  # tool ever splats user names into argv without a `--` separator).
  [[ "$1" =~ ^[A-Za-z0-9_][A-Za-z0-9_-]*$ ]]
}

require_setup() {
  if [[ ! -x "$TEAMAGENT_BIN" ]]; then
    echo "error: $TEAMAGENT_BIN missing or not executable." >&2
    echo "       run 'bash scripts/multi-user-sandbox.sh setup' first." >&2
    exit 2
  fi
}

cmd_setup() {
  echo "[setup] building teamagent into $SANDBOX_NPM"
  mkdir -p "$SANDBOX_NPM/.cache"
  ( cd "$REPO_ROOT" && pnpm build:publish )
  npm install -g "$REPO_ROOT/packages/teamagent" \
    --prefix "$SANDBOX_NPM" \
    --cache  "$SANDBOX_NPM/.cache" \
    --ignore-scripts
  echo "[setup] done — $TEAMAGENT_BIN"
}

cmd_add() {
  (( $# >= 1 )) || { echo "usage: add <user> [<user>…]" >&2; exit 2; }
  for name in "$@"; do
    valid_user_name "$name" || { echo "error: invalid user name '$name' (allowed: A-Z a-z 0-9 _ -)" >&2; exit 2; }
    local user_root="$SANDBOX_USERS/$name"
    mkdir -p \
      "$user_root/home/.claude" \
      "$user_root/home/.teamagent" \
      "$user_root/project/.claude" \
      "$user_root/project/.codex" \
      "$user_root/project/.teamagent"
    # Marker so `list` can identify users even before init.
    : > "$user_root/.sandbox-user"
    echo "[add] $user_root"
  done
}

cmd_init() {
  (( $# == 1 )) || { echo "usage: init <user>" >&2; exit 2; }
  local name="$1"
  valid_user_name "$name" || { echo "error: invalid user name '$name'" >&2; exit 2; }
  require_setup
  local user_root="$SANDBOX_USERS/$name"
  [[ -d "$user_root" ]] || { echo "error: user '$name' not added yet — run 'add $name' first." >&2; exit 2; }
  (
    cd "$user_root/project"
    HOME="$user_root/home" PATH="$SANDBOX_NPM/bin:$PATH" \
      exec "$TEAMAGENT_BIN" init --target=both
  )
}

cmd_as() {
  (( $# >= 2 )) || { echo "usage: as <user> <teamagent-subcmd> [args…]" >&2; exit 2; }
  local name="$1"; shift
  valid_user_name "$name" || { echo "error: invalid user name '$name'" >&2; exit 2; }
  require_setup
  local user_root="$SANDBOX_USERS/$name"
  [[ -d "$user_root" ]] || { echo "error: user '$name' not added yet — run 'add $name' first." >&2; exit 2; }
  (
    cd "$user_root/project"
    HOME="$user_root/home" PATH="$SANDBOX_NPM/bin:$PATH" \
      exec "$TEAMAGENT_BIN" "$@"
  )
}

cmd_list() {
  [[ -d "$SANDBOX_USERS" ]] || { echo "(no users; run 'add <name>')"; return 0; }
  local any=0
  for marker in "$SANDBOX_USERS"/*/.sandbox-user; do
    [[ -f "$marker" ]] || continue
    any=1
    local user_root home
    user_root="$(dirname "$marker")"
    home="$user_root/home"
    printf '%-20s  HOME=%s\n' "$(basename "$user_root")" "$home"
  done
  (( any )) || echo "(no users; run 'add <name>')"
}

cmd_reset() {
  [[ -d "$SANDBOX_USERS" ]] || { echo "[reset] nothing to remove"; return 0; }
  rm -rf "$SANDBOX_USERS"
  echo "[reset] removed $SANDBOX_USERS"
}

main() {
  (( $# >= 1 )) || usage 2
  local sub="$1"; shift
  case "$sub" in
    setup) cmd_setup "$@" ;;
    add)   cmd_add   "$@" ;;
    init)  cmd_init  "$@" ;;
    as)    cmd_as    "$@" ;;
    list)  cmd_list  "$@" ;;
    reset) cmd_reset "$@" ;;
    -h|--help|help) usage 0 ;;
    *) echo "unknown subcommand: $sub" >&2; usage 2 ;;
  esac
}

main "$@"
