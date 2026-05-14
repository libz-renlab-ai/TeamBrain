```text
   ┌────────────────────────────────────────────────────────────────────┐
   │  install-process debugging — root causes (transcript-corrected)    │
   │                                                                    │
   │  #1 install hangs    ┐                                             │
   │  #2 drains CC quota  ├ ONE root cause: init LLM rule-import loop    │
   │  #3 "needs API key"  ┘ (231 rules x serial `claude -p`)            │
   │  #4 reinstall freeze   uninstall never cleans user hooks/daemons   │
   │  #5 hooks all DOA      node:sqlite not inherited by hook subprocs  │
   │                                                                    │
   │  corrected 2026-05-14 by the #445 real-install transcript          │
   │  live: #445 anchor · #446 evidence · #477 (=#5); #459/60/61 sep.   │
   └────────────────────────────────────────────────────────────────────┘
```

# 安装过程 Bug 的根因调查

记录 2026-05-14 对安装期 bug 的 root-cause 调查（systematic-debugging Phase 1）。

> **2026-05-14 修订**：本文档初版（PR #464）的 Bug #1 / #2 根因是**错的**——基于只读代码的推断。一份真实安装 transcript（挂在 issue [#445](https://github.com/libz-renlab-ai/TeamBrain/issues/445) 上）证伪了它，并暴露了一个初版完全没有的 DOA 级 bug（#5）。本次修订以 transcript 一手证据为准。**live tracking 已迁到 GitHub issues**（见文末「关联」），本文档定位为修正后的历史调查记录。

用户报告原文：

> 1 安装过程太久；2 在安装过程中把用户的 cc max 订阅额度刷空，原因未知；3 提醒需要 apikey 但是我们不需要这个，我们直接调用用户的 CC 订阅即可；4 卸载之后再重装，电脑系统会卡死。

## 速查

| Bug | 根因 | live issue |
|---|---|---|
| #1 太久 / 挂死 8+ 分钟 | `teamagent init` 的 LLM 规则导入循环 | #445（正主） |
| #2 烧 CC 订阅额度 | **同上** —— 导入循环 spawn `claude -p` × 231 | #445 |
| #3 提示需要 API key | **同上** —— 导入步骤设计上要 key，用户只有 CC 订阅 | #445 / #446 |
| #4 卸载后重装卡死 | `uninstall` 从不清理用户级 hook / 不杀 daemon | 暂未单独立 issue（见下） |
| #5 hook 全部 DOA | hook 子进程继承不到 `NODE_OPTIONS`，`node:sqlite` 报错 | #477 |

**关键修正**：#1 / #2 / #3 **不是三个独立 bug，是同一个根因的三个症状** —— `teamagent init` 的 LLM 规则导入步骤。初版文档把它们当三件事、还编了个「后台进程生命周期」的共同线索，那是错的。

---

## Bug #1–#3：同一根因 —— `init` 的 LLM 规则导入循环

**根因：`teamagent init` 默认跑 LLM-based 规则导入 —— 把项目里的 231 条规则（91 条 CLAUDE.md + 140 条 .cursorrules）逐条串行 spawn `claude -p` 提炼，每条 ~10–21 秒，无 timeout、无进度、pnpm 把 stdout 全 buffer 到结束才 flush。**

一手证据（issue #445 附带的真实安装 transcript，非技术用户，macOS）：

| 现象 | transcript 证据 |
|---|---|
| 第一次 `init` 挂死 9 分 40 秒、无任何输出 | "Sautéed for 9m 40s"；子进程是 `claude -p --output-format json --no-session-persistence` 在干等 |
| `pnpm install` **正常**，2 分钟 | 初版把「重型 npm 依赖」当 #1 根因 —— **证伪** |
| 120MB 向量模型 warmup **正常**，48 秒 | 它是后台 detached 下载、根本不挡安装 —— 初版「串 120MB 模型」**证伪** |
| `--skip-import` 后 `init` 秒过 | 证明挂死 100% 来自导入循环 |
| 重跑导入：8.5 分钟 24 次 `claude -p`、db 一条没涨 | 烧着额度还**可能全失败** |
| transcript 最后一行 | `You've hit your limit · resets 8:20pm` —— **用户 Claude Max 订阅额度被烧穿** |

代码定位：

| 环节 | 位置 |
|---|---|
| `init` 主流程调用规则导入 | `packages/cli/src/commands/init.ts:271` `doImportRules(...)` |
| 导入函数本体 | `packages/cli/src/commands/init.ts:952` `doImportRules()` |
| 构造 LLM client（spawn `claude -p` 的源头） | `packages/cli/src/commands/init.ts:1022` `new ClaudeCodeLLMClient()` |
| 唯一逃生阀 `--skip-import`（只在 `--help` 可见） | `init.ts:1002`（gate）、`init.ts:1907`（flag 解析） |
| `ClaudeCodeLLMClient` 实际 spawn `claude -p` | `packages/adapters/src/llm/claude-code-client.ts` `complete()`（行 68–110） |

**三个症状如何从这一个根因长出来：**

- **#1 太久** = 231 次串行 LLM 调用，估 30–60 分钟，进度不可见（pnpm buffer stdout）。
- **#2 烧额度** = 每次 `claude -p` 都走用户登录的 CC 订阅，231 次直接烧穿。**这才是 transcript 里真正烧穿额度的地方** —— 初版定位的 `bin-stop.ts` Stop hook 是另一个**次要**烧额度点（装完后每轮对话各一次），真实 transcript 里把用户烧穿的是 `init` 导入循环、不是 Stop hook。
- **#3 要 API key** = 导入步骤设计上认为需要 `ANTHROPIC_API_KEY`（`init --help` 明写），而用户只有 CC 订阅、没有 key。注意：`claude -p` 本身能用订阅（transcript 里手动 `echo ... | claude -p` 14 秒就回了），所以问题是 `init` 导入步骤的**消息 / 门禁设计**，不是 `claude -p` 不能用订阅。

> 初版 #3「是 CC CLI 看到 env 里的 key 自己弹的」那套——`defaultSpawner` 透传 `ANTHROPIC_API_KEY`、CC CLI 自弹「Do you want to use this API key?」——作为**次要可能机制**保留（env 被污染时确实会这样），但 transcript 里的主线是 `init` 导入步骤本身要 key。

---

## Bug #4：卸载后重装，系统卡死

> 注意：#445 transcript **没有**复现 #4（它是首次安装、没有「卸载→重装」）。#4 来自用户口头报告 + 代码调查。卡死/过热那一簇另有三个活跃 issue（#459/#460/#461），**是不同机制**，见文末「关联」。

**头号缺口：`uninstall.ts` 从来不调用 `uninstallUserHook()`。** 卸载是「假卸载」，重装时新旧两代 hook/daemon 叠加。

| # | 成因 | 位置 |
|---|---|---|
| (a) | `uninstall()` 只删项目级 hook，从不调 `uninstallUserHook()` —— 用户级 hook 卸载后仍注册在 `~/.claude/settings.json` | `uninstall.ts`（行 55–142）；`uninstallUserHook()` 在 `install-user-hook.ts:264`，经 `uninstall-user-hook` 子命令可达，但 `uninstall` 命令从不调它 |
| (b) | `uninstall.ts` 不杀任何运行中的进程 | `uninstall.ts` |
| (c) | 不带 `--delete-data` 时 `~/.teamagent` 整个保留 → 重装后两代状态并存 | `uninstall.ts` |
| (d) | postinstall 的 `spawnDetachedWarmup()` spawn 点无守卫 | `postinstall.mjs`（行 316–364） |
| (e) | `bin-session-start.ts` 每次启动 spawn embedder + updater + `runM5Session`，新旧 hook 都注册 → spawn 扇出翻倍 | `bin-session-start.ts`（行 149 / 227 / 237–249） |

**守卫现状修正**（初版这段不准）：

- embedder daemon：**有**单例守卫（`~/.teamagent/.embedder-state.json` per-machine state + Race α/β 锁，Issue #164/#315）—— 但有个已知洞：`daemon-first-embedder.ts:111` / `:125` 的 `status === 'starting'` 检查不验 pid 存活，daemon 启动中崩溃会永久卡死（见 live issue **#450**）。
- updater：**有**守卫（`bin-updater.ts` 的 `update.lock` re-entry gate + 时间节流）。
- uploader daemon：**有**守卫（`packages/digital-twin/src/bin-uploader.ts:55` `acquirePidLock`）。
- **真正无守卫的只有 warmup 的 spawn 路径**：`spawnDetachedWarmup` 不查「是否已有 warmup / 模型是否已缓存」；`runWarmup` 的 pid-liveness 检查只在「依赖缺失」那个 skip 分支里，正常下载路径不礼让。

初版「embedder daemon、warmup、updater 没有同等守卫」是错的 —— 只有 warmup spawn 路径弱。

---

## Bug #5：hook 全部 DOA（`node:sqlite` 未被 hook 子进程继承）

**根因：hook bundle 硬 `require('node:sqlite')`（Node 的实验性内置模块，需较新 Node 版本 + `--experimental-sqlite` flag 才可用）。CLI 手动调用可以用 `NODE_OPTIONS='--experimental-sqlite'` 绕过，但 hook 是 Claude Code spawn 的子进程，继承不到调用方 shell 的 `NODE_OPTIONS` → 旧版 Node 上每个 hook、每次事件都报 `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`。**

一手证据（同 #445 transcript）：

- 用户 Node 23.3.0。`init` / `doctor` / `skeleton-demo` 加 `NODE_OPTIONS` 能跑。
- 但 `PreToolUse:Bash hook error` / `PostToolUse:Bash hook error` / `Stop hook error` / `UserPromptSubmit hook error` **每个事件都报**，栈顶：`~/.teamagent/hooks/bin-stop.cjs:46011` `require('node:sqlite')` → `ERR_UNKNOWN_BUILTIN_MODULE`。
- 净效果：**「装好了」但整个产品是死的** —— 学习管道、L0 门闸、状态栏全部在每次事件上崩。

这是 transcript 里**最严重**的 bug，初版文档完全没有。live issue：**#477**（DOA 级）。

---

## 旁证：非开发者被领上开发者安装路径

transcript 里用户明说「我是使用者，不是开发者」，但 `install-walkthrough` skill 仍让他走 `git clone` → `pnpm install` → `pnpm build` → `pnpm teamagent init` —— 完整开发者工具链（pnpm 版本地狱、build、`NODE_OPTIONS`）。真·终端用户应走 `npm install -g` 或 `curl|bash release/install.sh`。这个路由问题放大了 #1–#5 的所有摩擦。（暂未单独立 issue。）

---

## 修复优先级（未实施；以 live issue 为准）

1. **#5（#477）最高 —— DOA。** hook 全挂 = 产品装了等于没装。修复方向：hook bundle 不依赖 `node:sqlite`，或安装时把 `NODE_OPTIONS` 写进 hook 注册的 command 里。
2. **#1–#3（#445/#446）** —— `init` 规则导入循环。方向：导入默认 opt-in 或后台异步、加 timeout/进度、明确支持「用 CC 订阅而非 API key」、串行改批量/采样。
3. **#4** —— `uninstall()` 调 `uninstallUserHook()` + 杀 daemon；warmup spawn 路径补守卫；#450 的 `status === 'starting'` 加 pid 校验。

## 关联

**Live issues（source of truth）：**

- [#445](https://github.com/libz-renlab-ai/TeamBrain/issues/445) —— #1–#3 簇正主，附真实安装 transcript
- [#446](https://github.com/libz-renlab-ai/TeamBrain/issues/446) —— #1–#3 并列一手证据
- [#477](https://github.com/libz-renlab-ai/TeamBrain/issues/477) —— #5 `node:sqlite` hook 全 DOA
- [#450](https://github.com/libz-renlab-ai/TeamBrain/issues/450) —— embedder daemon stale `starting` 状态永不重启
- [#459](https://github.com/libz-renlab-ai/TeamBrain/issues/459) / [#460](https://github.com/libz-renlab-ai/TeamBrain/issues/460) / [#461](https://github.com/libz-renlab-ai/TeamBrain/issues/461) —— 卡死/过热簇（SessionEnd storm + bg-spare 泄漏），**与 #4 是不同机制**

**文档：**

- [`docs/debugging/toohot-many-bg-spare-workers.md`](toohot-many-bg-spare-workers.md) — scheduler-overload 病的 post-hoc kill recipe
- [ADR-0013](../adr/0013-inner-loop-on-ci.md) — scheduler-overload 的原始记录
- ADR-0001 — 两阶段安装设计（postinstall 并行 + 后台 warmup）
- `INSTALL.md` — 安装路径文档
