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

## Master kill switch — `TEAMAGENT_DISABLED=1`

Set in the shell environment, this env disables every TeamAgent hook handler at handler entry, **without** uninstalling. Added in issue #343 PR-1 to support paired TB-ON vs TB-OFF token-cost ablation runs.

| Hook | Behaviour when `TEAMAGENT_DISABLED=1` |
|------|---------------------------------------|
| `bin-session-start.cjs` | Returns minimal envelope; no embedder daemon spawn, no wiki residue cleanup, no schema-migration backup prune, no M5 pipeline, no update banner |
| `bin-user-prompt-submit.cjs` | Returns undefined (no injection); no pending-injection drain, no rule semantic retrieval, no recording-memory retrieval |
| `bin-pre-tool-use.cjs` | Returns `{permissionDecision: "allow"}`; no matcher, retriever, attribution |
| `bin-post-tool-use.cjs` | Returns `{}`; no `hook-post.result` event written to SqliteEventLog |
| `bin-stop.cjs` | Returns; no singleton lock claim, no detached self-spawn, no sync pipeline; covers all three internal paths (detached / async / sync) via one check at handler entry |
| `bin-session-end.cjs` | Returns; no embedder `/shutdown` POST, no full-rescan pipeline (detached), no foreground self-spawn |
| `bin-pre-compact.cjs` | Returns; no detached child re-entry, so no compact-time analyze pipeline runs |
| `bin-digital-twin-tap.cjs` | Returns at top of `main()` before stdin read; no `tapSession()` forward to `@teamagent/digital-twin`. Reads `process.env` directly (no `ctx.env` because this bin bypasses runHook / runAdvancedHook) |

**Activation contract**: opt-in by exact string match — only `TEAMAGENT_DISABLED=1` activates the kill switch. Any other value (including unset, `"0"`, `"true"`, `"yes"`) leaves all hooks fully enabled.

**Not affected**: statusline rendering (separate subprocess, reads `settings.local.json` directly); `pnpm teamagent compile / init / doctor / update` CLI subcommands (only hook *handlers* are gated); auto-update / postinstall warmup. CLI subcommands run normally even when the env is set — `TEAMAGENT_DISABLED` does NOT mean "TB does nothing at all", it means "TB hooks add zero work to a Claude Code conversation".

**ADR-0010 / ADR-0012 fixture-replay**: tests run with the env unset (default); the kill switch will not false-negative regression tests.

Integration test: `packages/cli/src/__tests__/disabled-env.test.ts` spawns each built hook bundle with the env set and asserts exit 0 + no TB runtime noise (matcher / M5 / analyze / embedder / attribution) in stderr.

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

## Codex hook parity (research draft, issue #289)

> **DRAFT** — research-only summary added by issue #289. The full surface (registry format, payload field-by-field diff, output schema, operational caveats) lives in [`./codex-hooks-spec.md`](./codex-hooks-spec.md). Sub-issue #293 will promote this into the canonical Claude lifecycle ASCII diagram once #290 + #291 land the actual `.codex/` wiring.

The TeamBrain Claude hook inventory documented above maps to Codex's officially-supported hook surface as follows. Same row schema as the Claude `## Channel-by-channel` section: one row per event, with the Codex verdict (`supported` / `absent` / `unknown`) and a one-line note on what changes between the two stacks.

| # | Event | Codex verdict | Notes vs the Claude row above |
|---|-------|---------------|-------------------------------|
| 1 | `SessionStart` | supported | Codex carries an extra `source` field (`startup` \| `resume` \| `clear`); Claude has no `source` discriminator |
| 2 | `UserPromptSubmit` | supported | Same `prompt` field; matcher is ignored on both sides |
| 3 | `PreToolUse` | supported | `Write`/`Edit` collapse into Codex's `apply_patch`; Claude's `permission_mode` field on input is **absent** in Codex (Codex uses the separate `PermissionRequest` event instead) |
| 3a | `PermissionRequest` | supported | Codex-unique event; no Claude analog. Hook returns `decision: {behavior: "allow" \| "deny"}` |
| 4 | `PostToolUse` | supported | Field-for-field equivalent (`tool_name`, `tool_use_id`, `tool_input`, `tool_response`) |
| 5 | `Stop` | supported | Codex stdin adds `stop_hook_active` + `last_assistant_message`; TeamBrain's three-handler Stop chain (`bin-stop.cjs` + `self-report-fused.sh` + `bin-digital-twin-tap.cjs`) needs an adapter shim — see issue #290 |
| 6 | `PreCompact` | absent | Codex docs do not promise this event. `bin-pre-compact.ts` source exists in TeamBrain but cannot be wired against Codex |
| 7 | `SessionEnd` | absent | Same — Codex docs do not promise this event |
| 8 | `SubagentStop` / `Notification` | absent | TeamBrain does not currently use them either; no parity work needed |

**Verdict: 5/8 Claude events have a Codex equivalent** (`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`); 3 are absent (`PreCompact`, `SessionEnd`, `SubagentStop`/`Notification`); 1 Codex-unique event (`PermissionRequest`) has no Claude analog and would map to TeamBrain's existing `permission_mode` handling inside `bin-pre-tool-use.cjs`. Total Codex-supported events including the Codex-unique one: 6.

For the per-event stdin field diff, output schema diff, registry file format (`~/.codex/{config.toml,hooks.json}` + project-level variants), trust gate, and the active Codex Desktop 0.129.0-alpha.15 hook regression (upstream issue #21639), see [`./codex-hooks-spec.md`](./codex-hooks-spec.md). For the research evidence + verbatim source URLs, see [`../plans/2026-05-12-issue-289-codex-hooks-spec/research.md`](../plans/2026-05-12-issue-289-codex-hooks-spec/research.md).
