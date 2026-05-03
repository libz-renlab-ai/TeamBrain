#!/usr/bin/env bash
set -euo pipefail
bash "$(dirname "$0")/verify-claude-stream-json.sh"
bash "$(dirname "$0")/hardmatch-features.sh"
bash "$(dirname "$0")/verify-dashboard-health.sh"
bash "$(dirname "$0")/verify-tmux-interactive.sh"
