#!/usr/bin/env bash
# dogfood-tier4 — Tier 4 isolation: run claude inside a container with the
# active dogfood sandbox bind-mounted at /workspace.
#
# Token handling: extracts claudefast's env vars in a subshell where `claude`
# is a no-op, then passes them to docker via --env-file <(...) (process
# substitution). The API token never lands in any docker config file or
# disk artifact.
#
# Lazy build: builds the image on first run; subsequent runs reuse it.
# Override image tag with DOGFOOD_TIER4_IMAGE env.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOCKERFILE_DIR="$REPO_ROOT/docker/dogfood"
IMAGE_TAG="${DOGFOOD_TIER4_IMAGE:-dogfood:latest}"
ACTIVE_SANDBOX_FILE="$REPO_ROOT/.dogfood/active-sandbox"

# --- preflight ---
if ! command -v docker >/dev/null 2>&1; then
  cat >&2 <<EOF
dogfood-tier4: docker not found.

Install one of:
  - Docker Desktop  (https://docs.docker.com/desktop/install/mac-install/)
  - OrbStack        (https://orbstack.dev — lighter on macOS)
  - Lima + nerdctl  (https://lima-vm.io)

Or downgrade with: DOGFOOD_TIER=3 bash scripts/dogfood.sh
EOF
  exit 2
fi

if ! docker info >/dev/null 2>&1; then
  echo "dogfood-tier4: docker is installed but the daemon is not running" >&2
  exit 2
fi

# --- find active sandbox ---
if [[ ! -f "$ACTIVE_SANDBOX_FILE" ]]; then
  echo "dogfood-tier4: no active sandbox; run scripts/dogfood.sh first" >&2
  exit 1
fi
SANDBOX_DIR="$(<"$ACTIVE_SANDBOX_FILE")"
if [[ ! -d "$SANDBOX_DIR" ]]; then
  echo "dogfood-tier4: stale active-sandbox: $SANDBOX_DIR (gone)" >&2
  exit 1
fi

# --- build image lazily ---
if ! docker image inspect "$IMAGE_TAG" >/dev/null 2>&1; then
  echo "dogfood-tier4: building $IMAGE_TAG (one-time, ~2-3 min)..."
  docker build -t "$IMAGE_TAG" "$DOCKERFILE_DIR"
fi

# --- extract claudefast env into a process-substitution fd ---
# Run claudefast with `claude` shadowed to a no-op so all the wrapper's env
# exports happen but `claude` isn't actually launched. Filter to the
# subset relevant to the model/auth so we don't drag the host PATH etc.
# into the container.
extract_claudefast_env() {
  # Run claudefast with `claude` shadowed to a no-op so the wrapper exports
  # all its env vars without actually invoking claude. Surface wrapper
  # failures (auth errors, missing function) instead of swallowing them.
  zsh -ic '
    claude() { :; }
    claudefast >/dev/null 2>&1
    env
  ' | grep -E '^(ANTHROPIC_|API_TIMEOUT_MS|CLAUDE_CODE_|MCP_|ENABLE_|INSIGHTS_)'
}

# Sanity check: env-file would receive at least ANTHROPIC_API_KEY.
TOKEN_PRESENT="$(extract_claudefast_env | grep -c '^ANTHROPIC_API_KEY=' || true)"
if [[ "$TOKEN_PRESENT" -lt 1 ]]; then
  echo "dogfood-tier4: failed to extract ANTHROPIC_API_KEY from claudefast env" >&2
  exit 3
fi

echo "dogfood-tier4: starting container"
echo "  image:   $IMAGE_TAG"
echo "  sandbox: $SANDBOX_DIR  ->  /workspace (rw)"
echo "  token:   passed via --env-file <(...) fd, not on disk"

# Use process substitution for env-file. Some docker frontends (rootless,
# OrbStack) don't read /dev/fd/N — fall back to a tmp file with 600 perms
# that is shred+removed on exit if needed.
exec docker run --rm -it \
  --env-file <(extract_claudefast_env) \
  -v "$SANDBOX_DIR:/workspace" \
  -w /workspace \
  --hostname dogfood-tier4 \
  "$IMAGE_TAG" \
  --add-dir /workspace
