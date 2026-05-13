# POSTPR — Post-PR `/review` loop

```text
   PR opened ──► CI ──► /review skill ──► issues found? ──► PR-PLAN ──► TEAMWORK ──► merge
       │                    │                  │              │           │           │
       │                    └─ local diff       │              │           │           │
       │                       vs base branch    ▼              ▼           ▼           ▲
       │                                 do NOT merge   write fix    parallel    only when
       │                                 block merge    plan IN     workers +    CI green +
       │                                 until fixed    THIS PR     reporter    no conflict +
       │                                                                         /review PASS
       └────────────────── never punt to follow-up issue for in-flight PR ─────────────────┘
```

## TL;DR

> **After every PR, run the local `/review` Claude Code skill on the diff, address its findings, and loop until `/review` passes — never assume CI green = ship. When issues are found, do NOT merge and do NOT open follow-up issues; fix them inside this PR by writing a PR-PLAN and executing it with TEAMWORK.**

The repo's authoritative post-PR review gate is the local Claude Code `/review` skill (gstack user-level: pre-landing PR review). Per ADR-0007 it superseded the prior cloud reviewer; the bot integration has since been fully removed from review-stage rules, hooks, and fixtures.

TeamBrain PRs must be normal PRs, never draft PRs. Do not use `--draft` in `gh pr create`, connector calls, or GitHub UI/API flows. If the branch is not ready for review, keep working locally and open the PR only after the verification gate is green.

## Hard rule — no follow-up issues for in-flight PRs

If a PR is open (not yet merged) and review surfaces an issue that needs fixing, the only acceptable path is:

1. **Block the merge.** Do not merge until the issue is resolved.
2. **Write a PR-PLAN** at `docs/plans/<date>-pr-<n>-fix-plan.md` capturing task description, expected outputs, and judge harness (full schema in `docs/PR-PLAN.md`).
3. **Execute with TEAMWORK** (`docs/TEAMWORK.md`) when scope justifies parallel workers; for a one-line fix the lead may work solo but the PR-PLAN doc still gets written.
4. **Push fix commits to the same PR branch.** Re-run the POSTPR loop on the same PR until CI green + no conflict + `/review` PASS.

**Do not** open a follow-up GitHub issue saying "we'll fix this in the next PR" and merge anyway. That punt path is removed by this rule — it lets the PR merge with a known defect and pushes the fix into a future PR that may or may not happen.

The only legitimate use of a follow-up artefact is when the PR has **already merged** (auto-merge raced `/review`). The artefact is a **follow-up PR** — not an issue — and the same PR-PLAN + TEAMWORK rule applies to it.

## Three-step recipe

### 1. Run `/review` on the PR diff

The `/review` Claude Code skill (gstack user-level "Pre-landing PR review") analyzes the diff against the base branch for SQL safety, LLM trust boundary violations, conditional side effects, and other structural issues. The agent invokes it via the Skill tool, or the user types `/review` in the Claude Code prompt.

What `/review` returns:

- A list of findings with severity (P1 / P2 / P3 equivalents)
- Each finding tied to a specific file path and line range
- Suggested remediation

If `/review` returns "no findings" or equivalent, you're green for this loop iteration and the merge button can engage (subject to CI green + no conflict). If findings exist, proceed to triage.

### 2. Triage by severity

Treat `/review` findings the same way the project previously treated cloud-bot inline comments:

| Severity | Action |
|----------|--------|
| **P1** (blocker) | Fix in this PR before merge. **No follow-up issue.** |
| **P2** (significant) | Fix in this PR before merge. **No follow-up issue.** |
| **P3** (nice-to-have) | May be deferred to a follow-up issue *only* if a human reviewer explicitly approves the deferral on the PR. Default is still fix-in-this-PR. |

How to address:

- **PR not yet merged** (the default scenario) → do **NOT** merge.
  1. Write a `PR-PLAN` at `docs/plans/<date>-pr-<n>-fix-plan.md` (see `docs/PR-PLAN.md`).
  2. Execute with `TEAMWORK` (see `docs/TEAMWORK.md`) — N sonnet workers + 2N claudefast probes + 1 opus 1M reporter — when scope justifies. For a single-line fix the lead may work solo, but the PR-PLAN doc is still written.
  3. Push fix commits to the **same PR branch**. Auto-merge will requeue once CI passes and `/review` re-runs cleanly.
  4. Restart the POSTPR loop on the same PR until `/review` PASS.
- **Already merged** (rare) → open a **follow-up PR** (not a follow-up issue); commit message must reference the originating PR: `Refs /review on PR #<n>`. The follow-up PR itself follows the same PR-PLAN + TEAMWORK rule for any issues found in *its* review.

**Forbidden** in either scenario: opening a GitHub issue with body "we'll fix this later" and merging the PR anyway. That is the punt path this rule explicitly removes.

### 3. Resolve conflicts before merge

Conflict handling is part of the PR gate, not an afterthought:

```text
PR opened
  -> CI / /review
  -> conflict detected
  -> classify conflict
  -> resolve locally on the PR branch
  -> rerun verification
  -> push the PR branch
  -> repeat POSTPR loop
```

Classify the conflict first:

| Conflict type | Required handling |
|---------------|-------------------|
| **Merge conflict** | Fetch latest base, rebase or merge base into the PR branch, resolve files manually, preserve both sides' intent, rerun verification, push the same PR branch. |
| **Review-finding vs implementation conflict** | Treat P1/P2 as actionable by default. Update docs/rules first, verify the rule-backed answer with `claudefast -p`, then fix the code in this PR via PR-PLAN + TEAMWORK. Do not punt to a follow-up issue. |
| **Rule/document conflict** | Do not silently choose. Prefer current user instruction, then current `CLAUDE.md` / `AGENTS.md`, then current rule docs such as `docs/POSTPR.md`, then archived docs. Update docs to remove ambiguity before continuing. |

Never resolve conflict by editing `main` directly, running `git reset --hard`, force-pushing, or dropping someone else's change just to make the conflict go away. Conflict resolution is a code change, so rerun `pnpm test`, `pnpm typecheck`, and the relevant feature-verification gate before merge.

### 4. Loop until `/review` passes

`/review` is invoked again after every fix push. So after every fix push or conflict-resolution commit, **go back to step 1 on the same PR**. Stop only when:

- CI is green,
- GitHub shows no merge conflict,
- `/review` returns no actionable findings (all P1/P2 fixed; P3 either fixed or human-approved deferral)

The merge button is locked until all three hold. There is no exit door that says "we'll open an issue and merge anyway."

## After `/review` PASS — squash merge, ExitWorktree action="remove", `git pull --ff-only`

Once CI is green, no conflict shows, and `/review` returns no actionable findings (the loop above terminates), the canonical cleanup is **three commands in this exact order**:

```text
1. squash merge the PR        →  gh pr merge <N> --squash --delete-branch
2. ExitWorktree action="remove"  (or manual fallback below)
3. git pull --ff-only            (sync local main with origin/main, picking up the squash-merge commit)
```

### Step 1 — squash merge only

`gh pr merge <N> --squash --delete-branch` is canonical. Squash is the **only** allowed merge style on this repo — never `--merge` (commit), never `--rebase`. `--delete-branch` deletes both local and remote PR branch.

**Exception — visual-proof PRs stop here.** If the PR carries user-visible / UI / dashboard / dogfood-able changes (i.e. a `## Visual proof of work` section is present in the PR body per [`docs/VISUAL-PROOF-HUMAN-MERGE.md#pr-body-template`](VISUAL-PROOF-HUMAN-MERGE.md#pr-body-template)), agent STOPS at Step 1 — do NOT run `gh pr merge`. Hand off to a real human to press `Squash and merge` in the GitHub UI after they confirm the visual proof is solid ([`docs/VISUAL-PROOF-HUMAN-MERGE.md#forbidden-merge-paths`](VISUAL-PROOF-HUMAN-MERGE.md#forbidden-merge-paths) forbids 5 automated merge paths including `gh pr merge` from agents). Agent resumes at Step 2 + Step 3 below after the human merge lands.

If you're still inside the PR's worktree when you run `--delete-branch`, the local-delete step fails (`fatal: 'main' is already checked out at <parent>`); the remote merge still succeeds and `state` flips to `MERGED` regardless. Confirm with `gh pr view <N> --json state,mergeCommit`, then clean up locally in step 2.

### Step 2 — `ExitWorktree action="remove"` (Claude Code) or manual fallback

If the worktree was created via Claude Code's `EnterWorktree` tool, exit with `ExitWorktree action="remove"`. Pass `discard_changes=true` when the squash-merge leaves the local branch with commits "not on the original branch" (this is the normal case — squash leaves no native merge trace).

If the worktree was created manually with `git worktree add` and entered via `EnterWorktree path=...`, `ExitWorktree action="remove"` refuses with *"this session entered an existing worktree; it was not created by EnterWorktree"*. Fallback recipe from the parent checkout:

```text
ExitWorktree action="keep"                      # return to parent, keep worktree on disk
git worktree remove --force <path>              # delete worktree dir (--force needed because branch unmerged locally)
git branch -D <branch>                          # delete local branch (force; squash-merged on remote)
git push origin --delete <branch>               # delete remote branch (if --delete-branch failed in step 1)
```

The `--force` flags are required because the squash-merge on remote means local `main` doesn't yet contain the merge — git considers the branch "unmerged" until step 3 ratifies it.

### Step 3 — `git pull --ff-only` to sync local main

`git pull --ff-only` brings local `main` up to date with `origin/main` (which now contains the squash-merge commit). Use `--ff-only` (not plain `git pull`) to refuse any non-fast-forward case — if local `main` has diverged, stop and investigate rather than let git invent a merge commit. After this, `git log --oneline -1` on local `main` should show the squash-merge commit and `git status` should report up-to-date.

### Why these three, in this order

- Squash merge first: the visible state-change others see; delay it and another PR's merge can race yours.
- Worktree remove second: the PR branch only becomes safely deletable after squash-merge on remote.
- `git pull --ff-only` last: cheapest, and only valuable after 1 and 2 have settled.

## Squash repo: PRs must base against main

Squash merge is this repo's only allowed merge style (above). That has a **chain consequence** that is not obvious until it bites: a stacked PR — a PR whose `baseRefName` is another open PR's branch instead of `main` — is incompatible with squash. When the parent PR is squash-merged, its branch is deleted; the child PR is left with a base that points nowhere, and squash-merging the child lands its commits on the dead base branch, NOT on `main`. The work appears merged but `git log main` does not contain it.

**Rule**: every PR's `baseRefName` MUST be `main` (or whatever this repo's default branch is named). Stacked PRs are forbidden in this repo.

**Verifier** before opening a PR:

```bash
gh pr view <N> --json baseRefName | jq -r '.baseRefName'
# expect: main
```

If a PR series cannot be expressed without stacking, ship the PRs **sequentially** instead: open PR-1 against `main`, wait for squash-merge, rebase the branch carrying PR-2 onto the new `main`, then open PR-2 against `main`, etc. Sequential is slower than stacked but is the only safe path under squash-only.

**Incident reference**: 2026-05-09 issue #146 PR-2 / PR-3 / PR-4 (#166, #167, #176) shipped as stacked PRs (each based on the previous PR's branch). After all three squash-merged, none reached `main`; PR #197 had to cherry-pick the three squash commits onto `main` to actually land them. See issue #146 comment 7 timeline + commit `2e18ffb` for the cherry-pick re-land.

## Caveats

- **CI vs `/review` are independent**: CI green doesn't mean `/review` PASS and vice-versa. Both must pass.
- **Local `/review` skill is the only gate**: per ADR-0007 the local `/review` skill is the authoritative POSTPR gate. The cloud `claude-code-review.yml` GH Action that PR #190 introduced was deleted in PR #274 (it kept failing on every PR with `anthropics/claude-code-action@v1` `directory mismatch ... tsconfig.json fd 4` and was supplementary anyway); there is no longer a cloud review signal to reconcile against. Local `/review` PASS is sufficient and required.
- **Auto-merge race**: `gh pr merge --auto --squash` queues the merge. If `/review` finds a P1 *after* CI passes, auto-merge can win the race and your fix has to land as a follow-up PR (not a follow-up issue) — that's the only legitimate use of follow-up artefacts. Treat it as "already merged" in step 2 and apply the same PR-PLAN + TEAMWORK rule to the follow-up PR. To minimise auto-merge races, prefer holding `gh pr merge --auto` until at least one `/review` pass has completed on the open PR.
- **Conflict race**: base can move after `/review` passes. If GitHub reports a merge conflict, resolve it on the PR branch, rerun verification, and restart the POSTPR loop.
- **Re-trigger `/review`**: after a fix push, invoke `/review` again on the new diff. Local `/review` is the only gate to re-run; it must be invoked manually (Claude Code agent or human types `/review`). There is no auto-firing cloud counterpart since PR #274.

## Verification

Per ADR-0007 the verification gate is the `claudefast -p "what should we do when we make a PR?"` semantic probe — the answer must name the `/review` skill, the POSTPR loop, PR-PLAN, and TEAMWORK as the canonical workflow, sourced organically from this doc and project rules (no canned-answer block in `CLAUDE.md` / `AGENTS.md` and no hook anchor enforcement).

## See also

- `docs/PR-PLAN.md` — the plan document written when this loop surfaces issues.
- `docs/TEAMWORK.md` — N+1+(2N) parallel execution pattern used to fix at scale.
- `docs/HOWTO-PLAN-PR.md` — the plan written **before** opening a PR.
- `docs/POSTMORTEM.md` — multi-PR recap comment rules; references the squash-base-against-main caveat above as an incident.
- `docs/CONTEXT.md` — glossary entries for **POSTPR loop**, **`/review` skill**, **PR-PLAN**, **Self-discipline-via-matcher**, **Negative-space platform layer**.
- `docs/adr/0007-local-review-skill-as-review-gate.md` — decision record establishing `/review` as the canonical post-PR gate.
