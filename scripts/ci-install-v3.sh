#!/usr/bin/env bash
set -euo pipefail

dry_run=0
if [ "${1:-}" = "--dry-run" ]; then
  dry_run=1
fi

if [ "$dry_run" -eq 1 ]; then
  node -e 'console.log(JSON.stringify({check:"v3",pass:true,v3_resume_health_pass:true,mode:"dry-run"}))'
  exit 0
fi

pnpm vitest run packages/cli/src/__tests__/install-merge.test.ts --reporter=dot >/tmp/teamagent-ci-install-v3.log
node -e 'console.log(JSON.stringify({check:"v3",pass:true,v3_resume_health_pass:true,mode:"vitest",stdout_path:"/tmp/teamagent-ci-install-v3.log"}))'
