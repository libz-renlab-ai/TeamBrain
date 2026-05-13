```
┌─────────────────────────────────────────────────────────────┐
│ Report — issue #308 FIXEDFLOW execution                       │
│                                                                │
│  research → plan → implement → /review → PR → merge          │
│                                                                │
│  Status: ✅ MERGED via PR #435 at 2026-05-13T07:17:26Z          │
└─────────────────────────────────────────────────────────────┘
```

# Report — issue #308 FIXEDFLOW execution

## Outcome

- **Issue**: #308 "1.满足leader微管理的需求"
- **PR**: [#435](https://github.com/libz-renlab-ai/TeamBrain/pull/435)
- **Squash commit**: `a10529e0`
- **Merged**: 2026-05-13T07:17:26Z
- **Branch**: `worktree-issue-308` (deleted on merge)
- **Driver session**: `bg-b47033b8` (Claude Code background job)
- **Worktree**: `.claude/worktrees/issue-308/` (removed in cleanup step)

## Actual chain executed

Per AGENTS.md Boris workflow: `research → plan → annotate → implement → report`.

1. **research.md** — mapped existing wiring: SessionStart + UserPromptSubmit already emit cc-status; Stop + SessionEnd don't; `CcStatusSnapshot` lacks `raw_prompt`; no presence state machine; no presence CLI. Identified existing `realtime-emit.ts` (PR #401/#404) as the transport seam to extend.
2. **plan.md** — 4-section HOWTO-PLAN-PR plan with 7 atomic-commit implementation order.
3. **judge.md** — 5-probe third-party judge harness playbook (state machine boundary, single-POST invariant, CLI smoke, schema additive round-trip, privacy default).
4. **Implementation** — 7 planned commits + 8 fix-up commits (see iteration count below).
5. **`/review` pre-landing pass** — adversarial subagent dispatched, 15 findings, fixed all P1s + high-impact P2s.
6. **PR #435 opened**, CI run, rebased twice for `BEHIND` state, squash-merged.

## Iteration count

`.fixedflow/iter-${N}.json` was not maintained because /review was run in-line rather than as an iterating loop — the adversarial subagent surfaced findings in one pass and they were addressed in a single fix-batch before opening the PR.

- 15 atomic commits before push
- 1 adversarial review pass (Claude subagent only; Codex not configured in this background session)
- 2 rebases for `BEHIND` state during merge (origin/main moved twice during CI execution)
- 0 CI failures

## What shipped

| Layer | File | Change |
| --- | --- | --- |
| Schema | `packages/digital-twin/src/cc-status/types.ts` | `raw_prompt?: string` (additive) |
| Schema | `packages/digital-twin/src/cc-status/store.ts` | `raw_prompt` in `SNAPSHOT_KEYS` + `STRING_KEYS` + 64 KiB `STRING_FIELD_CAP` |
| Transport | `packages/cli/src/realtime-emit.ts` | `EmitInput.rawPrompt?` + env opt-in re-check (defense in depth) |
| Hook | `packages/cli/src/bin-user-prompt-submit.ts` | Threads `rawPrompt` to emit when `TEAMAGENT_REALTIME_RAW_PROMPT=1` |
| Hook | `packages/cli/src/bin-stop.ts` | Foreground-only `emitCcStatus({ event: "stop" })` |
| Hook | `packages/cli/src/bin-session-end.ts` | Foreground-only `emitCcStatus({ event: "session_end" })` |
| Core | `packages/core/src/presence/state-machine.ts` | Pure FCIS state machine, 4 states, configurable TTLs |
| Core | `packages/core/src/presence/index.ts` | Module barrel |
| CLI | `packages/cli/src/commands/presence.ts` | `pnpm teamagent presence` subcommand with SSRF guard |
| CLI | `packages/cli/src/bin.ts` | Subcommand registration |
| Tests | `packages/core/src/__tests__/presence-state-machine.test.ts` | 18 tests |
| Tests | `packages/cli/src/__tests__/presence-command.test.ts` | 14 tests |
| Tests | `packages/cli/src/__tests__/bin-stop-emit.test.ts` | 6 tests (regression) |
| Tests | `packages/cli/src/__tests__/realtime-emit.test.ts` | +5 tests |
| Tests | `packages/digital-twin/src/cc-status/__tests__/store.test.ts` | +3 tests |
| Docs | `docs/plans/2026-05-13-issue-308/{plan,research,judge,report}.md` | Boris workflow artifacts |

## Pre-landing /review findings + resolutions

Adversarial subagent surfaced 15 findings:

**P1 (blocking, all fixed):**
1. `presence` CLI hit non-existent `/api/cc-status/latest?user_id=` endpoint. Real route is `/api/cc-status?user=` per `mock-server.ts:448`. Fixed: correct URL + `{sessions: [...]}` parsing with freshest-by-ts selection + URL-shape regression test.
2. `sanitizeCcStatusSnapshot` whitelist dropped `raw_prompt` — `TEAMAGENT_REALTIME_RAW_PROMPT=1` would silently exfiltrate prompt then discard it. Fixed: added to `SNAPSHOT_KEYS` + `STRING_KEYS` + `STRING_FIELD_CAP` (64 KiB) + round-trip tests.
3. `judge.md` referenced non-existent `bin-stop-emit.test.ts` + wrong test titles for probes 4/5. Fixed: created the regression test + synced judge.md to real titles.

**P2 (fixed):**
4. State machine `session_start` fall-through misbehaved when `idleAfterMs > activeTtlMs`. Fixed: always idle past `activeTtl` + regression test.
5. SSRF guard parity missing on `presence` CLI's GET path. Fixed: same loopback-only default + `TEAMAGENT_REALTIME_ALLOW_REMOTE=1` opt-in as `realtime-emit.ts`.
6. `emitCcStatus` accepted `rawPrompt` from any caller without re-checking env opt-in (defense-in-depth gap). Fixed: transport-layer env re-check at `realtime-emit.ts:174`.
7. `realtime-emit.test.ts` env hermeticity bug (vars leaked across test files when original was undefined). Fixed: snapshot/restore pattern from `presence-command.test.ts`.
8. Missing `bin-stop-emit.test.ts` regression for one-Stop-one-POST. Fixed: 6 new tests covering all 4 (env, argv) combinations of `isDetachedPipelineInvocation`.

**P2/P3 deferred** (acknowledged in PR body, not blocking):
- DRY drift between `urlIsLoopback` in `realtime-emit.ts` and `presence.ts` (byte-identical duplicate). Follow-up: extract to shared module.
- Stop emit happens before singleton-lock check → green-light flapping during rapid subagent stops. Design judgment: grill §11 says "Stop = immediate offline" so flapping is intentional; revisit only if leader complaints surface.
- `extractSnapshot` accepts unbounded strings → terminal escape attack via malicious receiver. Mitigated by loopback-only default; secondary defense (cap + sanitize) is follow-up scope.
- Response body has no size limit. Same mitigation; follow-up.
- `urlIsLoopback` rejects `127.0.0.0/8` non-`.1` + IPv4-mapped IPv6. Edge case; follow-up.
- `renderAge(NaN)` returns `"0s ago"` for unparseable ts → cosmetic inconsistency with state machine's "offline" verdict. Follow-up.
- `networkError` echoes raw fetch error to stdout. Low risk; follow-up sanitization.

## Deviations from the grill plan

None substantive. Implementation order matches `plan.md` §1 "Implementation order" verbatim plus one extra commit cluster for /review fix-batches (P1+P2 adversarial-review findings). All grill §2/§3/§11 mandates landed; explicit out-of-scope items (server-side `raw_events` extractor, normalized_event summarizer, #371 daily summary integration, #372 anomaly detection) remained out of scope as planned.

## Test results at merge

- `pnpm vitest run packages/cli/src/__tests__/ packages/core/src/__tests__/ packages/digital-twin/`: **1901 passed, 37 skipped (pre-existing), 0 failed**.
- `pnpm --filter @teamagent/cli --filter @teamagent/digital-twin run typecheck`: clean.
- CI on rebased commit: all 7 required checks pass (ubuntu+windows test matrix + V1-V4 install-verify suite).

## Links

- PR: https://github.com/libz-renlab-ai/TeamBrain/pull/435
- Issue: https://github.com/libz-renlab-ai/TeamBrain/issues/308
- Grill ADR: [docs/adr/0014/308.md](../../adr/0014/308.md)
- Grill source: https://chatgpt.com/s/t_6a03861d49b081918ed2c900f3870c46
- Plan: [plan.md](./plan.md)
- Research: [research.md](./research.md)
- Judge harness: [judge.md](./judge.md)

## Sibling-issue handoffs

Issues that consume the foundation this PR shipped:

- **#371 (daily summary)** — should consume GitHub events as primary source per grill §31; cc-status raw_prompt is supplementary evidence, not primary.
- **#372 (live inspection / anomaly)** — anomaly detection algorithm `ai_prompt_count vs github_progress_events` per grill §8. Consumes cc-status snapshots via this PR's persistence layer.
- **#309 (homepage UI)** — green-light kanban renders the state machine output from this PR.
- **Server-side `raw_events` table extraction + `normalized_event` summarization** — needs its own grill-ready issue. Receiver currently persists the raw `raw_prompt` field on the snapshot row but does not extract it into a separate table; downstream consumers can already read it from the snapshot JSONL.
