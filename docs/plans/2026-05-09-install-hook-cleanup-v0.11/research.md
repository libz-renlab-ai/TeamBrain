```
   __                                                
 <(o )___      Research dump for install-hook-cleanup-v0.11
  ( ._> /                                             
   `---'    Read 2026-05-09 / scope: 3 follow-ups from PR #232 report

 ┌──────────────────────────────────────────────────────────┐
 │  Where we are (post-#230)   ►   Where we want to be      │
 │  6 inline blocks            ►   1 channelOps helper      │
 │  2 .sh in settings.json     ►   1 .sh (self-report only) │
 │  install-user-hook duplica  ►   shim → shared helper     │
 │  tes ~80 lines of session                                │
 │  start install logic                                     │
 └──────────────────────────────────────────────────────────┘
```

# research.md — install-hook-cleanup-v0.11

This is the context dump backing `plan.md`. Per `AGENTS.md` rule 8, the plan
references this file rather than embedding "go read X" instructions. Read this
once; the plan is the operational doc.

## 1. Source of truth — what triggered this PR

`docs/plans/2026-05-09-install-hook-bc-scope/report.md` § 8 "Follow-up captured for next major version":

> 1. Refactor project-level `installHook` to share the `channelOps` loop with user level. Eliminates the inline-block / channelOps double-track maintenance burden.
> 2. Drop `digital-twin-tap.sh` from committed `.claude/settings.json` once `bin-digital-twin-tap.cjs` is universally installed via the user-level path. Collapses to a single Stop entry per project, eliminating the in-TeamBrain double-tap risk entirely.
> 3. Delete the deprecated `install-user-hook` command after one major version cycle.
>
> These are independent and shippable as separate PRs once consensus on timing is reached.

User decision (2026-05-09): bundle all three into ONE PR via option A — soft-retire #3 with a shim instead of hard delete; bump 0.10.1 → 0.11.0; do not touch `postinstall.mjs:365`.

## 2. Current code shape

### 2.1 `packages/cli/src/commands/install-hook.ts` (1145 lines)

Public API:

```
export function installHook(opts: InstallHookOptions = {}): {
  settingsPath: string;
  hookEntry: string;
  postHookEntry: string;
  alreadyInstalled: boolean;
  postAlreadyInstalled: boolean;
  statusLineSkipped: boolean;
  statusLineMergedScope: "user" | "project" | null;
}
export function uninstallHook(opts: { cwd?: string } = {}): { settingsPath: string; removed: boolean }
export function auditOrphanShellHooks(cwd: string): string[]
```

Internal layout:

```
lines  1-117   imports + per-channel TAG constants + types
       119-167 cliRoot + per-channel default<...>Entry helpers
       169-231 toForwardSlash, stageBundleToUserTeamagent (B-091 staging)
       233-273 isTeamagentEntry + CHANNEL_BUNDLE_FILENAMES (B-086 dedup)
       275-365 readSettings / writeSettings / pruneOldBackups
       367-449 acquireSettingsLock / releaseSettingsLock (B-fix #7)
       459-707 installHook() — project + user-level write
                  ├─ 6 INLINE channel blocks (PreToolUse, PostToolUse,
                  │   UserPromptSubmit, Stop, SessionEnd, PreCompact)
                  ├─ statusLine block (#104 chain wrap)
                  ├─ writeSettings(projectPath, settings)
                  └─ if userLevel: mergeUserLevelHooks(homeDir, entries)
       726-922 mergeUserLevelHooks() — clean channelOps array + loop
                  └─ 8 ops covering 7 channels (Stop has 2 entries)
       948-961 buildStatusLineCommand (escape + chain)
       964-1070 uninstallHook() — sweeps all channel tags + statusLine
       1072-1076 shellQuote
       1098-1144 auditOrphanShellHooks (orphan-scanner; B+C scope)
```

The `channelOps` array at line 752 is the cleaner pattern. The 6 inline blocks
at lines 487-604 are the legacy pattern. The refactor extracts a shared helper
applied to both.

### 2.2 `packages/cli/src/commands/install-user-hook.ts` (199 lines)

Public API:

```
export function installUserHook(opts: InstallUserHookOptions = {}): {
  settingsPath: string;
  backupPath: string | null;
  hookEntry: string;
  alreadyInstalled: boolean;
}
export function uninstallUserHook(opts: { homeDir?: string } = {}): {
  settingsPath: string;
  removed: boolean;
}
```

Body summary:

- Already prints deprecation warning (added by PR #230)
- Re-implements ~80 lines of SessionStart-specific logic that mostly mirrors
  `mergeUserLevelHooks`'s SessionStart op — different in three small ways:
  1. Returns `backupPath` (timestamp-stamped) explicitly; `mergeUserLevelHooks`
     uses `writeSettings`'s built-in `.bak-<ts>` rotation
  2. Uses its own `isTeamagentSessionStartEntry` heuristic (subset of
     `isTeamagentEntry`)
  3. Does not acquire the settings lock (single-channel writes pre-date the lock)

After this PR these all become the same code path via the shared helper.

### 2.3 Committed `.claude/settings.json`

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          { "type": "command", "command": "bash \"${CLAUDE_PROJECT_DIR}/.claude/hooks/self-report-fused.sh\"", "timeout": 10 },
          { "type": "command", "command": "bash \"${CLAUDE_PROJECT_DIR}/.claude/hooks/digital-twin-tap.sh\"", "timeout": 5 }
        ]
      }
    ]
  },
  "extraKnownMarketplaces": { ... },
  "enabledPlugins": { ... }
}
```

After this PR the second HookCommand (`digital-twin-tap.sh`) is removed; the
first remains.

### 2.4 `.claude/hooks/`

```
digital-twin-tap.sh    — gets `git rm`-ed in this PR
self-report-fused.sh   — stays (project-level enforcement script, out of scope)
```

### 2.5 `packages/teamagent/postinstall.mjs:357-389`

```js
// Stage 1: doctor + install-user-hook in parallel
const [doctorR, hookR] = await Promise.allSettled([
  spawnWithTimeout(process.execPath, [binPath, "doctor", "--postinstall"], {}, 15000),
  spawnWithTimeout(process.execPath, [binPath, "install-user-hook"], {}, 10000),
]);
```

This is the only caller that depends on the standalone command name. After
the shim, this still works — exit code 0, stderr deprecation warning, same
on-disk effect as `teamagent init` would have produced.

## 3. Test contracts that must stay green

### 3.1 `packages/cli/src/__tests__/install-hook.test.ts`

Asserts (sample):

- After `installHook({cwd, hookEntry, postHookEntry, ...})`:
  - `settings.hooks.PreToolUse[0]._teamagentTag === "teamagent-pre-tool-use"`
  - `settings.hooks.PostToolUse[0]._teamagentTag === "teamagent-post-tool-use"`
  - `settings.hooks.Stop[0]._teamagentTag === "teamagent-stop"`
  - statusLine chain-wrap behavior on `_teamagentOriginalScope`
- User-level merge: `~/.claude/settings.json` gets all 8 entries when bundles
  exist on disk

### 3.2 `packages/cli/src/__tests__/install-user-hook.test.ts`

Asserts:

- `installUserHook({homeDir, sessionStartEntry})` writes
  `settings.hooks.SessionStart[0]._teamagentTag === "teamagent-session-start"`
- Command must be wrapped in the issue #209 graceful shim
  (`bash -c '[ -f X ] || exit 0; exec node X'`)
- Return shape: `alreadyInstalled`, `backupPath`, `settingsPath`, `hookEntry`

The shim refactor must preserve this exact return shape.

## 4. The "double-tap" arithmetic (why #2 is safe)

Currently when a Stop event fires inside TeamBrain itself:

```
Claude Code session ends
        │
        ▼
Stop event reads (committed) .claude/settings.json
        │
        ├─ self-report-fused.sh         (12-field enforcement; unrelated)
        └─ digital-twin-tap.sh          (wraps node bin-digital-twin-tap.cjs path-A)
                │
                ▼
        spawn → tapSession(cwd, session_id)
                                        ↑
        AND simultaneously              │
                                        │
Stop event reads (user-level) ~/.claude/settings.json
        │
        └─ bin-digital-twin-tap.cjs     (path-B, staged user-level)
                │
                ▼
        spawn → tapSession(cwd, session_id) ← same target
```

`tapSession()` dedups by `(cwd, session_id)` so the actual database write
happens once. But two `node` processes spawn, two file reads happen, ~50ms
extra wall-clock per session.

After removing `digital-twin-tap.sh` from committed `.claude/settings.json`:

```
Stop event reads (committed) .claude/settings.json
        │
        └─ self-report-fused.sh         (unchanged)

Stop event reads (user-level) ~/.claude/settings.json
        │
        └─ bin-digital-twin-tap.cjs     (the only digital-twin path)
```

One spawn, one tap, no idempotency rescue needed. In other projects nothing
changes — they were already at one tap (user-level only).

## 5. Why option A (shim) and not option B (hard delete)

`postinstall.mjs:365` calls `[binPath, "install-user-hook"]` synchronously
during every `npm install -g teamagent`. If the standalone command is
deleted, the install itself fails: the spawned subprocess exits non-zero,
`recordSetupFailure("install-user-hook", ...)` writes to
`~/.teamagent/postinstall.log`, and the user sees `hook: failed`.

We could "fix" this by editing `postinstall.mjs` to call `init` or
`install-hook` instead. But that:

1. Is a much larger change spanning both packages
2. Breaks any external scripts that pin to `install-user-hook`
3. Means existing 0.10.x installs reinstalling 0.11.0 hit a hard error
   instead of a deprecation warning

Option A keeps the surface intact. The deprecation warning prints on every
postinstall, giving users one-major-version notice before v1.0 deletes it.

## 6. Refactor risk inventory

| Risk | Mitigation |
|---|---|
| `applyChannelOps` changes channel iteration order → some test asserts position | Tests assert presence by tag, not array index. Verified by grep. |
| Helper signature growth (project vs. user differ in 4 dimensions) | Pass `scope` discriminator + closures for the two divergent ops (command builder, bundle path resolver). |
| Lock acquisition timing changes | Keep lock acquisition exactly where it is in `mergeUserLevelHooks`; helper is called inside the lock block. |
| `installUserHook` return shape drift | Compute `alreadyInstalled` from pre-call `existsSync` + post-call settings inspection; compute `backupPath` from `writeSettings`'s side effect (read most recent `.bak-*`). Or: keep an explicit return-shape adapter. |
| Test fixtures relying on inline-block-only paths | Run full `pnpm test`; fix or update assertions case-by-case. |
| Snapshot drift on `install-hook --help` canonical JSON | Help text is unchanged in scope; snapshot diff should be empty. If non-empty, investigate before merging. |

## 7. What we deliberately are not researching

- Whether bin-digital-twin-tap should be in project-level too (it should not — see § 4)
- Whether to bump to 1.0.0 (no — that is the next PR, when install-user-hook is hard-deleted)
- Whether to combine self-report-fused.sh into the same .cjs migration path (out of scope; different concern, different risk profile)

## 8. References

- `docs/HOWTO-PLAN-PR.md`
- `docs/POSTPR.md`
- `docs/feature-verification.md`
- `docs/FASTPROBE.md`
- `docs/features/hooks-status.md`
- `docs/plans/2026-05-09-install-hook-bc-scope/{plan,judge,report}.md`
- `~/.claude/docs/rules/testing-judge-harness.md`
