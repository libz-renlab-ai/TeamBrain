# bpp-context-atomic-commits fixture (tier (a) byte-diff)

## What this fixture asserts

Given a Claude Code session transcript exhibiting the "atomic commit after every
edit" pattern (each `Write`/`Edit` tool_use is immediately followed by a
`Bash(git add <file> && git commit ...)` tool_use covering just that file), the
BPP mining pipeline + Wilson + tier gate must produce a `BestPractice` whose
serialized JSON is structurally byte-equal to the expected snapshot.

This is a **tier (a) harness** per
`docs/superpowers/specs/2026-05-13-best-practice-push-design.md` §8.

Type = `context-mgmt`, topic = `git-flow` — exercises both a new `BpType` and
`BpTopic` branch.

## Inputs

- `transcript.jsonl` — 4 assistant turns (2 Edit + 2 Bash commits).
- `expected-candidate-bp.json` — `pattern_count = 2`, `sessions_observed = 1`,
  `confidence_tier = "low"`.
- `expected-final-bp.json` — post-rollup BP with `{sessions_observed: 7,
  pattern_count: 15, reject_count: 0}` → Wilson LB ≈ 0.7961 → `canonical`.

## Pattern detector contract

Counts pairs where: (1) `Write` or `Edit` tool_use modifying file `X`; (2) the
immediately-following assistant tool_use is `Bash` whose command contains both
`git commit` and the basename of `X` (e.g. `git add src/a.ts && git commit -m
'...'` after `Edit(src/a.ts)`). Each such pair increments `pattern_count` by 1.

## Pass criteria

Identical to `bpp-brainstorm-habit/judge.md` — vitest `toEqual` on parsed JSON.

## How to run

```bash
npx vitest run packages/digital-twin/src/bpp/__tests__/fixture-replay-all.test.ts
```

## Caveats

- The detector is **basename-aware**, not regex-only. If the next Bash runs
  `git add -A && git commit`, it does NOT count (lacks file scoping —
  contradicts the "atomic per-file" practice).
- Tied to CLAUDE.md §开发节奏 "小 commit" rule + user-level
  `atomic-commits-on-edit.md` memory.
