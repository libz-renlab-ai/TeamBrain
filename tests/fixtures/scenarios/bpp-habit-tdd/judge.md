# bpp-habit-tdd fixture (tier (a) byte-diff)

## What this fixture asserts

Given a Claude Code session transcript exhibiting the "TDD red-first" pattern
(assistant Writes a `*.test.ts` file → runs vitest expecting red via Bash →
Writes the implementation file), the BPP mining pipeline + Wilson + tier gate
must produce a `BestPractice` whose serialized JSON is structurally byte-equal
to the expected snapshot.

This is a **tier (a) harness** per
`docs/superpowers/specs/2026-05-13-best-practice-push-design.md` §8.

Topic = `testing` (vs `ai-collab` for the brainstorm/dispatch fixtures) —
exercises a different `BpTopic` branch.

## Inputs

- `transcript.jsonl` — 8 entries with **two** `Write(*.test.ts) → Bash(vitest run)
  → Write(source)` triples across one session.
- `expected-candidate-bp.json` — `pattern_count = 2`, `sessions_observed = 1`,
  `confidence_tier = "low"`.
- `expected-final-bp.json` — post-rollup BP with `{sessions_observed: 6,
  pattern_count: 15, reject_count: 0}`. Wilson LB ≈ 0.7961 → `canonical`.

## Pattern detector contract

Counts triples where: (1) `Write` to a path matching `*.test.*`; (2) `Bash`
tool_use whose command mentions `vitest`; (3) `Write` to a non-test path that
shares the basename stem with the test file (e.g. `parseDuration.test.ts` →
`parseDuration.ts`). Each complete triple increments `pattern_count` by 1.

## Pass criteria

Identical to `bpp-brainstorm-habit/judge.md` — parsed-JSON equality via
vitest `toEqual`.

## How to run

```bash
npx vitest run packages/digital-twin/src/bpp/__tests__/fixture-replay-all.test.ts
```

## Caveats

- The triple detector is **strict ordering** — the Bash(red) step is mandatory.
  A session that writes the test and immediately the impl without running vitest
  in between will produce `pattern_count = 0` (deliberate: TDD red-first is the
  pattern, not "write test then code").
