---
name: fixed-flow-driver
description: TeamBrain FIXEDFLOW step-3-to-5 driver. Reads a grill-ready issue, creates a worktree, implements per the grill comment, loops /review until PASS, opens a normal PR, squash-merges, cleans up. Invoked manually by a maintainer in a Claude Code session — there is no watcher, no background dispatcher, no automatic trigger. Do NOT invoke unless an issue has been verified to have a valid grill comment + grill-ready label.
---

<what-to-do>

You are the FIXEDFLOW driver. Your input is a single issue number `<N>`. Run steps 3-5 of `docs/FIXEDFLOW.md` end-to-end without human intervention. The reporter has already done steps 1-2 (≤50-word body + grill comment + grill-ready label). Do **NOT** open a follow-up issue if /review fails — fix in the same PR branch per `docs/PR-PLAN.md`.

</what-to-do>

<procedure>

## 0. Sanity gates (bail loudly, never silently)

- Verify `${REPO_ROOT}/docs/FIXEDFLOW.md` exists; if not, abort with comment `⛔ FIXEDFLOW spec missing on this branch`.
- Verify `gh auth status` works; if not, abort.
- **Dispatch policy** — the only type of dispatch that is allowed is on **grilled-issues**: verify issue `#${N}` is open, has `grill-ready` label, and a valid grill comment. Anything else is refused.
- Verify the issue's latest comment is by the issue author AND (comment age ≥ 60 s OR ends with `--- end grill ---`); if neither, post `🛑 needs-grill-comment: please re-paste your grill output and ensure age ≥ 60s or end with --- end grill ---`, remove `grill-ready` label, exit cleanly.
- `needs-human` label is **informational only**; do NOT use it as an escape hatch (the loop never ends — see §4).

## 1. Pickup announcement

Post comment to issue `#${N}`:

```
👋 driver picked up at <ISO timestamp> on <hostname>.
Branch: feat/issue-<N>
Worktree: .codex/worktrees/issue-<N>
Following docs/FIXEDFLOW.md.
```

Use `gh issue comment ${N} --body "..."`.

## 2. Worktree + branch — let the first go

If many workers hit one same worktree, **let the first go**. Concretely:

- Read `.codex/worktrees/issue-${N}/.lock` (sentinel containing first driver's session-id + timestamp):
  - If exists and contains a **different** session-id → another driver is already on this worktree. Post `🚦 issue-${N}: already claimed by session <other-id>, deferring per FIXEDFLOW "let the first go"` and exit cleanly. **Do NOT** force-remove, do NOT race.
  - If exists with **your own** session-id → you are resuming; proceed.
  - If missing → you are first; proceed.
- `git fetch origin`
- `git worktree add .codex/worktrees/issue-${N} -b feat/issue-${N} origin/main`
- Write `.codex/worktrees/issue-${N}/.lock` containing `${SESSION_ID}\t<iso-timestamp>`.
- All subsequent file operations happen inside `.codex/worktrees/issue-${N}`.

The lock is removed only by §7 cleanup after a successful merge. A stale lock from a crashed driver must be cleared by a human (manual `rm -f .lock`) — never auto-evict.

## 3. Implementation

- Read the grill comment as your plan. Treat it as the equivalent of a `docs/HOWTO-PLAN-PR.md` 4-section plan even if it isn't literally formatted that way.
- Use `claudefast -p` for non-interactive heavy edits where appropriate (per `docs/CLAUDEFAST.md`); use direct file edits for small changes.
- Atomic commits per single concept. Commit messages: `feat(issue-${N}): <single concept>`.
- If implementation requires research, write `docs/plans/<YYYY-MM-DD>-issue-${N}/research.md` per AGENTS.md Boris workflow; this is the equivalent of "annotate" in research → plan → annotate → implement.

## 4. /review loop — never ends (only PASS terminates)

The `/review` loop **never ends**. It runs forever — finding → fix-plan →
commit → re-`/review` — until `/review` PASSes. There is **no** max-iter
cutoff, **no** token-budget kill, and **no** `needs-human` escape hatch
inside the driver itself. The only way out of the loop is a clean PASS.

For each `/review` invocation:

1. Increment iter counter; persist to `.fixedflow/iter-${N}.json`:
   ```json
   {"issue": <N>, "iter": <K>, "started_at": "<iso>", "last_iter_at": "<iso>", "tokens_cumulative": <int>}
   ```
2. If `/review` PASSes (no P1/P2 findings or per-rule policy met), break the loop and proceed to step 5. **PASS is the only termination.**
3. If `/review` returns findings:
   - Write or update `docs/plans/<YYYY-MM-DD>-pr-<PR_NUMBER>-fix-plan.md` per `docs/PR-PLAN.md` (3 sections: task / expected outputs / judge harness). PR may not exist yet; if so, name the file `docs/plans/<YYYY-MM-DD>-issue-${N}-iter-<K>-fix-plan.md` and rename it after the PR opens in step 5.
   - Fix in the same branch per project rule (NO follow-up issues).
   - Atomic commit per fix concept.
   - **Spawn Verification subagent** (per `docs/AGENTIC-CODING-POLICY.md` §3): use the Claude Code Agent tool to dispatch a read-only subagent that reads `git diff HEAD~1`, the latest commit message, and the grill comment; it outputs `pass | fail | uncertain` + a repro command + counter-example inputs; append the result to the §judge harness section of the current fix-plan.md **before** re-entering the loop. The Verification subagent MUST NOT modify the repo, MUST NOT read `/review` skill output (avoid overfitting to the answer), and MUST NOT live in `packages/core/` or `packages/cli/` (FCIS + scope-binding per ADR-0004 / ADR-0008). It does not replace `/review` skill — `/review` PASS is the only authoritative termination gate (ADR-0007).
4. PushNotification at iter ∈ {10, 25, 50, 100, 250, 500, 1000, ...} with subject `FIXEDFLOW issue #${N} iter ${K}, tokens=<>`.
5. Every 10 iters, post comment to issue `#${N}` with token-burn summary — informational only, does **not** halt the loop.
6. `needs-human` label: **informational only**. Read it for reporting, but do NOT exit on it. The loop never ends until PASS.

**Termination conditions: PASS only.** No timeout. No bailout. No human
override inside the driver. The /review loop never ends until /review PASS.
If a maintainer truly wants to stop, they kill the process or close the PR
externally — there is no clean exit signal for this loop.

## 5. Open PR

After /review PASSes:

- `git push origin feat/issue-${N}`
- `gh pr create` with:
  - title: `[issue-${N}] <title from issue>`
  - **NOT --draft** (project rule)
  - body: 4-section per `docs/HOWTO-PLAN-PR.md`:
    - plan (extracted from grill comment)
    - expected outputs (deliverables list)
    - how-to-verify (link to or inline `docs/plans/<YYYY-MM-DD>-issue-${N}/judge.md` if you wrote one)
    - claudefast probes (any verification probes you ran)
- Capture PR number; rename any iter-fix-plan files to `docs/plans/<YYYY-MM-DD>-pr-<PR_NUMBER>-fix-plan.md`.
- Optional: `gh pr comment <PR_NUMBER> --body "<auto-PR header>"`.

## 6. Squash-merge — keep trying until it failed

Run `gh pr merge <PR_NUMBER> --squash --auto` (NEVER `--merge`, NEVER `--rebase`
as the merge command — project rule for the merge invocation itself; we DO
use `git rebase origin/main` as a conflict-resolution tactic before retrying).

If the squash-merge fails (typically a conflict against main), the driver does
**NOT** add `needs-human` and bail. It enters an exhaustive retry loop and
**keeps trying until it failed** physically:

1. `git fetch origin && git rebase origin/main` inside the worktree.
2. `git push --force-with-lease origin feat/issue-${N}`.
3. `gh pr merge <PR_NUMBER> --squash --auto`.
4. If it succeeds → break and proceed to §7 cleanup.
5. If it fails — even after rebase — go back to step 1. **Keep trying until
   it failed.** Squash-merge fail then rebase fail does NOT terminate the
   driver; only physical failure does.
6. PushNotification every 5 retries with subject `FIXEDFLOW issue #${N} merge retry ${R}`.

The only physical-failure terminations:

- PR closed by upstream (404 on retry).
- Branch deleted by upstream (push fails with `does not exist`).
- Repo permission revoked (auth error).
- Maintainer kills the driver process / cancels the worktree externally.

Otherwise: **keep trying until it failed**. The driver does not give up after
the second failure. The `needs-human` label is no longer added by the driver
on merge failure (it was an old escape hatch; now removed).

## 7. Cleanup + report

After successful merge:

- `git worktree remove .codex/worktrees/issue-${N}`
- `git branch -D feat/issue-${N}` (local cleanup; remote is auto-deleted by GitHub on squash-merge if branch protection set)
- `gh issue close ${N} --comment "✅ FIXEDFLOW: merged via PR #<PR_NUMBER>"`
- Write `docs/plans/<YYYY-MM-DD>-issue-${N}/report.md` per AGENTS.md Boris workflow:
  - actual chain executed
  - iteration count from `.fixedflow/iter-${N}.json`
  - cumulative token spend
  - any deviations from the grill plan
  - links to PR + commits
- Commit `report.md` directly to main (or a follow-up "docs(issue-${N}): report" PR if main is protected)

## 8. Stop

Exit cleanly. The maintainer can pick up the next grill-ready issue when ready by re-invoking this skill manually.

</procedure>

<reused-rules>

- `docs/FIXEDFLOW.md` — canonical 5-step spec
- `docs/HOWTO-PLAN-PR.md` — 4-section PR body
- `docs/PR-PLAN.md` — same-PR fix loop, no follow-up issues
- `docs/POSTPR.md` — /review-loop-until-PASS shape
- `docs/feature-verification.md` — feature-verification gate if the implementation introduces a new feature
- `docs/AGENTIC-CODING-POLICY.md` §3 — Verification subagent definition + scope (issue #273)
- `docs/CONTEXT.md` `### Subagents in the verification stack` — three-subagent triage table
- AGENTS.md rule 11 — Boris research → plan → annotate → implement → report
- AGENTS.md `.codex/worktrees/` rule
- TeamBrain CLAUDE.md non-draft-PR rule
- User-level memory rule: squash-only merge

</reused-rules>

<do-not>

- Do NOT open follow-up issues when /review fails — same PR fix only.
- Do NOT use `--draft` flag on `gh pr create`.
- Do NOT use `--merge` or `--rebase` flag on `gh pr merge` — squash only.
- Do NOT silently catch errors; either bail with a `needs-human` label + comment, or fix.
- Do NOT add a FIXEDFLOW canned-answer block to CLAUDE.md or AGENTS.md (POSTPR.md L115 / ADR-0007 forbids).
- Do NOT skip the per-iter PR-PLAN write — it's mandated, not optional.

</do-not>
