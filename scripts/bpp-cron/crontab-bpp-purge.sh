#!/usr/bin/env bash
# BPP transcript purge — crontab entry.
# Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §6.1
#
# This file is NOT executed directly — it's a copy-pasteable template. Pick
# ONE of the lines below and paste it into `crontab -e`, adjusting paths.
#
# Verify the cron job is registered with `crontab -l`. Verify it actually runs
# by tailing the log file at the path you chose.

set -euo pipefail

cat <<'EOF'
# ----- crontab entries -----
# Prod (compiled JS, recommended):
0 3 * * * BPP_OUTPUT_DIR=/var/lib/teamagent-bpp BPP_RETAIN_DAYS=30 /usr/bin/node /opt/teamagent/packages/digital-twin/dist/bin-purge-cron.js >> /var/log/teamagent-bpp-purge.log 2>&1

# Dev (tsx, slower; uses workspace at WORKDIR):
0 3 * * * cd /opt/teamagent && BPP_OUTPUT_DIR=/var/lib/teamagent-bpp BPP_RETAIN_DAYS=30 /usr/local/bin/pnpm --filter @teamagent/digital-twin exec tsx src/bin-purge-cron.ts >> /var/log/teamagent-bpp-purge.log 2>&1

# Dry-run (run NOW, not on cron):
BPP_OUTPUT_DIR=/var/lib/teamagent-bpp BPP_RETAIN_DAYS=30 /usr/bin/node /opt/teamagent/packages/digital-twin/dist/bin-purge-cron.js
EOF
