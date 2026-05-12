---
date: 2026-05-07
audience: non-technical
schema-version: 1
---

```text
  git clone
      |
      v
  pnpm install       <-- 下载所有依赖（约 30–60 秒）
      |
      v
  pnpm build         <-- 把源码编译成可执行文件
      |
      v
  pnpm teamagent skeleton-demo  <-- 验证安装成功
      |
      v
  pnpm teamagent init  <-- 注册 hook（AI 犯错前提醒等）+ 状态栏 + 预热向量模型
      |                   ⚠ 跳过这一步会导致状态栏和 4 类 hook 都不生效
      |
  error? -------> fix 提示（见每个步骤的 common_errors）
      |
      v
    done!
```

# INSTALL.md — TeamAgent 安装指南

> 本文件同时被 **installer 脚本** 与 **AI 向导** 读取，是安装流程的唯一来源。
> 修改这里的说明，脚本与 AI 向导会自动同步更新。

---

## 推荐路径（issue #155 落地后；V1=1 单 prompt）

> **End user / AI 装 TeamBrain：** 一行 `curl|bash` 就够。装完自动跑 `teamagent init`。
>
> ```bash
> curl -fsSL https://raw.githubusercontent.com/libz-renlab-ai/TeamBrain/release/install.sh | bash
> ```
>
> 加 `--preview` 先看清单不装；加 `--skip-vector-model` opt-out 120MB 向量模型：
>
> ```bash
> curl -fsSL .../release/install.sh | bash -s -- --preview            # 只看清单
> curl -fsSL .../release/install.sh | bash -s -- --skip-vector-model  # 跳过向量模型
> ```
>
> **Contributor / 想改源码：** clone repo 后跑 `bash scripts/bootstrap.sh`，同样 1 prompt。
>
> ```bash
> git clone https://github.com/libz-renlab-ai/TeamBrain.git
> cd TeamBrain
> bash scripts/bootstrap.sh        # pnpm install + pnpm build + pnpm teamagent init
> bash scripts/bootstrap.sh --preview          # 仅看清单不装
> bash scripts/bootstrap.sh --skip-vector-model
> ```
>
> 5 段安装清单（写哪些文件、下多大模型、怎么 refuse）见 [`docs/install-manifest.txt`](docs/install-manifest.txt)。
> 中断后重跑 = 自动续 (底层幂等; 详见 [`docs/adr/0011-install-resumption-via-idempotency.md`](docs/adr/0011-install-resumption-via-idempotency.md))。

如果已经在源码 checkout 里，AI 向导或开发者也可以直接跑：

```bash
pnpm teamagent install
```

这条命令会先打印 `[config]` / `[skills]` / `[kb]` / `[download]` / `[refusal]` 五段清单，再只问一次确认；拒绝时不会写文件。向量模型预热在后台异步运行，`pnpm teamagent install` 不提供前台 `--skip-vector-model` flag。

---

## Dev fallback：手动 4 步（issue #155 落地后降级；保留是为了想分别看输出的开发者）

下面的 4 步 YAML schema 是 issue #155 之前的推荐路径。**新用户应该直接用上面的 install.sh 或 bootstrap.sh**；
但如果你是 dev、想分别看每一步的输出，或者推荐路径在你的环境出问题，下面的 4 步等价（手动跑而已，
prompt 数变成 4 而非 1）。

### Schema 说明（给开发者看）

每个安装步骤写成一个 fenced YAML 代码块，格式如下：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | 字符串 | 步骤唯一标识，如 `step-1` |
| `command` | 字符串 | 在终端里执行的命令（英文，可直接复制粘贴） |
| `explanation` | 字符串 | 用中文解释"这一步在做什么"，面向非技术用户，不超过 200 字 |
| `progress` | 字符串 | 当前步骤在整体流程中的位置，格式 `"i/N"`，如 `"1/3"` |
| `common_errors` | 列表 | 常见错误，每项包含 `pattern`（错误关键词，正则表达式）和 `fix`（可直接复制粘贴的修复命令） |

### 4-step 详细流程

```yaml install-step
id: step-1
command: pnpm install
explanation: |
  这一步会自动下载 TeamAgent 运行所需的所有"配件"（技术上叫依赖包）。
  类比：就像第一次用一台新电脑，系统要先下载并安装各种驱动程序，之后才能正常工作。
  首次执行大约需要 1–3 分钟，速度取决于网络状况。请耐心等待，看到"Done"或没有红色报错就表示成功。
progress: "1/4"
common_errors:
  - pattern: "command not found.*pnpm|pnpm.*not found|pnpm: No such file"
    fix: "npm install -g pnpm"
  - pattern: "EACCES|permission denied|access denied"
    fix: "sudo chown -R $(whoami) ~/.npm && pnpm install"
  - pattern: "ETIMEDOUT|network timeout|ECONNRESET|ENOTFOUND"
    fix: "pnpm install --prefer-offline"
```

```yaml install-step
id: step-2
command: pnpm build
explanation: |
  这一步把源代码"翻译"成计算机能直接运行的形式（技术上叫编译）。
  类比：就像把乐谱（源代码）演奏成实际能听的音乐（可执行程序）。
  执行过程中你会看到一些文字滚动，大约需要 30 秒到 1 分钟。
  执行完没有红色报错、最后看到类似"Build succeeded"的提示就表示成功。
progress: "2/4"
common_errors:
  - pattern: "Cannot find module|Module not found|ERR_MODULE_NOT_FOUND"
    fix: "pnpm install && pnpm build"
  - pattern: "error TS|TypeScript.*error|Type error"
    fix: "pnpm typecheck 2>&1 | head -40"
  - pattern: "ENOMEM|JavaScript heap out of memory|out of memory"
    fix: "NODE_OPTIONS=--max-old-space-size=4096 pnpm build"
```

```yaml install-step
id: step-3
command: pnpm teamagent skeleton-demo
explanation: |
  这一步运行一个"冒烟测试"，验证编译是否完全成功。
  类比：就像新买了电视，开机看能不能播放画面——不是真的在看节目，只是确认设备工作正常。
  成功时会在终端打印出一系列绿色的对勾（✓）和"demo complete"字样。
  注意：到这一步只是"代码能跑"，真正的产品功能（AI 犯错前提醒、纠正一次下次记住、状态栏统计）
  还没启用——下一步才会启用它们。
progress: "3/4"
common_errors:
  - pattern: "teamagent.*not found|cannot find.*teamagent|Unknown command.*teamagent"
    fix: "pnpm build && pnpm teamagent skeleton-demo"
  - pattern: "sqlite.*error|database.*locked|SQLITE_CANTOPEN"
    fix: "rm -f .teamagent/knowledge.db && pnpm teamagent skeleton-demo"
  - pattern: "ENOENT.*knowledge|no such file.*db"
    fix: "mkdir -p .teamagent && pnpm teamagent skeleton-demo"
```

```yaml install-step
id: step-4
command: pnpm teamagent init
explanation: |
  这一步把 TeamAgent 的"提醒贴纸"和状态栏正式贴到你这台机器的 Claude Code 配置里。
  类比：到上一步为止你只是把微波炉接通了电；这一步才把 4 张提醒贴纸（AI 即将动手前提醒、
  事后归因、经验自动注入上下文、每次结束自检）和门上的小屏幕（状态栏）都贴好。
  执行过程：注册 4 类 hook → 写入状态栏 → 注入 universal pack（约 15 条跨语言经验）→
  在后台预热语义匹配的向量模型（约 120MB，~10 分钟内静默完成）。
  执行完成后请重启你的 Claude Code（输入 /clear 或关闭重开），然后状态栏和提醒就生效了。
  ⚠ **跳过这一步**会导致：状态栏不显示、AI 犯错时不会提前提醒、纠正后下次还会犯同样的错——
  也就是说产品的核心卖点全部哑掉。如果你只跑了 step-3，请务必再跑一次 step-4。
progress: "4/4"
common_errors:
  - pattern: "Hook bundle not found|bin-pre-tool-use\\.cjs"
    fix: "pnpm --filter @teamagent/cli build:hook && pnpm teamagent init"
  - pattern: "EACCES|permission denied.*\\.claude"
    fix: "ls -la .claude/ && chmod -R u+rw .claude/ && pnpm teamagent init"
  - pattern: "warmup.*failed|onnxruntime|model.*download"
    fix: "pnpm teamagent init --skip-warmup    # 先装 hook，向量模型晚点再热"
```

---

## Upgrade — 卡在 v0.10.x 的 `secure crypto unusable`

如果跑 `teamagent --version` 或 `teamagent init` 直接炸：

```
Error: secure crypto unusable, insecure Math.random not allowed
    at detectPrng (.../dist/bin.js:...)
  source: 'ulid'
```

说明你装的是 **v0.10.x** — 这一版 `ulid` 被错误 bundle 进 ESM bin.js，Node 22
上 tsup 的 `__require("crypto")` 拿不到真 `crypto`，ulid 拒绝降级到
`Math.random` 就 throw 了。Issue #158 已修，落在 **v0.11.0**。

升级两条路：

1. **重跑 install.sh**（推荐 / end user）—— 自动拉 release 分支最新 build：
   ```bash
   curl -fsSL https://raw.githubusercontent.com/libz-renlab-ai/TeamBrain/release/install.sh | bash
   ```
2. **从源码 build 再 npm install -g**（contributor）—— clone 之后：
   ```bash
   cd TeamBrain
   pnpm install && pnpm --filter teamagent build
   npm install -g packages/teamagent       # 覆盖卡住的 v0.10.x
   teamagent --version                       # → 0.11.0
   ```

升级后再跑 `teamagent init`，如果父目录已经有 `.teamagent/`，会看到清楚的
`🛡️ 前置守卫: 嵌套项目守卫 ...` 报错；按提示 `cd` 到祖先项目，或加
`--force-nested-init` 创建独立子项目。

---

## 装机踩坑清单（issue #368）

下面这几条都真的把一个 teammate 卡住过——按顺序对照即可。

### a) `pnpm: command not found`

`pnpm install` 报 `command not found` / `pnpm: No such file`：先全局装 pnpm，再回到 step-1。

```bash
npm install -g pnpm
pnpm install
```

### b) 中国大陆网络 — `pnpm install` 卡死 / `sharp` / `vips` 下载超时

走镜像源，但**只用临时环境变量，不要动全局 `~/.npmrc`**（污染全局会影响别的项目）：

```bash
npm_config_registry=https://registry.npmmirror.com \
npm_config_sharp_libvips_binary_host=https://npmmirror.com/mirrors/sharp-libvips \
npm_config_sharp_binary_host=https://npmmirror.com/mirrors/sharp \
pnpm install
```

（Windows PowerShell：用 `$env:npm_config_registry='https://registry.npmmirror.com'; ...; pnpm install`，跑完后 `Remove-Item Env:npm_config_registry` 等清掉。）

### c) `teamagent init` 报 `Hook bundle not found` / `bin-pre-tool-use.cjs`

hook bundle 没 build 出来。先单独 build hook bundle，再重跑 init：

```bash
pnpm --filter @teamagent/cli build:hook
pnpm teamagent init
```

### d) 装完没数据上来？先**完全重启 Claude Code**

Stop hook（数字孪生 transcript 上传 + 学习管道）是在 Claude Code **下次启动**时才挂上的。`pnpm teamagent init` 之后必须**彻底退出并重开** Claude Code（关窗口重开，不是 `/clear`），Stop hook 才生效。

> 如果重启之后 dashboard 上还是看不到本机数据，跑 `teamagent doctor` 看 `digital-twin-uploader:` 那一行；显示 `BROKEN` 会附带具体原因，`teamagent digital-twin status` 的 `uploader log:` 段会给出 daemon 最近一次崩溃的错误行。

---

## 遇到没见过的报错？

如果遇到上面 `common_errors` 里没有覆盖的错误，请：

1. 把终端里完整的报错文字复制下来。
2. 在 Claude Code 里问：`我在执行 pnpm install/build/teamagent skeleton-demo 时遇到了以下报错：<粘贴报错>`。
3. 或者直接提交 bug report：`bash scripts/bugreport-collect.sh > /tmp/bug.md`，再把 `/tmp/bug.md` 贴进 https://github.com/libz-renlab-ai/TeamBrain/issues/new。
