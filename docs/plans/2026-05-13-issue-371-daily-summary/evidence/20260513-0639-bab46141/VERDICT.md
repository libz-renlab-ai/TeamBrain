# Judge verdict — issue #371 daily-summary, run `20260513-0639-bab46141`

**Result: PASS** (11/11 checks)

| # | Check | Result |
|---|-------|--------|
| 1 | typecheck-root exit==0 (CI-equivalent `pnpm typecheck`) | PASS |
| 2 | typecheck-cli  exit==0 | PASS |
| 3 | vitest-core failed==0 passed>=5 (passed=45) | PASS |
| 4 | vitest-cli-daily failed==0 passed>=2 (passed=18) | PASS |
| 5 | cli-build exit==0 | PASS |
| 6 | daily-help-exit exit==0 | PASS |
| 7 | daily-help has command/usage/flags/summary keys | PASS |
| 8 | fixture-scan projects.length>=1 (=2) | PASS |
| 9 | fixture-scan triggeredBy=='cli' | PASS |
| 10 | fixture-scan worktreeMergedCount>=1 (=1, TeamBrain host+worktree merged) | PASS |
| 11 | archive-sample.md startswith '# Daily activity' | PASS |

See `judge.md` for the playbook spec; this directory holds the raw JSON
evidence files (typecheck-root.json, typecheck-cli.json, vitest-core.json,
vitest-cli-daily.json, cli-build.json, daily-help.json, daily-help-exit.json,
fixture-scan.json, archive-sample.md).

Pre-existing typecheck-blocker note: `pnpm -F @teamagent/core typecheck`
reports two `TS6059` rootDir errors on `src/scenario/__tests__/runner.test.ts`
that pre-date this PR (introduced by m7 scenario DSL commits). The CI runs
`pnpm typecheck` (`tsc --noEmit -p tsconfig.base.json`), which excludes
those test imports per `tsconfig.base.json` excludes; this PR follows CI.

Run host: m1deMacBook-Air-3.local. Date: 2026-05-13.
