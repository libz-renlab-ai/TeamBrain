# bpp-skill-dispatch-parallel fixture (tier (a) byte-diff)

## What this fixture asserts

Given a Claude Code session transcript exhibiting the "dispatch parallel agents
for 2+ independent tasks" pattern (assistant invokes
`superpowers:dispatching-parallel-agents` skill, immediately followed by 2+
parallel `Task` tool_use blocks in a single message), the BPP mining pipeline +
Wilson + tier gate must produce a `BestPractice` whose serialized JSON is
structurally byte-equal to the expected snapshot.

This is a **tier (a) harness** per
`docs/superpowers/specs/2026-05-13-best-practice-push-design.md` §8.

Type = `skill` (vs `bpp-brainstorm-habit` which is type=habit) — exercises a
different `BpType` branch on the same fixture-replay machinery.

## Inputs

- `transcript.jsonl` — 6 entries with **two** `dispatching-parallel-agents → ≥2 Task`
  pattern instances across one session.
- `expected-candidate-bp.json` — raw single-session mining output: `pattern_count = 2`,
  `sessions_observed = 1`, `confidence_tier = "low"`.
- `expected-final-bp.json` — post-rollup BP after accumulating `{sessions_observed: 5,
  pattern_count: 15, reject_count: 0}`. Wilson LB(15,0) ≈ 0.7961 → `canonical`.

## Pattern detector contract

The mining stage counts `Skill(superpowers:dispatching-parallel-agents)` invocations
that are followed (in the same assistant message OR the immediately next assistant
message) by **≥2** `Task` tool_use blocks. Each such cluster increments
`pattern_count` by 1.

## Pass criteria

`toEqual` parsed-JSON equality of `mineForTest(transcript)[0]` vs
`expected-candidate-bp.json`, and `gate(candidate, accumulated)` vs
`expected-final-bp.json`. Same pass-criterion mechanics as
`bpp-brainstorm-habit/judge.md`.

## How to run

```bash
npx vitest run packages/digital-twin/src/bpp/__tests__/fixture-replay-all.test.ts
```

## Caveats

- The miner lives **inline** in `fixture-replay-all.test.ts` until Phase 2 lands
  a real `behavior-miner` capable of multi-pattern detection.
- `pushed_by = bob@team.com` to keep fixtures distinguishable in audit-log greps.
