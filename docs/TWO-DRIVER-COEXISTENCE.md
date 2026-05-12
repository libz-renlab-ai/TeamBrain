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

| Issue has... | Routes to | Human-gate position |
|--------------|-----------|---------------------|
| no `track:symphony` label | **fixed-flow** track (status quo) | AT FRONT (grill + docs-grill) |
| `track:symphony` label | **Symphony** track (new, autonomous) | AT END (`symphony-human-reviewed` on PR) |

The two label sets do not overlap. Each driver MUST refuse at §0 sanity
gate to dispatch on issues in the other track's state.

## §1. Label mutex matrix

Fixed-flow lifecycle labels (`grill-ready`, `grilling`, `docs-grill-ready`,
`grill-working`) and the Symphony lifecycle labels (`track:symphony`,
`symphony-working`, `symphony-human-reviewed`, `symphony-blocked`) are
**mutually exclusive on a single issue**.

| Label A | Label B | Allowed together? | Resolution |
|---------|---------|-------------------|------------|
| `track:symphony` | `grill-ready` | ❌ NO | Maintainer removes one |
| `track:symphony` | `grilling` | ❌ NO | Maintainer removes one |
| `track:symphony` | `docs-grill-ready` | ❌ NO | Maintainer removes one |
| `track:symphony` | `grill-working` | ❌ NO | Maintainer removes one |
| `symphony-working` | `grill-working` | ❌ NO | Cannot occur (drivers refuse at §0) |
| `track:symphony` | `ready-for-human` | ❌ NO | Symphony track uses `symphony-blocked` |
| `track:symphony` | `epic` | ❌ NO | `epic` issues are tracking-only, never dispatched |
| `track:symphony` | `non-conformant` | ✅ allowed | Conformance still applies (D5) |
| `track:symphony` | `bypass-fixed-flow` | ✅ allowed | See §5 |
| `symphony-human-reviewed` | (on PR) | n/a — PR-only label | See §4 |

**Operational rule**: maintainers and drivers must use a single
`gh issue edit <N> --remove-label X --add-label Y` atomic call when switching
an issue from one track to the other. Two-step (remove then add) leaves a
race window the wrong driver can claim through.

## §2. Driver §0 sanity gate — refusal contract

Each driver's first action upon being invoked on an issue MUST be:

```
1. Fetch issue labels via `gh issue view <N> --json labels`.
2. Apply the refusal rules below.
3. If any refusal triggers: post a 1-line comment naming the violation,
   add the appropriate "needs-*" label, and exit WITHOUT any worktree /
   branch / code change.
```

**`/fixed-flow-driver` §0 refusal — refuses to dispatch when**:
- `track:symphony` label present → comment `refusing: track:symphony issue
  is owned by Symphony; see TWO-DRIVER-COEXISTENCE.md §1`; exit.
- `symphony-working` label present → same comment + exit.
- `symphony-blocked` label present → same comment + exit.
- (existing) `grill-ready` missing, `docs-grill-ready` missing, or
  `ready-for-human` / `epic` present → existing FIXEDFLOW §Dispatch policy
  rules apply unchanged.

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

## §3. Branch / workspace namespacing

To prevent two drivers from ever writing to the same path or pushing the
same branch:

| Driver | Branch name | Workspace path |
|--------|-------------|----------------|
| fixed-flow | `feat/issue-<N>` (or `worktree-issue-<N>+pr-<i>` per FIXEDFLOW.md) | `.codex/worktrees/issue-<N>/` (in-repo git worktree) |
| Symphony | `symphony/issue-<N>` | `~/code/teambrain-workspaces/<N>/` (separate clone, NOT a worktree of the maintainer's checkout) |

The branch prefix `symphony/` is reserved for Symphony; `feat/` and
`worktree-` prefixes remain reserved for fixed-flow.

The workspace separation is deliberate: Symphony's published design clones
the repo into its workspace root, which would collide with an in-repo
worktree. Keeping Symphony's workspace **outside** the TeamBrain checkout
eliminates filesystem collisions even if both drivers run on the same
machine.

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

## §5. `bypass-fixed-flow` — semantically extended to bypass BOTH drivers

To avoid label proliferation, the existing `bypass-fixed-flow` label
(repo-admin-only) is reinterpreted as **bypass-all-drivers**: an issue
carrying this label is exempt from BOTH `/fixed-flow-driver` dispatch AND
Symphony dispatch. The label name stays for backward-compatibility; its
description is updated in `docs/ISSUE-LIFECYCLE.md` §4.

## §6. Triage decision tree

When a new issue arrives, maintainer at first triage:

```
Is this issue suitable for autonomous, no-human-grill execution?
│
├── YES → add `track:symphony` label.
│         Symphony will pick it up (once its GitHub adapter ships).
│         Human reviews the resulting PR and adds `symphony-human-reviewed`
│         to authorize squash-merge.
│
└── NO  → leave `track:symphony` OFF.
          Issue goes through FIXEDFLOW: grill → docs-grill → driver →
          /review PASS → squash-merge. Human gate is at the front.
```

Default = NO `track:symphony` (per design choice D2). All historical
issues stay on the fixed-flow track without migration.

**When to prefer Symphony track**:
- Well-bounded, mechanical task where the issue body is unambiguous.
- Low risk if the implementation is incorrect (easy to revert).
- The reporter is willing to review the PR carefully (since that's the
  only human gate).

**When to prefer fixed-flow track**:
- Architectural / cross-cutting changes.
- Ambiguous requirements that benefit from a grill conversation.
- Touching policy-load-bearing code (skill source, CLAUDE.md anchors).
- Any change that needs `/review` skill's adversarial pass.

## §7. Related docs

- `docs/FIXEDFLOW.md` — fixed-flow track lifecycle (P0-P6 in
  `docs/ISSUE-LIFECYCLE.md`). §Dispatch policy contains the refusal rule
  for `track:symphony`.
- `docs/SYMPHONY-FLOW.md` — Symphony track lifecycle (Q0-Q5 in
  `docs/ISSUE-LIFECYCLE.md` §1.5). Contains the label-create script.
- `docs/ISSUE-LIFECYCLE.md` — both tracks' state machines side-by-side.
- `docs/PRE-IMPLEMENT-CLAIM.md` — `grill-working` cross-host mutex for
  fixed-flow. Symphony has its own analog `symphony-working` documented
  in `docs/SYMPHONY-FLOW.md`.
- `docs/POSTPR.md` — squash-merge + cleanup; applies to PRs from both
  tracks identically.
- `docs/plans/2026-05-12-two-drivers/` — plan / research / judge harness
  for this contract.

## §8. Verification

`!claudefast -p "can a single TeamBrain issue have both grill-ready and
track:symphony labels?"` must answer NO with citation to this file §1.

`!claudefast -p "if I label an issue track:symphony, will
/fixed-flow-driver still try to claim it?"` must answer NO with citation
to `docs/FIXEDFLOW.md` §Dispatch policy + this file §2.

Full probe suite in `docs/plans/2026-05-12-two-drivers/judge.md` (P1-P5).
