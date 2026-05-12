# TeamBrain CHANGELOG

```
   plan ──► implement ──► review ──► ship
                          │
                          ▼
                    CHANGELOG entry
```

User-visible behaviour changes go here. Internal refactors that don't change
observable behaviour (CLI flags, file layouts, hook side-effects, on-disk
artifacts the user sees) do NOT need an entry.

## Unreleased

### Added

- **`TEAMAGENT_DISABLED=1` env disables every TeamAgent hook** (issue #343, PR-1 of 3).
  When this env is set to `"1"`, all 8 hook handlers — `SessionStart`,
  `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `SessionEnd`,
  `PreCompact`, and the user-level `digital-twin-tap` Stop hook — early-return
  at handler entry. No `~/.teamagent` filesystem mutation, no AttributionBus
  event, no matcher / M5 / analyze / embedder / digital-twin runtime work. The
  hooks still produce minimal Claude Code envelopes (so the conversation
  proceeds normally), they just don't do any TB-specific work.
  Purpose: lets PR-2 / PR-3 (Counterfactual Ablation harness) measure the
  paired TB-ON vs TB-OFF token cost without uninstalling TeamAgent. Without
  this switch the only way to disable TB was `pnpm teamagent uninstall`,
  which mutates `~/.claude/settings.json` and defeats paired t-test
  stability. Any value other than `"1"` (including unset, `"0"`, `"true"`)
  leaves all hooks fully enabled — opt-in by exact string match.

- **Issue #343 closed: boss-facing TB token cost report + reproducibility recipe** (PR-3 of 3).
  `docs/reports/2026-05-12-issue-343-tb-token-cost-summary.md` is a
  single-page Chinese summary aimed at the boss/CEO: headline verdict
  (mean Δ=+2,773 tokens, p=0.329 → no statistically significant token
  diff between TB-ON and TB-OFF on n=17 curated tasks), 3 anticipated
  Q&A, 3 takeaways, 5-command reproducibility recipe. Companion engineering
  doc `docs/features/cost-measurement.md` documents the full re-run recipe,
  JSON output shapes (`bench-report.json` + `ablation.json`), how to extend
  the corpus, and why scipy paired t-test is the canonical harness per
  `docs/verify/E2E-LEARNING.md`.

### Fixed

- **Multi-session no longer multiplies the 650MB embedder model**. Issue #315.
  Previously, opening multiple Claude Code dialogs concurrently caused each
  `bin-user-prompt-submit` invocation to load `Xenova/multilingual-e5-small`
  in-process (~650MB RSS per process). Five dialogs sending prompts at once
  was enough to freeze a 16GB machine. The fix has three parts:
    1. UserPromptSubmit now uses the same `DaemonFirstEmbedder` singleton
       as PreToolUse / Stop — talks to the long-running daemon over HTTP
       instead of loading the model itself. PR #227 (issue #164) wired
       the other three hooks but never UserPromptSubmit.
    2. When the daemon is unreachable (cold-start window, missing
       `onnxruntime-node`, daemon crash), `DaemonFirstEmbedder.embed()`
       now returns empty vectors instead of loading the model in-process.
       The semantic retriever degrades to BM25-only via its existing
       per-stage try/catch — same behaviour you'd get if vec0 itself
       were unavailable.
    3. Atomic `fs.openSync(wx)` locks at the spawn site
       (`tryDetachedSpawn`) and inside the daemon's own startup
       (`bin-embedder`'s `tryAcquireLock` window) so concurrent
       SessionStart hooks cannot race to spawn N independent daemon
       children each loading the model. 30s mtime stale-cleanup
       handles crashed holders.

- **Auto-update no longer silently sleeps for 24h on shared NAT / mobile networks (#313, closes #305)**.
  Pre-#313 the version-check fired `GET https://api.github.com/repos/libz-renlab-ai/TeamBrain/branches/release`,
  which hits the **60 req/hr anonymous quota per IP**. On corporate NAT, mobile cells, CI runners — any place
  several `teamagent` users share an outbound IP — the quota burned out fast; once exhausted, the updater
  fell into a silent exponential backoff up to 24 hours, leaving users stuck on old versions (e.g. #305:
  user stuck on 0.10.1, statusline `TeamAgent | 规则:2 | 帮过 …` line never appeared because that line is a
  0.11.x feature).

  New version-check chain — **completely off `api.github.com`**:
  1. **Tier 1 (主路)**: `https://libz-renlab-ai.github.io/TeamBrain/latest.json` — GitHub Pages, Fastly
     CDN, no rate limit, no token. CI in `release-branch.yml` regenerates this file on every release.
  2. **Tier 2 (兜底)**: `https://registry.npmjs.org/teamagent/latest` — npm registry, also no GitHub
     rate limit. May lag the release branch by ~1 week (`docs/PUBLISHING.md` cadence).
  3. **Tier 3 (人话提示)**: when both tiers fail, SessionStart now surfaces a banner with the failure
     cause + concrete recovery paths (`npm i -g teamagent@latest`, retry on next session, or set
     `TEAMAGENT_GITHUB_TOKEN`) — replacing the previous silent 24h sleep.

  The actual binary download path (`github.com/.../archive/refs/heads/release.tar.gz`) is unchanged —
  it was always a static asset URL and never consumed the 60/hr quota. Only the version-check moved.
  See `docs/features/auto-update-channel.md` for full schema and guarantees.

- **`teamagent init` no longer silently fails when blocked by `nested-init-guard`**.
  Previously, running `teamagent init` from a sub-directory of an already-initialized
  project printed only `❌ 安装未完成 ... 运行 teamagent doctor` with no reason —
  and `teamagent doctor` then sent the user back to `init`, a tight loop with no
  way out. `renderInitResult` now lists `nested-init-guard` under a dedicated
  `🛡️ 前置守卫` group so the user sees the ancestor path and the
  `--force-nested-init` escape hatch, e.g.

      🛡️  前置守卫...
         ❌ 嵌套项目守卫: detected ancestor TeamAgent project at /Users/m1/projects;
            refusing to create duplicate .teamagent/ in /Users/m1/projects/demo-repo —
            cd to the project root or use --force-nested-init to override.

  `friendlyError` now also passes the full detail through (was truncated at 120 chars
  before, losing the path the user needs to act on).

- **`dist/bin-digital-twin-tap.cjs` is now actually built and shipped** (issue #299).
  0.11.0's install table and CHANGELOG referenced this bundle as a user-level
  Stop hook, but `packages/teamagent/tsup.config.ts` `ENTRIES` dict (and the cjs
  block's `entry` list) never declared it, so the file was never emitted to
  `dist/`. `applyChannelOps` then silently `continue`d past the missing bundle
  and the user-level digital-twin Stop tap was dropped from
  `~/.claude/settings.json` without trace. The 0.11.0 CHANGELOG claim
  "v0.11.0 drops the `.sh` wrapper and collapses to the `.cjs` user-level path
  alone — net 1 spawn per Stop in TeamBrain" was therefore a no-op for
  downstream users until this fix (the .sh wrapper inside the TeamBrain repo
  kept the tap alive in dogfood mode, masking the regression).

  Defense-in-depth added alongside the build entry fix:

  - **`teamagent doctor` now walks every install-table-referenced bundle.**
    The new check (`install-table-bundles`) iterates `install-hook.ts`'s
    `ALL_CHANNELS`, resolves each `bundleFilename` to its expected dist path
    via `enumerateInstallTableBundlePaths()`, and `fs.existsSync` each. Any
    missing file → `status: "fail"` listing every absent filename → doctor
    exits non-zero. Catches future build-config regressions of the same
    shape before release.

  - **`applyChannelOps` no longer silently skips missing bundles.**
    Replaced the silent `continue` with a single stderr line
    `teamagent: skipping channel <channel> — bundle <bundle-filename> not found`,
    then continues. Install still proceeds with whatever bundles exist
    (partial install > hard failure for genuine cross-version-compat cases).
    Warn is NOT silenced under CI.

## 0.11.0 — 2026-05-09

Closes the three follow-ups captured in PR #232 § 8 ("Follow-up captured for next major version") via one bundled cleanup PR. See `docs/plans/2026-05-09-install-hook-cleanup-v0.11/plan.md` for the full scope decision. Bumps from 0.10.x with one user-visible deprecation and one performance fix specific to working inside the TeamBrain repo itself.

### Deprecated

- **`teamagent install-user-hook` is now a soft-retire shim**. The
  command body is reduced to a thin wrapper around the shared
  `applyUserLevelChannelOps` helper added in this PR; the deprecation
  banner now points users at `teamagent init` and avoids leaking
  internal helper names. The standalone command remains functional
  through the v1.0 deprecation window because
  `packages/teamagent/postinstall.mjs:365` still calls it directly
  during every `npm install -g teamagent` — hard-deletion is the v1.0
  cut.

### Fixed

- **In-TeamBrain double-tap on Stop hook eliminated**. Pre-v0.11 the
  TeamBrain repo's committed `.claude/settings.json` registered both a
  `digital-twin-tap.sh` bash wrapper AND `bin-digital-twin-tap.cjs`
  (user-level via `teamagent init`), so every Stop event spawned the
  digital-twin tap twice. `tapSession()`'s `(cwd, session_id)` idempotency
  dedup'd the database write, but the wasted process spawns and file
  reads (~50ms per Stop) added up. v0.11.0 drops the `.sh` wrapper and
  collapses to the `.cjs` user-level path alone — net 1 spawn per Stop
  in TeamBrain (previously 2) and unchanged in other projects (still 1).

## [0.10.5] — 2026-05-09

### Added

- **Issue #225**: Soft-force upgrade prompt — when a new version is available,
  every SessionStart now surfaces a three-choice banner (`teamagent update --now`
  立刻升级, `--snooze` 下次再说, `--never` 永远别问). Snooze backs off 24h →
  48h → 7d so a user who keeps deferring isn't pestered every shell.
  CHANGELOG-driven "what's new" bullets ride along on the prompt, the post-init
  tail, and a new `teamagent whatsnew` command — all three surfaces share one
  pure parser so they stay in sync. `TEAMAGENT_NEVER_PROMPT=1` env var is the
  CI / dogfood-probe escape hatch; `teamagent update --enable` resets snooze +
  never_prompt back to defaults. Auto-update polling itself is unchanged —
  only the user-facing banner is upgraded.

### Removed

- **PR #231 / Issue #229**: Removed `scripts/fixed-flow-watcher.sh` (the local
  poller that watched GitHub for `grill-ready` issues and forked `mainpi` to
  run the FIXEDFLOW driver) and its companion `.github/workflows/fixed-flow-heartbeat.yml`
  (which posted a "queued for local pipeline" comment when the label was added).
  FIXEDFLOW step 3-5 no longer supports any watcher / background poll / cron /
  auto-dispatch path: maintainers must invoke the `/fixed-flow-driver` skill
  manually inside a Claude Code session. The original auto-dispatch chain
  shipped in PR #200 was always gated behind `FIXEDFLOW_DRIVER_ENABLED=0`
  and never ran in production, so removing it changes no observable runtime
  behaviour — but it removes a wired-but-unused mechanism that the docs
  treated as canonical. `docs/FIXEDFLOW.md` v4 explicitly bans watchers /
  background polling / auto-dispatch. The env vars `FIXEDFLOW_DRIVER_ENABLED`
  and `FIXEDFLOW_POLL_INTERVAL` are no longer read by any script. (#229, #231)

### Fixed

- **Issue #158**: `npm i -g github:libz-renlab-ai/TeamBrain#release` no longer
  fails on Windows + destroys the user's prior teamagent install. The 3
  tree-sitter native deps (`web-tree-sitter`, `tree-sitter-typescript`,
  `tree-sitter-python`) have been removed from `packages/teamagent/package.json`
  entirely — their install scripts spawn `cmd.exe` during npm reify and abort
  with `ENOENT`, which left users with no teamagent at all because npm reify
  removes the prior package before downstream install scripts run.
  `packages/core/src/matcher/legacy/ast-context.ts:initAstMatcher` already had
  a try/catch fallback returning false → "conservative mode" (matcher does NOT
  filter comment/string false-positives), so removing the deps degrades match
  precision but does not break functionality. `postinstall.log` gains a new
  positive `stage=ast-matcher status=skipped reason=tree-sitter-deps-absent`
  line — symmetric to #160 `vector-deps-absent` — so doctor and bug-report
  tooling can distinguish "skipped on purpose" from "ast-matcher never
  reached." Users wanting AST-precise filtering can opt back in:
  `npm install -g teamagent web-tree-sitter@^0.26 tree-sitter-typescript@^0.23 tree-sitter-python@^0.23`.
  Defense-in-depth install-time backup + rollback in `release/install.sh`
  guards against future analogous failures (any cause). The rollback path
  (both shell + `packages/cli/src/lib/install-backup.ts`) validates the
  backup tarball with `tar -tzf` BEFORE `rm -rf $INSTALL_DIR`; a corrupt
  or truncated backup would otherwise wipe the install dir and then fail
  to extract — recreating the very partial-install corruption #158 was
  filed for. The backup canary uses `dist/bin.js` existence (not just
  "directory non-empty") so spurious .nfs* / .smbXXXX cruft on hostile
  filesystems isn't archived as garbage. `treeSitterDepsInstalled`
  `knownRoots` includes Windows %LOCALAPPDATA%/pnpm and %APPDATA%/npm so
  Windows users who explicitly install the tree-sitter packages aren't
  permanently flagged as "AST 过滤: 未安装". (#158)
- **Issue #160**: `teamagent warmup` now exits 0 with a friendly skip message
  when the optional vector deps (`@xenova/transformers` + `onnxruntime-node`)
  are not installed, instead of exit 1 with a misleading "warmup failed"
  error. The state file (`~/.teamagent/.warmup-state.json`) records
  `status="skipped"` rather than `status="failed"`, and the postinstall log
  (`~/.teamagent/postinstall.log`) gains a positive
  `stage=warmup status=skipped reason=optional-not-installed` line so doctor
  and bug-report tooling can distinguish "skipped on purpose" from "warmup
  never reached." `teamagent doctor` reports `vector_model: skip` (not
  `fail`) for the same state.
- **Issue #161**: hooks fired from a sub-directory now correctly resolve to
  the project root's `.teamagent/knowledge.db` via walk-up. Previously
  `findTeamagentRoot` was missing entirely and every hook entry hard-coded
  `path.join(cwd, ".teamagent", "knowledge.db")`, so the project DB was
  invisible from any child cwd. (#181)

### Changed

- `teamagent init` now writes hooks to user-level `~/.claude/settings.json`
  by default, so Claude Code launched from any cwd triggers TeamAgent. Use
  `--no-user-level-hook` to opt out and keep the previous project-level-only
  behaviour. (#181)
- `teamagent init` from a sub-directory of an already-initialized project
  refuses by default to avoid creating duplicate `.teamagent/` state. The
  init step `nested-init-guard` reports the detected ancestor and the user
  is told to `cd` to the project root or pass `--force-nested-init` to
  override. (#181)
- Hook bundles are now staged to `~/.teamagent/hooks/` before being
  referenced from `~/.claude/settings.json`, so worktree cleanup, npm
  reinstalls, nvm version switches, and last-init-from-a-different-project
  no longer break user-level hooks across every project on the machine. The
  `~/.claude/settings.json` PreToolUse / PostToolUse / UserPromptSubmit /
  Stop commands point at `~/.teamagent/hooks/bin-*.cjs` instead of at a
  transient `node_modules/.../dist/` path. (#181)
