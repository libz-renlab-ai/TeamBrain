# Learning fixture — `learning-prefer-pnpm`

Scenario for issue #332 (m5 rule propagation testing, L4 end-to-end behavior).

**Learning** rules accumulate `hit_count` over time — they aren't enforced
or injected so much as observed: every time the matcher sees a context that
triggers the rule, hit_count + last_hit_at update and the rule's tier may
get promoted by the scorer. The propagation test asserts the rule's `hit_count`
column moves from 0 (rule-OFF baseline) to N (rule-ON, fully propagated).

## Layout

- `rule.json` — TeamRuleFile recommending `pnpm install` / `pnpm vitest run`
  over npm / yarn / npx in the TeamBrain monorepo (author=alice, scope=team,
  confidence=0.75).
- `prompts/prompts.json` — 10 trigger paraphrases featuring npm / yarn / npx
  usage that should bump B's `hit_count` after propagation + matcher pass.

## Used by

- `packages/adapters/src/m5/__tests__/m5-propagation-learning.test.ts` —
  file-level A→B propagation (this slice).
- Slice 5 ablation runner — KB hit_count delta as the observable.
- Slice 6 m5-replay — byte-diff scenario input.
