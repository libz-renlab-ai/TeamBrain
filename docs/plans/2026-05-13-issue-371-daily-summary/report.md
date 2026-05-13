```
                       ┌──────────────────────────────┐
                       │      report.md (issue 371)   │
                       │  ─ implementation summary    │
                       │  ─ judge verdict             │
                       │  ─ known limits + follow-ups │
                       └──────────────────────────────┘
```

# report.md — issue #371 daily-summary MVP

## TL;DR

Shipped per `plan.md`: 7-module `@teamagent/core/daily-summary` package + `teamagent
daily` CLI subcommand + UserPromptSubmit hook wiring + 63 unit / integration tests
(45 core + 18 cli) + `docs/features/daily-summary.md` + CHANGELOG entry. Judge
harness run `20260513-0639-bab46141` reports **PASS** (11/11 checks) — see
`evidence/<run-id>/VERDICT.md`.

## What landed

| Layer | Path | LOC |
|-------|------|-----|
| core | `packages/core/src/daily-summary/{cwd-decode,project-key,scanner,aggregator,prompt-matcher,rewriter,index}.ts` | ~470 |
| core | `packages/core/src/index.ts` (barrel export) | +23 |
| core tests | `packages/core/src/daily-summary/__tests__/*.test.ts` × 5 | ~390 |
| cli | `packages/cli/src/commands/daily.ts` | ~165 |
| cli | `packages/cli/src/bin.ts` (`case "daily"` + help line) | +25 |
| cli | `packages/cli/src/bin-user-prompt-submit.ts` (hook short-circuit) | +30 |
| cli tests | `packages/cli/src/__tests__/{daily,bin-user-prompt-submit-daily-injection}.test.ts` | ~250 |
| docs | `docs/features/daily-summary.md` | 113 |
| docs | `CHANGELOG.md` (Unreleased > Added) | +20 |
| plan | `docs/plans/2026-05-13-issue-371-daily-summary/{plan,research,judge,report}.md` | — |
| evidence | `docs/plans/2026-05-13-issue-371-daily-summary/evidence/<run-id>/` | judge harness |

## Judge harness verdict

Run id `20260513-0639-bab46141` — **PASS** (11 / 11 checks):

1. ✅ typecheck-root (CI-equivalent `pnpm typecheck`)
2. ✅ typecheck-cli  (`pnpm -F @teamagent/cli typecheck`)
3. ✅ vitest-core (45 tests / 0 failed)
4. ✅ vitest-cli-daily (18 tests / 0 failed)
5. ✅ cli-build (`pnpm -F @teamagent/cli build`)
6. ✅ daily-help exit==0
7. ✅ daily-help has all 4 required keys (command / usage / flags / summary)
8. ✅ fixture-scan projects length>=1 (=2, TeamBrain + OtherRepo)
9. ✅ fixture-scan triggeredBy=='cli'
10. ✅ fixture-scan worktreeMergedCount>=1 (TeamBrain host + `.codex/worktrees/task1` merged)
11. ✅ archive-sample.md startswith '# Daily activity'

Full evidence: `evidence/20260513-0639-bab46141/`. Verdict file: `VERDICT.md`.

## Deviations from plan

- **Judge §V1.1 typecheck command**: original spec used per-package
  `pnpm -F @teamagent/core typecheck`, which fails on pre-existing
  rootDir errors in `packages/core/src/scenario/__tests__/runner.test.ts`
  (introduced by m7 commit `2ae70c8a`). Updated spec to use the CI-equivalent
  root `pnpm typecheck` (`tsc --noEmit -p tsconfig.base.json`), which excludes
  those fixture imports correctly. The CLI typecheck is still per-package
  because issue #371 lives mostly in `@teamagent/cli`.
- **pnpm noise filter**: §V1.5/§V1.6 commands were updated from
  `pnpm teamagent daily ...` to `pnpm --silent teamagent daily ...` because
  pnpm injects a script-banner stdout prefix that broke JSON parsing.

## Known limits / follow-ups

(All in scope of grill §3 "MVP 范围外 (二期)" or §4 engineering defaults.)

- **R1 cwd-decode is lossy on paths with literal `-`.** Documented in
  `cwd-decode.ts` and tested explicitly. Worktree-merge logic survives the
  ambiguity because it grep-substring-matches `/.codex/worktrees/` after
  decode.
- **LLM intent fallback (matcher layer 2) ships as a stub seam.** No real
  `claudefast` / `ANTHROPIC_API_KEY` call wired; matcher gracefully degrades
  to "whitelist + slash only" per grill §4 default.
- **Archive contains raw activity, not the LLM-generated summary.** Capturing
  the operator's Claude response (via Stop hook) and back-writing the summary
  to the same archive file is a clean follow-up.
- **`daily.triggers` in `~/.teamagent/config.json` is deferred.** Only env
  override (`TEAMAGENT_DAILY_TRIGGERS=...`) ships in this PR.

## File layout summary

```
packages/core/src/daily-summary/
├── index.ts                 # barrel
├── cwd-decode.ts            # ~/.claude/projects/<X>/ <-> abs path
├── project-key.ts           # worktree-merge fold
├── scanner.ts               # readdir + mtime filter + group
├── aggregator.ts            # per-project digest (LLM-free)
├── prompt-matcher.ts        # 3-layer matcher (whitelist / LLM seam / passthrough)
├── rewriter.ts              # additionalContext + archive markdown
└── __tests__/               # 5 suites / 45 cases

packages/cli/src/
├── commands/daily.ts        # `teamagent daily` subcommand
├── bin.ts                   # +case "daily" +help entry
├── bin-user-prompt-submit.ts# +daily short-circuit
└── __tests__/
    ├── daily.test.ts                                # 13 cases
    └── bin-user-prompt-submit-daily-injection.test.ts# 5 cases
```
