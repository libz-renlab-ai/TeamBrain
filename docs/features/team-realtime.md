# Feature #2 v3 — wiring SessionStart + UserPromptSubmit to the boss kanban

This file documents how a real teammate's Claude Code instance shows up on the
boss kanban — the gap Feature #2 v2 (PR #401) left open by shipping the
receiver, the SSE stream, and a synthetic-writer demo, but never wiring any
hook bundle to push real events.

```
SessionStart hook   ─┐
                     ├─► emitCcStatus()  ──►  POST /v1/cc-status
UserPromptSubmit ────┘   (fire-and-forget,    │
                          50ms timeout,       ▼
                          never blocks)   bin-realtime-demo (or
                                          any compatible receiver)
                                              │
                                              ▼
                                          SSE /v1/cc-status/stream
                                              │
                                              ▼
                                          boss kanban (1s poll)
```

## Scope

Two channels only, per `docs/BUSINESS-FEATURES.md` Feature #2 scope:

| Channel              | When it fires                                         |
|----------------------|-------------------------------------------------------|
| `SessionStart`       | Claude Code starts a new session for the teammate.    |
| `UserPromptSubmit`   | Teammate submits a prompt.                            |

`PreToolUse` / `Stop` / `SessionEnd` are intentionally **NOT** wired. The
boss-visibility unit is **the prompt boundary**, not the tool-call boundary.

## Opt-in

Each teammate opts in by exporting the receiver URL in their shell rc file
(or via `teamagent`'s settings):

```bash
# Default: loopback-only. Safe out of the box for `bin-realtime-demo`.
export TEAMAGENT_REALTIME_URL="http://127.0.0.1:9787"
# Optional — bearer for the receiver if it's auth-gated.
export TEAMAGENT_REALTIME_TOKEN="..."
# Optional — log every emit outcome to stderr (debug only).
export TEAMAGENT_REALTIME_DEBUG=1
# Required ONLY when pushing to a non-loopback team receiver (LAN / VPN).
# Without this, any non-loopback URL is rejected — see "Safety defaults" below.
export TEAMAGENT_REALTIME_ALLOW_REMOTE=1
```

Unset `TEAMAGENT_REALTIME_URL` → the hooks emit nothing. There is **no
default endpoint**: a teammate must explicitly opt in for any cc-status to
leave their machine.

## Safety defaults

The emitter applies three guards before it touches the network. They exist
because anyone who can set `TEAMAGENT_REALTIME_URL` (hostile dotfile sync,
supply-chain pnpm script, social engineering) would otherwise exfiltrate
cwd + git email + machine id + bearer token on every hook fire.

| Guard | When it kicks in | Override |
|-------|------------------|----------|
| Kill switch | `TEAMAGENT_DISABLED=1` set | None — the kill switch wins |
| Loopback-only | URL host is not `127.0.0.1` / `localhost` / `::1` | `TEAMAGENT_REALTIME_ALLOW_REMOTE=1` |
| Scheme allowlist | URL scheme is not `http:` / `https:` | None — `file://`, `javascript:` etc. always rejected |
| Token bound to URL | Bearer token only sent to the URL configured here, never anywhere else | n/a (existing behavior) |

Each rejection is silent in production. Set `TEAMAGENT_REALTIME_DEBUG=1` to
see the reason printed to stderr.

## Contract (what the helper guarantees)

The wiring code lives in `packages/cli/src/realtime-emit.ts` and is unit-tested
in `packages/cli/src/__tests__/realtime-emit.test.ts`. It guarantees:

1. **Never throws.** Any exception in identity, snapshot build, or fetch is
   swallowed. The hook critical path is never broken.
2. **Never blocks.** The fetch is fire-and-forget with a 50 ms abort timeout
   (`packages/digital-twin/src/realtime-client.ts`). Tested by passing a fetch
   that never resolves and asserting `emitCcStatus()` returns in under 50 ms.
3. **Never retries.** Drops on timeout / 5xx / network. M5 git-sync remains
   the final-consistency fallback for anything the receiver dropped.
4. **Identity is cached.** `getUserId()` (shells out to
   `git config user.email`) and `getMachineId()` (touches disk) are called
   once per process, not once per hook fire.

## Running the receiver locally (development / dogfood)

The existing `bin-realtime-demo.ts` doubles as a single-host receiver:

```bash
# Terminal 1 — receiver + kanban
pnpm tsx packages/digital-twin/src/bin-realtime-demo.ts
# {"ready":true,"url":"http://127.0.0.1:9787/", ...}

# Terminal 2 — start a Claude Code session against it
export TEAMAGENT_REALTIME_URL="http://127.0.0.1:9787"
claude   # or `claudefast` — every SessionStart + UserPromptSubmit pushes

# Terminal 3 — open the kanban
open -a "Google Chrome" http://127.0.0.1:9787/
```

The demo keeps its synthetic alice/bob/carol writer running so the SSE first
frame is non-empty; real-user cards appear alongside the synthetics and grey
out after 30 s of silence.

## Production receiver

For a team deployment, run `teamagent realtime serve` (TODO — Feature #2 v4)
or build a thin Express/Fastify wrapper around `createSseHandler` +
`appendCcStatusSnapshot` from `@teamagent/digital-twin`. The wire format is
the `CcStatusSnapshot` type at `packages/digital-twin/src/cc-status/types.ts`.

## Privacy

- `display_name` defaults to the user_id's local-part (the part before `@`).
- `cwd` is sent **verbatim** — teammates who don't want their working
  directory leaking off-machine should leave `TEAMAGENT_REALTIME_URL` unset.
- `prompt` and `prompt_excerpt` are **NOT** pushed in v3 — only the fact that
  a prompt fired. Adding a prompt excerpt would require the M5 secret-scanner +
  scope-classifier double-gate (plan v2 §4) and is deferred.

## Visual proof (PR comment)

PR comments attach two screenshots:
1. **Boss kanban (1600×900)** — wide view, 4 real teammates side-by-side with
   the synthetic baseline.
2. **UI/UX close-up (900×720)** — vertical card detail showing session id,
   event channel, cwd, git branch, context %, and model.

Both are hosted on the `proof/feature-2-v3-real-users` orphan branch.
