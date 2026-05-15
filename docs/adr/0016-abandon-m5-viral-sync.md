---
Status: accepted
Date: 2026-05-15
---

```text
   M5 viral sync                         M5 viral sync
   ============= (before)                ============= (after this ADR)

   senior user opens project             senior user opens project
        |                                     |
        v                                     v
   AUTO-INFECT repo  ──┐                  (no auto-infect)
   (.teamagent/manifest,│                       |
    hooks, team/ dir)   │                       v
        |               │                  docs declare the
        v               │                  feature ABANDONED
   teammate clones  ────┤                  (ADR-0016); m5-* code
        |               │                  left in place, frozen,
        v               │                  removal = follow-up
   AUTO-INSTALL plugins ┘                       |
   + AUTO-PUSH rules                            v
   on every SessionStart                  no new work builds
        |                                 on viral sync
        v
   (invasive, unvalidated)
```

# ADR-0016: Abandon M5 viral sync (team viral spread)

This ADR declares the **M5 "team viral sync"** feature **abandoned**. M5 viral
sync is no longer a supported or recommended capability; docs de-market it now,
and no new work builds on it. This is a **docs-only** decision record — the
`m5-*` code is left in place (frozen) and its removal is a deferred follow-up.

**Supersedes**: `docs/superpowers/specs/2026-05-06-m5-team-viral-sync-design.md`
(the 14-section M5 design spec — Status flipped to Abandoned by this ADR).

**Related**: ADR-0005 (archive hypothetical port seams), ADR-0006 (close-on-plan
commit policy), ADR-0009 (attribution delivery as metadata) — all three
reference viral sync in passing; they are historical and left intact.

## Context

M5 viral sync (shipped via PR #71, 2026-05-06) is a four-subsystem mechanism for
propagating TeamAgent rules across a git-based team:

- **Infection** — when a senior user first works in a project, the system
  *automatically* writes a `.teamagent/manifest.json` contract, bootstrap entry,
  hook anchors, and a shared-rule directory skeleton into the repo.
- **Bootstrap** — when a teammate clones the repo, bootstrap *automatically*
  installs missing plugins, hooks, and project-level Skills on their machine.
- **Sync** — personal rules pass two gates (secret scanner + scope classifier),
  shareable rules auto-commit to `.teamagent/team/<author>/<rule_id>.json` and
  auto-push; receivers auto-pull via a post-merge hook. On by default.
- **Enforcement** — periodic contract checks; failures degrade gracefully.

It is fully implemented (9 core modules under `packages/core/src/m5/`, 7 `m5-*`
CLI commands, `scripts/m5-auto-demo.sh`) and was tested end-to-end.

The feature is **bad** for three reasons:

1. **Invasive by design.** The "viral" framing is literal: it auto-writes
   contract files into other people's repos and auto-installs software on
   teammates' machines, with auto-push of rules on *every* SessionStart. The
   gates seal secrets, but the consent model is "infection", not opt-in. That
   is user-hostile — a teammate cloning a repo did not agree to have their
   environment mutated.
2. **Shipped but unvalidated.** It is a large, default-on surface (auto-share /
   auto-publish / auto-pull) with no validated demand. Complexity is real;
   the pull is not.
3. **Distracts from the core wedge.** TeamBrain's validated value is Feature #1
   (auto-capture / learning — new Claude Code instances stop repeating old
   mistakes). Viral sync pulls design and maintenance attention away from it.

## Decision

**M5 viral sync is abandoned.**

1. **Docs de-market it now.** Every doc that described viral sync as
   live / implemented / verified is updated to mark it abandoned and point at
   this ADR. The M5 design spec's Status is flipped to `Abandoned`.
2. **No new work builds on viral sync.** Infection, bootstrap, auto-share,
   auto-publish, post-merge auto-pull, and enforcement are not extended,
   re-verified, or surfaced in product positioning.
3. **Code is frozen, not yet removed.** The `m5-*` CLI commands,
   `packages/core/src/m5/*`, and `scripts/m5-auto-demo.sh` stay in the tree for
   now so this decision lands as a small, reversible, docs-only PR. Actual code
   removal (and deletion of the `TEAMAGENT_M5_AUTOSHARE` /
   `TEAMAGENT_M5_AUTOSESSION` / `TEAMAGENT_M5_AUTOPUSH` env-var surface) is a
   **deferred follow-up** PR.
4. **Business Feature #2 loses its evidence basis.** Feature #2 ("team leaders
   see teammates' Claude in second-level realtime") remains a *business
   aspiration*, but M5 viral sync was its only hour/day-granularity
   implementation substrate. With viral sync abandoned, Feature #2 currently
   has **no shipped implementation evidence**. Its grilled canned-answer anchor
   sentences in `CLAUDE.md` are **not** touched by this ADR (changing a grilled
   anchor needs its own grill cycle); only the descriptive evidence claims are
   downgraded.

## Considered Options

- **(A) Keep M5 viral sync as-is.** Rejected — leaves an invasive, default-on,
  unvalidated surface in the product and in the positioning.
- **(B) Keep the code, drop only the "viral" framing.** Rejected — the problem
  is not the word; it is the auto-infect / auto-install / auto-push behavior.
  Re-labeling it "team sync" while it still mutates other machines by default
  does not fix the consent problem.
- **(C) Fully abandon M5 viral sync (docs now, code removal as follow-up).**
  **Accepted.** Declares the decision unambiguously, downgrades the positioning
  honestly, and keeps the landing PR small and reversible.

## Consequences

- **Positive** — product positioning becomes honest (no invasive default-on
  feature claimed as shipped); design attention concentrates on Feature #1;
  the decision is recorded durably and is greppable in `docs/adr/`.
- **Negative** — Business Feature #2 loses its only implementation evidence and
  reverts to pure aspiration; the `m5-*` CLI commands become deprecated-but-
  present surface until the follow-up removal PR; historical plans/specs/reports
  under `docs/plans/`, `docs/specs/`, `docs/test-reports/` still describe viral
  sync as live (left intact as point-in-time history, like the referencing
  ADRs).
- **Risk** — readers may hit a stale historical plan/spec and think viral sync
  is current; mitigated by this ADR being the superseding record and by the
  M5 spec carrying an `Abandoned` Status banner that links here.

## Follow-ups (deferred, not in this PR)

- Remove `packages/core/src/m5/*`, the 7 `m5-*` CLI commands, and
  `scripts/m5-auto-demo.sh`; delete the `TEAMAGENT_M5_*` env-var surface.
- Decide Feature #2's path: either re-scope it onto a non-viral substrate or
  retire it; route that through a grill cycle since it touches grilled
  canned-answer anchors.
- Archive or redirect the M5 implementation plans under
  `docs/superpowers/plans/2026-05-06-m5a-infect-and-bootstrap.md` and the
  `docs/specs/2026-05-07-issue82-*` cluster.

## How to verify

- `grep -rn "viral sync\|M5 viral\|viral spread" docs/ README.md` — every
  surviving hit is either in this ADR, in an historical ADR (0005 / 0006 /
  0009), in a historical plan/spec/report, or carries an
  "abandoned / ADR-0016" tag. No top-level doc still describes viral sync as
  live / implemented / verified.
- `claudefast -p "show me the business feature of this repo"` and
  `claudefast -p "what are the business feature and do we have enough evidence to prove them to ceo, coder, machine-readable, LLM-readable evidence?"`
  still hit every grilled anchor — this ADR must not cause canned-answer drift.
