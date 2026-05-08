#!/bin/sh
# TeamAgent installer — POSIX sh, no bashisms.
# Run: curl -fsSL https://raw.githubusercontent.com/libz-renlab-ai/TeamBrain/release/install-legacy.sh | sh
# Then: teamagent init
#
# Exit codes:
#   0  install succeeded (or upgrade succeeded on re-run)
#   10 node is not on PATH
#   11 node major version < 22 (or unparseable)
#   20 neither npm nor pnpm on PATH
#   30 install command (npm/pnpm) failed
#
# Default install skips optional deps (onnxruntime-node + @xenova/transformers,
# ~70MB combined) so wall-clock fits the ADR 0001 30-second-hook promise.
# Substring matcher (legacy) is fully functional from first interception.
# To opt-in to vector matcher (BM25+dense RRF, smarter on paraphrases):
#   TEAMAGENT_INCLUDE_OPTIONAL=1 sh -c "$(curl -fsSL ...install.sh)"
# or after-the-fact: `npm install -g @xenova/transformers@^2.17.0 onnxruntime-node@1.14.0`.

set -eu

TARBALL_URL="https://github.com/libz-renlab-ai/TeamBrain/archive/refs/heads/release.tar.gz"
MIN_NODE_MAJOR=22

err() { printf 'teamagent install: error: %s\n' "$1" >&2; }
info() { printf 'teamagent install: %s\n' "$1"; }

# 1. node presence
if ! command -v node >/dev/null 2>&1; then
  err "node is not on PATH. Install Node.js >= ${MIN_NODE_MAJOR} first (https://nodejs.org)."
  exit 10
fi

# 2. node version >= MIN_NODE_MAJOR (parse 'vMM.mm.pp' → MM)
NODE_VERSION_RAW="$(node -v 2>/dev/null || true)"
NODE_MAJOR="$(printf '%s' "${NODE_VERSION_RAW}" | sed -e 's/^v//' -e 's/\..*$//')"
case "${NODE_MAJOR}" in
  ''|*[!0-9]*)
    err "could not parse node version '${NODE_VERSION_RAW}'; need >= ${MIN_NODE_MAJOR}."
    exit 11
    ;;
esac
if [ "${NODE_MAJOR}" -lt "${MIN_NODE_MAJOR}" ]; then
  err "node ${NODE_VERSION_RAW} is too old; need >= ${MIN_NODE_MAJOR}. Upgrade and re-run."
  exit 11
fi
info "node ${NODE_VERSION_RAW} ok."

# 3. pick installer — npm preferred, pnpm fallback
INSTALLER=""
if command -v npm >/dev/null 2>&1; then
  INSTALLER="npm"
elif command -v pnpm >/dev/null 2>&1; then
  INSTALLER="pnpm"
else
  err "neither npm nor pnpm is on PATH. Install one and re-run."
  exit 20
fi
info "using ${INSTALLER} for install."

# 4. install (idempotent — re-runs upgrade in place over the tarball).
#    Default: only the teamagent tarball. @xenova/transformers + onnxruntime-node
#    (~70MB combined) are NOT in package.json so they aren't installed → install
#    fits under 30 seconds (ADR 0001).
#    Set TEAMAGENT_INCLUDE_OPTIONAL=1 to install vector matcher deps alongside.
#    NB: npm 10 ignores `--omit=optional` / `--include=optional` for tarball
#    installs; explicit `npm install -g <tarball> <opt-pkg>...` is the only
#    reliable way to add vector deps in the same command.
INCLUDE_VECTOR=0
if [ "${TEAMAGENT_INCLUDE_OPTIONAL:-0}" = "1" ]; then
  INCLUDE_VECTOR=1
  info "TEAMAGENT_INCLUDE_OPTIONAL=1: also installing @xenova/transformers + onnxruntime-node (~70MB)."
else
  info "default install: substring matcher only. set TEAMAGENT_INCLUDE_OPTIONAL=1 for vector matcher."
fi

info "installing teamagent from ${TARBALL_URL}..."
if [ "${INSTALLER}" = "npm" ]; then
  if [ "${INCLUDE_VECTOR}" = "1" ]; then
    if ! npm install -g "${TARBALL_URL}" "@xenova/transformers@^2.17.0" "onnxruntime-node@1.14.0"; then
      err "npm install -g failed."
      exit 30
    fi
  else
    if ! npm install -g "${TARBALL_URL}"; then
      err "npm install -g failed."
      exit 30
    fi
  fi
else
  if [ "${INCLUDE_VECTOR}" = "1" ]; then
    if ! pnpm add -g "${TARBALL_URL}" "@xenova/transformers@^2.17.0" "onnxruntime-node@1.14.0"; then
      err "pnpm add -g failed."
      exit 30
    fi
  else
    if ! pnpm add -g "${TARBALL_URL}"; then
      err "pnpm add -g failed."
      exit 30
    fi
  fi
fi

info "teamagent installed."
info "next: cd into your project and run 'teamagent init'."
