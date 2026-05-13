```
   ______               ____       _                
  /_  __/ _____ ___    / __ \____ (_)_   _____  _____
   / / | |/|/ / _ \   / / / / __// /| | / / _ \/ ___/
  / /  |  '  / // /  / /_/ / /  / / | |/ /  __/ /    
 /_/   |__/\_/\___/  /_____/_/  /_/  |___/\___/_/     

  Two drivers, two human-gate positions, ONE driver per issue.

         ┌────────────────────────────────────────────────┐
         │           GitHub issue (libz-renlab-ai)         │
         └─────────┬───────────────────────────┬──────────┘
                   │ no track:symphony label    │ track:symphony label
                   ▼ (default = fixed-flow)     ▼
         ┌─────────────────┐           ┌─────────────────┐
         │  Track A         │           │  Track B         │
         │  fixed-flow      │           │  Symphony        │
         │  HUMAN @ FRONT   │           │  HUMAN @ END     │
         │  grill → driver  │           │  driver → PR →   │
         │  → /review PASS  │           │  symphony-human- │
         │  → squash-merge  │           │  reviewed label  │
         │                  │           │  → squash-merge  │
         └─────────────────┘           └─────────────────┘

  Mutex invariant: an issue is in EXACTLY ONE track at any time.
```

# TWO-DRIVER-COEXISTENCE — anti-collision contract for fixed-flow + symphony

Status: **canonical**. Single source of truth for: which driver claims which
issue; which labels are incompatible; where each driver's worktree / branch
lives; which PR uses which merge gate. Both `docs/FIXEDFLOW.md` and
`docs/SYMPHONY-FLOW.md` defer to this file for the cross-driver rules.

## TL;DR — one routing label, two never-overlapping label sets

**Canonical anchor sentence (mirrored from `CLAUDE.md` so `pnpm teamagent verify-anchors` finds it verbatim):**

> TeamBrain has two drivers: (1) `/fixed-flow-driver` — manual, human-gate at the beginning (grill-ready + docs-grill-ready before any code); (2) Symphony — autonomous, human-gate at the end (`symphony-human-reviewed` label on the PR). Routing label `track:symphony` opts an issue into the Symphony track; absence routes to fixed-flow. Cross-track mutex + driver §0 refusal rules in `docs/TWO-DRIVER-COEXISTENCE.md`.

| Issue has... | Routes to | Human-gate position |
|--------------|-----------|---------------------|
| no `track:symphony` label | **fixed-flow** track (status quo) | AT FRONT (grill + docs-grill) |
| `track:symphony` label | **Symphony** track (new, autonomous) | AT END (`symphony-human-reviewed` on PR) |

The two label sets do not overlap. Each driver MUST refuse at §0 sanity
gate to dispatch on issues in the other track's state.

## §1. Label mutex matrix

Fixed-flow labels (`grill-ready`, `grilling`, `docs-grill-ready`,
`grill-working`) and Symphony labels (`track:symphony`, `symphony-working`,
`symphony-human-reviewed`, `symphony-blocked`) are **mutually exclusive on
a single issue**.

| `track:symphony` + ... | Allowed? | Resolution |
|---|---|---|
| `grill-ready` / `grilling` / `docs-grill-ready` / `grill-working` | ❌ | Maintainer removes one |
| `ready-for-human` | ❌ | Symphony track uses `symphony-blocked` |
| `epic` | ❌ | `epic` is tracking-only, never dispatched |
| `non-conformant` | ✅ coexist | Conformance still blocks dispatch (D5) |
| `bypass-fixed-flow` | ✅ coexist | See §5 (bypass-all-drivers) |
| `symphony-human-reviewed` | n/a — PR-only | See §4 |

**Track switches** use a single `gh issue edit <N> --remove-label X
--add-label Y` atomic call; two-step (remove then add) leaves a race window.

## §2. Driver §0 sanity gate — refusal contract

Each driver's first action MUST be: (1) fetch issue labels via
`gh issue view <N> --json labels`; (2) apply the refusal rules below;
(3) if any rule triggers, post a 1-line comment naming the violation,
add the appropriate `needs-*` label, exit WITHOUT any worktree / branch
/ code change.

**`/fixed-flow-driver` §0 refusal — refuses to dispatch when**:
- `track:symphony` label present → comment `refusing: track:symphony issue
  is owned by Symphony; see TWO-DRIVER-COEXISTENCE.md §1`; exit.
- `symphony-working` label present → same comment + exit.
- `symphony-blocked` label present → same comment + exit.
- **A Symphony PR already exists for this issue** —
  `gh pr list --search "Closes #<N> in:body" --label "track:symphony"`
  returns non-empty → comment `refusing: track:symphony PR <#PR> already
  open for this issue; see §2 cross-PR check`; exit. Catches the case
  where `track:symphony` got stripped from the issue but a Symphony PR
  is mid-flight (zombie scenario; see §5b Stale recovery).
- (existing FIXEDFLOW §Dispatch policy rules — `grill-ready` /
  `docs-grill-ready` missing, `ready-for-human` / `epic` present — apply
  unchanged.)

**Symphony §0 refusal — refuses to dispatch when**:
- `track:symphony` label **missing** → not Symphony's track; do not touch.
- `grill-ready` / `grilling` / `docs-grill-ready` / `grill-working` present
  → comment `refusing: fixed-flow lifecycle label present on this
  track:symphony issue; maintainer must remove fixed-flow labels first`;
  exit.
- `ready-for-human` / `epic` present → comment `refusing: Symphony does not
  dispatch on ready-for-human or epic issues`; exit.
- `non-conformant` present → comment `refusing: issue body fails
  conformance check`; exit. (D5 — same bar as fixed-flow.)
- `symphony-blocked` present → already in human-handoff state; only a
  human can clear the block.
- **`symphony-human-reviewed` label on the issue (misapplication)** —
  that label is PR-only by spec; on an issue it's meaningless. Comment
  `refusing: symphony-human-reviewed is PR-only; stripping from issue
  and continuing`, `gh issue edit <N> --remove-label
  symphony-human-reviewed`, then proceed.

## §3. Branch / workspace namespacing

To prevent two drivers from ever writing to the same path or pushing the
same branch:

| Driver | Branch name | Workspace path |
|--------|-------------|----------------|
| fixed-flow | `feat/issue-<N>` (or `worktree-issue-<N>+pr-<i>` per FIXEDFLOW.md) | `.codex/worktrees/issue-<N>/` (in-repo git worktree) |
| Symphony | `symphony/issue-<N>` | `~/code/teambrain-workspaces/<N>/` (separate clone, NOT a worktree of the maintainer's checkout) |

`symphony/` is reserved for Symphony; `feat/` and `worktree-` stay
reserved for fixed-flow. Symphony's workspace is **outside** the
TeamBrain checkout (it clones the repo itself) so filesystem paths
never collide with fixed-flow's in-repo worktrees.

## §4. PR-side routing — which merge gate applies

The same `track:symphony` label that routes an issue carries through to its
PR. Each PR is gated by exactly one merge contract:

| PR has... | Merge gate | Authority |
|-----------|-----------|-----------|
| no `track:symphony` label | `/review` skill returns PASS (ADR-0007) | local `/review` loop in `/fixed-flow-driver` |
| `track:symphony` label | `symphony-human-reviewed` label applied by a human reviewer | human, named in `docs/SYMPHONY-FLOW.md` §human review |

Both gates feed into the same `gh pr merge <N> --squash --delete-branch`
command (squash-only per user memory `feedback_squash_only_merge.md`); the
gate only differs in **what authorizes the merge**, not how the merge
happens.

`symphony-human-reviewed` lives on the PR (per design choice D3), not on
the issue. The issue auto-closes via `Closes #N` in the PR body, identical
to fixed-flow.

## §5. `bypass-fixed-flow` — extended to bypass BOTH drivers

`bypass-fixed-flow` (repo-admin-only) is reinterpreted as bypass-all-drivers:
exempts issue from BOTH dispatchers. Label name stays for backward compat;
description updated in `docs/ISSUE-LIFECYCLE.md` §4.

## §5b. Stale recovery — when labels drift out of sync

Failure mode: `track:symphony` gets stripped from an issue but
`symphony-working` lingers (Symphony crashed before §7 cleanup, or human
stripped the routing label by mistake). Result: fixed-flow §0 refuses
(sees `symphony-working`); Symphony §0 also refuses (sees `track:symphony`
missing). Issue is zombie — both drivers refuse to touch it.

**Recovery (human maintainer only — never automation, per `ready-for-human`
hard-rule pattern in FIXEDFLOW.md)**:
1. Decide which track the issue should end up on.
2. If Symphony track: re-add `track:symphony`; verify Symphony picks it up.
3. If fixed-flow track: strip `symphony-working` **first**, then
   `track:symphony`, then add fixed-flow lifecycle labels (`grilling`
   for fresh grill, or `grill-ready` + `docs-grill-ready` if grill comments
   already exist). Order matters — Symphony's atomic mutex assumes the
   work label is the last thing stripped.
4. Post a `--- recovery: <one-line reason> ---` comment so the audit trail
   names the human action.

**Prevention**: when reverting a track decision, always strip the lifecycle
label (`symphony-working` or `grill-working`) BEFORE stripping the routing
label (`track:symphony`). Reverse order opens the zombie window.

## §6. Triage decision tree

At triage, maintainer asks: suitable for autonomous, no-human-grill
execution? **YES** → add `track:symphony`; human reviews resulting PR
and adds `symphony-human-reviewed` to authorize merge. **NO** → leave
`track:symphony` OFF; issue goes through FIXEDFLOW (grill → docs-grill
→ driver → `/review` PASS → squash-merge). Default = NO (D2; zero
migration of historical issues).

**Prefer Symphony**: well-bounded mechanical task, unambiguous body, low
revert cost, reporter willing to PR-review carefully.

**Prefer fixed-flow**: architectural / cross-cutting, ambiguous
requirements, policy-load-bearing code (skills, CLAUDE.md anchors), or
anything that needs `/review`'s adversarial pass.

## §7. Related docs

- `docs/FIXEDFLOW.md` — fixed-flow lifecycle (P0-P6); §Dispatch policy has
  the `track:symphony` refusal.
- `docs/SYMPHONY-FLOW.md` — Symphony lifecycle (Q0-Q5); label-create script.
- `docs/ISSUE-LIFECYCLE.md` — both tracks' state machines side-by-side.
- `docs/PRE-IMPLEMENT-CLAIM.md` — `grill-working` mutex (Symphony's
  `symphony-working` mirrors this).
- `docs/POSTPR.md` — squash-merge + cleanup, identical for both tracks.
- `docs/plans/2026-05-12-two-drivers/` — plan / research / judge harness.

## §8. Verification

P2 (mutex) + P3 (refusal) probes in `docs/plans/2026-05-12-two-drivers/judge.md`
cover §1 and §2; P1-P5 is the full suite.
