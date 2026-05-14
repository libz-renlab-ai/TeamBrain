# bpp-brainstorm-habit fixture (tier (a) byte-diff)

## What this fixture asserts

Given a Claude Code session transcript where the user/assistant exhibit a "brainstorm
before writing code" pattern (assistant invokes `superpowers:brainstorming` skill
before every `Write` tool call), the BPP **mining pipeline** + **Wilson + tier gate**
must produce a `BestPractice` whose serialized JSON is structurally byte-equal to the
expected snapshot.

This is a **tier (a) harness** in the three-layer testing strategy from
`docs/superpowers/specs/2026-05-13-best-practice-push-design.md` §8 — purely
deterministic, no LLM-as-judge in the loop.

## Inputs

- `transcript.jsonl` — 6 entries (3 user, 3 assistant) representing **one** session
  with **two** `brainstorm → write` pattern instances.
- `expected-candidate-bp.json` — what `mineForTest(transcript)` should emit:
  `pattern_count = 2`, `sessions_observed = 1`, `confidence_tier = "low"` (no Wilson
  yet, just raw counts).
- `expected-final-bp.json` — what the Wilson + tier gate emits **after accumulating
  evidence across multiple sessions**. The fixture supplies a hand-rolled rollup of
  `{sessions_observed: 4, pattern_count: 15, reject_count: 0}` simulating four
  prior sessions exhibiting the same pattern. Wilson LB with z=1.96 over
  (15 success, 0 failure) ≈ **0.7961**, which crosses the `canonical` threshold (≥0.75)
  per BpTier.

## The candidate → final seam (intentional, document loudly)

The candidate carries **only** evidence from the current transcript
(`pattern_count = 2, sessions_observed = 1`). One session is **not** enough to clear
canonical tier. The gate function signature is:

```ts
gate(candidate, accumulatedEvidence) → BestPractice
```

`accumulatedEvidence` represents rollup state the server maintains across all sessions
for this `(user, pattern)` pair. In production this would come from the
`_audit/` or `_bp/` rollup store; for the fixture it is hand-supplied in the test.

This seam is **deliberate** — do not think the candidate's small counts are a bug. The
mining stage is faithful to what one transcript shows; the gate is where multi-session
evidence accumulates.

## Pass criteria

Truly literal byte-equality of hand-written JSON files vs. JS-serialized objects is
fragile (key order, trailing newlines, whitespace). "Byte-diff" here means
**structural equality of parsed JSON** via `vitest`'s `toEqual`:

```ts
expect(actualCandidate).toEqual(JSON.parse(readFileSync('expected-candidate-bp.json')));
expect(actualFinal).toEqual(JSON.parse(readFileSync('expected-final-bp.json')));
```

Equivalent to: serialize both sides with stable key ordering and `diff -q`. The PASS
verdict is **deterministic numeric/string equality**, no LLM judge.

## How to run

```bash
npx vitest run packages/digital-twin/src/bpp/__tests__/fixture-replay.test.ts
```

PASS if both `toEqual` assertions pass; FAIL otherwise.

## Objective grep example (independent of vitest)

The spec §8.2 grep criterion: `pattern_count / sessions_observed >= 0.7 AND reject_count == 0`
can be checked from the expected JSON with:

```bash
jq '
  (.mining_evidence.pattern_count / .mining_evidence.sessions_observed) as $rate
  | .mining_evidence.reject_count as $r
  | { rate: $rate, rejects: $r, pass: ($rate >= 0.7 and $r == 0) }
' tests/fixtures/scenarios/bpp-brainstorm-habit/expected-final-bp.json
```

Expected: `{"rate": 3.75, "rejects": 0, "pass": true}`.

## Caveats

- `mineForTest` in `fixture-replay.test.ts` is a hardcoded placeholder. When
  Phase 2 lands a real `behavior-miner`, swap the placeholder for the real import
  and re-record `expected-candidate-bp.json` if mining details change.
- `CandidateBp` type is **not** in `packages/digital-twin/src/bpp/types.ts` yet
  (Phase 1 frozen); declared inline in the test as a local shim until Phase 2
  formalizes it.
- `created_at` is fixed (`2026-05-13T10:11:00Z`) — never use `Date.now()` in
  miner or gate during fixture replay.
