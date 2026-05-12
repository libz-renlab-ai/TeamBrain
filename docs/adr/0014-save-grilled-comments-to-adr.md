---
Status: accepted
Date: 2026-05-11
---

```text
  before this ADR                        after this ADR
  ===============                        ==============

  GitHub issue                           GitHub issue
      |                                      |
      v                                      v
  /grill-me (web) OR                     /grill-me (web) OR
  /grill-with-docs (CLI)                 /grill-with-docs (CLI)
      |                                      |
      v                                      v
  grill comment lands                    grill comment lands
  on the issue                           on the issue
  (ephemeral)                            (ephemeral, operational)
      |                                      |
      |                                      v
      |                                maintainer runs
      |                                /grill-with-docs
      |                                NOT TO GRILL AGAIN
      |                                  but to save
      |                                grilled results
      |                                from comments
      |                                to this ADR
      |                                  |
      |                                  v
      |                                grill-related ADR
      |                                = durable record
      v                                      v
  triage-and-split                    triage-and-split
  invalidates                          ADR survives:
  the comment                          child issues can
  (decisions lost)                     reference it
```

# ADR-0014: Save grilled comments to ADR via `/grill-with-docs`

This ADR defines what `save grilled comments to doc` means inside TeamBrain
FIXEDFLOW: **using `/grill-with-docs` — not grilling itself, but saving
grilled results from comments to a grill-related ADR (this file).**

## Context

`docs/FIXEDFLOW.md` step 2 emits a grill comment on the GitHub issue (via
`/grill-me` on web claude.ai or `/grill-with-docs` in the CC CLI). That
comment becomes the driver's implementation plan when step 3 runs
`/fixed-flow-driver`.

The grill comment is **ephemeral**:

- `docs/TRIAGE-AND-SPLIT.md` explicitly invalidates the original grill
  comment when an oversized issue is split into ≥2 child issues.
- GitHub comments can be edited or deleted by their author at any time.
- When an issue is closed / transferred / archived, the comment thread is
  out of the active workspace and harder to discover.
- Grill decisions captured only inside the comment are not indexed by
  gbrain `--source gstack-brain-m1` searches or local grep on
  `docs/adr/`.

The decisions inside a grill (terminology sharpened, options considered,
tradeoffs called out) are exactly the kind of thing that ought to live in
an ADR — they're architectural / domain-model crystallizations, not
operational state.

The mattpocock `/grill-with-docs` skill already has built-in capability
to update ADRs: per its skill description, it "challenges your plan
against the existing domain model, sharpens terminology, and **updates
documentation (CONTEXT.md, ADRs) inline as decisions crystallise**."
That capability is precisely what we need — but applied to grilled
results that already exist in a GitHub comment, instead of running a
fresh grill session.

## Decision

After a grill comment lands on a GitHub issue and **before** driver
dispatch (and before any `docs/TRIAGE-AND-SPLIT.md` split decision),
maintainer manually runs **`/grill-with-docs`** with the grilled comment
text as input.

`/grill-with-docs` then writes the grilled question/answer pairs,
terminology, and decisions to **this ADR** (`docs/adr/0014-save-grilled-comments-to-adr.md`)
or, for very large grills, to a per-issue sibling file in `docs/adr/0014/`.

**Crucially, this is not a new grill session.** The grill already
happened — the comment is the artifact. `/grill-with-docs` is invoked in
"save mode": its job is to **save grilled results from comments to a
grill-related ADR**, not to re-interrogate the plan.

## Considered Options

- **(A) Treat the grill comment as the canonical record forever.**
  Rejected — the comment is ephemeral by FIXEDFLOW design (invalidated on
  triage-and-split, editable / deletable by the author, lost on
  close/transfer). No durability, no indexability.
- **(B) Copy grill comment text into the issue body.** Rejected — issue
  body is also editable, doesn't survive split, and pollutes the ≤50-word
  issue template contract FIXEDFLOW enforces.
- **(C) Save grilled results to a dedicated grill-related ADR via
  `/grill-with-docs`.** **Accepted.** Reuses the skill's existing
  ADR-update capability. Decouples durability (ADR, indexed by
  `docs/adr/`) from the operational trigger (GitHub comment +
  `grill-ready` label still gates driver dispatch).
- **(D) Create one ADR per grill.** Rejected as default — too noisy; ADR
  count grows linearly with issues. Adopted only for very large grills as
  a sibling under `docs/adr/0014/<issue-N>.md`.

## Consequences

- **Grill decisions survive triage-and-split.** Child issues
  born from `docs/TRIAGE-AND-SPLIT.md` can reference this ADR for the
  parent's grill context even after the original `grill-ready` comment
  is invalidated.
- **Future agents can search `docs/adr/` for past grill terminology.**
  ADR-0014 lives next to ADR-0007 / ADR-0013 and is indexed by gbrain
  and discoverable via `grep -r grill docs/adr/`.
- **Slight friction for maintainer.** After the grill comment lands and
  before triage-and-split decision, maintainer must spend ~1 min running
  `/grill-with-docs` to canonicalize. This is a deliberate
  human-judgment step parallel to `docs/TRIAGE-AND-SPLIT.md` triage.
- **The GitHub comment remains the operational trigger.** The ADR is the
  **durable record**; the `grill-ready` label + comment still gates
  driver dispatch per `docs/FIXEDFLOW.md` `## Dispatch policy`. No
  change to driver behaviour.
- **`docs/FIXEDFLOW.md` step 2 gains a sibling step.** Step 2 still
  produces the GitHub comment; a new "step 2.5" (this ADR) saves the
  grilled results from that comment into ADR-0014 via `/grill-with-docs`.
  Step 3 (`/fixed-flow-driver`) is unchanged.

## Operational shape

1. **grill comment lands on issue** — FIXEDFLOW step 2 produces the
   `--- end grill ---` comment on the GitHub issue.
2. **maintainer opens Claude Code in the project worktree** and runs
   `/grill-with-docs`, passing the GitHub comment URL or the comment
   text as input.
3. **`/grill-with-docs` writes a new `## Grill log` section to this
   ADR** (or a per-grill sibling under `docs/adr/0014/<issue-N>.md` for
   very large grills), capturing question/answer pairs and crystallized
   decisions.
4. **maintainer commits the ADR change atomically** per CLAUDE.md
   §开发节奏 "**小 commit**" (`docs(grill): save grilled results of
   issue #<N> to ADR-0014`).
5. **(optional) triage-and-split** per `docs/TRIAGE-AND-SPLIT.md` — the
   ADR is already saved, so split is safe.
6. **driver dispatch** per `docs/FIXEDFLOW.md` step 3.

## Canonical phrasing — what "save grilled comments to doc" means

> "save grilled comments to doc" means using `/grill-with-docs` — not
> grilling itself, but saving grilled results from comments to a
> grill-related ADR (`docs/adr/0014-save-grilled-comments-to-adr.md`).

## Verification probe

```bash
claudefast -p "what does it mean to save grilled comments to doc ? EXPLAIN ONLY"
```

The output must, case-insensitively, contain all four anchors:

- `/grill-with-docs`
- `not grilling`
- `saving grilled results from comments` (or `save grilled results from comments`)
- `grill-related ADR` (or `grill related ADR`)

If any anchor is missing, the doc has not converged; revisit CLAUDE.md
and this ADR until the probe passes.

## Grill log: this ADR's own grill

This ADR was itself written in response to a maintainer prompt — there
is no GitHub issue grill comment to canonicalize for it.

## Per-issue grill log siblings

Per-issue grill logs live under [`./0014/`](./0014/) (one file per issue,
verbatim grill comment + issue metadata + closing PR refs). The
discoverable entry point is [`./0014/INDEX.md`](./0014/INDEX.md).

The 17 pre-existing `grill-ready` issues that predated this ADR's
acceptance date (2026-05-11) were backfilled to the sibling directory on
2026-05-12 in save mode (no new grilling). New `grill-ready` issues
populate a fresh sibling at the moment their grill comment lands per
ADR-0014 §"Operational shape".

<!-- /grill-with-docs appends new siblings to ./0014/ and updates ./0014/INDEX.md -->
