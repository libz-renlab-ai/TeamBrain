#!/usr/bin/env bash
# CI / non-interactive-bash version of the `claudefast` zsh function in ~/.zshrc.
# Reads MINIMAX_API_KEY from env (typically a GitHub Actions secret).
# Usage:  MINIMAX_API_KEY=... bash scripts/claudefast-ci.sh -p "..."
# See docs/CLAUDEFAST.md "CI parity" for details.

set -euo pipefail

if [ -z "${MINIMAX_API_KEY:-}" ]; then
  echo "ERROR: MINIMAX_API_KEY env var is empty or unset" >&2
  echo "  CI:    add it as a repo secret, then wire env: MINIMAX_API_KEY: \${{ secrets.MINIMAX_API_KEY }}" >&2
  echo "  Local: export MINIMAX_API_KEY=... before running this script" >&2
  exit 64
fi

if ! command -v claude >/dev/null 2>&1; then
  echo "ERROR: 'claude' CLI not found on PATH" >&2
  echo "  Install with: npm install -g @anthropic-ai/claude-code" >&2
  exit 65
fi

export ANTHROPIC_API_KEY="$MINIMAX_API_KEY"
unset ANTHROPIC_AUTH_TOKEN
export ANTHROPIC_BASE_URL="https://api.minimaxi.com/anthropic"
export ANTHROPIC_DEFAULT_HAIKU_MODEL="MiniMax-M2.7-highspeed"
export ANTHROPIC_DEFAULT_OPUS_MODEL="MiniMax-M2.7-highspeed"
export ANTHROPIC_DEFAULT_SONNET_MODEL="MiniMax-M2.7-highspeed"
export ANTHROPIC_MODEL="MiniMax-M2.7-highspeed"
export API_TIMEOUT_MS="3000000"
export CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING="1"
export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC="1"
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS="1"
export ENABLE_CLAUDEAI_MCP_SERVERS="false"
export MCP_CONNECTION_NONBLOCKING="true"
export INSIGHTS_CAPTURE_DISABLED="1"
export INSIGHTS_HAIKU_BIN="/nonexistent/insights-haiku-disabled"

exec claude --dangerously-skip-permissions --add-dir "$PWD" "$@"
