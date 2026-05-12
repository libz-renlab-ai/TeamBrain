# Avoidance fixture — `avoidance-no-force-push-to-main`

Scenario for issue #332 (m5 rule propagation testing, L4 end-to-end behavior).

## Layout

- `rule.json` — TeamRuleFile-shaped rule object that A's m5-share would produce
  (author=alice, scope=team, content describes the forbidden behavior).
- `prompts/prompts.json` — 10 trigger paraphrases (each should fire the rule on
  B's matcher after sync) + 5 negative prompts (must NOT fire).

## Used by

- `packages/adapters/src/m5/__tests__/m5-propagation-avoidance.test.ts`
  verifies file-level A→B propagation (slice 3): A writes via FsTeamRuleStore,
  fs-copy bridges to B, B reads back the same rule. Matcher firing on the
  10 trigger prompts is deferred to slice 4 (hot-path verification).
- Future slices: ablation runner (slice 5) uses the prompt set for rule-ON
  vs rule-OFF paired t-test; m5-replay command (slice 6) uses the scenario
  layout as input for byte-diff replay.
