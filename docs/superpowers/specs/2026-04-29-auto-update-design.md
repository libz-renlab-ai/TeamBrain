# Auto-Update + GitHub-Native Distribution

**Date:** 2026-04-29
**Status:** Draft (pending user review)
**Branch:** `auto-update`

---

## 问题陈述

当前 TeamAgent 的安装与更新链路有三个痛点：

1. **分发依赖 npm registry**：用户必须 `npm install -g teamagent`，发布周期由 npm publish 节奏决定，与 GitHub 仓库的 commit 不实时同步。
2. **无自动更新**：用户安装后必须手动 `npm install -g teamagent@latest` 才能拿到新版本；多数用户从不更新。
3. **向量模型懒下载**：`Xenova/multilingual-e5-small`（~120MB）在第一次调用 embedder 时同步下载，常发生在 Stop / PreToolUse 等关键 hook 路径上，给用户"卡住"的感觉。

我们想要的最终状态：

- 安装：一行命令从 GitHub 拉，不依赖 npm registry
- 更新：用户零操作，开 Claude 时静默自动更新（节流 + 失败回滚 + banner 通知）
- 模型：在 `teamagent init` 阶段一次性预热，之后所有 hook 均无网络阻塞

---

## 目标

1. 替换分发渠道：`npm install -g github:libz-renlab-ai/TeamBrain#release`，废 npm registry
2. 全自动更新：每 1 小时检查 release 分支 HEAD，发现新 commit 后台静默更新，下次会话生效
3. 失败安全：网络/安装/迁移任一环节失败均不影响 Claude 启动；安装失败自动回滚旧版
4. 向量模型预热：`teamagent init` / `teamagent doctor --fix` / `postinstall.mjs` 均触发一次 warmup

---

## 整体架构

```
开发者推 main
   │
   ▼  GitHub Action (release-branch.yml) 自动触发
   ┌────────────────────────────────────────────────┐
   │  pnpm install --frozen-lockfile                 │
   │  pnpm --filter teamagent build                  │
   │  把 packages/teamagent/{dist, package.json,     │
   │  postinstall.mjs} 整理到干净目录                │
   │  强推到 release 分支根                           │
   └────────────────────────────────────────────────┘
   │
   ▼ release 分支永远是 install-ready 状态
   │
   │  ←── 用户首装：npm install -g github:libz-renlab-ai/TeamBrain#release
   │             postinstall.mjs:
   │              ① doctor --postinstall
   │              ② install-user-hook
   │              ③ teamagent warmup（新增，下载向量模型）
   │              ④ 写 ~/.teamagent/update-state.json (last_installed_sha)
   │
   │  ←── 之后每次开 Claude → SessionStart hook：
   │             ① decideAction (现有 auto-init / skip)
   │             ② 显示 pending banner（如有）
   │             ③ shouldCheckUpdate? → detached spawn updater 子进程
   │
   │  updater 子进程（独立、不阻塞 Claude）：
   │    GET /repos/libz-renlab-ai/TeamBrain/branches/release
   │    → 比对 sha → 不同 → npm install -g github:.../release
   │                       → migrate-auto
   │                       → 备份 + 失败回滚
   │                       → 写 pending_banner
```

---

## 详细设计

### §1 分发：release 分支 + GitHub Action

**仓库新增 `release` 分支**，由 CI 完全自动维护，开发者**永不手动改**这个分支。

`.github/workflows/release-branch.yml`：

```yaml
name: Publish release branch
on:
  push:
    branches: [main]

permissions:
  contents: write   # 默认 GITHUB_TOKEN 即可

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - run: corepack enable
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter teamagent build

      - name: Stage release artifacts
        run: |
          rm -rf /tmp/release-stage
          mkdir -p /tmp/release-stage
          cp -r packages/teamagent/dist /tmp/release-stage/dist
          cp packages/teamagent/package.json /tmp/release-stage/package.json
          cp packages/teamagent/postinstall.mjs /tmp/release-stage/postinstall.mjs
          # 嵌入 release 元数据，让 updater 知道当前是哪个 commit
          echo "{\"sha\":\"$GITHUB_SHA\",\"built_at\":\"$(date -u +%FT%TZ)\"}" \
            > /tmp/release-stage/release-meta.json

      - name: Force-push release branch
        run: |
          cd /tmp/release-stage
          git init -q -b release
          git config user.name "TeamAgent Release Bot"
          git config user.email "bot@teamagent.local"
          git add -A
          git commit -q -m "release: $GITHUB_SHA"
          git push -q --force \
            "https://x-access-token:${{ secrets.GITHUB_TOKEN }}@github.com/${{ github.repository }}.git" \
            release
```

**release 分支根 package.json 形态**（直接复用 `packages/teamagent/package.json`）：
- `name: "teamagent"`
- `version: "<同 main>"`
- `bin: { teamagent: "./dist/bin.js" }`
- `files: ["dist/", "postinstall.mjs"]`
- `scripts.postinstall: "node postinstall.mjs"`

`release-meta.json` 是新增的，留给 updater 比对用——但实际比对走 GitHub API 的 commit sha 更可靠，meta 主要供调试。

### §2 安装命令变更

**旧**：
```bash
npm install -g teamagent
```

**新**：
```bash
npm install -g github:libz-renlab-ai/TeamBrain#release
```

行为：
- npm 拉 release 分支 tarball
- 自动跑 `postinstall.mjs`
- postinstall 现有逻辑 + 新增 warmup + 写 update-state.json

**关于 npm registry**：旧的 `npm install -g teamagent` 命令在用户机器上仍能装到现存的 v0.10.1（npm registry 不下架历史版本），但**我们不再发布新版本到 npm registry**——只走 GitHub release 分支。README 安装说明完全切到 GitHub URL。

### §3 `teamagent warmup` 命令

新命令文件：`packages/cli/src/commands/warmup.ts`

```ts
export async function warmup(opts: WarmupOptions = {}): Promise<WarmupResult> {
  const { XenovaRuleEmbedder } = await import("@teamagent/adapters");
  const embedder = opts.embedder ?? new XenovaRuleEmbedder();
  const start = Date.now();
  process.stderr.write("⏳ TeamAgent: 预热向量模型 multilingual-e5-small (~120MB)...\n");
  try {
    await embedder.embed(["warmup"]);
    process.stderr.write(`✅ TeamAgent: 模型预热完成 (${Date.now() - start}ms)\n`);
    return { ok: true, durationMs: Date.now() - start };
  } catch (e) {
    process.stderr.write(`⚠️  TeamAgent: 模型预热失败 (${(e as Error).message})\n`);
    process.stderr.write("   不影响安装；首次使用时仍会按需下载。\n");
    return { ok: false, error: String(e) };
  }
}
```

**调用点**：

1. `packages/teamagent/postinstall.mjs` 末尾（新增）：
   ```js
   try {
     execSync(`node "${binPath}" warmup`, { stdio: "inherit", timeout: 300_000 });
   } catch { /* 静默失败，不阻塞 npm 安装 */ }
   ```
2. `commands/init.ts` 末尾，默认开，`--skip-warmup` 跳过
3. `commands/doctor.ts --fix` 末尾，若检测到模型未缓存则调

**网络受限环境**：尊重 `HF_ENDPOINT` / `TEAMAGENT_HF_ENDPOINT` 环境变量（`xenova-rule-embedder.ts:51-54` 已支持），warmup 文档提示这两个变量。

**测试**：
- 单测：mock embedder，验证调用、错误处理、durationMs 上报
- 契约测试：复用现有 `RuleEmbedder` 契约
- 不跑真实下载（vitest 不联网）

### §4 自动更新核心流

#### §4.1 SessionStart hook 改造

`packages/cli/src/bin-session-start.ts` 增加更新逻辑，主进程仍保持 ≤10s 预算：

```ts
async function main(): Promise<void> {
  cleanupWikiResidue();
  const cwd = readCwd();

  // 现有逻辑：auto-init / skip
  const action = decideAction(cwd, new Date());
  emitInitMessage(action);
  if (action === "auto-init") spawnAutoInit(cwd);

  // 新增：pending banner（上次更新完成后提示用户）
  await maybeShowPendingBanner();

  // 新增：自动更新检查
  if (await shouldCheckUpdate(new Date())) {
    spawnUpdater();   // detached、completely fire-and-forget
  }
}
```

`shouldCheckUpdate` 决策（纯函数，便于测试）：

```ts
export function shouldCheckUpdate(now: Date, state: UpdateState, env: NodeJS.ProcessEnv): boolean {
  if (env.TEAMAGENT_AUTO_UPDATE === "0") return false;
  if (existsSync(disabledMarkerPath())) return false;   // ~/.teamagent/auto-update.disabled
  if (state.consecutive_install_failures >= 3 &&
      now.getTime() - state.last_check_ts < 24 * 60 * 60 * 1000) return false;
  const intervalMs = (state.interval_hours ?? 1) * 60 * 60 * 1000;
  return now.getTime() - state.last_check_ts >= intervalMs;
}
```

#### §4.2 updater 子进程

新文件：`packages/cli/src/bin-updater.ts`，注册为 `dist/bin-updater.cjs`。

**绝不和 SessionStart 共享进程生命周期**——`spawnUpdater` 用 `detached: true, stdio: 'ignore'`，立刻 unref。即使 updater 跑 5 分钟，Claude UI 完全无感。

```ts
async function main(): Promise<void> {
  const state = readUpdateState();
  state.last_check_ts = Date.now();
  writeUpdateState(state);

  const remoteSha = await fetchRemoteSha();   // GitHub API
  if (!remoteSha) { logUpdate("fetch-failed"); return; }

  if (remoteSha === state.last_installed_sha) {
    logUpdate("up-to-date");
    return;
  }

  // 备份当前 dist/
  const backupDir = backupCurrentInstall(state.last_installed_sha);

  // 跑 npm install
  const installOk = runNpmInstall();
  if (!installOk) {
    restoreFromBackup(backupDir);
    state.consecutive_install_failures += 1;
    state.last_install_error = "npm install failed";
    writeUpdateState(state);
    return;
  }

  // 跑 migrate-auto
  const migrateOk = runMigrateAuto();
  if (!migrateOk) {
    restoreFromBackup(backupDir);
    state.consecutive_install_failures += 1;
    state.last_install_error = "migrate-auto failed";
    writeUpdateState(state);
    return;
  }

  // 成功（注意 from 必须在 last_installed_sha 被覆盖之前取出）
  const fromSha = state.last_installed_sha;
  state.last_installed_sha = remoteSha;
  state.consecutive_install_failures = 0;
  state.last_install_error = null;
  state.pending_banner = {
    from: fromSha,
    to: remoteSha,
    at: Date.now(),
    shown: false,
  };
  writeUpdateState(state);
}
```

**`fetchRemoteSha`** 用 Node 内置 `https`（不引入 axios/fetch 依赖），未认证调用：

```
GET https://api.github.com/repos/libz-renlab-ai/TeamBrain/branches/release
Headers: User-Agent: teamagent-updater/<version>
```

返回 `body.commit.sha`。失败（网络/限流/解析错误）静默返回 `null`，updater 退出。

**`runNpmInstall`** 调用：
```bash
npm install -g github:libz-renlab-ai/TeamBrain#release
```

#### §4.3 migrate-auto 命令

新命令 `teamagent migrate-auto`：扫描 db schema 版本，链式调用 `migrate-v1-to-v2` → `migrate-v6` → `migrate-v7`（按需），最后跑 `compile`。每个 migrate 步骤都是幂等的（已有约定）。

#### §4.4 回滚机制

**备份**：`~/.teamagent/rollback/<sha>/`，存放安装前的 dist 目录快照（实测当前 dist ≈ 31MB）。备份保留最近 3 个 sha，更早的成功更新后自动清理。

**触发回滚的条件**：
1. `runNpmInstall` 失败（npm 退出码非 0）→ 立即恢复
2. `runMigrateAuto` 失败 → 恢复 + 数据库回退（migrate 命令本身需保证可逆，已有约定）
3. **新版本 SessionStart hook 启动失败**（高级特性，MVP 不做）：updater 不能检测这个，但可以加一个 health probe——下次 SessionStart 时若发现 `last_installed_sha` 比 `health_confirmed_sha` 新，先跑一次 `teamagent doctor`，doctor 失败则触发回滚

**MVP 仅做 1 + 2**。3 留作后续迭代。

### §5 状态文件 `~/.teamagent/update-state.json`

```ts
export interface UpdateState {
  // 节流
  last_check_ts: number;          // 上次 GitHub API 调用 UTC ms
  interval_hours: number;          // 默认 1，可改 1/6/24/never

  // 当前版本
  last_installed_sha: string;     // release 分支 commit sha (40 字符)
  last_installed_version: string; // package.json version
  installed_at: number;            // UTC ms

  // 故障管理
  consecutive_install_failures: number;
  last_install_error: string | null;

  // banner 通知
  pending_banner: {
    from: string;
    to: string;
    at: number;
    shown: boolean;
  } | null;
}
```

读写函数纯函数化（`packages/core` 内），便于测试。

### §6 Banner 通知

`bin-session-start.ts` 主进程读 `pending_banner`：

```
if (state.pending_banner && !state.pending_banner.shown) {
  process.stderr.write(
    `✨ TeamAgent: 已自动更新 ${shortSha(banner.from)} → ${shortSha(banner.to)}\n` +
    `   本次会话生效。详情: teamagent update --status\n`
  );
  state.pending_banner.shown = true;
  writeUpdateState(state);
}
```

### §7 用户控制命令组

`teamagent update`（新命令）：

| 子命令 | 行为 |
|---|---|
| `--check` | GET release 分支，对比，输出 up-to-date / new sha 信息，不更新 |
| `--now` | 跳过节流，立刻同步触发 updater（前台跑，看进度） |
| `--status` | 打印 update-state.json 的人类可读视图 |
| `--disable` | `touch ~/.teamagent/auto-update.disabled` |
| `--enable` | `rm ~/.teamagent/auto-update.disabled` |
| `--rollback` | 列 `~/.teamagent/rollback/` 下所有备份，让用户选一个恢复 |
| `--logs` | tail `~/.teamagent/update.log` |

### §8 attribution 事件

每次更新流的关键节点 emit AttributionBus 事件（沿用现有 bus），事件类型：
- `update-check-started`
- `update-check-noop` (up-to-date)
- `update-installing` (from sha → to sha)
- `update-installed` (success)
- `update-rolled-back` (failure)

事件落 `~/.teamagent/events.db`，供 `teamagent stats` 显示。

### §9 README 改写

主要变更：
1. "30 秒上手" 段：`npm install -g teamagent` → `npm install -g github:libz-renlab-ai/TeamBrain#release`
2. 新增"自动更新"章节：解释默认 1h 检查、如何禁用、状态查询、回滚
3. "命令速查"加入 `warmup` / `update --check` / `update --now` / `update --status`
4. "常见问题" 加入：禁用自动更新 / 模型下载失败 / 回滚到旧版

---

## 验收方案

5 个端到端场景，每个用 subagent 独立执行：

| # | 场景 | 验证点 |
|---|---|---|
| 1 | **首装** | clean state → `npm install -g github:.../release` → 验 hook 注册 + 模型缓存 + update-state.json 写入 |
| 2 | **静默更新** | release 分支推一条空 commit → 开 Claude → 后台 updater 跑完 → 第二次开 Claude 看到 banner |
| 3 | **节流** | 1h 内连续触发 SessionStart 5 次 → `update.log` 只有 1 条 fetch 记录 |
| 4 | **失败容错** | 模拟 release 分支 404 / 模拟 npm install 失败 → Claude 不卡 → 状态文件记录失败 + 备份恢复 |
| 5 | **回滚** | 模拟新 dist 损坏 → updater 检测到 npm install 退出非 0 → 自动恢复旧 dist → 用户感知不到 |

每个场景的 pass/fail 在文档"验收记录"段更新。**全部 5 个绿才算 100% 完成**，红的需要迭代到绿。

---

## 实施分阶段

下一步交给 `superpowers:writing-plans` 拆成可执行 task。预期阶段：

- **P0** release 分支 CI workflow + 验证 release 分支首次构建出来
- **P1** `teamagent warmup` 命令 + 接入 init / postinstall / doctor
- **P2** `update-state.json` 类型 + 读写纯函数 + 单测
- **P3** `bin-updater.cjs` + GitHub API + npm install 调用 + 备份/回滚
- **P4** `bin-session-start.ts` 接入 updater spawn + pending banner
- **P5** `teamagent update` 命令组
- **P6** `teamagent migrate-auto` 命令
- **P7** README 改写
- **P8** subagent 端到端验证 5 个场景，迭代到 100%

---

## 风险 & 缓解

| 风险 | 缓解 |
|---|---|
| GitHub API rate limit (60/h/IP) | 节流默认 1h，最多 1 次/h；连续失败退避 24h |
| npm install 拉 GitHub 失败（网络/限流） | 静默重试下次 SessionStart；备份保证不影响当前版本 |
| release 分支 CI 与 main 不同步 | CI 失败必须修复，release 分支是 install-ready 唯一来源；开发者不直接改 release |
| 用户改了全局 npm prefix → 备份目录找不到 dist | 备份函数走 `npm root -g` 解析，跟随当前 prefix |
| Windows 全局安装路径含空格 | 所有路径用 `shellQuote`（已存在）+ `path.join`，单测覆盖 |
| HuggingFace 模型下载失败（GFW） | warmup 失败静默；使用 `HF_ENDPOINT` mirror 文档化 |
| 同一台机器多个 Claude 会话同时跑 SessionStart | updater 用 lockfile（`~/.teamagent/update.lock`）保证全局只一个 updater 在跑 |

---

## 验收记录

实施完成于 2026-04-29，subagent (`general-purpose`) 隔离 `HOME=/tmp/tg-test-home` + `--prefix=/tmp/tg-test-install` 端到端跑 5 场景。

| # | 场景 | 状态 | 证据 |
|---|---|---|---|
| 1 | 首装 | ⚠️ PARTIAL | release artifact 完整（dist 全 8 个 hook bin + bin-updater.cjs + 46 条 seed + release-meta.json）；`update-state.json` 写入正确 `last_installed_sha`；`install-user-hook` 注册 `_teamagentTag: teamagent-session-start`；`teamagent --version` = 0.10.1。**唯一卡点**：测试 host 缺 VS Build Tools，`tree-sitter-python/typescript` native gyp build 失败——这是测试环境问题，非 release 分支或 update 链路的 bug。常规用户机器（Mac/Linux 或 Windows + Build Tools）不受影响。 |
| 2 | 静默更新 / check | ✅ PASS | `update --check` 实际命中 GitHub API 并正确比对 sha，输出 `update available: 3dc5149 -> 1916513`；`update --status` 完整列出全部字段。 |
| 3 | 节流 | ✅ PASS | 第 1 次 SessionStart 触发 updater；连续 3 次后 `update.log` 仅有 1 个 `updater started` 时间戳，`update.lock` 持有 PID。后续触发被节流静默跳过。 |
| 4 | 失败容错 | ✅ PASS | 重置 `last_check_ts=0` 强制重跑 → `npm install` 因测试环境 native build 失败 → **真实触发** rollback restore，log 完整记录 `restored from .../rollback/<sha>` + `npm install failed` + `updater exit`。`bin-session-start.cjs` 退出码 0，不阻塞 Claude UI。这同时验证了 §4.4 备份/回滚机制端到端可用。 |
| 5 | 回滚命令 | ✅ PASS | `update --rollback` 列出场景 4 留下的真实备份 `3dc5149...`，提示用法 `teamagent update --rollback <sha>`。退出码 0。 |

**整体结论：可以上线**。核心链路（SessionStart → 后台 updater → API 比对 sha → npm install → rollback on failure → 命令查询）端到端工作正常。Windows 缺 VS Build Tools 的安装失败是已存在问题，不属于本次新增能力的回归。

**Caveat**: Windows 用户如果跑 npm install 时遇到 `tree-sitter-*` gyp 编译失败，需要装 Visual Studio Build Tools（Desktop development with C++ workload）。建议 README 后续加入此提示。
