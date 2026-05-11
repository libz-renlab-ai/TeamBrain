# Fixture replay

Status: VERIFIED

`teamagent fixture replay --tier=a` runs the deterministic offline scenario
fixture harness. It reuses the existing TeamAgent three-phase verifier:

1. correction detection from a recorded or synthetic session
2. rule extraction into an isolated in-memory store
3. PreToolUse-style matching against a future tool call

The first business-facing fixture is `moment-dayjs`: an old Claude Code instance
tries `npm install moment`, the user corrects it to `dayjs`, and replay verifies
that the next `npm install moment` is blocked.

## Scope

Implemented now:

- `teamagent fixture replay --tier=a`
- `--scenario <id>` filtering (`--slug <id>` alias for ADR-0010 wording)
- `--json` machine output
- `moment-dayjs` scenario in `fixtures/scenarios/`

Not implemented here:

- ADR-0010 immutable raw transcript corpus under `tests/fixtures/scenarios/`
- ADR-0010 tier (b) DB-state replay
- ADR-0010 tier (c) LLM judge / `--live-capture`

Those remain separate ADR-0010/0012 work. This command is the low-level adapter
that makes the existing scenario runner addressable from CLI and CI.

## Verify

```bash
pnpm vitest run packages/cli/src/__tests__/fixture-replay.test.ts packages/cli/src/__tests__/verify.test.ts
pnpm teamagent fixture replay --tier=a --scenario moment-dayjs --json
```

Expected JSON anchors:

- `ok: true`
- `id: "moment-dayjs"`
- `phases.correctionDetected: true`
- `phases.ruleGenerated: true`
- `phases.interceptMatched: true`
- `phases.expectedBehavior: "block"`
- `phases.actualBehavior: "block"`
