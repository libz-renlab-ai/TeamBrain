```
   __
 <(o.o)___    judge harness: soft-force upgrade
  ( <_< /     issue #225 — third-party LLM judge reads raw JSON only
   `---'
```

# Judge Harness: Soft-Force Upgrade (issue #225)

**契约**：MAIN agent dispatches each check below either as a subagent or via `claudefast -p`. Every check writes a `judge.json` row of the form
```json
{
  "id": "J1",
  "exit_code": 0,
  "metrics": { ... },
  "evidence_dir": "evidence/J1/",
  "stdout_path": "evidence/J1/stdout.txt"
}
```
into `.judge/<run_id>/judge.json`. After all rows are written, an independent LLM judge reads only `judge.json` + the `evidence/` files (NEVER source code, NEVER this plan) and emits the final PASS/FAIL verdict per check. The implementation agent **MUST NOT** judge its own work.

## Checks

### J1 — typecheck
```bash
cd .codex/worktrees/issue-225
pnpm typecheck > evidence/J1/stdout.txt 2>&1
echo "exit_code=$?" >> evidence/J1/stdout.txt
```
- PASS: `exit_code=0`

### J2 — core pure unit tests
```bash
pnpm --filter @teamagent/core test \
  -- --run src/update/__tests__/changelog-parser.test.ts \
              src/update/__tests__/snooze.test.ts \
              src/update/__tests__/prompt-text.test.ts \
              src/update/__tests__/update-state.test.ts \
  > evidence/J2/stdout.txt 2>&1
```
- PASS: vitest exit 0; no `FAIL` lines

### J3 — cli unit tests for new surfaces
```bash
pnpm --filter @teamagent/cli test \
  -- --run src/__tests__/session-start-update.test.ts \
              src/__tests__/whatsnew.test.ts \
              src/__tests__/update-snooze.test.ts \
              src/__tests__/init-whatsnew-tail.test.ts \
  > evidence/J3/stdout.txt 2>&1
```
- PASS: vitest exit 0; all describe blocks green

### J4 — snooze backoff progression
- vitest assertion inside `snooze.test.ts`: with `now=T0`, calling `nextSnooze(0,T0).snooze_until_ts === T0+24h`, `nextSnooze(1,T0).snooze_until_ts === T0+48h`, `nextSnooze(2,T0).snooze_until_ts === T0+7d`, `nextSnooze(99,T0).snooze_until_ts === T0+7d` (cap)
- Evidence: vitest stdout from J2

### J5 — never_prompt suppression
- vitest assertion: `shouldPromptUpgrade({...state, never_prompt:true}, now, env) === false` regardless of pending update
- Also: `env.TEAMAGENT_NEVER_PROMPT="1"` short-circuits to false
- Evidence: vitest stdout from J2

### J6 — backwards-compat parse
- vitest assertion in `update-state.test.ts`: `parseUpdateState('{"last_check_ts":1}')` returns full default state with `snooze_until_ts=0, snooze_level=0, never_prompt=false`; no throw
- Evidence: vitest stdout from J2

### J7 — CHANGELOG parser range
- vitest fixture in `changelog-parser.test.ts`: synthetic CHANGELOG with versions `[0.10.1, 0.10.2, 0.10.5]`, calling `parseChangelog(content, "0.10.1", "0.10.5")` returns ONLY `[0.10.2, 0.10.5]` entries
- Also unreleased-only edge case returns `[]`
- Evidence: vitest stdout from J2

### J8 — whatsnew --help
```bash
node packages/cli/dist/bin.js whatsnew --help > evidence/J8/stdout.txt 2>&1
echo "exit_code=$?" >> evidence/J8/stdout.txt
```
- PASS: `exit_code=0` AND stdout contains "Usage:" + "whatsnew"

## Run
```bash
RUN_ID=$(date +%Y%m%dT%H%M%S)
mkdir -p .judge/$RUN_ID/evidence/J{1,2,3,4,5,6,7,8}
# (run each check, append a row to judge.json)
# Then dispatch independent LLM judge with prompt:
# "Read .judge/$RUN_ID/judge.json and emit PASS/FAIL per id."
```
