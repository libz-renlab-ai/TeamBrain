# TeamAgent

> **给 Claude Code 装一个会学习的大脑** · 自进化 AI 规则引擎
> *Self-evolving rule engine for Claude Code and Codex — learn from every mistake, never repeat it.*

[![npm](https://badge.fury.io/js/teamagent.svg)](https://www.npmjs.com/package/teamagent) ![Node ≥22](https://img.shields.io/badge/node-%3E%3D22-green) ![tests 1230 passing](https://img.shields.io/badge/tests-1230%20passing-brightgreen) ![open bugs](https://img.shields.io/badge/open%20bugs-0-brightgreen) ![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

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

## 30 秒上手

```bash
npm install -g github:libz-renlab-ai/TeamBrain#release   # 1. 装（直接从 GitHub 拉）
cd your-project                                          # 2. 进项目
teamagent init                                           # 3. 初始化（注册 hook + 预热向量模型）
# 如果同一个项目也要给 Codex 读取规则：
teamagent init --target=both
# → 重启 Claude Code，工作如常
# → 系统每小时自动检查 GitHub 上有没有新版本，有就静默更新
# → 它每次被你纠正，都会自动入库
```

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
2. 不一样就 detached spawn `npm install -g github:.../release` 拉新代码
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
```

**环境变量**：
- `TEAMAGENT_AUTO_UPDATE=0`：会话级禁用（不写文件）
- `~/.teamagent/update-state.json` 的 `interval_hours` 可改 1/6/24（默认 1）

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

## 它做了什么

```
你 ←→ Claude 正常对话
        │
        ▼  会话结束（Stop hook 触发）
   ① analyze    扫描会话，找"被纠正时刻"和"成功信号"
   ② extract    LLM 把每个时刻抽成结构化规则（trigger / wrong / correct / why）
   ③ calibrate  用真实使用数据校准每条规则的置信度（Wilson 置信区间）
   ④ compile    高置信规则编译进 CLAUDE.md（3000 token 预算 + Jaccard 多样性过滤）
        │
        ▼  下次会话开启
   CLAUDE.md 自动挂入 Claude 上下文 → 它读到"教训"
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
| **Stop** | 会话结束，跑完整学习闭环（analyze → calibrate → compile） |
| **SessionEnd / PreCompact** | 全量重扫，确保 token 压缩 / 退出时不漏 turn |

每次操作都通过 **AttributionBus** 给你一段归因输出 —— 你能看见"系统刚刚做了什么 / 传播到哪个文件 / 下次体验会怎样"。不黑盒。

---

## 知识层级

| 层 | 存储 | 作用域 |
|---|---|---|
| **project** | `<repo>/.teamagent/knowledge.db` | 仅当前项目（项目独有约定） |
| **personal** | `~/.teamagent/global.db` | 跨所有项目（个人通用经验） |
| **events** | `~/.teamagent/events.db` | 真实工具调用记录，校准引擎用 |

每条规则不是死规则，有完整的**生命周期**：

- 新生 → `experimental` tier，confidence ≈ 0.5
- 多次成功命中 → 升 `canonical` → `canonical+` → 进入 CLAUDE.md token 预算优先级
- 被用户 override / 工具失败 → demerit 累积 → 掉 tier → 归档

校准用 **Wilson 置信区间** + **指数衰减**，少量噪声不会带跑偏。

---

## 关键技术决策

| 难题 | 解法 |
|---|---|
| 关键词匹配漏召回 | **BM25 + 语义向量**（multilingual-e5-small, 384 维）做 RRF 融合 + soft-AND 打分 |
| CLAUDE.md 编译爆 context window | 严格 **3000 token 预算** + **Jaccard 多样性过滤**（去近义条目） |
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
teamagent warmup             # 单独预热向量模型 (~120MB，init 已自动跑)
teamagent doctor             # 8 项环境诊断
teamagent install-plugins    # 装 superpowers / caveman / sales / playground 等团队标配 skill
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
teamagent compile            # 重编译 CLAUDE.md
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
| 测试 | **1230 / 1230** 全绿（vitest，全 monorepo） |
| 历史 bug 候选 | 90 条投资性调查（fixed 76 / withdrawn 8 / wontfix-merged 1 / **open 0**） |
| Chaos QA 覆盖 | 9 轮（Wave 1–9）自我对抗测试，含 215 文件白盒 + 全 35 CLI 命令攻击 |
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

**插件命令报错？** `install-plugins` 调用 `claude plugin` CLI。确认 `claude --version` 能跑、机器能访问 GitHub。

**Node 版本不够？** `nvm install 22 && nvm use 22`。

**怎么彻底卸载？**
```bash
teamagent uninstall --delete-data    # 清规则库 + 移除 hook
npm uninstall -g teamagent
```

**Codex 没读到规则？** 用 `teamagent init --target=codex` 或 `teamagent compile --target=codex` 重新生成 `AGENTS.md -> CLAUDE.md`，并把 `.codex/skills` 指向 TeamAgent 实际编译出的 skill 目录。开启新的 Codex 会话后生效；Codex 不注册 Claude Code hooks，也不提供实时拦截。

**自动更新太频繁？** `teamagent update --disable` 完全关掉。或编辑 `~/.teamagent/update-state.json` 把 `interval_hours` 改大（6 / 24）。

**模型下载失败？** 设置 `HF_ENDPOINT=https://hf-mirror.com` 重跑 `teamagent warmup`。

**新版本启动崩了？** `teamagent update --rollback <旧 sha>` 回退。备份在 `~/.teamagent/rollback/`（保留最近 3 个）。

---

## 适合谁

✅ **天天用 Claude Code 的开发者**——每天被打脸 ≥1 次的，回收成本最快
✅ **多人协作团队**——把"团队约定"沉淀进 personal/global 知识库
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

## License

MIT
