```
┌─────────────────────────────────────────────────────────────┐
│ Research notes — issue #308 event-upload bedrock              │
│                                                                │
│  This file is the equivalent of Boris workflow's "annotate"   │
│  stage: what already exists in the repo, not the plan itself. │
└─────────────────────────────────────────────────────────────┘
```

# Research — what already exists for #308

## Source documents

- Grill ADR: [docs/adr/0014/308.md](../../adr/0014/308.md) (saved 2026-05-13 from ChatGPT batch grill).
- Grill source: [chatgpt.com/s/t_6a03861d49b081918ed2c900f3870c46](https://chatgpt.com/s/t_6a03861d49b081918ed2c900f3870c46).
- Cross-cutting batch overview: `docs/adr/0014/batch-2026-05-13-overview.md`, `architecture.md`, `feature-specs.md`.
- Sibling issues mentioned: #371 (daily summary, NOT this issue's data sink), #372 (live inspection / anomaly), #309 (homepage UI), #320 (evidence matrix — orthogonal).

## What's already wired (DO NOT redo)

### SessionStart hook → cc-status emit

`packages/cli/src/bin-session-start.ts:68` imports `emitCcStatus` and calls it after `decideAction(cwd)` in the `runAdvancedHook` handler. Already POSTs to `/v1/cc-status` when `TEAMAGENT_REALTIME_URL` is set.

### UserPromptSubmit hook → cc-status emit

`packages/cli/src/bin-user-prompt-submit.ts:59` imports `emitCcStatus`. Around line 128 calls:

```ts
emitCcStatus({
  event: "user_prompt_submit",
  sessionId,
  cwd,
});
```

`input.prompt` is **already in scope** at the call site (line 118) but **NOT** passed to `emitCcStatus`. This is the seam where grill §3 ("完整存 raw prompt") plugs in.

### Realtime emit module — env-gated, loopback-default

`packages/cli/src/realtime-emit.ts:173-221` ships `emitCcStatus(input)`:

- No-op when `TEAMAGENT_REALTIME_URL` unset.
- No-op when `TEAMAGENT_DISABLED=1`.
- Loopback-only unless `TEAMAGENT_REALTIME_ALLOW_REMOTE=1`.
- 50ms timeout, fire-and-forget, never throws.
- `EmitInput` interface: `event, sessionId?, cwd?, gitBranch?, model?, contextTokens?` — needs `rawPrompt?` extension.

### Receiver schema & store

`packages/digital-twin/src/cc-status/types.ts` defines `CcStatusSnapshot` (issue #350) with optional fields: `display_name, machine_id, cwd, git_branch, model, context_tokens, context_pct, session_health, cost_usd, tokens_5h, tokens_7d, subscription_tier, five_hour_utilization, seven_day_utilization, ..., turn_count, tool_calls_total, files_touched, session_started_at`.

`schema_version: 1`. Adding `raw_prompt?: string` is purely additive — no bump required.

`packages/digital-twin/src/realtime-client.ts:57` — `postCcStatusSnapshot()` POSTs to `${baseUrl}/v1/cc-status`. Returns `PostCcStatusOutcome` (`ok | timeout | network | http-error | bad-response`). Already absorbs `raw_prompt` because JSON.stringify takes the whole object.

`packages/digital-twin/src/mock-server.ts` — has `/v1/cc-status` route handler. Stores snapshots per `safeUserId(user_id)` / `dateStamp()`. Reads back via `readLatestAllUsers`. Used by `pnpm teamagent digital-twin demo`.

### Existing test files

- `packages/cli/src/__tests__/realtime-emit.test.ts` — covers env-gating, snapshot build, loopback enforcement.
- `packages/digital-twin/src/cc-status/__tests__/store.test.ts` (likely exists) — covers per-user/per-date storage.

### Port pattern conventions

`packages/ports/src/` files: `attribution-bus.ts`, `knowledge-store.ts`, `calibrator-v2.ts`, `install-state-store.ts`, etc. Contract tests at `packages/ports/src/__tests__/*-contract.ts` named `run<PortName>Contract`. Per CLAUDE.md M0 rule: "新增 Port 必须先写契约测试再写实现".

**Decision**: presence state machine is a pure FCIS function, not a Port. No external IO. No contract test scaffold needed. Lives in `packages/core/src/presence/`, tested with normal vitest unit tests.

## What's missing (this PR delivers)

| Gap | Where | Severity |
| --- | --- | --- |
| Stop hook doesn't emit | `packages/cli/src/bin-stop.ts` main handler | high — green light never goes offline |
| SessionEnd hook doesn't emit | `packages/cli/src/bin-session-end.ts` | medium — duplicate of Stop in practice |
| `raw_prompt` field absent | `packages/digital-twin/src/cc-status/types.ts` + `realtime-emit.ts` `EmitInput` | high — grill §3 mandate |
| UserPromptSubmit doesn't pass prompt | `packages/cli/src/bin-user-prompt-submit.ts` ~L128 | high — `input.prompt` in scope, just not threaded |
| No presence state machine | `packages/core/src/presence/` (new dir) | high — leader can't render 4-state |
| No `presence` CLI | `packages/cli/src/commands/` | medium — verification + dogfood UX |

## Out of scope (sibling issues will pick up)

- **Server-side `raw_events` table** — `docs/adr/0014/batch-2026-05-13-architecture.md` documents the receiver-side schema. Not in this repo's runtime. Follow-up PR/issue.
- **`normalized_events` extractor** (summary/tags/work_item hints) — downstream pipeline, grill §2 explicitly defers.
- **#371 daily summary integration** — grill §31 verdict mandates "#308 不作为 #371 日报的主数据源".
- **#372 anomaly detection / live inspection** — grill §22: #320 evidence layer is orthogonal to #308 product surface.
- **Statusline local presence rendering** — grill §0/§24 (cross-cutting batch overview) defers UI-side rendering to a different PR track (#306-related).

## Risk register

1. **Privacy of raw_prompt** — defaulting opt-in via `TEAMAGENT_REALTIME_RAW_PROMPT=1` mitigates. Loopback-only default already in place (PR #404 adversarial-review hardening).
2. **50ms emit timeout vs large raw_prompt** — JSON serialization is cheap; the timeout is on receiver response, not payload size. Acceptable. If a single prompt exceeds ~1MB someone should call us out and we'd add a `raw_prompt_size_limit` env.
3. **Stop hook detached-spawn pattern** — bin-stop.ts uses `runAdvancedHook` with detached transcript-tap spawn. emitCcStatus is synchronous build + fire-and-forget POST; must be called BEFORE the detached spawn rationalizes its lifetime. Wire emit in the main `runAdvancedHook` handler closure, not inside the spawned child.
4. **TypeScript additive break** — adding an optional field is backward-compatible at type level; receiver code that constructs snapshots elsewhere (mock-server tests) doesn't need updates.
5. **Test scaffold for bin-stop emit** — bin-stop.ts is 1131 lines and heavily mocked already. We'll add a focused `bin-stop-emit.test.ts` that injects a mock fetch + asserts a single POST.

## File-by-file change scope (preview)

| File | Change |
| --- | --- |
| `packages/digital-twin/src/cc-status/types.ts` | Add `raw_prompt?: string` |
| `packages/cli/src/realtime-emit.ts` | Add `rawPrompt?: string` to `EmitInput`, thread to snapshot |
| `packages/cli/src/bin-user-prompt-submit.ts` | When `TEAMAGENT_REALTIME_RAW_PROMPT=1`, pass `rawPrompt: input.prompt` |
| `packages/cli/src/bin-stop.ts` | Call `emitCcStatus({ event: "stop", sessionId, cwd })` in handler |
| `packages/cli/src/bin-session-end.ts` | Call `emitCcStatus({ event: "session_end", sessionId, cwd })` |
| `packages/core/src/presence/state-machine.ts` | NEW — pure FCIS state machine |
| `packages/core/src/presence/index.ts` | NEW — module barrel |
| `packages/core/src/index.ts` | Re-export presence module |
| `packages/core/src/__tests__/presence-state-machine.test.ts` | NEW — 4-state boundary tests |
| `packages/cli/src/commands/presence.ts` | NEW — CLI subcommand |
| `packages/cli/src/teamagent.ts` (or registration entry point) | Register `presence` subcommand |
| `packages/cli/src/__tests__/realtime-emit.test.ts` | Extend with rawPrompt thread test |
| `packages/cli/src/__tests__/bin-stop-emit.test.ts` | NEW — single-POST assertion |
| `packages/cli/src/__tests__/presence-command.test.ts` | NEW — CLI smoke test |

## Constraints from CLAUDE.md / AGENTS.md to honor

- **FCIS**: `packages/core/` may NOT import `node:fs` / `node:child_process` — state-machine.ts is a pure function over `(input, now, config)`.
- **Atomic commits**: per `docs/COMMIT-FLOW.md` anchor — one concept per commit, `feat(issue-308):` prefix.
- **No follow-up issues on /review fail**: `docs/PR-PLAN.md` — fix in same branch.
- **No `--draft` PR**: project rule.
- **Squash-only merge**: user memory feedback rule.
- **Verification artifacts**: per `docs/feature-verification.md` — `pnpm test` + `pnpm typecheck` + `/review` PASS + VISUAL-PROOF-PR HTML (if applicable; this PR is CLI-only so a hosted CLI-output transcript HTML suffices).
