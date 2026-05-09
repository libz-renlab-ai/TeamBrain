---
Status: proposed
Date: 2026-05-09
---

```text
                ┌─────────────────────────────┐
                │ tests/fixtures/scenarios/   │
                │   <feature-slug>--<name>/   │
                │ (immutable raw + derived)   │
                └──────────────┬──────────────┘
                               │
            ┌──────────────────┼──────────────────┐
            ▼                  ▼                  ▼
         tier (a)           tier (b)           tier (c)
       byte-diff         seq + DB-state      LLM-judge
       per-commit          per-PR              per-PR (α)
            \                 │                  /
             \                │                 /
              ▼               ▼                ▼
                α-strict: any FAIL → CI red, PR block
                escape: judge-overrides.jsonl (human, append-only)
```

# Bottom-level testing: scenario-fixture corpus with ephemeral LLM-generated derivers and α-strict gate

Establishes a third verification tier — "bottom-level testing" — beneath the existing PR-time gate (`docs/feature-verification.md`) and per-feature long-running loop (`docs/verify/RUN-VERIFY-LOOP.md`). The bottom layer captures `claudefast -p` sessions as **scenario fixtures** stored under `tests/fixtures/scenarios/<feature-slug>--<scenario-name>/`. Each fixture contains immutable raw streams (`transcript.jsonl` from `--output-format stream-json` and `hooks.raw.log` from `--debug hooks --debug-file`), three derived projections used at three replay tiers ((a) `events/NNN-*.json` for byte-level event diff at every commit, (b) `events.jsonl` + scenario `db-state-after` for sequence + DB-state diff at every PR, (c) `expected_decisions.json` for an LLM-judge against `transcript.jsonl` at every PR with dual-consensus runs), declarative `db-seed.json` describing how to rebuild the KB at capture time plus a SHA-256 sanity hash in `meta.json`, a per-scenario thin `capture.md` (~15 lines: prompt / seed pack / purpose / expected-in-prose) sharing the universal `tests/fixtures/CAPTURE-MASTER.md` pipeline, an `audit/` subdirectory committing every LLM input/output of the capture chain, and a per-scenario `judge.md` driving the replay-time judge call. Count-type derivations (events.jsonl, slice events into events/, hash) are produced by **ephemeral LLM-generated scripts** at finalize time, run once in a sandbox, and committed only to the fixture's `audit/` — never wired into `packages/*/src/`. Semantic derivations (expected_decisions.json) use LLM-as-analyst followed by a separate LLM-as-converter to suppress hallucination. The α-strict gate policy means any tier FAIL — including (c) `verdict: fail` or `verdict: needs-human-review` — blocks the PR; the only escape is an append-only `judge-overrides.jsonl` entry committed in the same PR with explicit human approver, reason, and audit-hash reference. Tier (c) runs at temperature=0 with JSON-schema-validated output and dual-run consensus (both invocations must PASS) to harden against LLM noise without softening the gate.

## Considered Options

### Gate policy

- **(α) Strictest: any tier FAIL → overall FAIL** — Accepted. Precision-over-recall on the block-bad-code axis. False-block cost is low (re-edit + re-push in AI-coding era is ≈30s); false-pass cost is silent semantic regression entering main, poisoning future fixture captures and undermining the corpus's authority. LLM noise is treated as a transient implementation problem (mitigated via temperature=0 + schema + dual-consensus + `judge-overrides.jsonl`) that improves as models improve, not a structural reason to demote (c) to advisory.
- **(γ) Tier-specific terminality (`(c)` advisory only)** — Rejected. Demoting (c) to advisory preserves throughput at the cost of letting LLM-detected semantic regressions reach main while waiting for human triage; this is the exact failure mode the bottom layer exists to prevent.
- **(β) (a) terminal only** / **(δ) Multi-tier voting** — Rejected. β shares γ's failure mode; δ inverts the cost gradient by allowing expensive non-deterministic tier to outvote cheap deterministic tiers.

### Capture-time architecture

- **(D + LLM pipeline + ephemeral codegen)** — Accepted. ONE master playbook (`CAPTURE-MASTER.md`) drives capture; per-scenario `capture.md` is thin input declaration; count-type derives are produced by LLM-generated single-use scripts run once and stored in `audit/` (not in `packages/*/src/`); semantic derives use LLM-as-analyst + LLM-as-converter for prose→JSON to suppress hallucination; entire chain audited turn-by-turn.
- **(B) Two-stage record/finalize CLI with hand-coded derivers** — Rejected. Maintaining `derive-events.ts` etc. in production code creates permanent maintenance surface for code that runs once per fixture, and drifts when Claude Code's `--debug hooks` log schema evolves upstream.
- **(A) Single one-shot capture command** — Rejected. No scratch-and-discard cycle; every unsatisfactory capture wastes a real `claudefast` call.
- **(C) Three-stage with explicit human-review step** — Rejected. `finalize --dry-run` preview achieves the same review gate without a third command.

### DB-state encoding

- **(δ) Declarative `db-seed.json` + SHA-256 sanity hash** — Accepted. JSON describes seed-pack version + additional rules; replay rebuilds DB from configuration rather than restoring binary; hash detects seed-pack drift across releases; tier-set timestamps and other time-derived fields are zeroed during seed to keep hash stable.
- **(α) Binary `.sqlite` snapshot** — Rejected. Schema migrations break old fixtures wholesale; binary diffs are unreviewable.
- **(β) Full SQL dump** / **(γ) Subset SQL dump** — Rejected. Both store noise; subset dump introduces a "what counts as relevant" judgment per fixture.

### Integration with existing verification stack

- **(Y + W) Bottom replaces tier 2 fixture portion + emits to tier 3 backlog** — Accepted. Tier 2 (`docs/feature-verification.md`) is amended to delegate the snapshot+tmux capture portion to `pnpm teamagent fixture replay --tier=all`, keeping only the PR-record narrative. Tier 3 (`docs/verify/INDEX.md` / `RUN-VERIFY-LOOP.md`) is amended to ingest `docs/verify/backlog.jsonl` entries written by failed/uncertain (c) verdicts and override events.
- **(X) Three independent tiers** — Rejected. Triple maintenance burden; engineers face "which gate is authoritative" ambiguity.
- **(Z) Bottom feeds tier 2 alongside snapshot** — Rejected. Snapshot becomes redundant once the fixture corpus exists.
- **(W only)** — Rejected as standalone. Without Y, tier 2's snapshot stays canonical and bottom is duplicate work.

## Consequences

- **`tests/fixtures/scenarios/<slug>/` is the canonical bottom-level fixture root.** Required artifacts per fixture: `meta.json`, `capture.md`, `prompt.txt`, `db-seed.json`, `transcript.jsonl`, `hooks.raw.log`, `events.jsonl`, `events/NNN-<channel>.json`, `expected_decisions.json`, `rules.json`, `judge.md`, `judge-overrides.jsonl` (append-only, may start empty), `audit/`. Slug naming is `<feature-slug>--<scenario-name>` (double-dash separator); slug == folder name == ID, no separate numeric ID.
- **No production-code derive utilities in `packages/*/src/`.** `derive-events.ts` and equivalents do not exist; `CAPTURE-MASTER.md` produces them per capture via LLM-codegen and discards them after committing artifacts. A future lint rule MAY enforce "no `derive-*` utilities outside `audit/` directories". Upstream format changes are absorbed by re-prompting at next finalize, not by maintaining parser code.
- **`pnpm teamagent fixture replay --tier=a|b|c|all`** is the canonical replay entry point. Tier (a) ALSO runs in `pnpm test` via `tests/fixtures/scenarios/__tests__/replay-events.test.ts` for local watch-mode feedback. Tiers (b) and (c) do not enter vitest to keep `pnpm test` fast and offline-safe.
- **α-strict gate semantics.** All three tiers must PASS for CI green. (c) `verdict: fail` or `verdict: needs-human-review` blocks PR merge. The only escape is a same-PR `judge-overrides.jsonl` append-only entry referencing the audit hash with explicit human approver / reason / scope. Override is a commit, not a flag — silent CLI bypasses (e.g. `--allow-judge-disagreement`) are explicitly forbidden and any such flag introduced in future is itself a rule violation.
- **(c) determinism hardening.** LLM calls run at temperature=0 with JSON-schema-validated output. Each (c) verdict requires dual-consensus: both runs must PASS; any FAIL or schema mismatch in either run blocks the PR.
- **Capture is two-stage (record → finalize).** `pnpm teamagent fixture record` writes to `.scratch/fixtures/<auto-uuid>/` (gitignored); `pnpm teamagent fixture finalize` validates schema, runs LLM derive chain, writes audit, computes hashes, and moves the directory to `tests/fixtures/scenarios/<slug>/` ready for `git add` (no auto-commit).
- **Capture must use isolated DB.** `--seed-pack` is a required `record` flag; the user's `~/.teamagent/knowledge.db` is never touched. Capture is therefore safe to run anytime, and replay is portable across machines.
- **`docs/feature-verification.md` snapshot+tmux portion is superseded.** Amended in this ADR's implementation PR to delegate capture to bottom layer replay; the PR-record narrative section is retained.
- **`docs/verify/INDEX.md` gains a "Backlog ingestion from bottom layer" entry.** (c) FAIL / `needs-human-review` / override events emit JSONL records to `docs/verify/backlog.jsonl`; tier 3's per-feature long-running loop prioritizes these for deep semantic investigation.
- **`docs/CONTEXT.md` gains "Bottom-level testing" terms.** Canonical: `Scenario fixture`, `Three replay tiers`. Detailed terminology lives in this ADR.
- **No new ports or core modules.** Per ADR-0005, the bottom layer reuses existing CLI infrastructure (`pnpm teamagent <cmd>`); replay is a new CLI command but does not introduce ports or contracts. The audit chain is filesystem-only.
- **Walking Skeleton (ADR-0008) impact.** `pnpm teamagent skeleton-demo` continues to pass at every milestone-end commit; bottom-layer `replay --tier=a` is additive and does not depend on skeleton structure.
- **First-fixture seed and migration are out of scope of this ADR.** The implementation PR will (1) seed `tests/fixtures/scenarios/` with ≥3 initial fixtures captured against the existing seed packs, (2) add the `fixture record` / `fixture finalize` / `fixture replay` subcommands, (3) add `tests/fixtures/CAPTURE-MASTER.md` and an example per-scenario `capture.md`, (4) update tier 2/3 docs as above. Existing `docs/verification/recording-*` files remain as historical artifacts; they are not retroactively migrated.
