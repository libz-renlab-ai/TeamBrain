# Judge: fixture replay

## RUN

Run fixed tools from the repository root:

```bash
pnpm vitest run packages/cli/src/__tests__/fixture-replay.test.ts packages/cli/src/__tests__/verify.test.ts
pnpm teamagent fixture replay --tier=a --scenario moment-dayjs --json
```

## DUMP

Write evidence to `.judge/fixture-replay/<run_id>/`:

- `vitest.stdout.txt`
- `vitest.stderr.txt`
- `replay.stdout.json`
- `replay.stderr.txt`
- `judge.json`

`judge.json` shape:

```json
{
  "exit_code": 0,
  "metrics": {
    "vitest_passed": true,
    "replay_ok": true,
    "scenario_id": "moment-dayjs",
    "expected_behavior": "block",
    "actual_behavior": "block"
  },
  "evidence_dir": ".judge/fixture-replay/<run_id>",
  "stdout_path": ".judge/fixture-replay/<run_id>/replay.stdout.json"
}
```

## READ

LLM judge reads only `judge.json` plus the raw stdout/stderr files. PASS iff:

- vitest exits 0
- replay JSON parses
- `ok === true`
- one scenario exists and its `id === "moment-dayjs"`
- `correctionDetected`, `ruleGenerated`, and `interceptMatched` are all true
- `expectedBehavior === "block"` and `actualBehavior === "block"`

Any parse error, missing field, or nonzero exit is FAIL.
