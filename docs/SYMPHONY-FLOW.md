```
   _____                       _                       
  / ___/_   ____ ___  ____  / /_ ___  ___  __  __    
  \__ \ | / / __ `__ \/ __ \/ __ \/ __ \/ _ \/ / / /    
 ___/ / |/ / / / / / / /_/ / / / / /_/ /  __/ /_/ /     
/____/|___/_/ /_/ /_/ .___/_/ /_/\____/\___/\__, /      
                   /_/                     /____/

  Symphony = TeamBrain's autonomous driver. Picks up track:symphony
  issues, opens PRs by itself, waits for a human to bless the PR via
  symphony-human-reviewed label, then squash-merges.

  Q0 needs-triage ─▶ Q1 track:symphony ─▶ Q2 symphony-working ─▶
   Q3 PR open  ─▶  Q4 symphony-human-reviewed (on PR)  ─▶  Q5 CLOSED

  Human gate is AT THE END (the symphony-human-reviewed label).
  For the front-gate alternative, see docs/FIXEDFLOW.md.
```

# SYMPHONY-FLOW — TeamBrain Symphony-track issue → PR → merge workflow

Status: **canonical** for the `track:symphony` lifecycle. Cross-track rules
(label mutex, refusal contracts, branch namespacing) live in
[`docs/TWO-DRIVER-COEXISTENCE.md`](TWO-DRIVER-COEXISTENCE.md). This file
covers the Symphony track in isolation.

> Runtime status (2026-05-14): the upstream `openai/symphony` repo still
> ships only a Linear tracker adapter, BUT a Symphony fork
> [`LiuShiyuMath/symphony#claude-multi-provider`](https://github.com/LiuShiyuMath/symphony/tree/claude-multi-provider)
> now implements both (a) a multi-provider agent runner that drives
> Claude Code (`claude -p` headless) instead of Codex, and (b) a
> `Symphony.Tracker.Github` adapter that calls `gh` CLI for label-based
> issue dispatch. This document is now **executable contract** —
> dispatched runs land via the fork. See ADR-0015 for the policy shift
> and the fork's `elixir/CLAUDE-PROVIDER.md` for the runner matrix.

## TL;DR — 5-phase lifecycle, human gate at END

**Canonical anchor sentence (mirrored from `CLAUDE.md` so `pnpm teamagent verify-anchors` finds it verbatim):**

> TeamBrain Symphony track has 5 phases: (Q0) `needs-triage` (shared with fixed-flow); (Q1) `track:symphony` — maintainer opted into autonomous track at triage; (Q2) `track:symphony` + `symphony-working` — Symphony daemon has claimed the issue (cross-host mutex per `docs/SYMPHONY-FLOW.md` §Cross-host mutex); (Q3) Symphony opens PR with `track:symphony` label, issue stays at Q2 awaiting human review; (Q4) PR carries `symphony-human-reviewed` (added by a human; THIS is the Symphony human gate, parallel to fixed-flow's `/review` PASS); (Q5) CLOSED via squash-merge `Closes #N`, Symphony §7 cleanup strips `symphony-working`. Off-mainline: `symphony-blocked` (parallel to `ready-for-human`; only humans clear); see `docs/TWO-DRIVER-COEXISTENCE.md` for cross-track refusal rules.

1. **Triage (human)** — maintainer adds `track:symphony` label to an issue
   judged suitable for autonomous execution (see TWO-DRIVER-COEXISTENCE.md
   §6 decision tree). The same issue body conformance check applies as for
   fixed-flow (`<50` 字 body, fixed-flow template; D5 in plan §2a).
2. **Symphony self-claims (autonomous)** — the Symphony daemon polling
   GitHub picks up the issue, runs the §0 sanity gate
   (TWO-DRIVER-COEXISTENCE.md §2), runs `gh issue edit <N> --add-label
   symphony-working` (`track:symphony` stays), and posts a workpad claim
   comment.
3. **Symphony implements + opens PR (autonomous)** — Symphony writes code
   in its workspace, opens a regular (non-draft) PR with branch
   `symphony/issue-<N>` and body containing `Closes #<N>`. PR carries
   `track:symphony` label automatically (Symphony adds it on PR open).
4. **Human reviews PR + adds label (human gate)** — a human reviewer reads
   the PR, runs whatever local checks they want, and adds
   `symphony-human-reviewed` to the PR. This label IS the merge
   authorization — there is no `/review` skill loop on the Symphony track.
5. **Squash-merge (autonomous or human)** — once `symphony-human-reviewed`
   is on the PR, `gh pr merge <N> --squash --delete-branch` ships it
   (squash-only per user memory `feedback_squash_only_merge.md`). Issue
   auto-closes via `Closes #N` keyword. Symphony §7 cleanup removes
   `symphony-working` from the (now-closed) issue.

The human gate is **only** step 4. Steps 2/3/5 are fully autonomous.

## §Dispatch policy — only `track:symphony` issues

Symphony **may** dispatch on an issue iff ALL hold:
- ✅ `track:symphony` label is present.
- ✅ Issue is `open`.
- ✅ No fixed-flow lifecycle labels present
  (`grilling` / `grill-ready` / `docs-grill-ready` / `grill-working`).
  See TWO-DRIVER-COEXISTENCE.md §1.
- ✅ No `ready-for-human` / `epic` / `non-conformant` / `symphony-blocked`
  labels.
- ✅ No `bypass-fixed-flow` label (reinterpreted as bypass-all-drivers per
  TWO-DRIVER-COEXISTENCE.md §5).

Otherwise Symphony **must** refuse at §0 sanity gate, post a 1-line refusal
comment, and exit.

## §Claim — 2-outcome contract

Mirror of FIXEDFLOW.md's "Claim an issue" 2-outcome contract, scoped to
Symphony:

1. **Refuse and exit** — any §Dispatch policy condition fails → Symphony
   posts the refusal comment and exits. No workspace, no branch, no code.
2. **Do everything from issue → merged PR** — all conditions hold → Symphony
   atomically adds `symphony-working` label + posts workpad claim comment;
   creates `~/code/teambrain-workspaces/<N>/` clone; implements per the
   issue body; opens `symphony/issue-<N>` PR with `Closes #<N>`; waits
   (polling) for `symphony-human-reviewed` label on the PR; once present,
   runs `gh pr merge <N> --squash --delete-branch`; removes
   `symphony-working` from the (now-closed) issue.

If Symphony hits a true blocker (missing auth / external dep / scope
ambiguity), it does **not** unilaterally close the issue. It adds
`symphony-blocked`, leaves a 1-comment summary of the blocker + exact
unblock action, and exits.

## §Cross-host mutex — `symphony-working` label

Same model as fixed-flow's `grill-working` (`docs/PRE-IMPLEMENT-CLAIM.md`):
GitHub label edit is the cross-host atomic primitive. A second Symphony
instance that sees `symphony-working` already on an issue immediately
backs off (does not strip the label, does not race). The label is
released by Symphony §7 cleanup after squash-merge succeeds.

Stale `symphony-working` (Symphony instance crashed or was killed) is
cleared by a human maintainer only — `≥ 24h` no progress is the staleness
threshold. **Never** auto-evicted by automation.

## §Workspace + branch + workpad

| Resource | Convention |
|----------|------------|
| Workspace path | `~/code/teambrain-workspaces/<N>/` (Symphony clones the repo here; NOT a git worktree) |
| Branch name | `symphony/issue-<N>` |
| PR base branch | `main` (squash-only; no stacked PRs) |
| Workpad comment | One persistent issue comment headed `## Codex Workpad`, updated in-place throughout execution. Template inherited from upstream Symphony WORKFLOW.md. |
| PR body | Must contain `Closes #<N>` so GitHub auto-closes the issue on squash-merge. Must reference the workpad comment. |

## §Human review — `symphony-human-reviewed` is THE gate

The human reviewer's job on a Symphony PR:

1. Read the PR diff and the workpad comment on the issue.
2. Optionally run TeamBrain's `/review` skill locally for a deeper pass
   (not required; this is the **Symphony** track, not fixed-flow).
3. If acceptable, do **both** atomic actions (label alone is NOT enough
   under standard GitHub branch protection — `required_pull_request_reviews`
   needs an actual PR-review approval, not a label):
   - `gh pr review <PR> --approve` — satisfies branch protection's
     `required_approving_review_count`.
   - `gh pr edit <PR> --add-label symphony-human-reviewed` — satisfies
     the Symphony-track merge contract.
   Both are required. Branch-protection check details:
   `docs/BEFORE-MERGE.md` §branch-protection verify.
4. If unacceptable: leave PR comments; **do not** approve, **do not** add
   the label. Symphony reads the comments on its next poll cycle and
   addresses them (upstream Symphony's PR-feedback-sweep protocol).
   Human re-reviews and does both step-3 actions when satisfied.

The reviewer must be a human (`actor.type == "User"`, not in the repo's
bot allowlist). Agents / bots / Symphony itself are forbidden from adding
`symphony-human-reviewed`. Tooling can audit via
`gh api repos/:owner/:repo/issues/:N/events` to confirm the `labeled`
event came from a human actor.

## §`symphony-blocked` escape hatch

When Symphony can't proceed:

- **Missing auth / external dep**: Symphony adds `symphony-blocked` + a
  comment naming the missing resource. Maintainer provides it, removes
  `symphony-blocked` label, Symphony resumes on next poll.
- **Scope ambiguity**: Symphony adds `symphony-blocked` + a comment listing
  the ambiguous points. Maintainer clarifies in comments, removes label.
- **Same as fixed-flow's `ready-for-human` semantics** but namespaced to
  the Symphony track (per design choice D4) so cross-track audit queries
  remain clean (`gh issue list --label symphony-blocked` shows only
  Symphony-track blockers).

`symphony-blocked` is NOT removed by Symphony itself. Only a human
maintainer can clear it.

## §Label-create script (repo admin one-shot)

Required before Symphony can run (P5 in
`docs/plans/2026-05-12-two-drivers/judge.md`). Repo admin runs:

```bash
gh label create track:symphony           --color "5319e7" --description "Routing: handled by Symphony, not /fixed-flow-driver"
gh label create symphony-working         --color "fbca04" --description "Cross-host mutex: Symphony has claimed this issue"
gh label create symphony-human-reviewed  --color "0e8a16" --description "PR label: human approved Symphony PR for squash-merge"
gh label create symphony-blocked         --color "1d76db" --description "Symphony hit a true blocker; needs human intervention"
```

Colors match existing TeamBrain conventions: purple = routing/tracking,
yellow = mutex-in-progress, green = ready-to-ship, blue = needs-human.

## §Related docs

- [`docs/TWO-DRIVER-COEXISTENCE.md`](TWO-DRIVER-COEXISTENCE.md) — cross-track
  rules. THE authority on label mutex + driver refusal.
- [`docs/FIXEDFLOW.md`](FIXEDFLOW.md) — fixed-flow track lifecycle (the
  other driver, with human gate AT THE FRONT).
- [`docs/ISSUE-LIFECYCLE.md`](ISSUE-LIFECYCLE.md) §1.5 — Symphony lifecycle
  state machine Q0-Q5 side-by-side with fixed-flow P0-P6.
- [`docs/POSTPR.md`](POSTPR.md) — squash-merge + cleanup; applies to
  Symphony PRs identically.
- [`docs/plans/2026-05-12-two-drivers/`](plans/2026-05-12-two-drivers/) —
  plan / research / judge harness for this contract.
- `/Users/m1/projects/symphony/elixir/SETUP-TEAMBRAIN.md` — upstream
  Symphony install notes + the 3 prerequisites (mise + Elixir, Linear or
  GitHub adapter, FIXEDFLOW policy amendment).

## §Verification

- `!claudefast -p "show github symphony lifecycle for me"` must hit the
  5 substring anchors (`track:symphony` / `symphony-working` /
  `symphony-human-reviewed` / `symphony-blocked` / `SYMPHONY-FLOW.md`).
- Full probe suite: `docs/plans/2026-05-12-two-drivers/judge.md` (P1-P5).
