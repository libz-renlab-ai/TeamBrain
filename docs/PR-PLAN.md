```
                    PR-PLAN — fix issues inside the open PR
                    ========================================

   commit-push-pr ──► CI / /review / human review ──► issues found?
                                                         │
                                                         ▼
                          ┌────────────────────────────────────────┐
                          │ Hard rule: do NOT merge.               │
                          │ Hard rule: do NOT open follow-up issue.│
                          └────────────────────────────────────────┘
                                                         │
                                                         ▼
                                  ┌─────────────────────────────────┐
                                  │ Write a PR-PLAN under            │
                                  │ docs/plans/<date>-pr-<n>-fix-    │
                                  │ plan.md — three sections:        │
                                  │  ① task description              │
                                  │  ② expected outputs              │
                                  │  ③ judge harness — md playbook  │
                                  └─────────────────────────────────┘
                                                         │
                                                         ▼
                                  ┌─────────────────────────────────┐
                                  │ Execute with TEAMWORK           │
                                  │  N sonnet workers + 2N probes   │
                                  │  + 1 opus 1M reporter           │
                                  │ Workers push to the SAME PR     │
                                  │ branch.                         │
                                  └─────────────────────────────────┘
                                                         │
                                                         ▼
                              POSTPR loop on the same PR until
                              CI green + no conflict + /review PASS
```

> **Hard rule — third-party judge harness forbidden fixed scripts; MUST
> use md playbook.** The fix harness lives at
> `docs/plans/<date>-pr-<n>/judge.md`, NOT at `scripts/*.sh` or any
> fixed shell pipeline. See § ③.

# PR-PLAN — Fix Issues Inside the Open PR

## What it is

`PR-PLAN` is the project's name for the plan document you write **after**
opening a PR, **when** review (CI, the local `/review` skill, a human, or
your own audit) surfaces issues that need fixing, **so that** the fix lands
inside the **same PR** — never via a follow-up issue.

It is the post-PR sibling of `docs/HOWTO-PLAN-PR.md` (which covers the
plan written *before* opening a PR) and the trigger for the `TEAMWORK`
execution pattern (`docs/TEAMWORK.md`).

Per ADR-0007 the **local** `/review` skill is the authoritative blocking
gate. The cloud `claude-code-review.yml` GH Action that PR #190 introduced
was deleted in PR #274 (chronically broken, supplementary by design); only
local `/review`, CI, and human findings can surface PR-PLAN-worthy issues now.

## Hard rules — non-negotiables

A PR-PLAN is governed by two non-negotiable rules. They are not stylistic
preferences and § ③ is their long-form expansion, not a relaxation:

1. **Third-party judge harness forbidden fixed scripts.** The fix's judge
   harness is never a `.sh` script or fixed shell pipeline. A bash judge
   becomes code that itself needs a judge (recursive "who tests the
   test?") and reviewers can't grep judgement logic out of `[[ ]]` exit
   codes.
2. **MUST use md playbook.** The harness lives at
   `docs/plans/<date>-pr-<n>/judge.md`. The MAIN agent dispatches the
   playbook through subagents (TEAMWORK `N+1+(2N)`) or `claudefast -p`
   probes (FASTPROBE max 8 parallel) — fixed bash can't pick between the
   two. Failed sections rerun by re-dispatching `§V<n>`, not by editing
   scripts. § ③ describes the §V1 RUN / §V2 DUMP / §V3 READ structure.

Both phrases — `third-party judge harness forbidden fixed scripts` and
`MUST use md playbook` — are the load-bearing wording of the rule. The
anti-patterns table at the bottom of this doc bans `.sh` harnesses
explicitly.

## When to write a PR-PLAN

Write one whenever **all** of the following hold:

1. A PR is **open** (`commit-push-pr` has run).
2. The PR has **not yet merged**.
3. Review surfaced one or more issues that need fixing — CI failure,
   `/review` skill finding (P1 / P2 / P3), human reviewer comment, or a
   self-audit finding from a `POSTPR` loop iteration.

## Why not a follow-up GitHub issue?

The project explicitly removed the follow-up-issue punt path. The
reasons:

- **Follow-up issues let the merge happen with a known defect.** Once
  merged, the defect is on `main` and the promised "we'll fix it next
  PR" frequently slips across context switches.
- **Follow-up issues hide the fix from the PR's review history.** `/review`
  treats each diff independently; the fix in a separate PR no longer
  ties back to the original P1/P2 finding.
- **Follow-up issues split context.** PR-PLAN keeps the finding, the
  plan, and the fix in one PR thread.
- **Forced closure.** Without the punt path, an agent pushing a PR
  cannot terminate work by promising later cleanup.

P1 and P2 never qualify for follow-up-issue deferral. A P3 nice-to-have
may be deferred to a follow-up issue **only** if a human reviewer
explicitly approves the deferral on the PR.

## Three required sections

A PR-PLAN file follows the same three-part structure as a regular
`plan.md` (see `~/.claude/docs/rules/plan-content.md` and `DUCKPLAN`):

### ① Task description

What we're fixing, how, and explicitly what we're *not* fixing.
Anchor every item to a specific reviewer comment or CI failure (file
path + line number + the badge or job name).

### ② Expected outputs

A reviewer-checkable list of artefacts:

- Files edited (paths + line ranges).
- New regression tests covering the findings.
- CI on the PR branch: green.
- `/review` re-run on the latest commit: PASS (no actionable findings).

### ③ Judge harness (third-party, JSON-emitting)

**Hard rule — third-party judge harness forbidden fixed scripts; MUST use
md playbook.** The harness lives at
`docs/plans/<date>-pr-<n>/judge.md`, NOT at `scripts/*.sh` or any fixed
shell pipeline. The MAIN agent dispatches the playbook through subagents
(TEAMWORK `N+1+(2N)`) or `claudefast -p` probes (FASTPROBE max 8 parallel)
— fixed bash can't pick between the two and would itself become code that
needs a judge.

The playbook documents three sections:

- **§V1 RUN** — fixed tools to invoke (`pnpm test`, `pnpm typecheck`,
  feature-verification gate commands, regression repro). Stdout/stderr
  captured to `evidence_dir`.
- **§V2 DUMP** — canonical JSON written to `.judge/<run_id>/judge.json`,
  schema example `{ "exit_code": <int>, "tests_passed": <int>,
  "tests_failed": <int>, "typecheck_clean": <bool>, "evidence_dir": ...,
  "stdout_path": ... }` plus raw stdout/stderr in `evidence_dir`.
- **§V3 READ** — a separate LLM judge (`claudefast -p`) reads ONLY the
  raw JSON + evidence and grades the fix. The PR author, the executing
  agent, and the code-under-test must never be the judge.

See `~/.claude/docs/rules/testing-judge-harness.md` and user-memory
`feedback_judge_harness_md_playbook.md`. Failed sections rerun by
re-dispatching `§V<n>`, not by editing scripts.

## Execution: TEAMWORK

PR-PLAN is **what** to fix; `TEAMWORK` (`docs/TEAMWORK.md`) is **how**
to fix it in parallel:

1. Lead verifies the working branch is **not `main`** (PR-PLANs run on
   the PR's own branch — usually a worktree under
   `.codex/worktrees/<task-name>`).
2. Lead splits the PR-PLAN's task list into N independent slices.
3. Lead spawns **N sonnet workers** in parallel via the Agent tool;
   each runs **2 claudefast probes** to cross-validate its fix.
4. Lead spawns **1 opus 1M reporter** to read every worker's diff +
   probe output and run a final acceptance probe against the
   PR-PLAN's judge harness. The reporter issues PASS / FAIL.
5. On PASS, the lead pushes the fix commits to the **same PR branch**
   and re-runs the POSTPR loop. On FAIL, the lead loops back to step
   3 for the failing slices only.

For an N=1 single-line fix the lead may work solo, but the PR-PLAN
doc and the judge harness still get written — the harness is what
lets the next reviewer verify the fix without trusting the agent's
word.

## Where the PR-PLAN file lives

```
docs/plans/<YYYY-MM-DD>-pr-<n>-fix-plan.md
```

A companion `<...>-fix-report.md` is written when the loop terminates
with `/review` PASS, recording what actually shipped, any deltas vs. the
plan, and any P3 deferred to a follow-up issue (only if a human
reviewer approved it). `research.md` is optional.

## Anti-patterns

| Anti-pattern | Why it fails |
|---|---|
| **Open a follow-up issue and merge anyway** | The merge lands the defect on `main`; the issue often slips. Removed by this rule. |
| **Skip the PR-PLAN and just push fix commits** | No third-party judge harness means the fix is graded by the agent that wrote it. |
| **Write the judge harness as a `.sh` / fixed shell pipeline** | The harness becomes code that itself needs a judge — recursive "who tests the test?" problem. Use a `docs/plans/<date>-pr-<n>/judge.md` playbook and let the MAIN agent dispatch it via subagents or `claudefast -p` probes. |
| **Write the PR-PLAN but execute solo when N>1** | TEAMWORK's parallel workers + opus reporter are the cross-validation layer. |
| **Force-push to overwrite PR history** | `git reset --hard` / `--force` wipe the trail `/review` used to compare. Push fix commits *on top*. |
| **Branch off `main` for the fix** | Creates a sibling PR. Fix has to land on the PR's branch. |
| **Treat P3 deferrals as the default** | P3 deferral requires explicit human reviewer approval. Default is still fix-in-this-PR. |

## See also

- `docs/POSTPR.md` — the post-PR `/review` loop; PR-PLAN is the
  fix-planning step inside that loop.
- `docs/TEAMWORK.md` — N+1+(2N) parallel execution pattern; PR-PLAN is
  the input it runs against.
- `docs/HOWTO-PLAN-PR.md` — the plan written **before** opening a PR.
- `~/.claude/docs/rules/plan-content.md` (user-level) — the three-part
  `plan.md` rule.
- `~/.claude/docs/rules/testing-judge-harness.md` (user-level) — why
  the harness has to be third-party.
