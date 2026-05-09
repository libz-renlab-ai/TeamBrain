```
        __                                               
      <(o )___       Project-level Hook Status (canonical)
       ( ._> /                                            
        `---'    Last updated: 2026-05-09                 

  Session lifecycle ──► every hook fires here:

    SessionStart  ─►  UserPromptSubmit  ─►  PreToolUse  ─►  [tool runs]
                                                                │
                                                                ▼
                                                         PostToolUse
                                                                │
                                                                ▼
        ┌─────────────────────────  Stop  ──────────────────────┤
        │                             │                         │
   bin-stop.cjs            digital-twin-tap.sh           self-report-fused.sh
   (analyze→calibrate      (taps cwd+session_id          (12-field self-report
    →compile pipeline)      to digital-twin module)       enforcement)
        │                             │                         │
        └─────────────────────────────┴─────────────────────────┘
                                      │
                                      ▼
                                  PreCompact  ─►  SessionEnd
```

# Project-level Hook Status

This is the **single source of truth** for which hooks the TeamBrain repo ships, what each one does, where it gets installed, and which ones are currently dormant.

For the Stop-hook detail (12-field self-report contract), see [`docs/STOP-HOOKS.md`](../STOP-HOOKS.md).
For the multi-tool channel design, see [`docs/features/multi-tool.md`](./multi-tool.md).

## TL;DR

| Asset class | Count | Detail |
|-------------|-------|--------|
| 🟢 Active Node bundles installed by `teamagent init` | 4 | `bin-{pre-tool-use, post-tool-use, user-prompt-submit, stop}.cjs` |
| 🟢 Active statusLine script (single-slot, chain-wraps user cmd) | 1 | `dist/teamagent-statusline.cjs` |
| 🟢 Active `.sh` scripts wired by committed `.claude/settings.json` | 2 | `self-report-fused.sh`, `digital-twin-tap.sh` |
| 🟡 SessionStart bundle installed only by separate command | 1 | `teamagent install-user-hook` writes `bin-session-start.cjs` to `~/.claude/settings.json` |
| 🟠 Built but not yet wired by any installer | 3 | `bin-{session-end, pre-compact, digital-twin-tap}.ts` (sources exist; not in `installHook` channelOps) |
| ⚪ Updater (not a hook) | 1 | `bin-updater.ts` |

**Total**: 12 production assets. Coverage by `teamagent init`: 5/12 ≈ 42% (the gap is tracked as a separate B+C scope PR — see "Out of scope" below).

## Channel-by-channel

### 1. SessionStart  
**Fires when**: a Claude Code conversation starts (cold open or new session).  
**Active path**: `bin-session-start.cjs` registered to **user-level** `~/.claude/settings.json` by `teamagent install-user-hook` (separate command — NOT installed by `teamagent init`).  
**Job**: detect missing `<cwd>/.teamagent/knowledge.db` and auto-init the project.  
**Deliberately uses `escape.manualResources = true`** so `DualLayerStore` doesn't pre-create the sqlite file before the existence check.

### 2. UserPromptSubmit  
**Fires when**: user hits Enter on a prompt.  
**Active path**: `bin-user-prompt-submit.cjs` registered to project `.claude/settings.local.json` (and viral-installed to `~/.claude/settings.json`) by `teamagent init`.  
**Job**: scan user prompt against `user-input` rules; run rule semantic retrieval + recording-memory retrieval; write Claude Code injection envelope to stdout.

### 3. PreToolUse  
**Fires when**: Claude is about to call `Bash` / `Write` / `Edit` / `WebFetch`.  
**Active path**: `bin-pre-tool-use.cjs` registered to project `.claude/settings.local.json` (and `~/.claude/settings.json`) by `teamagent init`. Matcher: `Bash|Write|Edit|WebFetch`.  
**Job**: parse the SDK `PreToolUseHookInput`; evaluate `avoidance` rules; allow / warn / block.  
**Fast-allow path** when `tool_name` is missing.

### 4. PostToolUse  
**Fires when**: a tool call returns.  
**Active path**: `bin-post-tool-use.cjs`, same install path as PreToolUse.  
**Job**: write a `hook-post.result` event to `SqliteEventLog`. No business logic — pure observability.

### 5. Stop  
**Fires when**: Claude finishes a turn.  
**Three concurrent handlers** (committed `.claude/settings.json` + `settings.local.json` both contribute):

| Handler | Source | Wired by |
|---------|--------|----------|
| `bin-stop.cjs` | TS source | `teamagent init` → `settings.local.json` |
| `self-report-fused.sh` | shell wrapper | committed `.claude/settings.json` |
| `digital-twin-tap.sh` (wraps `bin-digital-twin-tap` logic) | shell + node | committed `.claude/settings.json` |

**Jobs (in order)**:
- `bin-stop.cjs`: learning pipeline `analyze → calibrate → compile`. Sync (legacy) or async detached mode (recommended) — see source comment.
- `self-report-fused.sh`: enforce the 12-field `<self-report>` block; block if missing or any field is `true`.
- `digital-twin-tap.sh`: forward `(cwd, session_id)` to `tapSession()` of `@teamagent/digital-twin`. Includes SIGTERM forwarding so the hook timeout doesn't reparent node to launchd.

### 6. PreCompact  
**Fires when**: Claude Code is about to compact the transcript.  
**Active path**: ❌ `bin-pre-compact.ts` source exists; **no installer wires it yet**.  
**Job (when wired)**: full rescan before compaction so learnings from soon-to-be-summarized turns enter the knowledge base.

### 7. SessionEnd  
**Fires when**: `/clear`, logout, Ctrl+C at prompt, window close.  
**Active path**: ❌ `bin-session-end.ts` source exists; **no installer wires it yet**.  
**Job (when wired)**: detached child re-execs the same bin with `TEAMAGENT_SESSION_END_PIPELINE=1` for full rescan + cursor reset. Foreground returns immediately so UI close is never blocked.

### 8. SubagentStop / Notification  
**Status**: no source bundles exist; not used by TeamBrain.

## Status-line slot (not a hook, but same install pipe)

Single-slot `statusLine.command` registered by `installHook()` into `.claude/settings.local.json`. Chain-wraps any user-pre-existing statusLine via `bash -c '<user>; echo; <teamagent>'` and stores the original in `_teamagentOriginalCommand` for clean uninstall.

## Why `.sh` and `.cjs` co-exist

`.sh` files in `.claude/hooks/` are **wrappers**, not duplicates. They:
1. Are tracked by `.claude/settings.json` (committed) so a fresh clone gets the hooks immediately, no `teamagent init` required.
2. Handle SIGTERM forwarding so `node` children aren't reparented to `launchd`/`init` when Claude Code times out the hook.
3. Cross-platform path resolution (look up `bin-stop.cjs` in dev tree / pnpm hoisted / global install).

The `.cjs` files installed to `settings.local.json` by `teamagent init` are the **direct path** — faster (no bash spawn), but only present after init runs.

## Archived scripts (2026-05-09)

These shell scripts were removed in this PR and are tracked in git history:
- `.claude/hooks/laziness-self-report.sh` — superseded by `self-report-fused.sh` (12-field replaces 6-field). Bug B-092 (jq-on-Windows) becomes obsolete.
- `.claude/hooks/teamagent-stop.sh` — old B-103 shim; `bin-stop.cjs` now installed directly by `teamagent init`.

To restore: `git show <pre-archive-sha>:.claude/hooks/<filename>`.

## Out of scope (next PR — B+C scope)

The following gaps were intentionally not closed in this archive PR:
- Wire `bin-session-end.cjs` / `bin-pre-compact.cjs` / `bin-digital-twin-tap.cjs` into `installHook()` channelOps array (`packages/cli/src/commands/install-hook.ts:654-687`).
- Fold `teamagent install-user-hook`'s SessionStart logic into `installHook()` user-level branch; deprecate the separate command.
- Add an orphan-`.sh` scanner to `installHook()` so future stale shell scripts surface a warning during `teamagent init`.

These are tracked in `docs/plans/2026-05-09-hook-archive-docs/plan.md` § 6.
