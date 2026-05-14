```text
   ┌────────────────────────────────────────────────────────────────────┐
   │   install-process debugging — 4 root-cause investigations          │
   │                                                                    │
   │   #1  install too slow      重依赖 + 串 120MB 模型 + 每小时重装    │
   │   #2  drains CC quota       Stop hook 每轮 spawn `claude -p`        │
   │   #3  "needs API key"       不是我们弹的，是 CC CLI 看到 env key   │
   │   #4  reinstall freezes     假卸载 → 新旧 hook/daemon 叠加         │
   │                                                                    │
   │   status : 调查完成（Phase 1），未实施修复。非 grill-ready。       │
   │   date   : 2026-05-14                                              │
   └────────────────────────────────────────────────────────────────────┘
```

# 安装过程 4 个 Bug 的根因调查

记录 2026-05-14 对四个安装期 bug 的 root-cause 调查（systematic-debugging Phase 1）。**只调查、未修复**——这几个问题还不是 grill-ready issue。本文档目的是把研究固化下来，防止后面忘记。

用户报告原文：

> 1 安装过程太久；2 在安装过程中把用户的 cc max 订阅额度刷空，原因未知；3 提醒需要 apikey 但是我们不需要这个，我们直接调用用户的 CC 订阅即可；4 卸载之后再重装，电脑系统会卡死。

## 四个 bug 的关系速查

| Bug | 类型 | 是否 install 期发生 |
|---|---|---|
| #1 太久 | 重依赖 + 串行模型下载 + 每小时重装 | 部分（安装期）+ 持续（updater） |
| #2 刷额度 | Stop hook 每轮 spawn `claude -p`，无全局节流 | **否**——装完后每轮对话 |
| #3 API key 提示 | 不是我们弹的，是 CC CLI 看到 env 里的 key 自己弹的 | 取决于 env 何时被污染 |
| #4 重装卡死 | 假卸载 → 新旧 hook/daemon 叠加 → 调度器饱和 | 重装期 + 之后持续 |

**共同线索**：#1 的 auto-updater 每小时重装、#4 的旧 daemon 不清理，都指向同一个系统性问题——**后台进程的生命周期管理（spawn 守卫、卸载清理、节流）整体缺失**。

---

## Bug #1：安装太久

**根因：包里挂了重型原生依赖 + 串了一个 120MB 模型下载，且每小时还会重装一次。**

| 证据 | 位置 |
|---|---|
| 重型原生依赖直接进 `dependencies`：`@xenova/transformers`、`onnxruntime-node@1.14.0`、`sqlite-vec@^0.1.9` | `packages/teamagent/package.json` |
| 根包又加了 `sharp`、`onnxruntime-node` | 根 `package.json` |
| `postinstall` 钩子：Stage 1 并行 `doctor` + `install-user-hook`（~15s 预算），Stage 2 `spawnDetachedWarmup()` 后台拉模型 | `packages/teamagent/postinstall.mjs`（行 316–364） |
| Stage 2 下载 ~120MB `multilingual-e5-small` 向量模型 | `packages/cli/src/commands/warmup.ts` `runWarmup()` |
| 中国网络下 `sharp`/`vips` 下载超时（项目自己记录的已知问题） | `INSTALL.md` §b |
| **放大效应**：自动更新间隔被设成 1 小时 | `packages/teamagent/postinstall.mjs`（行 ~504：`if (!state.interval_hours) state.interval_hours = 1;`） |
| auto-updater 每小时重跑完整 `npm install -g`（连原生依赖一起重建） | `packages/cli/src/bin-updater.ts` `runNpmInstall()`（行 239–255） |

**关键点**：用户"装完之后还会持续感觉在装"，其实是 auto-updater 在每小时重装。安装时长的地板是原生依赖的二进制下载/编译，叠加的是 120MB 模型下载。

---

## Bug #2：刷空 CC Max 订阅额度

**根因：学习用的 Stop hook 每轮对话都 spawn `claude -p` 跑 LLM 分析，用的就是用户登录的 CC 订阅；多项目并发时无全局节流。**

确认的调用链：

| 环节 | 位置 |
|---|---|
| `ClaudeCodeLLMClient` spawn 本机 `claude -p --output-format json` — **按设计复用用户 CC 订阅、不走 API key** | `packages/adapters/src/llm/claude-code-client.ts`（行 38–40 设计注释，行 68–110 `complete()`） |
| `buildLLMClient()` 构造 `ClaudeCodeLLMClient` | `packages/cli/src/bin-stop.ts`（行 407–414） |
| Step 1 analyze 调一次 | `packages/cli/src/bin-stop.ts`（行 486） |
| Step 5 scan-errors 再调一次 | `packages/cli/src/bin-stop.ts`（行 646） |
| 每检测到一个 correction 再发一次 LLM 调用 | `packages/cli/src/commands/analyze.ts`（行 225、260） |
| 节流只有 per-cwd 单例锁（issue #189），**只锁单个项目** | `packages/cli/src/bin-stop.ts` |
| 自述："observed 71 concurrent bin-stop.cjs hooks consuming 5+ GB RAM on an 8 GB Mac" | `packages/cli/src/bin-stop.ts`（行 1019–1021 注释） |

**重要澄清**：这个消耗发生在**装完之后、每一轮对话的 Stop 时刻**，**不是在 `npm install` 期间**。Stop hook 每轮对话都触发，每轮最多两次订阅额度消耗，再加每个 correction 一次。用户感觉"安装过程中被刷空"，是因为装完马上开 session 就开始烧 + auto-updater 每小时重装让人误以为还在安装期。开多个项目 = 多个 Stop hook 并发烧额度（per-cwd 锁锁不住跨项目）。

---

## Bug #3：提醒需要 apikey（但我们不需要）

**根因：TeamAgent 全代码库没有任何"需要 API key"的提示——这句提示是 Claude Code CLI 自己弹的。**

排查结论：

- `grep [Aa]pi[ _-]?[Kk]ey packages/cli/src` → `apiKey` 只出现在 `symphony.ts`（Linear tracker，跟安装无关）和测试文件。
- `grep ANTHROPIC_API_KEY packages` → 只出现在 `packages/digital-twin/src/bpp/mining/llm-client.ts`（BPP mining 的 anthropic-sdk provider，是 stub，不在热路径）。
- `release/install.sh` 全文读完：除了 `--safe` 模式的 `[y/N]` 确认，**没有任何 API key 提示**。结尾只是 `teamagent init`。

两个候选机制（**待用户确认**）：

1. **Claude Code CLI 自带的 "Do you want to use this API key?" 提示**——当环境里存在 `ANTHROPIC_API_KEY` 时，`claude` 第一次跑会弹。`ClaudeCodeLLMClient.defaultSpawner`（`packages/adapters/src/llm/claude-code-client.ts` 行 202–255）原样透传 `process.env`、不覆盖 `env`，所以被 spawn 的 `claude -p` 会继承 shell 里任何 `ANTHROPIC_API_KEY`。佐证：`scripts/user-collect/run-v3.sh:52` 正好 grep `"Do you want to use this API key?"` 这个字符串，说明这是已知的 CC CLI 交互提示。
2. **`claudefast` wrapper 在 env 里设了 MiniMax token**——如果某个 hook/进程经由 `claudefast` 或继承了它的环境，被 spawn 的 `claude` 同样会看到 key 并弹提示。

**诊断问题（需用户回答）**：弹这个提示的那台机器，shell profile（`.zshrc`/`.bashrc`）里是不是 export 了 `ANTHROPIC_API_KEY`，或者有 `claudefast` 的 alias/wrapper 在导出 token？这能直接区分是候选 1 还是候选 2。

**修复方向提示**（不在本次范围）：`defaultSpawner` 在 spawn `claude` 前从 `env` 里剥掉 `ANTHROPIC_API_KEY`，强制走订阅。

---

## Bug #4：卸载后重装，系统卡死

**头号缺口：`uninstall.ts` 从来不调用 `uninstallUserHook()`。** 卸载是"假卸载"，重装时新旧两代 hook/daemon 叠加，触发 `toohot`/ADR-0013 的调度器饱和卡死（同 `docs/debugging/toohot-many-bg-spare-workers.md`）。

5 个叠加成因：

| # | 成因 | 位置 |
|---|---|---|
| (a) | `uninstall()` 只删**项目级** hook（`uninstallHook({cwd})`），从不调 `uninstallUserHook()`——用户级 SessionStart hook + digital-twin Stop tap 卸载后依然注册在 `~/.claude/settings.json` | `packages/cli/src/commands/uninstall.ts`（行 55–142）；死代码 `uninstallUserHook()` 在 `packages/cli/src/commands/install-user-hook.ts:264` |
| (b) | `uninstall.ts` **不杀任何运行中的进程**——uploader daemon、embedder daemon、auto-updater 继续用旧代码路径跑 | `packages/cli/src/commands/uninstall.ts` |
| (c) | 不带 `--delete-data` 时 `~/.teamagent` 整个保留（含 staged 的 `bin-uploader.cjs`、含 `interval_hours: 1` 的 updater 状态）。重装后 = 两代 hook/daemon/状态并存 | `packages/cli/src/commands/uninstall.ts`（step 3 仅在 `--delete-data` 时删数据） |
| (d) | 重装时 `spawnDetachedWarmup()` **没有"是否已有 warmup 在跑"的守卫**——多个 ~120MB 模型的 warmup 子进程会叠起来 | `packages/teamagent/postinstall.mjs`（行 316–364） |
| (e) | `bin-session-start.ts` 每次 session 启动都 spawn embedder daemon + auto-updater + 跑 `runM5Session`。旧 hook 没删 + 新 hook 又注册 → 每次 session 启动 spawn 扇出翻倍 | `packages/cli/src/bin-session-start.ts`（行 149 embedder、行 227 updater、行 237–249 `runM5Session`） |

叠加 auto-updater 每小时 `npm install -g` → 这就是 `toohot`/ADR-0013 描述的调度器饱和冻结。

**注**：uploader daemon 本身有 PID 锁单例守卫（`packages/digital-twin/src/bin-uploader.ts:55` `acquirePidLock`），所以它是单例的；但 embedder daemon、warmup、updater 没有同等守卫。

---

## 修复建议（拆 issue 用，未实施）

按优先级：

1. **#4 最高**——是真"卡死系统"。最小修复：`uninstall()` 调用 `uninstallUserHook()` + 杀掉运行中的 daemon。根治：给 embedder/warmup/updater 都加 PID 锁单例守卫。
2. **#1 + auto-updater**——把 `interval_hours` 默认值从 1 改大（或改成"检查版本号、版本没变就不重装"），并考虑把重型原生依赖改成 optional / lazy install。
3. **#2**——Stop hook 加全局（跨项目）节流 / 频率上限；或把每轮 LLM 分析改成批量/采样。
4. **#3**——`defaultSpawner` spawn `claude` 前从 env 剥掉 `ANTHROPIC_API_KEY`。先等用户确认诊断问题。

拆 issue 时每条走 FIXEDFLOW（≤50 字 issue body + grill + `grill-ready` label）。

## 关联

- [`docs/debugging/toohot-many-bg-spare-workers.md`](toohot-many-bg-spare-workers.md) — #4 卡死的同种 scheduler-overload 病
- [ADR-0013](../adr/0013-inner-loop-on-ci.md) — scheduler-overload 的原始记录
- ADR-0001 — 两阶段安装设计（postinstall 并行 + 后台 warmup）
- `INSTALL.md` — 安装路径文档；§b 记录中国网络 `sharp` 超时
