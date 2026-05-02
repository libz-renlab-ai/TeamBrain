# DOGFOOD Tier 4 image — runs Claude Code inside a container with bind-mounted sandbox.
#
# Build:
#   docker build -t dogfood:latest -f docker/dogfood/Dockerfile docker/dogfood/
# Run (managed by scripts/dogfood-tier4.sh — invoked when DOGFOOD_TIER=4):
#   docker run -it --rm \
#     --env-file <(extract claudefast env) \
#     -v $SANDBOX_DIR:/workspace \
#     -w /workspace \
#     dogfood:latest \
#     --add-dir /workspace
#
# Isolation gained over Tier 3:
#   - private root filesystem (containerfs)
#   - private process namespace
#   - private network namespace (only outbound to api endpoint)
#   - HOME = /root inside container (not the host's HOME)
#
# What still flows:
#   - bind-mounted /workspace (your sandbox worktree) — that's the entire point
#   - outbound network to api.minimaxi.com / api.anthropic.com (model traffic)
#   - the API token via --env-file fd from claudefast wrapper (never on disk)

FROM node:20-bookworm-slim

# Minimal deps Claude Code needs at runtime: git for repo ops, ca-certs for TLS,
# curl for plugin/MCP fetches.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       git ca-certificates curl tini \
  && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI globally so `claude` resolves on PATH.
RUN npm install -g @anthropic-ai/claude-code@latest \
  && npm cache clean --force

WORKDIR /workspace

# Use tini as PID 1 for clean signal handling on Ctrl-C in tmux.
ENTRYPOINT ["tini", "--", "claude"]
