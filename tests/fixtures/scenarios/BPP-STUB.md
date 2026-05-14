# BPP fixtures — STUB scope disclaimer

> This file disambiguates what the BPP (Best-Practice Push) fixtures under this
> directory are, and what they are NOT, relative to
> `docs/plans/2026-05-13-bpp-full-system-acceptance.md` §M3 (挖矿管线接通) and
> §M4 (挖矿质量验证).

## What these fixtures ARE

The five fixtures —
`bpp-brainstorm-habit`, `bpp-skill-dispatch-parallel`, `bpp-habit-tdd`,
`bpp-context-atomic-commits`, `bpp-conflict-mock-vs-real-db` —
form a **tier (a) byte-diff regression-replay harness**:

- Each fixture pairs a hand-authored `transcript.jsonl` with a hand-authored
  `expected-candidate-bp.json` and `expected-final-bp.json`.
- The corresponding test files
  (`packages/digital-twin/src/bpp/__tests__/fixture-replay.test.ts` and
  `fixture-replay-all.test.ts`) ship an **inline placeholder miner** per
  fixture that produces the hand-authored expected JSON byte-for-byte.
- Their job: catch accidental regressions in those placeholder miners,
  the Wilson lower-bound math, the tier-from-confidence rounding,
  and the conflict_with double-link.

This is a useful **scaffolding** test surface. It is not a fake-out — the
test names, JSDoc, and comments inside both test files openly call the
miners "placeholder" and reference the still-unwritten production miner.

## What these fixtures are NOT

These fixtures DO NOT validate that:

1. The real production mining pipeline
   (`packages/digital-twin/src/bpp/mining/behavior-miner.ts`,
   `context-pattern-miner.ts`, `correction-adapter.ts`,
   `wilson-tier-gate.ts`) produces the same outputs on these transcripts.
   The placeholder miners and the real miners are **separate code paths**;
   passing tier (a) does not mean the real pipeline is correct.
2. The real production mining pipeline produces sensible outputs on
   **real recorded transcripts** (not these hand-authored fixtures).
3. The real LLM-call cost / latency / determinism characteristics match
   what the production pipeline would exhibit at team scale.

Per `docs/plans/2026-05-13-bpp-full-system-acceptance.md` §9.5:

> 任何阶段交付的"实验结果"、"数据"、"案例"、"对照数字"，都要附上原始记录的
> 物理位置和复现脚本。**没有原始记录和复现脚本的数据一律不予采信**。

These fixtures are hand-authored, not real recordings — so by acceptance
report §9.5, they cannot count as "the synthetic data trap can't bite us
again" evidence.

## Mapping to acceptance report milestones

| Acceptance ref | Status using these fixtures alone | What still needs to happen |
|---|---|---|
| §M1 推送链路 (functional) | PASS via `e2e.test.ts` + `server-handlers.test.ts` (these don't use the synthetic fixtures) | nothing — M1 is independent |
| §M2 对话上传通道 | PASS (collector + identity + sensitive-info redaction tests are independent of synthetic fixtures) | nothing — M2 is independent |
| §M3 挖矿管线接通 | **STUB** — the production mining pipeline exists (`mining/*.ts`) and has its own unit tests, but it has never been run on real recorded transcripts | run mining on a real ≥1-week recording from a real team member and hand-audit the top-20 high-tier candidates |
| §M4 挖矿质量验证 (real-user experiment) | **BLOCKED-ON-HUMAN** | recruit 6-12 person team; run the 4-week experiment defined under `docs/plans/2026-05-13-bpp-poc/m4-experiment/` |
| §M5 生产化运维 | **BLOCKED-ON-HUMAN** (server, domain, key required) | execute the runbook under `docs/ops/bpp-runbook.md` against a real server |

## Why the PR description's "Gap 5 ✅ DONE" needs qualifying

The PR 430 description currently reads:

| Gap 5 | Full 4+1+1 verify fixtures + scipy ablation + LLM-judge | ✅ DONE |

Read literally, this implies §M4 is done. It is not. The honest reading is:

> Gap 5: Tier (a) byte-diff harness scaffolding **DONE** for 5 fixtures;
> the harness will host the real mining pipeline once §M3 is wired against
> real transcripts and §M4 collects real-team data.

The acceptance checklist
(`docs/plans/2026-05-13-bpp-acceptance-checklist.md`) makes this distinction
row-by-row. The PR description should be updated when the checklist is
generated.

## Not deleting these fixtures

These fixtures remain valuable as:

- Regression replay for the **placeholder** miners (catches edits to the
  inline miners that would silently break the wiring).
- Documentation: each fixture's `transcript.jsonl` is a worked example of
  the kind of pattern the real miner is expected to extract.
- A reference shape — when §M3 wires real miners against real transcripts,
  the output structure must remain compatible with these expected JSON files.

So they stay in. What changes is the **claim** attached to them.
