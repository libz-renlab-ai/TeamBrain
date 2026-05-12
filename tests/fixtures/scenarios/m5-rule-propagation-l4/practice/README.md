# Practice fixture — `practice-force-with-lease`

Scenario for issue #332 (m5 rule propagation testing, L4 end-to-end behavior).

Where avoidance rules block a wrong action via PreToolUse, **practice** rules
inject a recommended approach through `UserPromptSubmit` context — they guide
the model toward the better tool call rather than rejecting it after the fact.

## Layout

- `rule.json` — TeamRuleFile recommending `git push --force-with-lease` on
  feature branches (author=alice, scope=team, confidence=0.85).
- `prompts/prompts.json` — 30 trigger paraphrases describing "force push my
  feature branch" intents that should inject the rule into B's session.

The N=30 size matches the grill plan's "practice rules have d ≈ 0.5-1.0
effect size; need N=30 for 80% statistical power at p≤0.01 in the ablation
runner (slice 5)."

## Used by

- `packages/adapters/src/m5/__tests__/m5-propagation-practice.test.ts` —
  file-level A→B propagation (this slice).
- Slice 5 ablation runner — paired t-test on prompt set.
- Slice 6 m5-replay — byte-diff scenario input.
