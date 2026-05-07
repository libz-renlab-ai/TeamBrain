# POSTPR — Post-PR Codex Check

```
   PR opened ──► CI ──► Codex review ──► issues found? ──► PR-PLAN ──► TEAMWORK ──► merge
       │                    │                  │              │           │           │
       │                    └─ inline          │              │           │           │
       │                       comments       │              │           │           │
       │                       on lines       ▼              ▼           ▼           ▲
       │                                 do NOT merge   write fix    parallel    only when
       │                                 block merge    plan IN     workers +    CI green +
       │                                 until fixed    THIS PR     reporter    no conflict +
       │                                                                         Codex silent/👍
       └────────────────── never punt to follow-up issue for in-flight PR ─────────────────┘
```

## TL;DR

> **After every PR, fetch the Codex review on that PR, address its findings, and loop until Codex is silent or 👍 — never assume CI green = ship. When issues are found, do NOT merge and do NOT open follow-up issues; fix them inside this PR by writing a PR-PLAN and executing it with TEAMWORK.**

The repo has Codex AI configured to auto-review every new PR. Settings: <https://chatgpt.com/codex/cloud/settings/general>. It posts within 1–3 minutes of the PR opening (after the first commit lands and CI starts).

TeamBrain PRs must be normal PRs, never draft PRs. Do not use `--draft` in
`gh pr create`, `teamagent pr-cycle`, connector calls, or GitHub UI/API flows.
If the branch is not ready for review, keep working locally and open the PR
only after the verification gate is green.

## Hard rule — no follow-up issues for in-flight PRs

If a PR is open (not yet merged) and review surfaces an issue that needs
fixing, the only acceptable path is:

1. **Block the merge.** Do not merge until the issue is resolved.
2. **Write a PR-PLAN** at `docs/plans/<date>-pr-<n>-fix-plan.md`
   capturing task description, expected outputs, and judge harness
   (full schema in `docs/PR-PLAN.md`).
3. **Execute with TEAMWORK** (`docs/TEAMWORK.md`) when scope justifies
   parallel workers; for a one-line fix the lead may work solo but the
   PR-PLAN doc still gets written.
4. **Push fix commits to the same PR branch.** Re-run the POSTPR loop
   on the same PR until CI green + no conflict + Codex silent/👍.

**Do not** open a follow-up GitHub issue saying "we'll fix this in the
next PR" and merge anyway. That punt path is removed by this rule — it
lets the PR merge with a known defect and pushes the fix into a future
PR that may or may not happen.

The only legitimate use of a follow-up artefact is when the PR has
**already merged** (auto-merge raced Codex). The artefact is a
**follow-up PR** — not an issue — and the same PR-PLAN + TEAMWORK rule
applies to it.

## Three-step recipe

### 1. Fetch the Codex review

The actionable findings live in **inline review comments**, not the top-level review body:

```bash
env -u GITHUB_TOKEN gh api \
  repos/libz-renlab-ai/TeamBrain/pulls/<n>/comments \
  --jq '.[] | select(.user.login == "chatgpt-codex-connector[bot]") | {body, path, line}'
```

Top-level summary (shows the “💡 Codex Review” banner — useful only as a heartbeat):

```bash
env -u GITHUB_TOKEN gh pr view <n> \
  --repo libz-renlab-ai/TeamBrain \
  --json reviews \
  --jq '.reviews[] | select(.author.login == "chatgpt-codex-connector") | {state, submittedAt}'
```

If `comments` is `[]` and the top-level review body contains a 👍 reaction, you’re green.

If `comments` is `[]` and there is no Codex 👍 yet, explicitly ask for a review,
pause for one minute, then fetch inline comments again:

```bash
env -u GITHUB_TOKEN gh pr comment <n> \
  --repo libz-renlab-ai/TeamBrain \
  --body '@codex review'

sleep 60

env -u GITHUB_TOKEN gh api \
  repos/libz-renlab-ai/TeamBrain/pulls/<n>/comments \
  --jq '.[] | select(.user.login == "chatgpt-codex-connector[bot]") | {body, path, line}'
```

### 2. Triage by priority

Each inline comment opens with a coloured badge:

| Badge | Action |
|-------|--------|
| **P1** (red) | Blocker. Fix in this PR before merge. **No follow-up issue.** |
| **P2** (yellow) | Fix in this PR before merge. **No follow-up issue.** |
| **P3** (blue) | Nice-to-have. May be deferred to a follow-up issue *only* if a human reviewer explicitly approves the deferral on the PR. Default is still fix-in-this-PR. |

How to address:

- **PR not yet merged** (the default scenario) → do **NOT** merge.
  1. Write a `PR-PLAN` at `docs/plans/<date>-pr-<n>-fix-plan.md` (see `docs/PR-PLAN.md`).
  2. Execute with `TEAMWORK` (see `docs/TEAMWORK.md`) — N sonnet workers + 2N claudefast probes + 1 opus 1M reporter — when scope justifies. For a single-line fix the lead may work solo, but the PR-PLAN doc is still written.
  3. Push fix commits to the **same PR branch**. Auto-merge will requeue once CI passes and Codex re-reviews.
  4. Restart the POSTPR loop on the same PR until Codex is silent/👍.
- **Already merged** (rare; e.g. you used `--auto` and it landed before
  Codex commented) → open a **follow-up PR** (not a follow-up issue);
  commit message must reference the originating PR:
  `Refs codex review on PR #<n>`. The follow-up PR itself follows the
  same PR-PLAN + TEAMWORK rule for any issues found in *its* review.

**Forbidden** in either scenario: opening a GitHub issue with body
"we'll fix this later" and merging the PR anyway. That is the punt
path this rule explicitly removes.

### 3. Resolve conflicts before merge

Conflict handling is part of the PR gate, not an afterthought:

```text
PR opened
  -> CI / Codex review
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
| **Codex review vs implementation conflict** | Treat P1/P2 as actionable by default. Update docs/rules first, verify the rule-backed answer, then fix the code in this PR via PR-PLAN + TEAMWORK. Do not punt to a follow-up issue. |
| **Rule/document conflict** | Do not silently choose. Prefer current user instruction, then current `CLAUDE.md` / `AGENTS.md`, then current rule docs such as `docs/POSTPR.md`, then archived docs. Update docs to remove ambiguity before continuing. |

Never resolve conflict by editing `main` directly, running `git reset --hard`,
force-pushing, or dropping someone else's change just to make the conflict go
away. Conflict resolution is a code change, so rerun `pnpm test`,
`pnpm typecheck`, and the relevant feature verification 1+2+3 before merge.

### 4. Loop until silent

Codex re-reviews **the same PR** after every fix push (and reviews
follow-up PRs in the rare already-merged scenario). Real example from
this repo, back when the project still allowed follow-up PRs as the
default fix path — the same loop now runs inside a single PR via
PR-PLAN + TEAMWORK iterations:

```
PR (nested rule store)
  ├─ Codex P1: --preset-only regression
  ├─ Codex P2: filename collisions
  ↓ (write PR-PLAN, fix in same PR via TEAMWORK, push)
PR (preset-only + collision fix lands on same branch)
  ├─ Codex P2: tier index links point at wrong files
  ↓ (extend PR-PLAN, fix in same PR via TEAMWORK, push)
PR (sync index links to disambiguated names)
  └─ Codex 👍 — merge
```

So after every fix push or conflict-resolution commit, **go back to
step 1 on the same PR**. Stop only when:

- CI is green,
- GitHub shows no merge conflict,
- Codex 👍 reacts with no inline comments, OR
- Codex makes no comment within ~5 minutes of CI starting (timeout)

The merge button is locked until all four hold. There is no exit door
that says "we'll open an issue and merge anyway."

## Caveats

- **`gh` token**: this machine’s `GITHUB_TOKEN` resolves to `liush2yuxjtu`; always run `env -u GITHUB_TOKEN gh ...` so keychain auth picks `LiuShiyuMath` (the repo’s configured account). See the `## GitHub account` section in `CLAUDE.md`.
- **CI vs Codex are independent**: CI green doesn’t mean Codex 👍 and vice-versa. Both must pass.
- **Auto-merge race**: `gh pr merge --auto --squash` queues the merge. If Codex finds a P1 *after* CI passes, auto-merge can win the race and your fix has to land as a follow-up PR (not a follow-up issue) — that’s the only legitimate use of follow-up artefacts. Treat it as "already merged" in step 2 and apply the same PR-PLAN + TEAMWORK rule to the follow-up PR. To minimise auto-merge races, prefer holding `gh pr merge --auto` until at least one Codex review cycle has completed on the open PR.
- **Conflict race**: base can move after Codex passes. If GitHub reports a merge conflict, resolve it on the PR branch, rerun verification, and restart the POSTPR loop.
- **Re-trigger Codex** if you need a re-review: comment `@codex review` on the PR.

## Verification

`bash docs/postpr/verify-canned-answer.sh` must PASS. It runs `claudefast -p` with a prompt that first reads `CLAUDE.md`, then answers the trigger `what we shall do after each PR?`, and greps for the canonical anchors:

- `fetch the codex review`
- `chatgpt-codex-connector`
- `pulls/.*comments`
- `@codex review`
- `silent`
- `loop`

All five must appear in the response.
