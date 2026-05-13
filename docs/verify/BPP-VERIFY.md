# BPP-VERIFY — How to verify BPP (Best-Practice Push) is real, not a fake demo

**Status**: Phase 6 PR-1/3 (scaffold). Spec: [`docs/superpowers/specs/2026-05-13-best-practice-push-design.md`](../superpowers/specs/2026-05-13-best-practice-push-design.md) §3.5 and §8.

## TL;DR

BPP claims a team can mine high-confidence best practices from team transcripts
and push them to teammates' Claude Code sessions in seconds. Two natural failure
modes need to be ruled out:

1. **Hallucinated practices** — mining LLM writes a plausible-sounding rule that
   isn't actually grounded in observed sessions.
2. **No-op effect** — practices get pushed but don't change downstream behavior.

The three-tier harness below verifies both. **Tier (a) and (b) are deterministic
and LLM-uncheatable**; tier (c) is a semantic-ambiguity fallback.

## The three tiers

| Tier | Tool | What it verifies | LLM in verdict loop? |
|---|---|---|---|
| (a) | `tests/fixtures/scenarios/bpp-*/` byte-diff via vitest | Given a transcript, mining + Wilson gate produces exactly the expected `BestPractice` JSON | **No** — `toEqual` on parsed JSON |
| (b) | `scripts/bpp-ablation.ts` + `scipy.stats.ttest_rel` | bpp-on arm produces more BPs (or fewer downstream avoidable mistakes) than bpp-off arm with p < 0.05 | **No** — numeric Δ + p-value |
| (c) | LLM-as-judge | Semantic-ambiguity bottlenecks (e.g. "are these two BPs really conflicting?") | Yes (last resort, narrow scope) |

Per spec §8.1: **"主门禁是 tier (a) + (b). tier (c) 仅作 semantic-ambiguity 兜底."**

## Current status (Phase 6 PR-1)

| Slice | Status | Artifact |
|---|---|---|
| P6.1 — tier (a) byte-diff fixtures | **1 of 5 done** (`bpp-brainstorm-habit`) | `tests/fixtures/scenarios/bpp-brainstorm-habit/` + `packages/digital-twin/src/bpp/__tests__/fixture-replay.test.ts` |
| P6.2 — tier (b) Counterfactual Ablation | **skeleton only** (single-task placeholder) | `scripts/bpp-ablation.ts` |
| P6.3 — tier (c) LLM judge for conflict-pair semantic | Not started | — |
| P6.4 — this doc | **scaffold** | `docs/verify/BPP-VERIFY.md` |

## Objective grep criteria (§8.2)

The spec defines BP "shippability" purely from `mining_evidence` integer counts
— no LLM read required. Two examples:

### Criterion 1: pattern_count / sessions_observed ≥ 0.7 AND reject_count == 0

```bash
jq '
  (.mining_evidence.pattern_count / .mining_evidence.sessions_observed) as $rate
  | .mining_evidence.reject_count as $r
  | { rate: $rate, rejects: $r, pass: ($rate >= 0.7 and $r == 0) }
' tests/fixtures/scenarios/bpp-brainstorm-habit/expected-final-bp.json
```

Expected output: `{"rate": 3.75, "rejects": 0, "pass": true}`.

### Criterion 2: awk one-liner across all fixtures

```bash
for f in tests/fixtures/scenarios/bpp-*/expected-final-bp.json; do
  jq -r '[.id, .mining_evidence.pattern_count, .mining_evidence.sessions_observed, .mining_evidence.reject_count] | @tsv' "$f"
done | awk '
  { rate = $2 / $3; pass = (rate >= 0.7 && $4 == 0); printf "%s  rate=%.2f  rejects=%d  pass=%s\n", $1, rate, $4, (pass?"YES":"NO") }
'
```

This grep is the **objective backstop** for an LLM trying to claim "yes this BP
passes": the integers in `mining_evidence` are counted from real session
collector output, not summarised by an LLM, so the model cannot fabricate a pass.

## How to run

```bash
# tier (a) — vitest byte-diff
npx vitest run packages/digital-twin/src/bpp/__tests__/fixture-replay.test.ts

# tier (b) — single-task ablation skeleton
npx tsx scripts/bpp-ablation.ts
```

Sample tier (b) output:

```json
{"ablation":"brainstorm-habit","bpp_on_bp_count":1,"bpp_off_bp_count":0,"delta":1,"p_value_placeholder":0.01,"note":"real p-value needs scipy.stats.ttest_rel on 17-task corpus, this is single-task placeholder"}
```

## Why this is LLM-uncheatable

Three load-bearing properties:

1. **`mining_evidence` is integers.** Per spec §3.5: `sessions_observed`,
   `pattern_count`, `reject_count` are populated by the collector (file scanner +
   AST matcher) and the `PushEvent` rejected-count, not by an LLM summary.
   An LLM that fakes a rule cannot fake its counts past the grep gate.
2. **Tier (a) compares parsed JSON.** Bytes go in, bytes go out, `toEqual`
   compares — no model reads the verdict.
3. **Tier (b) returns a p-value.** Pure number. `scipy.stats.ttest_rel` is
   third-party code that pre-exists this repo (also used by
   [`docs/verify/E2E-LEARNING.md`](./E2E-LEARNING.md) and
   [`scripts/ablation/ttest_l4.py`](../../scripts/ablation/ttest_l4.py)).

When a future agent claims "BPP works", you can refuse the claim unless tier (a)
passes for **all 5 fixtures** and tier (b) returns **p < 0.05**.

## Roadmap to "done"

| Step | Action |
|---|---|
| P6.1 expand | Add 4 more fixtures: `bpp-rule-mock-db`, `bpp-skill-debounce`, `bpp-context-mgmt-checkpoint`, `bpp-conflict-pair`. Same structure as `bpp-brainstorm-habit/`. |
| P6.2 expand | Wire `scripts/bpp-ablation.ts` to the 17-task corpus (issue #343 reused) and replace `p_value_placeholder` with real `scipy.stats.ttest_rel` output. |
| P6.3 | Add `scripts/bpp-llm-judge.ts` for the narrow semantic-ambiguity case (two BPs disagree but neither violates objective grep). Voting: 3 judges, majority wins, log dissent. |
| P6.4 | This doc — promote from scaffold to canonical once P6.1-3 are green. |

## Relation to existing verify infra

- [`docs/verify/E2E-LEARNING.md`](./E2E-LEARNING.md) is the parent doctrine
  ("Counterfactual Ablation + Regression Replay, no LLM judge in main loop").
  BPP-VERIFY applies the same recipe at BPP scope.
- [`docs/adr/0013`](../adr/0013-inner-loop-on-ci.md) — tier (a) vitest tests run
  in the inner-loop CI workflow on `wip/**`; tier (b) ablation will run nightly
  per the same workflow once corpus-attached (slice 7 pattern).
- Existing fixtures under [`fixtures/sessions/`](../../fixtures/sessions/) are
  the source pool for `tests/fixtures/scenarios/bpp-*` — we extract candidate
  sub-traces, not invent new transcripts.
