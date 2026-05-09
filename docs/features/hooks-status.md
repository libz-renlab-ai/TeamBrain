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
| 🟢 Active Node bundles installed by `teamagent init` (project-level) | 6 | `bin-{pre-tool-use, post-tool-use, user-prompt-submit, stop, session-end, pre-compact}.cjs` |
| 🟢 Active Node bundles installed by `teamagent init` (user-level additive) | 2 | `bin-session-start.cjs`, `bin-digital-twin-tap.cjs` (both write to `~/.claude/settings.json` only) |
| 🟢 Active statusLine script (single-slot, chain-wraps user cmd) | 1 | `dist/teamagent-statusline.cjs` |
| 🟢 Active `.sh` scripts wired by committed `.claude/settings.json` | 1 | `self-report-fused.sh` (12-field self-report enforcement; SIGTERM-aware bash wrapper) |
| 🟡 Deprecated standalone command (still functional shim) | 1 | `teamagent install-user-hook` — body now delegates to `applyUserLevelChannelOps`; emits deprecation warning. Removed in v1.0. |
| ⚪ Updater (not a hook) | 1 | `bin-updater.ts` (CLI self-update; intentionally excluded from hook installation) |

**Total**: 11 production assets. Coverage by `teamagent init`: **10/11 ≈ 91%** — only `bin-updater.ts` is excluded by design. After v0.11.0 (2026-05-09 cleanup PR), `digital-twin-tap.cjs` is the SOLE digital-twin path on every machine: TeamBrain itself receives one tap (via the user-level `.cjs`) and other projects also receive one tap (also via the user-level `.cjs`). The previous in-TeamBrain double-tap risk — where `digital-twin-tap.sh` from committed settings AND `bin-digital-twin-tap.cjs` from user-level both fired against `tapSession`'s idempotent (cwd, session_id) dedup — is eliminated entirely, not merely deduped.

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
**Three concurrent handlers** post-v0.11.0 (committed `.claude/settings.json` + `settings.local.json` + user-level `~/.claude/settings.json` all contribute):

| Handler | Source | Wired by |
|---------|--------|----------|
| `bin-stop.cjs` | TS source | `teamagent init` → `settings.local.json` (project) + user-level `~/.claude/settings.json` |
| `self-report-fused.sh` | shell wrapper | committed `.claude/settings.json` |
| `bin-digital-twin-tap.cjs` | TS source | `teamagent init` → user-level `~/.claude/settings.json` only |

**Jobs (in order)**:
- `bin-stop.cjs`: learning pipeline `analyze → calibrate → compile`. Sync (legacy) or async detached mode (recommended) — see source comment.
- `self-report-fused.sh`: enforce the 12-field `<self-report>` block; block if missing or any field is `true`.
- `bin-digital-twin-tap.cjs`: forward `(cwd, session_id)` to `tapSession()` of `@teamagent/digital-twin`. v0.11.0 dropped the `digital-twin-tap.sh` bash wrapper from committed `.claude/settings.json` — the `.cjs` is now the only digital-twin path and is installed user-level only by `teamagent init`. `tapSession()` is still idempotent by `(cwd, session_id)` for safety.

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

After v0.11.0 only one `.sh` wrapper remains: `self-report-fused.sh`. It stays because the 12-field self-report block enforcement is a project-level discipline that must be available the moment a fresh TeamBrain clone is opened — before any `teamagent init` has had a chance to register the `.cjs` direct path. The bash wrapper:

1. Is tracked by `.claude/settings.json` (committed) so a fresh clone gets the enforcement immediately, no `teamagent init` required.
2. Handles SIGTERM forwarding so `node` children aren't reparented to `launchd`/`init` when Claude Code times out the hook.
3. Cross-platform path resolution (looks up its target in dev tree / pnpm hoisted / global install).

The `.cjs` files installed to `settings.local.json` (project) and `~/.claude/settings.json` (user) by `teamagent init` are the **direct path** — faster (no bash spawn), present after init runs. v0.11.0 collapsed the digital-twin tap from a bash-wrapper-plus-cjs pair down to the cjs alone (eliminates the in-TeamBrain double-tap risk that PR #232 § 8 tracked).

## Archived scripts (2026-05-09)

These shell scripts were removed in this PR and are tracked in git history:
- `.claude/hooks/laziness-self-report.sh` — superseded by `self-report-fused.sh` (12-field replaces 6-field). Bug B-092 (jq-on-Windows) becomes obsolete.
- `.claude/hooks/teamagent-stop.sh` — old B-103 shim; `bin-stop.cjs` now installed directly by `teamagent init`.

To restore: `git show <pre-archive-sha>:.claude/hooks/<filename>`.

## B+C scope — completed 2026-05-09

The five gaps listed in the archive PR's "out of scope" section were closed in a follow-up PR (see `docs/plans/2026-05-09-install-hook-bc-scope/plan.md`):
- ✅ Wired `bin-session-end.cjs` into `installHook()` channelOps (project + user level).
- ✅ Wired `bin-pre-compact.cjs` into `installHook()` channelOps (project + user level).
- ✅ Wired `bin-digital-twin-tap.cjs` as a second Stop entry — user-level only, to avoid double-tap with the committed `.sh` wrapper.
- ✅ Folded `teamagent install-user-hook`'s SessionStart logic into `installHook()`'s user-level branch; standalone command emits a deprecation warning but remains functional for ≥ 1 major version.
- ✅ Added `auditOrphanShellHooks(cwd)`; `teamagent init` now scans `.claude/hooks/*.sh` and warns on unreferenced files.

## Future work

Two of the three follow-ups originally captured in PR #232 § 8 landed in v0.11.0
(2026-05-09 cleanup PR — `docs/plans/2026-05-09-install-hook-cleanup-v0.11/`):

- ✅ **v0.11.0** — refactor project-level `installHook()` to share the
  `applyChannelOps` loop with user level (inline blocks gone).
- ✅ **v0.11.0** — drop `digital-twin-tap.sh` wrapper + its reference from
  committed `.claude/settings.json`. `bin-digital-twin-tap.cjs` is now the
  sole digital-twin Stop path on every machine.
- ⏳ **v1.0** — delete the deprecated `teamagent install-user-hook` command.
  Currently a soft-retire shim delegating to `applyUserLevelChannelOps`;
  removed when `postinstall.mjs:365` is also migrated to call `init` /
  `install-hook` directly.
