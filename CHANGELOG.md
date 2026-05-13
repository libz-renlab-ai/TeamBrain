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

### Changed

- **`teamagent init` success block minimized + landing rescope sweep** (issue #326,
  delivering items 4, 6, 7 of `docs/plans/2026-05-11-issue-122/grill-spec-acceptance.md`
  §Implementation summary). `teamagent init` now ends with a 5-line minimal block
  (`✅ TeamAgent 已就绪` + `下一步：` + `cd your-project` + `claude`); the
  pre-existing 4-item 下一步 list, `💡 团队标配插件` tip, and `🆕 本次新增`
  post-init CHANGELOG tail are now gated behind `TEAMAGENT_VERBOSE_INIT=1`
  (helpers stay in source for `teamagent doctor` / a future `--verbose-init`
  flag). Step-group label `🔗 注册 Hook` renamed to `🔗 注册集成` to drop the
  `hook` jargon from the default human display (item 7). `teamagent --help`
  text and the FIXEDFLOW banner ordering follow suit. Landing copy
  (`apps/landing/src/index.html`, **legacy static-HTML mirror** — the live
  deploy is `landing/rocketteam` via `.github/workflows/landing-deploy.yml` +
  `landing/build-static.sh`, which was already clean of these strings) drops
  `PreToolUse` / `拦截 PreToolUse` / `拦截机制` vocabulary from
  `<meta description>`, hero GIF alt, install-box (now one curl line since
  `release/install.sh` auto-runs init), comparison-table row 2
  (`工具调用前拦截 PreToolUse` → `团队规则自动应用`), and headache-bullets
  line 3 (drops `拦截机制`). Items 1, 2, 3, 5, 8, 9, 10, 11, 12 of the
  12-item RESCOPE were already PRESENT on main per
  `docs/plans/2026-05-13-issue-326/research.md`. Audit runner
  `audit/runners/feature-01-init.ts` updated to accept both old
  (`TeamAgent 安装成功`) and new (`TeamAgent 已就绪`) banner strings for
  mid-rollout safety. Postinstall.mjs npm-install banner unchanged; that
  surface is independent of `teamagent init` success and not within #326
  item 6 scope.

### Added

- **`teamagent daily` 日报总结 hook + CLI** (issue #371). Says "总结一下今天的日报"
  / `/daily` to your Claude Code window and the UserPromptSubmit hook
  intercepts the prompt, LLM-free-scans `~/.claude/projects/<encoded-cwd>/*.jsonl`
  for today's local-time activity across all your Claude projects, merges
  `.codex/worktrees/<task>` and `.claude/worktrees/<task>` sessions back to
  their host repo, and injects a per-project digest (session count / turn
  count / tools used / first&last user excerpts) as `additionalContext` so
  your own Claude window writes the one-line-per-project summary itself.
  Same path also archives the raw activity dump to
  `${TEAMAGENT_HOME-~/.teamagent}/daily/<YYYY-MM-DD>.md`. CLI side: new
  `teamagent daily [--projects-root=PATH] [--archive] [--format=json|context]
  [--help]` subcommand (`--help` emits canonical JSON for snapshot tests per
  `docs/feature-verification.md`). Three-layer matcher (strict whitelist +
  `/daily` slash; `日报`/`daily summary` keyword + injectable LLM intent seam;
  passthrough); LLM seam ships as a stub — graceful degrade to whitelist +
  slash per grill §4 default. Env knobs: `TEAMAGENT_DAILY_DISABLED=1` to
  bypass; `TEAMAGENT_DAILY_TRIGGERS=phrase1,phrase2` to extend the whitelist.
  Verification playbook: `docs/plans/2026-05-13-issue-371-daily-summary/judge.md`.
- **`项目:<name>` field in statusline** (issue #306). The Claude Code status row
  now surfaces the current repo name between the existing `拦过:T今` field and
  the CC runtime fields (`模型` / `上下文` / `用量` / `5h` / `7d` / `会话`).
  Worktree-aware: the displayed name is the basename of the **main checkout**
  (via the existing `findMainCheckoutFromWorktree` walk-up), so all worktrees
  of the same repo render the same project name instead of the per-worktree
  directory (e.g. `issue-306`). Names longer than 32 characters are truncated
  with a `...` suffix; root-only / unresolvable cwd falls back to `unknown`.
  Per grill verdict §12 (B), the statusline is a local presence/health view —
  this field is the single grill-aligned addition; the full 5-field presence
  redesign (`<state>` / `<name>` / `<queue>` / `<upload>` / `<binding>`) stays
  in the scope of #326 (`feat(issue-122-impl): RESCOPE 实现 12 项 — landing →
  init → Claude Code statusline`).

- **4-layer evidence matrix + sibling canned-answer for evidence-asking probe** (issue #320).
  `docs/BUSINESS-FEATURES.md` adds a `## 四层证明矩阵 / 4-layer evidence matrix` section
  with per-feature 4-row tables (CEO narrative / Coder file paths / Machine-readable
  JSON+SQL / LLM-readable raw artifacts). `CLAUDE.md` gains a sibling canned-answer rule
  for the probe `!claudefast -p "what are the business feature and do we have enough
  evidence to prove them to ceo, coder, machine-readable, LLM-readable evidence?"` with
  6 disjoint grep anchors (`four-layer evidence matrix` / `CEO narrative` / `Coder file
  paths` / `Machine-readable JSON+SQL` / `LLM-readable raw artifacts` / `turnkey UX is a
  vision, not PRESHIP`) — strictly non-overlapping with the legacy `show me the business
  feature` 6 anchors so the two probes never collide. Per grill verdict §22
  (`docs/adr/0014/320.md`), #320 is evidence/coding discipline; it does NOT
  reverse-dictate the product design of #308 / #371 / #372. `README.md` gains a short
  `## 三大业务特性 / Three business features` section pointing at both probes.

- **Digital-twin sidecar + `/api/cc-status` collector** (issue #350, PR #374, #381).
  Every Stop hook now taps a structured session snapshot — session id,
  cwd, latest user prompt, tool-call counters, elapsed turns — and a
  user-level `bin-digital-twin-tap.cjs` Stop hook hands it off to a long-running
  uploader daemon. The uploader pushes hourly delta logs to a local collector
  server (default `http://127.0.0.1:8080`) which exposes
  `GET /api/cc-status` returning the latest snapshot per session. Privacy:
  per-user data dir (`~/.teamagent/digital-twin/<hostname>/`), TLS-friendly
  paths, redactor reused from the team-share gate. Disabled by setting
  `TEAMAGENT_DISABLED=1` or by leaving the collector server unreachable
  (uploader degrades silently after one warn line). Issue #368 hooks the
  same payload up so out-of-the-box installs upload to the LAN collector
  on port 8080 without manual config.

- **`teamagent statusline` exposes CC runtime state** (issue #331, PR #337,
  follow-ups #124, #317). The Claude Code status bar now reads from
  `~/.teamagent/cc-status.json` (written by the digital-twin tap) and
  surfaces `TeamAgent | 规则:N | 帮过 …` with live rule-fire count,
  recent intercepts, and propagation status. Resolves to the project DB
  even when called from a git worktree (PR #317 walk-up fix).

- **Post-merge auto-update banner for PR creators** (PR #358, m6).
  When a contributor merges a PR, the next SessionStart surfaces a 🎯
  banner offering to bump TeamAgent to the just-shipped release branch.
  Replaces the previous "wait one hour for the SessionStart auto-check"
  delay specifically for PR creators who want their own commit in-process
  for the next session. Driven by `m6/post-merge-update.ts`, no daemon
  required.

- **Newsboard SessionStart hook with ASCII duck MOTD** (issue #233, PR #235,
  Chinese template + CI strict-format guard #249). Each SessionStart prints
  a 4-section newsboard: latest release notes, deferred TODOs hot off the
  press, in-flight propagation count, and an ASCII duck of the week. Reads
  from `~/.teamagent/newsboard.json` regenerated by `m6` and the
  CHANGELOG-driven "what's new" parser shared with the upgrade prompt.

- **`teamagent install duck` static skill** (PR #321, m5). New static
  user-level skill that ships the "install symphony" status board into the
  user's `~/.claude/skills/` and references `docs/install-status.html` for
  cross-machine install visibility.

- **`/reverification` skill — LLM-uncheatable verification** (PR #318).
  Project-level Claude Code skill that re-runs a feature's judge harness
  in a sandboxed sub-process against the actual repo HEAD (not a frozen
  fixture), ensuring the model can't fabricate a PASS by reading the
  harness's success-marker. Wired into `/review` and listed in
  `~/.claude/skills/`.

- **`grill-via-web` + `grill-with-docs` skills + cross-host grill mutex**
  (PRs #286, #314, #347, #361, ADR-0014).
  `grill-via-web` pops a ChatGPT/Claude.ai URL pre-filled with a grill prompt
  for one or many GitHub issues so a maintainer can finish the grill in a
  browser tab. Cross-host mutex via two GitHub labels — `grilling` (held
  during the grill itself) and `grill-working` (held during driver
  implementation) — prevents two driver hosts from racing on the same
  issue. `grill-with-docs` saves grilled comments to per-issue siblings of
  ADR-0014 for durable record.

- **`teamagent required-check` and `init` propagation wiring** (issue #284,
  PR #383, slice 1). `teamagent init` now writes a required-version pin
  into `.teamagent/manifest.json` and rejects sessions that fall below it
  on SessionStart. Replaces the legacy `m5-infect` "soft suggest" path
  (now deprecated). Companion `teamagent doctor` shows the propagated
  required version vs the locally installed binary, plus a propagation
  report so admins see which 4 static user-level skills landed via init
  (PR #288).

- **`teamagent demo` three-mode command** (issue #93, PR #123). Three demo
  modes: `default` polls `events.db` for live rule fires, `--inline`
  spawns the hook bin in-process so users see the PreToolUse stop, and
  `--record` generates a vhs tape used by `apps/landing` for the hero GIF.

- **`teamagent try` 30-second onboarding** + **first-run wizard** (PRs #87,
  #119, #99). Runs 5 canonical PreToolUse intercept scenarios — including
  the `moment → dayjs` correction → next-session intercept closing-the-loop
  — so new users see the value within 30 seconds of install. First-run
  wizard surfaces 3 next-step actions on the first run; progress persists
  in `~/.teamagent/wizard-state.json`.

- **One-line `curl|bash` install + idempotent resume** (issues #85, #92,
  #155, PRs #107, #147, #180, #268, #272, ADR-0011). `release/install.sh`
  + `release-prep/install-sh-checklist.md`: gates `node ≥ 22`, picks
  `npm`/`pnpm`, fetches release tarball via HTTPS, runs `teamagent init`
  in one prompt. SHA256 checksum file published alongside on
  `release` branch; deterministic exit codes (10/11/20/30) for CI
  fallback. Re-running after a partial install resumes deterministically
  per ADR-0011.

- **`teamagent install-plugins` + 5 official Claude Code plugins enabled at
  project level** (PR #207). `install-plugins` mirrors
  `.claude/settings.json:enabledPlugins` so contributors get the same
  plugin set after `pnpm install`. Default bundle: 5 official Claude
  plugins (caveman dropped in PR #75) — see
  `docs/features/install-hook/install-table.md` for the full table.

- **Inner-loop tests run on `wip/**` CI** (PR #270, ADR-0013).
  `git push origin HEAD:wip/<name>` triggers `.github/workflows/inner-loop.yml`
  to run the full `pnpm test` + `pnpm verify` suite off the developer
  laptop — `toohot` (2026-05-10) confirmed local parallel `pnpm test`
  flooded macOS scheduler at loadavg 274. PR-gate workflow (`ci.yml`)
  unchanged.

- **TeamAgent symphony orchestration service** (PR #363, m6).
  In-process service that sequences install steps as a "symphony" with
  named movements (config → skills → kb → download → refusal), explicit
  ordering, and a single status board rendered by the install-status
  HTML. Visible at `docs/install-status.html` (English) and
  `docs/install-status-zh.html` (Chinese, PR #373).

- **Counterfactual Ablation harness (scipy paired t-test)** (issue #332,
  PR #365, PR #369). 17-task corpus + per-task TB-ON vs TB-OFF run +
  `scipy.stats.ttest_rel` paired t-test. Companion `m5-replay` CLI (PR
  #366) replays a fixture against a built-in MockLlmResponder (PR #360)
  so the harness is fully deterministic. See `docs/verify/E2E-LEARNING.md`
  for the LLM-uncheatable verdict contract.

- **Mock LLM responder for hot-path fixture tests** (issue #332, PR #360).
  `tests/fixtures/scenarios/<slug>/transcript.jsonl` immutable byte-snapshot
  format (ADR-0010, ADR-0012). Hot-path tests now replay against the mock
  responder so per-test latency drops from seconds to milliseconds.

- **`teamagent fixture replay` for moment dayjs gate** (issue #324, PR #324).
  Replays the canonical `moment-dayjs` fixture and asserts byte-equal
  transcript against the snapshot — used as the bottom-level (tier-a) gate
  in `docs/verify/E2E-LEARNING.md`.

- **TeamBrain landing page + product hook video** (issues #84, #94, #179,
  PR #4012ed). `apps/landing` ships variant A (minimalist), with a hero
  GIF that records the `teamagent try` flow end-to-end. Companion product
  hook video harness in `apps/landing/src/hooks-video/` (PR #94).

- **`/onboard` project skill for remote Mac bootstrap** (PR #201).
  Walks a non-technical user through node install, `claude` install,
  `claudefast` shim, and `teamagent init` over SSH — used for the
  remote macmini / Paperclip dogfood.

- **`/repo-issues-status` project skill** (PR #334). Surfaces open issues
  filtered by `grill-ready` / `grill-working` labels with a per-issue
  status table — what's claimed vs free, what's stale.

- **Soft-force upgrade prompt + `teamagent whatsnew`** (issue #225, PR
  #237). SessionStart now surfaces a three-choice banner
  (`--now` 立刻升级 / `--snooze` 下次再说 / `--never` 永远别问).
  Snooze backs off 24h → 48h → 7d. CHANGELOG-driven "what's new"
  bullets flow to the prompt, the post-init tail, and the new
  `teamagent whatsnew` command via one shared parser.
  `TEAMAGENT_NEVER_PROMPT=1` is the CI / dogfood-probe escape hatch.
  `teamagent update --enable` resets snooze + never_prompt to defaults.

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

### Changed

- **`teamagent install-user-hook` is now a soft-retire shim** — see 0.11.0
  for the deprecation banner. Hard removal scheduled for v1.0.

### Removed

- **`scripts/fixed-flow-watcher.sh` and
  `.github/workflows/fixed-flow-heartbeat.yml`** (PR #231, issue #229).
  FIXEDFLOW step 3-5 no longer supports any watcher / background poll /
  cron / auto-dispatch path. Maintainers invoke the `/fixed-flow-driver`
  skill manually inside a Claude Code session. The env vars
  `FIXEDFLOW_DRIVER_ENABLED` and `FIXEDFLOW_POLL_INTERVAL` are no
  longer read. Documented in `docs/FIXEDFLOW.md` v4.

- **`m5-infect` soft-suggest path** (issue #284, PR #383). Replaced by
  the new `teamagent required-check` hard gate. Calling
  `pnpm teamagent m5-infect` now prints a deprecation banner pointing
  at `teamagent init` and `teamagent required-check`.

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
