# Research — issue #313 auto-update rate-limit

> Boris workflow step 1 (research → plan → annotate → implement → report).
> 实施前对现有 auto-update 代码、token 路径、退避机制、调用点的事实摸底。

## Current auto-update architecture

成熟度：mature。完整链路（按调用顺序）：

| 文件 | 角色 |
|------|------|
| `packages/cli/src/github-api.ts` | 唯一 HTTP layer。`fetchRemoteSha()` 打 `https://api.github.com/repos/libz-renlab-ai/TeamBrain/branches/release`，返回 discriminated `FetchShaResult`（`200 / 304 / 401 / 403 / 404 / 5xx / network / parse`）。 |
| `packages/cli/src/bin-updater.ts` | 后台 detached updater binary。从 SessionStart hook 启动。注入 `fetchRemoteSha` 闭包，闭包内每次调用从 disk 读最新 ETag + token，再调 `github-api.ts`。 |
| `packages/cli/src/updater-logic.ts` `runUpdater(deps)` | 真正的 state machine：lock → backoff guard → fetch → compare to `last_installed_sha` → npm install (`PACKAGE_SPEC` tarball) → `migrate-auto` → write `pending_banner` → emit `update-installed` event. |
| `packages/cli/src/commands/update.ts` `checkCmd / nowCmd / statusCmd / ...` | 用户主动触发路径。`checkCmd` 复用同一个 `fetchRemoteSha`。`nowCmd` 调用 `bin-updater.cjs` 子进程。 |
| `packages/core/src/update/update-state.ts` | `UpdateState` shape。**已有 `last_installed_version` 字段**（empty by default），可直接承担 version-based 比对。 |
| `packages/core/src/update/should-check.ts` | SessionStart 端的「现在该不该触发后台 updater」判断（interval、failure 计数）。本 issue 不动。 |
| `packages/cli/src/session-start-logic.ts` | SessionStart hook 入口；`maybeShowPendingBanner` / `maybeShowReinstallBanner` 在这里。Tier 3 「人话提示」需要在 reinstall banner 路径加一条。 |

## What's NOT broken

1. **ETag/304 cache hit** — 304 path 不消耗 quota（`github-api.ts:109-124`）。
2. **Exponential backoff** — 撞限速进 1h→2h→4h→...→24h 上限（`updater-logic.ts:79-94`）。
3. **Auth token path** — `resolveGithubToken()` 接 `TEAMAGENT_GITHUB_TOKEN > GITHUB_TOKEN > GH_TOKEN`（`commands/update.ts:26-31`），认证后 5000/hr。
4. **Binary fetch URL** — `PACKAGE_SPEC = https://github.com/libz-renlab-ai/TeamBrain/archive/refs/heads/release.tar.gz` 是静态资产 URL，**完全不打 api.github.com**。这条不动。
5. **Atomic state write under lock** — `withUpdateStateLock` + tmp + rename，已防 lost-update（issue #244 修过）。
6. **Field-ownership-aware merge** — `bin-updater.writeState` 只 overlay updater-owned fields，不冲掉 foreground-owned snooze 状态（issue #244）。

## What IS broken (#313 root cause)

匿名 cold-start 场景下：

1. `fetchRemoteSha()` 打 `api.github.com` 走 60 req/hr/IP 匿名通道。
2. 共享 NAT / 移动出口 / CI runner / 同事们共享一个出口 IP → 几人凑一凑 60 通用完。
3. GitHub 回 `403 + X-RateLimit-Remaining: 0` → `result.reason === "rate_limit_anonymous"`。
4. `runUpdater` 进入指数退避：`next_check_after_ts = now + 2^(n-1) * 3600 * 1000`，n 加到 5+ → **退避窗口最长 24h**。
5. 这 24h 期间：
   - `runUpdater` 看到 `next_check_after_ts > now` → `return`，啥都不做（`updater-logic.ts:60-63`）。
   - `checkCmd --check` 同样判这个字段 → 返回 `auto-updater backoff active until <iso>; skip\n`，但**用户极少跑 `--check`**，所以这条消息基本不会被看到。
   - SessionStart banner 路径不会因为「更新失败」而提示用户做任何事 —— 只有 `consecutive_install_failures` 累积时才走 `maybeShowReinstallBanner`，而本 issue 的失败发生在更早的 fetch 阶段，**不累 install_failures**。
6. 用户视角：「软件死活不更新，没报错」= silent failure。
7. 下游症状：用户卡在 0.10.1（合并的 #305 描述），statusline 看不见 0.11.x 才有的 `TeamAgent | 规则:2 | 帮过:...` 行。

## Token 路径为什么不是默认解

技术上 `TEAMAGENT_GITHUB_TOKEN=xxxxxx` 一行环境变量即可 5000/hr 不撞限速。但：

1. **end user 不会主动配 token** —— 个人用户/团队成员不熟悉 GitHub PAT 概念。
2. **token 管理负担违背 "easy install" 卖点** —— README 三大业务特性都假设用户「装好就工作」。
3. **token 泄露风险** —— 写 shell profile 容易 leak（git commit、screenshot、远程截屏）。

因此 cold-start 匿名是 **default 用户体验**，必须正面 handle，不能让用户用 token 绕。

## 调用点清单（version-check 改写时要全部覆盖）

直接命中 `fetchRemoteSha` 的位置（grep 结果）：

| 文件:行 | 用途 | 改造决策 |
|---------|------|---------|
| `packages/cli/src/bin-updater.ts:53,313-321` | `import { fetchRemoteSha }`；闭包注入 `runUpdater.fetchRemoteSha` deps | 改造：闭包替换为新 `fetchLatestVersion`，`runUpdater` 接口加 `fetchLatestVersion`（保留 `fetchRemoteSha` 字段以兼容现有 mock，但 runUpdater 调用 `fetchLatestVersion`） |
| `packages/cli/src/commands/update.ts:14, 275, 287-292` | `checkCmd` 直接调 `fetchRemoteSha` | 改造：改调 `fetchLatestVersion` |
| `packages/cli/src/updater-logic.ts:7, 25, 72` | `UpdaterDeps.fetchRemoteSha` type + `result = await deps.fetchRemoteSha()` | 改造：接口新增 `fetchLatestVersion()`，runUpdater 主路径改调它；保留旧字段为 deprecated 但不再触发主路 |

非 version-check 用途（保留）：

| 文件 | 用途 | 保留原因 |
|------|------|---------|
| `packages/cli/src/__tests__/update.test.ts` | 单元测试 mock | 保留旧测试覆盖 fetchRemoteSha；新加 fetchLatestVersion 测试 |
| `audit/runners/feature-09-wiki.ts` | audit/non-runtime | 与 #313 无关 |
| `packages/cli/src/commands/bug-report.ts` | 收集 bug 报告 metadata | 不在 cold-start path |
| `packages/cli/src/__tests__/session-start-update.test.ts` | SessionStart updater 链路测试 | 改造 mock 输入 |

## Release publish workflow

`.github/workflows/release-branch.yml` — 当前职责（pull from main pre-research）：每次 main branch 有 release-able 提交时把 release branch 同步 +（可能）发 npm。需要扩展的 step：

- 在 release branch 推送之后，生成 `latest.json`（schema 见 plan.md）并提交到 `gh-pages` 分支。
- 使用 `actions/checkout` + `peaceiris/actions-gh-pages` 或同等的 commit-to-branch action。
- `latest.json` 写在 `gh-pages` 分支根目录，对应 URL `https://libz-renlab-ai.github.io/TeamBrain/latest.json`。

GitHub Pages 已 deploy（landing page 已 live），不需要重新 enable。

## npm registry 兜底语义

`https://registry.npmjs.org/teamagent/latest` 返回 JSON，包含 `version` / `dist-tags` 等。无 rate-limit（npm 自身基础设施级稳定）。Trade-off：

- 滞后：`docs/PUBLISHING.md` 规则「Publish per 10 PRs」→ npm `latest` 比 release branch HEAD 慢 ~1 周。
- 但仅在 Pages 主路挂掉时才会调用 npm，**普通情况用户感知不到**。

## Out of scope for #313

- 改 npm 发布频率（`docs/PUBLISHING.md` policy 不在本 issue 改）。
- 改 binary 分发（仍是 `release.tar.gz`）。
- 加 `git ls-remote` / CDN proxy 第三条路（grill 决策：三层架构已足够）。
- 调 backoff 算法（不再触发主路即不再有意义）。
- 把 PAT 打包进 npm tarball（安全违规，明确禁止）。

## Tests / mocks landscape

`packages/cli/src/__tests__/update.test.ts` 用 `httpsGet` 注入。新 helper 同样要支持 `httpsGet` 注入以便单测覆盖：

- Pages 200 / Pages 5xx / Pages timeout / Pages 404 / Pages malformed JSON
- npm 200 / npm 5xx / npm timeout
- Pages OK → 不调 npm（短路）
- Pages fail → 调 npm fallback
- 全失败 → discriminated failure 含两侧 reason
- **任何场景 0 个调用打 api.github.com**（mock 验证）

Windows-specific 注意（CLAUDE.md §已知限制）：vitest `fileParallelism: false`，测试单进程跑；OOM 风险已 mitigate。
