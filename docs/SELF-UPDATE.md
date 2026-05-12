```text
       ┌────────────────────────────────────────────────────────────┐
       │  TeamBrain Self-Update Lifecycle (auto-update)             │
       │                                                            │
       │  SessionStart ─► shouldCheckUpdate? ─► detached updater    │
       │   (each open)     (1h debounce)         (npm i -g release) │
       │                                                            │
       │   ~/.teamagent/                                            │
       │   ├── update-state.json   ◄── decision input + output      │
       │   ├── update.log          ◄── append-only audit trail      │
       │   └── rollback/<sha>/     ◄── backups (last 3)             │
       └────────────────────────────────────────────────────────────┘
```

# Self-Update / 自动升级

TeamBrain 的全局安装 (`teamagent` CLI) 会**在每次 Claude Code 会话开始时**静默检查并升级自己。本文是 user-facing canonical doc，权威来源是 `docs/superpowers/specs/2026-04-29-auto-update-design.md`（实现 spec，462 行）。

> **See also**: 升级**之后**用户怎么知道版本里加了啥、怎么暂停 / 永久关掉提示，见 [docs/features/soft-force-upgrade.md](features/soft-force-upgrade.md)（issue #225 — soft-force prompt + CHANGELOG-driven what's-new + `teamagent whatsnew` + `--snooze` / `--never`）。本文档管"轮询 + 安装"（POLL），soft-force-upgrade 文档管"安装后弹什么"（SHOW）。

## TL;DR

- **触发**：每次 `SessionStart` hook（即每开一次 Claude Code 都可能跑），但有 1 小时节流。
- **改什么**：`npm install -g https://github.com/libz-renlab-ai/TeamBrain/archive/refs/heads/release.tar.gz`，跑 `migrate-auto` 升级 SQLite，写 `~/.teamagent/update-state.json` + 备份旧版到 `~/.teamagent/rollback/<sha>/`。
- **看哪里**：`~/.teamagent/update.log`（append-only），`update-state.json`（当前状态）。
- **怎么关**：`touch ~/.teamagent/auto-update.disabled` **或** `export TEAMAGENT_AUTO_UPDATE=0`。

## 5 字段速查

| 字段 | 内容 |
|------|------|
| trigger | 每次 `SessionStart` hook；`shouldCheckUpdate()` 通过条件：未被 disabled、距上次 check ≥ `interval_hours`（默认 1h）、连续失败 < 3 次（或 24h 后重试） |
| impact scope | (a) global node_modules（`npm install -g https://github.com/libz-renlab-ai/TeamBrain/archive/refs/heads/release.tar.gz`，**改你的 `npm root -g`**）<br>(b) `~/.teamagent/update-state.json`（last_installed_sha / installed_at / consecutive_install_failures / pending_banner / interval_hours）<br>(c) `~/.teamagent/rollback/<sha>/`（升级前 dist 快照，最近 3 个）<br>(d) `~/.teamagent/update.log`（append-only）<br>(e) 升级后跑 `migrate-auto` → `migrate-v6` + `migrate-v7` 改 SQLite knowledge.db / global.db |
| audit trail | check 阶段静默；updater 子进程 `stdio:'ignore'`、`detached:true`；**全部** log 进 `~/.teamagent/update.log`；成功后 `pending_banner` 在**下次** SessionStart 由 stderr 提示 |
| opt-out | 三种任选其一：<br>1. `touch ~/.teamagent/auto-update.disabled`（文件存在即关）<br>2. `export TEAMAGENT_AUTO_UPDATE=0`（env var）<br>3. 连续 3 次失败后自动 24h 节流（被动 opt-out） |
| 关联 issue / 测试 | 实现 spec：`docs/superpowers/specs/2026-04-29-auto-update-design.md`<br>commit：`38e0a7e`、`fbcb4e1`、`312c419`、`043a947`<br>测试：`packages/cli/src/__tests__/updater-logic.test.ts` (7 case)、`session-start-update.test.ts`、`session-start-logic.test.ts` |

## 完整生命周期

```text
   ┌──────────────────────┐
   │ Claude Code starts   │
   └──────────────────────┘
              │
              ▼
   bin-session-start.cjs
              │
              ├─► decideAction(cwd, now)        ── auto-init / skip
              ├─► maybeShowPendingBanner()       ── stderr "升级到 v… 完成"（如有）
              └─► shouldCheckUpdate(now, state, env)
                       │
                  yes  │  no → exit 0
                       ▼
              spawnUpdater()  detached / stdio:'ignore'
                       │ (parent SessionStart 立即返回；updater 完全独立)
                       │
                       ▼
              ~/.nvm/.../bin-updater.cjs
                       │
                       ├─► writeUpdateState({ last_check_ts: now })
                       ├─► fetchRemoteSha()
                       │      GET api.github.com/repos/libz-renlab-ai/TeamBrain/branches/release
                       │      → body.commit.sha
                       │      失败（网络/限流）→ logUpdate("fetch-failed") → exit
                       │
                       ├─► remoteSha == last_installed_sha?
                       │      yes → logUpdate("up-to-date") → exit
                       │
                       ├─► backupCurrentInstall(last_installed_sha)
                       │      → ~/.teamagent/rollback/<sha>/ 存旧 dist 快照
                       │
                       ├─► runNpmInstall()
                       │      npm install -g https://github.com/libz-renlab-ai/TeamBrain/archive/refs/heads/release.tar.gz
                       │      失败 → restoreFromBackup → ++consecutive_install_failures → exit
                       │
                       ├─► runMigrateAuto()
                       │      链式跑 migrate-v6 + migrate-v7
                       │      失败 → restoreFromBackup → ++consecutive_install_failures → exit
                       │
                       └─► writeUpdateState({
                              last_installed_sha: remoteSha,
                              consecutive_install_failures: 0,
                              pending_banner: { from, to, at, shown: false }
                           })
                       │
                       ▼
              下次 SessionStart `maybeShowPendingBanner()` 拿到 banner、stderr 提示一次、置 `shown:true`。
```

## 状态文件 schema

`~/.teamagent/update-state.json`：

```json
{
  "last_check_ts": 1777886477718,            // ms epoch；上次 shouldCheckUpdate 通过时刻
  "interval_hours": 1,                        // 检查节流；默认 1
  "last_installed_sha": "2e783ae0...",        // 当前已装的 release commit SHA
  "last_installed_version": "0.10.1",         // 来自 release-meta.json
  "installed_at": 1778143872429,
  "consecutive_install_failures": 0,
  "last_install_error": null,
  "pending_banner": null,                     // 或 { from, to, at, shown: false }
  "reinstall_banner_shown_at": 0              // B-104: 安装失败时的 24h 节流 alert 时间戳
}
```

## 常见 failure modes

### ENOTEMPTY rename collision（已观察到）

`update.log` 出现：

```
npm install failed: ENOTEMPTY: directory not empty,
rename '<npm root>/teamagent' -> '<npm root>/.teamagent-<rand>'
```

原因：global node_modules 里另一个 npm 进程或 hook 持有 `teamagent/dist/*` 文件句柄（macOS / nvm 高发）。updater 触发 `restoreFromBackup`，旧版本恢复，`consecutive_install_failures += 1`。

排查：
```bash
lsof +D "$(npm root -g)/teamagent" 2>/dev/null   # 谁在拿 dist
ls "$(npm root -g)" | grep teamagent              # 是否残留 .teamagent-XXXXX 临时目录
```

修复：`rm -rf "$(npm root -g)/.teamagent-"*` 清理临时目录后下一次 SessionStart 重试；或手动 `npm install -g https://github.com/libz-renlab-ai/TeamBrain/archive/refs/heads/release.tar.gz`。

### 网络 / GitHub API 限流

`fetchRemoteSha()` 静默 fallback `null`，log 写 `fetch-failed`。下次 SessionStart 节流到了再试，对用户无感。

### 连续失败节流

`consecutive_install_failures >= 3` 且距上次 check < 24h → `shouldCheckUpdate()` 返回 false，updater 不再 spawn 直到 24h 过去 OR 用户手动重置（删 `update-state.json` 或修 `last_check_ts`）。

## inspection commands

```bash
# 当前状态
cat ~/.teamagent/update-state.json

# 最近事件
tail -50 ~/.teamagent/update.log

# 当前可回滚到的版本
ls ~/.teamagent/rollback/

# 全局装的版本
teamagent --version
ls "$(npm root -g)/teamagent/dist/" | head
```

## 关闭

```bash
# 永久关
touch ~/.teamagent/auto-update.disabled

# 或 env-level（per shell）
export TEAMAGENT_AUTO_UPDATE=0

# 重新打开
rm ~/.teamagent/auto-update.disabled
unset TEAMAGENT_AUTO_UPDATE
```

## 参考

- 实现 spec：`docs/superpowers/specs/2026-04-29-auto-update-design.md`（462 行）
- 实现 plan：`docs/superpowers/plans/2026-04-29-auto-update.md`（1968 行）
- 源码：`packages/cli/src/bin-updater.ts`、`updater-logic.ts`、`session-start-logic.ts`、`commands/migrate-auto.ts`
- postinstall：`packages/teamagent/postinstall.mjs`
- 测试：`packages/cli/src/__tests__/updater-logic.test.ts`、`session-start-update.test.ts`、`session-start-logic.test.ts`
- 触发审计入口：`docs/plans/issue-118/research.md` §7

## Token & ETag (issue #159)

`teamagent update --check` and the auto-updater both call `api.github.com` to
read the latest commit on the `release` branch. Two opt-in features make this
robust against rate limits.

### Token (skip the 60 req/h anonymous limit)

If any of the following env vars is set, the updater will send it as a Bearer
token, raising the GitHub limit to 5000 req/h:

- `TEAMAGENT_GITHUB_TOKEN` — TeamAgent-specific, recommended (won't collide
  with `gh` or other tools).
- `GITHUB_TOKEN` — common in CI environments.
- `GH_TOKEN` — used by `gh`. Picked up if neither of the above is set.

The token only needs `public_repo` read scope.

### ETag / conditional GET (zero-quota check when nothing changed)

The updater persists the response ETag in `~/.teamagent/update-state.json` and
sends `If-None-Match` on the next call. When upstream hasn't moved, GitHub
returns `304 Not Modified` which **does NOT count against the rate limit**.
The cached SHA is returned without a fresh fetch.

### Failure backoff

When the rate limit is hit (anonymous or authenticated), the updater waits
exponentially before retrying: 1h → 2h → 4h → 8h → 16h → 24h (capped). The
counter resets to 0 on the first successful fetch. This avoids hot-looping
against an exhausted quota.

### Error messages

`teamagent update --check` now classifies failures and surfaces a per-reason
message instead of the generic `fetch failed (network/rate-limit)`:

- `rate_limit_anonymous` → suggests setting `TEAMAGENT_GITHUB_TOKEN`.
- `rate_limit_authed` → "retry later".
- `auth` → token rejected / SSO-required.
- `not_found` → branch missing.
- `server` → 5xx, GitHub-side issue.
- `network` → connection refused / timeout / DNS.
- `parse` → upstream returned malformed JSON.

## PR-creator force-update

When a PR squash-merges into `main`, the CI workflow
`.github/workflows/release-branch.yml` resolves the PR's author via
`gh api .../commits/{sha}/pulls` and publishes their **public GitHub login**
into `latest.json` alongside the new version (see
`docs/features/auto-update-channel.md`). On the local box, the updater
then:

1. Calls `gatherLocalIdentity()` (a best-effort lookup of `gh api user --jq
   .login`, `process.env.GITHUB_USER`/`GH_USER`, and
   `git config user.email` for `<id>+<login>@users.noreply.github.com`).
2. Feeds those signals to the pure helper `isLocalUserPrCreator(…)`. Any
   single match (any signal, case-insensitive) returns `true`.
3. When matched, the resulting `pending_banner` is stamped with
   `pr_creator: true` and `pr_number: <N>`. On the next SessionStart,
   `maybeShowPendingBanner` renders a distinct banner naming the PR:

   ```
   🎯 TeamAgent: 你的 PR #348 已 merge — 自动更新到 0.11.6 (强制刷新)
      本次会话生效。详情: teamagent update --status
   ```

The install path itself is unchanged — the feature is **identity-aware
banner stamping** plus making sure your own merged-PR doesn't go un-noticed
on the box where you wrote it.

### What "force" means (and doesn't)

The PR-creator path **does**:

- Override `snooze` and `never_prompt` for the banner (the user still sees
  the new version even if they previously snoozed; this is intentional —
  you should see your own merge).
- Use the same install pipeline (`npm install -g <release tarball>` →
  `migrate-auto`) as every other update path.

The PR-creator path **does NOT**:

- Bypass the `auto-update.disabled` marker. If a user has hard-disabled
  auto-update, even their own merged PR won't trigger an install.
- Run a webhook, daemon, or background poller. It piggybacks on the
  existing SessionStart polling channel (~hourly Pages check). Worst case:
  ~1 hour delay between merge and the PR creator's next session updating.
- Publish anything beyond the public GitHub login — no email, no real
  name, no machine identifiers.

### Opt-out

The `auto-update.disabled` hard kill-switch (`touch
~/.teamagent/auto-update.disabled` or `TEAMAGENT_AUTO_UPDATE=0`) suppresses
the PR-creator force path as well as the regular update path. There is no
separate "PR-creator opt-out" — the feature only adds a banner; the install
is already happening anyway.

### Privacy

The `latest.json` schema gains three optional fields:
`pr_number`, `pr_creator_login`, `merged_at`. Only the public GitHub
**login** is ever published, never an email, real name, or PII. The
workflow validates the login against the strict GitHub charset
`^[A-Za-z0-9-]{1,39}$` before writing the file, defense-in-depth against
any future API quirk.
