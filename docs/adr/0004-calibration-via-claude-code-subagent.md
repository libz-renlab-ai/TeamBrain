---
Status: proposed
Date: 2026-05-07
---

```text
   Claude Code (host agent, the smart one)
        |
        |  spawn Agent tool subagent when tier needs re-judging
        v
   subagent
        |   reads via CLI:  teamagent dump-events --rule X / show-rule X
        |   searches via:   gbrain / repo grep / docs/
        |   writes via CLI: teamagent set-tier <id> <tier> --reason "..."
        v
   TeamBrain (functional core sidecar, the dumb one)
        |
        +-- RuleBasedCalibrator (=old v1)
        |     auto-updates `confidence: number` only
        |     runs in Stop hook, sync, deterministic, free
        |
        +-- Store
        |     `tier` is a first-class field on KnowledgeEntry
        |     `tier_source` ∈ {auto-rule, manual, subagent}
        |     `tier_set_at` audit timestamp
        |
        +-- (no v2 calibrator, no Wilson LB, no Bayesian, no inline LLM)
```

# Calibration via Claude Code subagent; TeamBrain core has no LLM

TeamBrain is a Claude Code sidecar — the host agent (Claude Code) is where contextual judgment lives, and TeamBrain's job is to be a small deterministic state store with hooks. Therefore Calibrator inside TeamBrain stays as one rule-based pure function (`RuleBasedCalibrator` =v1 from `packages/core/src/calibrator/default.ts`) that only updates `confidence: number`, and `tier` is a separately-managed first-class field on `KnowledgeEntry` written exclusively from the outside — by humans via CLI, or by Claude Code subagents spawned via the Agent tool, that read context (events, observations, similar rules in gbrain) and write back via `teamagent set-tier <rule-id> <tier> --reason "..."`. The previously-shipped `CalibratorV2` port + impl + contract test + pipeline branch is removed.

## Considered Options

- **(a) Keep dual calibrators (`Calibrator` + `CalibratorV2`)** — Rejected. Both ports exist, both have contract tests, both are exported from `@teamagent/core`, but callers in `analyze.ts`, `review-candidates.ts`, `calibrate.ts` all hardcode v1, while v2 is wired in only one branch of `pipeline.ts`. Migration is in flight implicitly but with no policy, no router, no deprecation. The seam between v1 and v2 lives in import paths, not in any module — it is a hypothetical seam that creates ongoing confusion without producing leverage.
- **(b) Promote v2 (Wilson LB + Bayesian + 6-tier) and deprecate v1** — Rejected. Wilson lower bound on observations collapses to ≈ 0 when N=0, so any v1-shape rule (only `confidence: number`, no observations history) suddenly looks broken on first calibration touch under v2. Even with a Bayesian prior workaround, the formula compresses what is fundamentally a contextual judgment ("does this rule still apply, given the project's drift") into a closed-form statistic. The right primitive is contextual search by an LLM agent, not a fixed formula.
- **(c) Embed an `AgenticCalibrator` adapter inside TeamBrain that calls an LLM** — Rejected. This breaks the Functional Core, Imperative Shell rule (calibration becomes async + non-pure + IO-bound), introduces per-Stop-hook LLM cost on the latency-sensitive hot path, and duplicates an agentic layer that already exists in the host (Claude Code itself). TeamBrain should not grow its own LLM client just to do what Claude Code is already there to do.
- **(d) Auto-set `tier` from rule-based confidence buckets in v1** — Rejected. Confidence is one signal; tier is a maturity / enforcement / compile-gate decision that depends on context the calibrator doesn't see (is the rule still on-strategy, has the surrounding code changed, has the team revoked it). Auto-setting tier from confidence collapses two distinct concerns and removes the audit trail of who-decided.

## Consequences

- **Deletions.** `packages/ports/src/calibrator-v2.ts`, `packages/ports/src/__tests__/calibrator-v2-contract.ts`, `packages/core/src/calibrator/v2/` (impl + tests), the `v2Calibrator` re-export from `packages/core/src/index.ts`, the v2 branch in `packages/core/src/pipeline/pipeline.ts:288` and `pipeline-v2.test.ts` are removed in the implementation PR that follows this ADR. Wilson LB, the `Observation` interface, `demerit`, `Tier` as a calibrator-output, and the 6-tier Wilson-LB-driven state machine all disappear from the calibrator surface.
- **`tier` becomes a first-class persisted field on `KnowledgeEntry`.** Today it is only present in v2's output type. The store schema gains `tier`, `tier_source ∈ {auto-rule, manual, subagent}`, and `tier_set_at`. `RuleBasedCalibrator` (=v1) does **not** write `tier`; it only updates `confidence`. The 6-value Tier enum (`experimental | probation | stable | canonical | enforced | dormant`) is preserved verbatim from v2 — the names and ordering are good, only the auto-assignment machinery dies.
- **New CLI surface.** `teamagent set-tier <rule-id> <tier> --reason "<text>" [--source manual|subagent|auto-rule]` is the single entry point for tier mutation, callable by humans or by Claude Code subagents. The reason is required and stored alongside `tier_set_at`.
- **Subagent invocation pattern.** Claude Code spawns calibration subagents via the Agent tool when the user asks for a tier review, when a `/loop` schedules periodic re-evaluation, or when batch CLI work (`teamagent review-candidates`) requests it. The subagent prompt is responsible for reading events via CLI, searching for context via gbrain, and writing the decision back via `set-tier`. There is **no** subagent-invocation logic inside TeamBrain itself — TeamBrain only exposes the read/write CLI surface.
- **Compile gate semantics unchanged.** `pnpm teamagent compile` continues to write only `stable` / `canonical` / `enforced` rules to Skills (per existing CLAUDE.md compile.ts contract). Because tier is now exclusively externally written, the compile gate becomes a more honest reflection of who decided what is canonical.
- **`docs/CONTEXT.md` adds two terms:** **Tier** (the maturity / enforcement / compile-gate axis) and **Calibration source** (audit field recording who set the current tier). See companion commit.
- **CLAUDE.md "TeamAgent 经验" entry #4** (which currently states "v2 5-tier system canonical") becomes stale and is updated in the implementation PR to: "Tier is set externally by humans or Claude Code subagents via `teamagent set-tier`; RuleBasedCalibrator (the only in-process calibrator) updates `confidence` only."
- **5-tier vs 6-tier drift resolved.** Documentation that says "5-tier" (CLAUDE.md experience #4, design spec) is corrected to **6-tier** to match the canonical enum, including the `dormant` state (functionally equivalent to old `archived` status).
- **One existing v2-touched rule cohort needs a one-time tier seed.** Rules that were calibrated by the v2 branch in `pipeline.ts:288` already have a tier value computed by Wilson LB. The implementation PR adds a one-shot migration that re-stamps these as `tier_source=auto-rule` with reason `"seeded from removed v2 calibrator (ADR-0004)"`, so the audit trail stays clean.
