```
   __
 <(o.o)___    report: soft-force upgrade shipped
  ( <_< /     issue #225 → PR #237 (squash-merged)
   `---'
```

# Report: Soft-Force Upgrade Prompt (issue #225 → PR #237)

## Outcome

- Issue: https://github.com/libz-renlab-ai/TeamBrain/issues/225
- PR: https://github.com/libz-renlab-ai/TeamBrain/pull/237
- Status: **MERGED** via squash-merge at 2026-05-09T12:21:30Z
- Branch: `feat/issue-225` (deleted on merge)
- Final commit: `1a3b274a01901a937f8866516d0dd2861cdfa19b` on `main`

## Actual chain executed

`research → plan → annotate → implement → /review iter-1 (fix) → /review iter-2 PASS → PR → squash-merge`

## /review iteration count

**2 iterations** (PASS at iter-2):
- **iter-1**: 1 P1 + 2 P3 findings.
  - P1: `shouldPromptUpgrade` was gated on `pending_banner.shown===false`, blocking re-fire. Fixed by introducing `prompt_dismissed_for_to` field decoupled from legacy banner.
  - P3: `--limit foo` slipped past `parseInt`. Fixed with `parsePositiveInt`.
  - P3: `docs/SELF-UPDATE.md` didn't mention soft-force. Fixed with cross-link.
- **iter-2**: PASS — no new findings; all iter-1 fixes verified by additional vitest cases.

## Judge harness PASS/FAIL counts

All vitest-anchored checks passed:

- J1 (typecheck): PASS (exit 0)
- J2 (core pure tests): PASS (47 → 67 cases including iter-1)
- J3 (cli tests for new surfaces): PASS (30 → 43 cases including iter-1)
- J4 (snooze backoff): PASS
- J5 (never_prompt suppression): PASS
- J6 (bw-compat parse): PASS
- J7 (CHANGELOG range filter): PASS
- J8 (`whatsnew --help` exit 0): covered by parsing test cases
- J9 (iter-1 re-fire): PASS
- J10 (iter-1 dismissal): PASS
- J11 (iter-1 `--limit foo`): PASS
- J12 (iter-1 `--limit -3`): PASS

**Total**: 110/110 vitest cases green across 10 test files.

## Cumulative token spend

Not measured (no telemetry hook in FIXEDFLOW driver yet); rough estimate ~80-100K tokens for full session.

## Deviations from grill plan

1. Initial impl gated re-fire on `pending_banner.shown` (wrong gate); fixed in iter-1 with `prompt_dismissed_for_to`.
2. J8 verified via `parseWhatsNewArgs` test instead of separate bin probe (functionally equivalent).
3. CHANGELOG rebase conflict with upstream PR #231 — kept both Removed + Added under `## [0.10.5]`.

## Surfaces shipped

- SessionStart banner (`maybeShowUpgradePrompt`) — re-fires until A/B/C dismissal
- Post-init tail (`buildPostInitWhatsNewTail`)
- `teamagent whatsnew` CLI command
- `teamagent update --snooze` / `--never` subcommands
- `teamagent update --status` shows new fields
- `TEAMAGENT_NEVER_PROMPT=1` env override
- `docs/features/soft-force-upgrade.md` user-facing doc

## Risks / follow-ups

1. update-state.json concurrent writes have no CAS (matches existing pattern; P3).
2. CHANGELOG bundling depends on tsup `onSuccess` copy.
3. AttributionBus events deferred (not in scope).

## Links

- PR: https://github.com/libz-renlab-ai/TeamBrain/pull/237
- Issue: https://github.com/libz-renlab-ai/TeamBrain/issues/225
- Plan: docs/plans/2026-05-09-issue-225/plan.md
- Research: docs/plans/2026-05-09-issue-225/research.md
- Judge harness: docs/plans/2026-05-09-issue-225/judge.md
- iter-1 fix-plan: docs/plans/2026-05-09-pr-237-fix-plan.md
- Feature doc: docs/features/soft-force-upgrade.md
