---
Status: proposed
Date: 2026-05-10
---

```text
            before this ADR (order-6 plan v1)         after this ADR (O1=B)
            =================================         =====================

            ADR-0010 tier (c)                         ADR-0010 tier (c) extended:
              ↓ runs against                            ┌─ default mode (UNCHANGED):
              IMMUTABLE pre-recorded                    │    immutable transcript.jsonl
              tests/fixtures/scenarios/                 │    in tests/fixtures/scenarios/
                <slug>/transcript.jsonl                 │    (per-PR, dual-consensus, α-strict)
                                                        │
            order-6 (orthogonal CI gate):             ─┴─ NEW: --live-capture mode
              .github/workflows/                              ↓ records ephemeral transcript
                install-canned-answer-check.yml               in scratch path (NOT committed)
              + scripts/claudefast-ci.sh                      ↓ runs SAME dual-consensus
              ↓ direct claudefast -p probes                   judge harness, temperature=0,
              ↓ regex anchor checks                           JSON-schema validated
              ↓ SECOND review gate                            ↓ verdict + (c)-FAIL backlog
                                                              entry ONLY persisted; raw stays
                                                              ephemeral

            order-6 becomes:
              .github/workflows/install-canned-answer-check.yml
              ──► one `pnpm teamagent fixture replay --tier=c
                                          --live-capture
                                          --prompt-set <name>` line
              (no scripts/claudefast-ci.sh, no second judge harness)
```

# Extend ADR-0010 with `--live-capture` tier (c) mode; collapse order-6 V5 into the same gate

## Status

Proposed.

## Date

2026-05-10.

## Context

Issue #155 decision #5 ("post-merge canned-answer probes against a
freshly-installed binary remain a required signal") motivates order-6
(`docs/plans/issue-155/order-6-ci-v5/plan.md`). The order-6 plan v1
shipped the V5 layer as a standalone GitHub Actions workflow at
`.github/workflows/install-canned-answer-check.yml` plus a helper
`scripts/claudefast-ci.sh` that runs `claudefast -p` probes against a
freshly-installed TeamAgent binary on every push to `main`, then
asserts canned-answer anchor strings (e.g., `FASTPROBE`, `TEAMWORK`,
`PR-PLAN`, `POSTPR`) via regex.

ADR-0010 (bottom-level fixtures) already specifies a tier (c) LLM-judge
harness for per-PR semantic verification. Tier (c) today runs only
against IMMUTABLE pre-recorded transcripts under
`tests/fixtures/scenarios/<slug>/transcript.jsonl` — captured once at
finalize time, hash-pinned in `meta.json`, replayed deterministically
across PRs. ADR-0010 explicitly forbids mutating those committed
transcripts; that "immutable raw" property is the load-bearing invariant
that lets `git diff` on the fixture corpus remain a meaningful review
artifact.

Issue #155 grill round 2 (2026-05-10) flagged that order-6 plan v1
introduces a **second** CI review gate alongside ADR-0010's existing
one, with different semantics (regex anchors vs LLM-judge), different
prompt-set definitions, different result shapes, and different escape
mechanisms. The same install regression could pass one and fail the
other; engineers would face the "which gate is authoritative"
ambiguity that ADR-0010's "(X) Three independent tiers" rejection
already named, this time across CI workflows rather than across replay
tiers. Round 2 surfaced four options for resolving the duplication
(A/B/C/D below); the user's choice was **B** — extend ADR-0010 with a
live-capture mode and collapse order-6 into a 1-line invocation of
the same harness.

## Decision

Add a new `--live-capture` mode to ADR-0010's tier (c) replay command:

```
pnpm teamagent fixture replay --tier=c --live-capture --prompt-set <name>
```

`--live-capture` records a fresh `claudefast -p` transcript on each
invocation, writes it to a scratch path that is NOT committed under
`tests/fixtures/scenarios/` (e.g., `.scratch/live-capture/<run-id>/`,
gitignored — same convention as ADR-0010's `pnpm teamagent fixture
record` scratch directory), then runs the SAME dual-consensus LLM-judge
harness (temperature=0, JSON-schema-validated, both runs must PASS) the
default tier (c) path uses. The fresh transcript is ephemeral; only the
judge verdict and any `docs/verify/backlog.jsonl` entries (when verdict
is `fail` or `needs-human-review`) are persisted.

`--prompt-set <name>` resolves to a named prompt definition shipped
under `tests/fixtures/prompt-sets/<name>.json`; the order-6 use case
ships `tests/fixtures/prompt-sets/install-canned-anchors.json`.

Order-6's GitHub Action becomes a 1-line workflow calling
`pnpm teamagent fixture replay --tier=c --live-capture --prompt-set
install-canned-anchors`. `scripts/claudefast-ci.sh` and the standalone
regex-anchor gate are deleted; the prior canned-answer anchor checks
become natural-language assertions inside the prompt-set's expected
behavior, judged by the same dual-consensus LLM pair ADR-0010
specifies.

The decision preserves ADR-0010's "immutable raw" property by keeping
the live-capture path strictly out-of-tree (scratch only, never `git
add`-ed) and routes any verdict failure through ADR-0010's existing
α-strict gate + `judge-overrides.jsonl` escape, so the single review
gate retains its authority instead of being shadowed by a second
orthogonal gate.

## Considered Options

- **(A) Keep order-6 standalone — two orthogonal gates** — Rejected per
  user choice B in grill round 2. Two gates with different semantics
  (regex anchors in V5 vs LLM-judge in ADR-0010 tier (c)) means the same
  install regression can pass one and fail the other; engineers face the
  "which gate is authoritative" ambiguity that ADR-0010's "(X) Three
  independent tiers" rejection already named, this time across CI
  workflows rather than across replay tiers. Doubles the maintenance
  surface (two judge harnesses, two prompt-set definitions, two
  result-shape conventions) and doubles `MINIMAX_API_KEY` quota burn
  per main push.
- **(B, accepted)** Extend ADR-0010 tier (c) with a `--live-capture`
  mode; order-6 collapses into a 1-line workflow call. Single judge
  harness, single dual-consensus discipline, single backlog ingestion
  path; live-capture stays compatible with ADR-0010's immutable-raw
  guarantee by keeping the fresh transcript ephemeral.
- **(C) Drop V5 from CI entirely** — Rejected. Contradicts issue #155's
  decision #5 ("post-merge canned-answer probes against a freshly-installed
  binary remain a required signal"), which exists because order-1+3+4's
  install change can plausibly regress the canonical anchors that
  `CLAUDE.md` / `AGENTS.md` rely on. Without a freshly-installed-binary
  probe, install regressions land on main undetected until the next
  human reads the docs.
- **(D) Run both — order-6 standalone V5 + ADR-0010 live-capture mode** —
  Rejected. Doubles `MINIMAX_API_KEY` API spend per main push (the
  expensive bit of both gates is the LLM call) and re-introduces the
  double-gate ambiguity option (A) was rejected for. If the live-capture
  mode produces a false-positive `fail`, the order-6 regex gate cannot
  override it; if the regex gate produces a false-positive failure,
  live-capture cannot override it; in both directions the engineer is
  stuck explaining contradictory signals.

## Consequences

- **`pnpm teamagent fixture replay --tier=c --live-capture --prompt-set
  <name>` is the canonical post-merge V5 entry point.** The
  `--prompt-set` argument resolves to a named prompt definition (e.g.,
  `--prompt-set install-canned-anchors`) shipped under
  `tests/fixtures/prompt-sets/<name>.json`. The flag is mode-orthogonal
  to `--tier=c`: tier semantics (judge harness, dual-consensus,
  temperature=0, JSON-schema-validated) are reused verbatim; only the
  transcript source changes from immutable file to fresh recording.
- **Live-capture transcripts are ephemeral.** Captured to a scratch path
  outside `tests/fixtures/scenarios/` (e.g., `.scratch/live-capture/<run-id>/`,
  gitignored — same convention as ADR-0010's `pnpm teamagent fixture
  record` scratch directory). They are NOT moved into
  `tests/fixtures/scenarios/`, NOT hashed into a `meta.json`, NOT
  committed. ADR-0010's `immutable raw` property — that any committed
  `tests/fixtures/scenarios/<slug>/transcript.jsonl` file is hash-stable
  across replays — is preserved unchanged.
- **Persisted artifacts from a live-capture run.** Only (1) the JSON
  judge verdict (printed to stdout, schema-validated against ADR-0010's
  judge-output contract); (2) when verdict is `fail` or
  `needs-human-review`, an append-only entry in
  `docs/verify/backlog.jsonl` referencing the run-id, prompt-set name,
  and dual-consensus disagreement details. The fresh transcript itself
  is purged at end-of-run (or left in `.scratch/` for ad-hoc human
  inspection but never committed).
- **α-strict gate semantics carry over.** A live-capture verdict of
  `fail` or `needs-human-review` blocks the workflow exit code (CI red),
  exactly as ADR-0010 specifies for tier (c). The only escape is the
  same `judge-overrides.jsonl` append-only commit. Silent CLI bypasses
  (e.g., `--allow-judge-disagreement`) remain explicitly forbidden by
  ADR-0010 and are not re-enabled by the live-capture mode.
- **Order-6 plan
  (`docs/plans/issue-155/order-6-ci-v5/plan.md`) is amended in this PR**
  to delete `scripts/claudefast-ci.sh` from the deliverables, replace
  `.github/workflows/install-canned-answer-check.yml`'s body with a
  1-line invocation of `pnpm teamagent fixture replay --tier=c
  --live-capture --prompt-set install-canned-anchors`, and ship the
  install-canned-anchors prompt-set under
  `tests/fixtures/prompt-sets/install-canned-anchors.json`. The
  amendment is a sibling worker's job; this ADR only records the
  architectural call.
- **`packages/cli/src/commands/fixture/replay.ts` (or equivalent
  subcommand entry) gains the `--live-capture` flag and the
  `--prompt-set` argument.** Implementation MUST reuse the same judge
  harness module that ADR-0010's default tier (c) path calls — no
  parallel "live judge" code branch with diverging temperature, schema,
  or consensus rules. The only new branch is the transcript-source
  resolver (immutable file vs scratch capture).
- **API quota note.** Live-capture runs the same dual-consensus LLM
  pair as default tier (c). Per-run cost in MiniMax tokens is the same
  order of magnitude as the order-6-plan-v1 standalone gate's 5
  `claudefast -p` probes (≈$0.015/run); the saving relative to option
  (D) is exactly that — running ONE judge harness instead of running
  the regex-anchor probes AND the LLM-judge harness back-to-back.
- **Cross-refs.** ADR-0010 (`bottom-level fixtures`) is the parent
  specification this ADR supplements; ADR-0010's tier (c) section,
  α-strict gate semantics, dual-consensus rule, and
  `judge-overrides.jsonl` escape all apply unchanged to the
  `--live-capture` mode. ADR-0007 (`local /review skill as review
  gate`) governs the local-review side of POSTPR; ADR-0012 governs the
  CI / post-merge side. Issue #155 grill round 2 transcript
  (decision O1=B) is the originating record.
- **`docs/verify/INDEX.md` "Backlog ingestion from bottom layer"
  entry** (added by ADR-0010) is broadened to include live-capture
  failures alongside the existing immutable-fixture replay failures.
  The backlog entry schema is unchanged; only the source field
  distinguishes "scenario-fixture replay" from "live-capture replay."
- **Walking Skeleton (ADR-0008) impact.** `pnpm teamagent
  skeleton-demo` does not depend on tier (c) at all; the
  `--live-capture` flag is additive and skeleton-demo continues to
  pass at every milestone-end commit.
- **Verification gate.** This ADR is "shipped" when (1) the
  `--live-capture` flag exists on the `fixture replay` subcommand and
  defaults to OFF (preserving ADR-0010 default behavior); (2) a
  successful live-capture run against the install-canned-anchors
  prompt-set on a healthy main produces a JSON verdict matching
  ADR-0010's judge-output schema and exits 0; (3) a deliberately
  regressed install (e.g., empty `CLAUDE.md`) produces verdict `fail`
  and exits non-zero, with a `docs/verify/backlog.jsonl` entry
  appended; (4) `tests/fixtures/scenarios/` contains zero new files
  attributable to a live-capture run (the immutable-raw invariant);
  (5) order-6's workflow file is a single CLI invocation, not a
  bespoke harness.
