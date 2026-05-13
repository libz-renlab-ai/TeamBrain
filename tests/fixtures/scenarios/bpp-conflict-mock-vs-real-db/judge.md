# bpp-conflict-mock-vs-real-db fixture (tier (a) byte-diff with conflict pair)

## What this fixture asserts

This fixture is **structurally different** from the other 4 tier (a) fixtures:
the transcript carries **two** sessions from two different teammates whose
behaviors directly contradict each other:

- `bpp-mock-yes-01` session (eve@team.com): writes `vi.mock('./db')` in tests
- `bpp-mock-no-01` session (frank@team.com): writes real in-memory sqlite in tests

The BPP mining pipeline must:

1. Mine TWO candidate BPs (one per session/teammate).
2. After Wilson + tier gate, the **conflict detector** (spec §7.1) must link
   the two BPs via `conflict_with` (double-linked: each BP's `conflict_with`
   array contains the other BP's id).

This is the **only fixture in the tier (a) corpus that exercises the
`conflict_with` field**.

Per `docs/superpowers/specs/2026-05-13-best-practice-push-design.md` §8.3:
> 新增 ... 5 个 fixture，分别覆盖 4 类 type + **1 个矛盾对**

This is that one矛盾对.

## Inputs

- `transcript.jsonl` — 4 entries (2 user + 2 assistant), one user/assistant pair
  per session (two distinct `sessionId`).
- `expected-candidate-bp.json` — **array of 2** candidates (no conflict_with yet
  — that's a post-mining step).
- `expected-final-bp.json` — **array of 2** final BPs with double-linked
  `conflict_with` and Wilson-gated confidence.

## Wilson LB sanity

- Eve's BP: post-rollup `{sessions_observed: 8, pattern_count: 16, reject_count: 0}` →
  Wilson LB(16, 0, z=1.96) ≈ 0.8064 → `canonical`.
- Frank's BP: `{sessions_observed: 6, pattern_count: 15, reject_count: 0}` →
  Wilson LB(15, 0, z=1.96) ≈ 0.7961 → `canonical`.

Both BPs cross the canonical threshold (≥0.75) independently — they are
**both shippable**; the conflict resolution is left to the receiving teammates
per spec §7.2 (decision #8 "两条并列").

## Pass criteria

The test must assert:

```ts
const actualCandidates = mineConflictForTest(transcript);
expect(actualCandidates).toEqual(expectedCandidate);  // array of 2

const finals = actualCandidates.map((c, i) => gate(c, accumulatedForBp(i)));
const linkedFinals = linkConflicts(finals, [['mock-db', 'not-mock-db']]);
expect(linkedFinals).toEqual(expectedFinal);  // array of 2 with conflict_with set
```

**Critically**: `linkedFinals[0].conflict_with` must equal `[linkedFinals[1].id]`
and vice versa. This is the explicit `conflict_with` field check called out in
the Gap 5 spec.

## How to run

```bash
npx vitest run packages/digital-twin/src/bpp/__tests__/fixture-replay-all.test.ts
```

## Caveats

- The **conflict-detector** in production runs an LLM (spec §7.1: "LLM 二分类
  '矛盾 / 不矛盾'"). In this fixture we **hardcode the conflict pair** because
  the LLM stage is non-deterministic and tier (a) must be byte-deterministic.
  The byte-diff test asserts: given a hardcoded conflict link, the `conflict_with`
  fields are double-written correctly. The LLM-vs-LLM ambiguity is delegated to
  tier (c) (`scripts/bpp-llm-judge.ts`).
