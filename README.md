# TeamAgent

> **给 Claude Code 装一个会学习的大脑** · 自进化 AI 规则引擎
> *Self-evolving rule engine for Claude Code and Codex — learn from every mistake, never repeat it.*

[![npm](https://badge.fury.io/js/teamagent.svg)](https://www.npmjs.com/package/teamagent) ![Node ≥22](https://img.shields.io/badge/node-%3E%3D22-green) ![tests 3251 passing](https://img.shields.io/badge/tests-3251%20passing-brightgreen) ![open bugs](https://img.shields.io/badge/open%20bugs-0-brightgreen) ![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

---

## 为什么需要它

你有没有过这种经验？

- AI 第 5 次想给你装 `moment`，你第 5 次告诉它"不要，用 dayjs"
- AI 又一次硬编码了你机器的绝对路径
- 某个团队约定，新会话又解释一遍
- "这个我们上次讨论过呀..." — 它忘了

**Claude Code 没有跨会话的长期记忆。每一次都是从零开始。**

TeamAgent 解决这件事：从你纠正它的每一次对话里，自动**提炼出可复用的规则**，下次它要再犯同样的错时，**在工具调用前就拦住**。

---

### 快速安装（V1=1 单 prompt，issue #155 落地后）

```bash
# 推荐：直接 curl|bash — 装完自动跑 teamagent init，1 个授权弹窗就够
curl -fsSL https://raw.githubusercontent.com/libz-renlab-ai/TeamBrain/release/install.sh | bash
```

或者先 review 再执行：

```bash
curl -fsSL https://raw.githubusercontent.com/libz-renlab-ai/TeamBrain/release/install.sh -o /tmp/teambrain-install.sh
bash /tmp/teambrain-install.sh --preview          # 看 5 段清单不装
bash /tmp/teambrain-install.sh                    # 装好再用
```

可选 flag：
- `--preview` 仅打印 5 段安装清单 (`[config]/[skills]/[kb]/[download]/[refusal]`)，不装；
- `--skip-vector-model` opt-out 120 MB 向量模型加载（写 `~/.teamagent/.skip-vector-model` marker）；
- `--skip-init` 装 binary 但不自动 `teamagent init`（CI / 高级用户用）。

5 段清单 canonical 源：[`docs/install-manifest.txt`](docs/install-manifest.txt)。
中断后重跑 = 自动续（幂等；详见 [`docs/adr/0011-install-resumption-via-idempotency.md`](docs/adr/0011-install-resumption-via-idempotency.md)）。

校验文件（SHA256）：[`install.sh.sha256`](https://raw.githubusercontent.com/libz-renlab-ai/TeamBrain/release/install.sh.sha256) — 由 `release-branch.yml` 工作流随 release 分支自动发布；GitHub Release 资产里也附带一份同名文件。
参考：[release-prep/install-sh-checklist.md](release-prep/install-sh-checklist.md)

#### Contributor / 想改源码

```bash
git clone https://github.com/libz-renlab-ai/TeamBrain.git
cd TeamBrain
bash scripts/bootstrap.sh        # pnpm install + pnpm build + pnpm teamagent init (V1=1)
```

bootstrap.sh 同样支持 `--preview` / `--skip-vector-model` / `--skip-init` flag。
若想分步看每条命令的输出，参见 [`INSTALL.md` 的 dev fallback](INSTALL.md)（4 步 pnpm 流程，issue #155 之前的推荐路径，现保留作 dev fallback）。

`teamagent init` 约 30 秒完成：注册 PreToolUse hook、注入 universal pack（~15 条跨语言
avoidance 规则）、立即可拦截。背景任务将在 ~10 分钟内静默升级为 BM25+dense 语义匹配。

---

### 立即验证（30 秒内看到第一次拦截）

```bash
teamagent try
```

`try` 命令是 30 秒一键体验入口，依次播放 5 个经典 PreToolUse 拦截场景（含 `moment → dayjs`
纠正 → 下一会话被拦截的完整闭环）。GIF 演示同样展示这些时刻（[见 landing page](https://libz-renlab-ai.github.io/TeamBrain/)）。
进阶用法见 `teamagent demo --help`。

---

### 注意事项

- **建议先 review install.sh**（`curl ... -o /tmp/... && cat ...`），确认来源和内容，
  再决定是否执行。这是 P4 mitigation P4-M04 的最佳实践建议。
- `install.sh` 固定来自仓库 `release` 分支根目录，不依赖自有域名。
- 安装过程中不需要 SSH key，走 HTTPS tarball。

---

## AI guidance — `pnpm teamagent install`

```bash
pnpm teamagent install
```

会跑 `pnpm` 的开发者和 AI coding agent 用这个单步入口：它会先打印 5 段安装清单，再用一次确认完成 hooks、团队插件、用户级 hook、后台向量模型 warmup，并在结尾跑 health check。

<details>
<summary>不能 curl 的环境（离线、Windows PowerShell、CI 容器）— 用 tarball URL 直装</summary>

```bash
npm install -g https://github.com/libz-renlab-ai/TeamBrain/archive/refs/heads/release.tar.gz
```

为什么用 tarball URL 而不是 `npm install -g github:libz-renlab-ai/TeamBrain#release`？
npm 的 `github:` shorthand 默认走 SSH（`git+ssh://git@github.com/...`），没配 SSH key 的机器（绝大多数 Windows 用户、CI/容器）会直接失败。tarball URL 走 HTTPS，绕开 git clone，更稳定。

</details>

之后**不用做任何事**——继续正常开发，TeamAgent 自动学习 + 自动更新。

---

## 实时 dashboard

想看真实规则和 Hook 事件的实时变化，直接在项目根目录启动：

```bash
pnpm teamagent dashboard --watch --open
```

它会先生成 `docs/dashboard.html`，再启动本地服务，默认地址是：

```text
http://127.0.0.1:8787/dashboard.html
```

实时模式每 2 秒重新读取 `.teamagent/knowledge.db`、`~/.teamagent/global.db`
和 `~/.teamagent/events.db`，重生成 dashboard，并让浏览器自动刷新。常用选项：

```bash
pnpm teamagent dashboard --watch --port=0 --interval=5s  # 随机空闲端口，5 秒刷新
pnpm teamagent dashboard --once                          # 只生成 docs/dashboard.html，不启动服务
```

---

## 自动更新（用户零操作）

装完之后**完全不用管**。每次开 Claude Code 时 SessionStart hook 在后台静默：

1. 检查 GitHub `release` 分支 HEAD commit
2. 不一样就 detached spawn `npm install -g https://github.com/.../archive/refs/heads/release.tar.gz` 拉新代码（走 HTTPS tarball，不依赖 SSH）
3. 链式跑 `migrate-auto`（数据库 schema 升级）
4. 失败自动回滚到上一版（备份在 `~/.teamagent/rollback/`）
5. 当前会话不动（避免热替换风险），下次开 Claude 看到一行 banner：

```
✨ TeamAgent: 已自动更新 abc1234 → def5678
   本次会话生效。详情: teamagent update --status
```

**节流**：默认 1 小时检查一次（太频繁打 GitHub API 没意义；连续 3 次安装失败自动退避 24 小时）。

**控制命令**：

```bash
teamagent update --check                # 看 release 分支有没有新版本，不更新
teamagent update --now                  # 跳过节流立刻更
teamagent update --status               # 看更新状态（last_check / sha / 失败次数 / 待显示 banner）
teamagent update --disable              # 关闭自动更新（写 ~/.teamagent/auto-update.disabled）
teamagent update --enable               # 重新打开
teamagent update --rollback             # 列所有备份 sha
teamagent update --rollback <sha>       # 手动回到任一备份版本
teamagent update --logs                 # 看 ~/.teamagent/update.log 末尾 50 行
teamagent bug-report                    # 生成系统信息 + hook 配置 + 原始日志的脱敏报告
```

**环境变量**：
- `TEAMAGENT_AUTO_UPDATE=0`：会话级禁用（不写文件）
- `~/.teamagent/update-state.json` 的 `interval_hours` 可改 1/6/24（默认 1）

**验证边界**：`teamagent update --status` 是 sandbox-safe，只读状态并显示
`updater_binary` 是否存在；它不会运行 `npm install -g`。如果显示 missing，先在本仓库构建
`pnpm --filter @teamagent/cli build:hook`，再用 `teamagent update --now` 触发真实更新。

---


## Codex Cloud 环境（预装 claude/claudefast）

如果你在 Codex Cloud 容器里看到 `claudefast: command not found` 或 `claude: command not found`，在项目根目录执行：

```bash
pnpm setup:codex-cloud
```

它会做两件事：

1. 全局安装 `@anthropic-ai/claude-code`（提供 `claude`）
2. 创建 `~/.local/bin/claudefast` shim（等价转发到 `claude`）

执行后建议验证：

```bash
claude -p "hi"
claudefast -p "hi"
```

---

## 三大业务特性 / Three business features

TeamBrain 的 single-source-of-truth pitch + 四层证据矩阵在 [`docs/BUSINESS-FEATURES.md`](docs/BUSINESS-FEATURES.md)：

1. **新 Claude Code 实例不再重复旧错** — PRESHIP，四层证据齐全（CEO narrative / Coder file paths / Machine-readable JSON+SQL / LLM-readable raw artifacts）。
2. **Team leader 秒级看到 teammate 在干啥** — Vision (NOT PRESHIP)：hour/day 粒度已落地（M5 viral sync），second-level dashboard UI 待 ship。
3. **视频录制 + 集中存储易用** — PRESHIP wedge（upload + share link, SHA-256 round-trip PASS 2026-05-13）+ Vision tail（queue retry / signed ACL / 浏览器端录屏）。

两个 canned-answer probe 并存（锚点严格 disjoint）：

```bash
# CEO/VC pitch
claudefast -p "show me the business feature of this repo"
# → 6 anchors: no longer make mistakes / previous Claude Code / second-level realtime
#              / teammate's Claude Code instance / video recording / centralized data storage

# Evidence audit
claudefast -p "what are the business feature and do we have enough evidence to prove them to ceo, coder, machine-readable, LLM-readable evidence?"
# → 6 anchors: four-layer evidence matrix / CEO narrative / Coder file paths
#              / Machine-readable JSON+SQL / LLM-readable raw artifacts / turnkey UX is a vision, not PRESHIP
```

详见 [`docs/BUSINESS-FEATURES.md`](docs/BUSINESS-FEATURES.md)。

---

## 它做了什么

```
你 ←→ Claude 正常对话
        │
        ▼  会话结束（Stop hook 触发）
   ① analyze    扫描会话，找"被纠正时刻"和"成功信号"
   ② extract    LLM 把每个时刻抽成结构化规则（trigger / wrong / correct / why）
   ③ calibrate  用真实使用数据校准每条规则的置信度（Wilson 置信区间）
   ④ compile    高置信规则传播到 Skills / docs 知识索引（按预算和多样性筛选）
        │
        ▼  下次会话开启
   Skills / docs 知识索引进入上下文 → 它读到"教训"
        │
        ▼  当它要犯同样错误时
   PreToolUse hook 在工具调用之前拦截 → block / warn / suggest
```

**全自动**。无需人工标注。

---

## 真实场景对比

| 时刻 | 没装 TeamAgent | 装了 TeamAgent |
|---|---|---|
| 你说"不要 moment，用 dayjs" | Claude 道歉、改写 | 同上 + 静默入库一条规则 |
| 下次会话 Claude 又写 `moment().format()` | **你又得说一次** | PreToolUse 拦截：`💡 推荐用 dayjs（置信 0.83）` |
| 工具调用失败、自己重试瞎猜 | 反复试，烧 token | 入库为"失败信号"，未来同模式下提示 |
| 你手动写下"这个坑别再踩" | 脑子 / 飞书 / 分散文档 | `teamagent pitfall` 一条命令进知识库 |

---

## 在 AI 工作时实时介入（Hook 时间线）

| 时点 | 干什么 |
|---|---|
| **SessionStart** | 检测项目状态 / auto-init |
| **UserPromptSubmit** | 用户发问时把相关规则**主动注入**进上下文 |
| **PreToolUse** | AI 想动工具前按规则**拦截 / 警告 / 放行**（block / warn / suggest / passive 四档） |
| **PostToolUse** | 记录工具调用结果（成功/失败/exit code）到事件库，供下次校准 |
| **Stop** | 会话结束，跑完整学习闭环（analyze → calibrate → docs/Skills propagation） |
| **SessionEnd / PreCompact** | 全量重扫，确保 token 压缩 / 退出时不漏 turn |

每次操作都通过 **AttributionBus** 给你一段归因输出 —— 你能看见"系统刚刚做了什么 / 传播到哪个文件 / 下次体验会怎样"。不黑盒。

---

## 知识层级

| 层 | 存储 | 作用域 |
|---|---|---|
| **project** | `<repo>/.teamagent/knowledge.db` | 当前项目内的 personal / team 本地知识 |
| **global** | `~/.teamagent/global.db` | 跨所有项目（个人通用经验） |
| **events** | `~/.teamagent/events.db` | 真实工具调用记录，校准引擎用 |

每条规则不是死规则，有完整的**生命周期**：

- 新生 → `experimental` tier，confidence ≈ 0.5
- 多次成功命中 → 升 `canonical` → `canonical+` → 优先传播到 Skills / docs 知识索引
- 被用户 override / 工具失败 → demerit 累积 → 掉 tier → 归档

校准用 **Wilson 置信区间** + **指数衰减**，少量噪声不会带跑偏。

---

## 关键技术决策

| 难题 | 解法 |
|---|---|
| 关键词匹配漏召回 | **BM25 + 语义向量**（multilingual-e5-small, 384 维）做 RRF 融合 + soft-AND 打分 |
| 知识传播挤爆 context window | 严格预算 + **Jaccard 多样性过滤**（去近义条目） |
| 用户感觉系统在偷偷搞事 | 每次操作都通过 **AttributionBus** 渲染归因块 |
| Stop hook 阻塞会话关闭 | 全部 **detached spawn** + **永不非零退出** |
| 重复扫描浪费 token | **scan-cursor.json** 增量扫描，只看新 turn |
| 模型升级、规则迁移 | 内置 `migrate-v1-to-v2` / `migrate-v6` / `migrate-v7` 多版迁移命令 |
| 系统层错误也要学习 | `scan-errors` 扫日志 + `ingest --from-{git,pr,insights,audit}` 多源吸收 |

---

## 命令速查

```bash
# 安装与诊断
teamagent init               # 初始化项目（注册 hook + 创建 .teamagent/ + 预热向量模型）
teamagent warmup             # 单独预热向量模型 (~120MB，init 已自动跑；TTY 显示进度条 / CI 每文件一行)
teamagent doctor             # 环境诊断 + 产品边界状态
teamagent install-plugins    # 装与 .claude/settings.json:enabledPlugins 同步的团队标配插件
teamagent uninstall          # 卸载（保留数据，加 --delete-data 清空）

# 自动更新
teamagent update --check     # 查 release 分支有没有新版本
teamagent update --now       # 立刻跑更新
teamagent update --status    # 看更新状态
teamagent update --disable   # 关闭自动更新
teamagent update --rollback  # 列备份 / 回退
teamagent migrate-auto       # 链式跑所有 schema migration（自动更新会自动调）

# 日常使用（多数情况无需手动跑，hook 自动触发）
teamagent stats              # 看知识库分布与最近新增
teamagent review [N]         # 复核最近 N 条新规则
teamagent pitfall            # 手动录一条经验（交互或 --non-interactive）
teamagent analyze --commit   # 主动分析最近会话并入库
teamagent compile            # 刷新 Skills / docs 知识传播产物
teamagent calibrate          # 主动校准（hook 已自动跑）

# 高级
teamagent ingest --from-git  # 从 git 历史吸收候选规则
teamagent scan-errors        # 扫描错误日志生成候选
teamagent verify             # 端到端 PRR/KP 自检
teamagent demo hook Bash command='...'  # 离线模拟 PreToolUse 看会拦谁
```

完整命令：`teamagent --help`

---

## 工程指标

| 指标 | 数值 |
|---|---|
| 测试 | **3251 / 3299** 全绿（48 skipped；vitest，全 monorepo；283 test files） |
| 历史 bug 候选 | 90 条投资性调查（fixed 76 / withdrawn 8 / wontfix-merged 1 / **open 0**） |
| Chaos QA 覆盖 | 15 轮（Wave 1–15）自我对抗测试，含 215 文件白盒 + 全 35 CLI 命令攻击（Wave 15 诊断报告：`docs/test-reports/2026-05-08-trio-deep-report.md`） |
| TypeScript 严格度 | `tsc --noEmit` 干净，全 monorepo |
| 增量扫描 | scan-cursor 只看新 turn，避免会话越长扫描越慢 |

---

## 系统要求

- **Node.js ≥ 22**
- **Claude Code ≥ 1.0**
- macOS / Linux / **Windows (Git Bash)**

> ⚠️ Windows 必须用 **Git Bash**。PowerShell / CMD 不支持 hook 路径转义。

---

## 常见问题

**装完 hook 不工作？** 必须**完全退出并重开** Claude Code（不是刷新页面）。

**sqlite-vec 加载失败？** 跑 `teamagent doctor --fix`。

**首装后看到 UserPromptSubmit hook error？** 跑 `teamagent bug-report`，把生成的
`~/.teamagent/bug-reports/teamagent-bug-report-*.md` 附到 issue；报告会包含系统信息、hook 命令、TeamAgent 原始日志，并自动脱敏常见 token。

**插件命令报错？** `install-plugins` 调用 `claude plugin` CLI。确认 `claude --version` 能跑、机器能访问 GitHub。

**Node 版本不够？** `nvm install 22 && nvm use 22`。

**怎么彻底卸载？**
```bash
teamagent uninstall --delete-data    # 清规则库 + 移除 hook
npm uninstall -g teamagent
```

**Codex 没读到规则？** 用 `teamagent init --target=codex` 或 `teamagent compile --target=codex` 重新生成 `AGENTS.md -> CLAUDE.md`，并把 `.codex/skills` 指向 TeamAgent 实际编译出的 skill 目录。开启新的 Codex 会话后生效；Codex 不注册 Claude Code hooks，也不提供实时拦截。

**自动更新太频繁？** `teamagent update --disable` 完全关掉。或编辑 `~/.teamagent/update-state.json` 把 `interval_hours` 改大（6 / 24）。

**团队共享完成了吗？** 还没有。本地 `scope=team` 已支持写入、读取和统计；
但 `teamagent doctor --json` 仍会把 `team-sharing` 标为 `skip/PARTIAL`：
跨机器 git transport、privacy redaction、review gates 都落地后，才能说多人团队共享完成。

**模型下载失败？** 设置 `HF_ENDPOINT=https://hf-mirror.com` 重跑 `teamagent warmup`。

**新版本启动崩了？** `teamagent update --rollback <旧 sha>` 回退。备份在 `~/.teamagent/rollback/`（保留最近 3 个）。

---

## 适合谁

✅ **天天用 Claude Code 的开发者**——每天被打脸 ≥1 次的，回收成本最快
✅ **多人协作团队**——先把"团队约定"沉淀进本地 team/project/global 知识库；跨成员自动同步仍在后续阶段
✅ **大型代码库 owner**——项目级规则（`.teamagent/knowledge.db`）跟随仓库，新人秒同步
✅ **有大量重复犯错模式的场景**——任何"这个我说过吧"的瞬间，都是 ROI

不适合：偶尔用 Claude Code 试试看的（学习闭环需要至少几次会话）。

---

## 参与开发

仓库结构：

```
packages/
  types/         共享类型
  ports/         接口契约（含契约测试套件）
  core/          纯函数核心（Functional Core）
  adapters/      IO 适配（SQLite / Xenova / Claude SDK 等）
  cli/           CLI + 7 个 hook bin
  teamagent/     发布产物 + seed 知识
  benchmark/     性能基准
```

开发约定见 [`CLAUDE.md`](CLAUDE.md)：TDD、契约先于实现、Functional Core / Imperative Shell、AttributionBus 强制。

---

## Dev / contributor fallback（贡献者旧流程）

```bash
# 1. 装（一行 curl|bash：先校验 node ≥ 22 + npm/pnpm，再 npm install -g release tarball）
curl -fsSL https://raw.githubusercontent.com/libz-renlab-ai/TeamBrain/release/install.sh | bash
cd your-project                                          # 2. 进项目
teamagent init                                           # 3. 初始化（注册 hook + 预热向量模型）
# 如果同一个项目也要给 Codex 读取规则：
teamagent init --target=both
# → 重启 Claude Code，工作如常
# → 系统每小时自动检查 GitHub 上有没有新版本，有就静默更新
# → 它每次被你纠正，都会自动入库
```

> **`curl … | bash` 做了什么？** 校验 `node -v` ≥ 22 → 通过 SHA-256 双文件校验 + redirect domain guard 下载 release tarball → 解压到 `~/.local/lib/teamagent` 并把 `dist/bin.js` 软链到 `~/.local/bin/teamagent`。默认 `--safe` 模式会先打印脚本内容再 prompt y/N（输入 `--auto` 跳过）。失败时给确定的退出码（10 = node 缺失，11 = node 太老，20 = 包管理器都没有，30 = 安装失败）。脚本源码：[`release/install.sh`](./release/install.sh)，POSIX-sh 兼容版本（legacy）：[`release/install-legacy.sh`](./release/install-legacy.sh)。

---

## License

MIT
