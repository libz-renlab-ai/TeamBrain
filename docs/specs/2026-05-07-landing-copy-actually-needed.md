```
 ┌──────────────────────────────────────────────────────────────────────┐
 │  Landing Copy Decision Funnel                                        │
 │                                                                      │
 │  访客到达 ──► 30s 读 & 判断 ──► 看 GIF 惊叹 ──► install 命令        │
 │     │              │                  │                │             │
 │   Hero         对比表             correction          curl|sh        │
 │   Sub       (第一屏底部)          → 拦截演示          teamagent init │
 │  已有 49 个 verified features — 本规格选出 8 个浮上来，新建 6 个    │
 └──────────────────────────────────────────────────────────────────────┘
```

# Landing Copy Actually Needed — 2026-05-07

## 目标

本规格回答一个问题：**要让 30 秒英雄文案真正带来安装，产品侧需要做什么、展示什么、构建什么？**

通过 grill-with-docs 对话，我们识别出：现有 49 个 verified feature 中有 8 个需要浮到第一/二屏；还有 6 个功能当前不存在，必须新建，才能让文案的核心承诺（装完立即生效、30 秒内看到拦截）可兑现。本文档沉淀 7 条决策及其理由、feature 矩阵、页面布局草图和待解问题。

---

## 7 条 Grill 决策

### 决策 1：landing 定位为外部转化（external），不是内部文档

**决策**：整个 landing 面向"从没听说过 TeamAgent 的外部访客"，目标是 30 秒读完，做出"装还是不装"的判断。

**理由**：现有 README 大量文字是面向已决定使用的开发者的配置说明，与转化目标错位。外部 landing 需要的是：识别痛点 → 看到差异化 → 看到可工作的演示 → 最低摩擦安装。文档口径必须重新对齐。

---

### 决策 2：Avoidance starter pack + `teamagent demo` + GIF（合称 B+C+GIF）

**决策**：install 必须携带一批开箱即用的 avoidance 规则（universal pack），并提供 `teamagent demo` 命令与配套 GIF，让用户在 30 秒内看到第一次拦截。

**理由**：如果用户 `teamagent init` 之后需要等自己先"积累错误、纠正、等系统学习"才能看到拦截，转化漏斗在安装后立即断裂。starter pack 解决"冷启动沉默期"；`demo` 命令提供确定性的演示体验；GIF 让访客在点 install 之前就能看到这一刻。三者缺一不可。

---

### 决策 3：Hero 区域使用强对比表（对比 CLAUDE.md / .cursorrules / Claude memory vs TeamAgent）

**决策**：将现有 README 第 156 行附近的"真实场景对比"表格提升到第一屏底部，作为 Hero 区域的锚定。4 个症状描述降级到第二屏的 empathy section。

**理由**：对比表是最密集的差异化信号，访客一眼就能判断"这个比我现在的方案强在哪"。4 条症状叙事有情感价值，但需要已经认同的访客——放第二屏更合适。第一屏必须先赢得"值得继续读"的判断。

---

### 决策 4：GIF 内容 = double-moment（约 25–30 秒）

**决策**：GIF 展示两个连续时刻：
1. moment 1：用户纠正一次（`moment` → 改成 `dayjs`，AI 接受并记录）
2. cut（新会话标记）
3. moment 2：下一个会话里 AI 准备用 `moment`，被 PreToolUse hook 拦截，提示"上次你说用 dayjs"

**理由**：单独展示"纠正"不够有力——用户会想"我现在也能手动告诉 AI"。单独展示"拦截"没有上下文——用户会问"这个规则哪来的"。double-moment 把完整闭环压缩进一个 GIF，用 `moment → dayjs` 作为具体锚点，普通前端开发者立即能代入。

---

### 决策 5：两阶段 install + raw GitHub `install.sh`

**决策**：安装入口为：
```
curl -fsSL https://raw.githubusercontent.com/libz-renlab-ai/TeamBrain/release/install.sh | sh
teamagent init
```
`teamagent init` 约 30 秒完成，带 legacy substring matcher + universal pack，立即可拦截。~120MB Xenova vector model 在后台下载，约 10 分钟后静默升级为 BM25+dense RRF 语义匹配。无需自有域名，`install.sh` 放在本仓库 `release` 分支。

**理由**：单阶段完整安装需要 5–10 分钟，在 landing 30 秒承诺面前是致命的。两阶段分离"立即可用"和"质量提升"。legacy substring matcher 对 universal pack 中的字面关键词（`moment`、`/Users/`、`rm -rf`）足够精准，冷启动体验可接受。

---

### 决策 6：stack pack 选择委托给用户的 coding agent

**决策**：`teamagent init` 默认安装 universal pack（~15 条跨语言 avoidance 规则）。然后向 stdout 打印一段 markdown 提示语，描述检测到的项目文件（package.json / pyproject.toml / Dockerfile 等）和可用 pack 列表；由用户的 Claude Code 或 Codex 读取并决定运行 `teamagent pack add frontend-js,ops-safety` 等命令。Power user 路径：`--pack all` 或 `--pack X,Y`。teamagent 内部不硬编码 stack 检测逻辑。

**理由**：LLM agent 本身非常擅长读取项目结构并匹配选项，远比任何硬编码解析精准，尤其在 polyglot monorepo 和非标项目中。硬编码检测是维护负担，且在边缘情况下给出错误 pack 比不给更糟糕。stdout prompt 让 agent 做它最擅长的事。

---

### 决策 7：第二屏使用 `<details>` 可展开段落

**决策**：team-layer 共享（features #21–25 + xsync）、多工具集成（#31–33）、卸载 + 数据位置（#48），全部放在 `<details>` 可折叠块里，Markdown 原生支持，零工程成本。

**理由**：这些功能对部分访客是关键信息（团队购买决策者、Cursor 用户、隐私敏感用户），但对大多数个人开发者是噪声。`<details>` 让关心的人找到，不关心的人不被打断。GitHub/GitLab README 原生渲染，不需要 JS。

---

## 8 of 49 Features 浮到 Landing

| 序号 | Feature 名 | 位置 | 作用 |
|------|-----------|------|------|
| #3   | PreToolUse intercept | Hero + GIF moment 2 | 核心承诺：工具调用前拦截，而非事后纠正 |
| #4   | correct-once-remembered | Hero + GIF moment 1 | 核心承诺：纠正一次，下次记住 |
| #10  | Stop hook auto-capture | 第二屏"工作原理"图 | 解释系统如何从对话里自动提炼规则 |
| #21–25 | team layer + xsync | 第二屏 `<details>` | 团队共享维度，打消"只对个人有用"的疑虑 |
| #31–33 | MCP / Cursor / Codex 多工具 | 第二屏 `<details>` | 不只 Claude Code，降低工具锁定顾虑 |
| #38–40 | A/B benchmark | 第一屏底部 trust anchor | 有实测数字，positiveTriggerRate / falsePositiveRate |
| #48  | uninstall | 第二屏 `<details>` | 降低试用摩擦："装了可以卸" |
| #44  | `teamagent verify` | Footer trust anchor | 可机器验证的质量承诺 |

---

## 6 个新 Feature（当前 49 个中没有）

| ID | 名称 | 描述 | 实现成本估算 |
|----|------|------|------------|
| N1 | `seed/packs/universal.jsonl` | ~15 条跨语言、substring 可匹配的 avoidance 规则（`moment`/`dayjs`、绝对路径、`.env` 泄露、`rm -rf`、硬编码 API key 等） | 小（写 JSONL 文件，无 code 改动；需产品判断哪 15 条） |
| N2 | `seed/packs/{frontend-js,python-data,ops-safety,golang,rust}.jsonl` | 每个 pack 约 5–10 条语言/栈专属 avoidance 规则 | 小（同上；需各栈 SME review） |
| N3 | `teamagent pack list/add/remove` CLI + init stdout prompt | 新增 CLI 子命令管理 pack；`init` 完成后向 stdout 打印 markdown 提示，让 agent 选 pack | 中（需新增 CLI 子命令、pack 注册表、stdout 格式设计） |
| N4 | 两阶段 `teamagent init`（legacy → 后台 vector 升级） | init 返回时已有 substring matcher + universal pack；后台 worker 下载 Xenova model，完成后静默升级 matcher | 大（需后台 downloader、matcher 切换逻辑、进度通知） |
| N5 | `release/install.sh` | 放在 `release` 分支的一键安装脚本，curl|sh 可用 | 小（shell 脚本；需 release 分支 CI 策略） |
| N6 | `teamagent demo` 命令 | fixture 驱动的 correction→interception 演示，用于 GIF 录制和用户首次体验验证 | 中（需 fixture 数据、确定性回放逻辑；不依赖真实 AI 响应） |

---

## 第一屏布局草图（60 秒结构）

```
┌─────────────────────────────────────────────────────────┐
│  Hero（0–10s 阅读）                                      │
│  ─────────────────────────────────────────────────────  │
│  H1：[待定 — 见 Open Questions]                         │
│  Sub：AI 第 5 次想用 moment，你第 5 次告诉它用 dayjs。  │
│       TeamAgent 让第 2 次不再发生。                     │
│                                                         │
│  对比表（10–25s 阅读）                                  │
│  ─────────────────────────────────────────────────────  │
│  | 方案           | 跨会话记忆 | 工具调用前拦截 | 团队共享 |
│  | CLAUDE.md      | ❌ 手动维护 | ❌            | ❌        |
│  | .cursorrules   | ❌ 静态文件 | ❌            | ❌        |
│  | Claude memory  | ✅ 有       | ❌ 无法拦截   | ❌        |
│  | TeamAgent      | ✅          | ✅ PreToolUse | ✅ xsync  |
│                                                         │
│  GIF（25–50s 观看，约 25–30s 长）                       │
│  ─────────────────────────────────────────────────────  │
│  [GIF: moment → 纠正 → cut → 下次拦截]                  │
│                                                         │
│  Trust anchor（50–55s）                                 │
│  ─────────────────────────────────────────────────────  │
│  positiveTriggerRate=1 · falsePositiveRate=0            │
│  e2e-evaluate 实测 · teamagent verify 可复现             │
│                                                         │
│  CTA（55–60s）                                          │
│  ─────────────────────────────────────────────────────  │
│  curl -fsSL https://raw.githubusercontent.com/          │
│    libz-renlab-ai/TeamBrain/release/install.sh | sh    │
│  && teamagent init                                      │
│                                                         │
│  [复制按钮]  ·  文档  ·  GitHub                         │
└─────────────────────────────────────────────────────────┘
```

每个元素的时间占比估算：Hero 阅读约 10s，对比表扫描约 15s，GIF 观看约 25s，trust anchor 扫描约 5s，CTA 决策约 5s。总计约 60s。对比表放 Hero 底部（第一屏可见），GIF 紧接其后作为情感高潮。

---

## 第二屏结构（empathy + expandable details）

```markdown
## 你遇到过这种事吗？

AI 第 5 次想给你装 moment，你第 5 次告诉它"不要，用 dayjs"。
AI 又一次硬编码了你机器的绝对路径。
某个团队约定，新会话又得解释一遍。
"这个我们上次讨论过呀..." — 它忘了。

TeamAgent 从你每次纠正的对话里，自动提炼可复用规则，
下次工具调用前就拦住。

---

## 它怎么工作

[Stop hook auto-capture 图]
对话发生 → Stop hook 捕获纠正信号 → 提炼 avoidance 规则
→ 下次 PreToolUse 命中 → 拦截 + 提示原因

---

<details>
<summary>团队共享（多人 + xsync）</summary>

teamagent 的规则库可以通过 xsync 在团队成员间同步。
每个人纠正 AI 的经验，变成团队共享的规则。
规则有层级：个人层 / 项目层 / 团队层（#21–25）。

```bash
teamagent xsync push   # 推送本地规则到团队
teamagent xsync pull   # 拉取团队规则
```

</details>

<details>
<summary>支持的 AI 工具</summary>

| 工具 | 状态 | 集成方式 |
|------|------|---------|
| Claude Code | ✅ 已支持 | PreToolUse / UserPromptSubmit / Stop hook |
| Cursor | 🔧 开发中 | compiler（NOT YET） |
| MCP Server | 🔧 开发中 | MCP Server（NOT YET） |
| Codex | ✅ 已支持 | AttributionBus |

</details>

<details>
<summary>卸载 + 数据位置</summary>

数据存储在 `~/.teamagent/`，规则库为纯 JSON，可人工检查。

```bash
teamagent uninstall     # 移除 hooks + CLI
rm -rf ~/.teamagent     # 删除所有规则数据（可选）
```

</details>
```

---

## 已解决叶子决策（2026-05-07 grill 续）

### Leaf 1：Hero 主标题措辞 — **RESOLVED：选方案 B**

**决策**：Hero H1 + sub 使用 pain-first + differentiation 句式：

```
> **Claude Code 没有记忆。你纠正它的每一句话，下次都白说。**
> *— 不是 CLAUDE.md。是会自己进化的活规则库。*
```

**理由**：`白说` 用用户视角的损失语言，比"纠正一次记住"更有情感冲击力；sub 行点名 CLAUDE.md，在第一秒化解"我已经有 CLAUDE.md"的最高频异议；不依赖 `moment` 典故（无须受众事先知情），普通开发者秒懂。

---

### Leaf 2：Demo 命令具体形态 — **RESOLVED：B+C 三模式组合**

**决策**：`teamagent demo` 以三个模式交付，互不干扰：

- **Default（真实 IDE 流）**：写 fixture 规则到沙箱 `.teamagent/demo-{epoch}.db`，注入 `moment → dayjs` avoidance 规则（conf=0.83，block），打印 CTA `"打开 Claude Code，让它'帮我装个时间格式化库'"`, 轮询 events.db 等待 hook 触发（60s 超时），打印捕获到的归因事件 JSON，退出时自动清理 demo db。
- **`--inline`**：直接拉起真实 `bin-pre-tool-use.cjs` hook 进程，mock stdin `{tool_name:"Bash", tool_input:{command:"npm install moment"}}`，将 stdout JSON 渲染成 ANSI 红框。走真实 hook 代码路径，仅数据源为 fixture。CI 安全。
- **`--record demo.gif`**：生成 `docs/landing/demo.tape`（vhs 配置），若 PATH 上有 `vhs` 则自动运行 `vhs demo.tape -o demo.gif`；否则打印安装说明。`vhs` 不作为安装时依赖，仅为维护者工具。

**限制**：`--record` 只能录 `--inline` 模式（终端可控）；IDE 真实红框录制需平台工具（QuickTime / OBS / Kap），README 指向外部工具但不打包。实现参考 → ADR 0003 (`docs/adr/0003-demo-dual-mode.md`)。

---

### Leaf 3：信任锚点位置 — **RESOLVED：方案 e（拆分）**

**决策**：Hero 区域顶部**只放 2 个 badge**：`tests passing` + `MIT License`。其余所有数字与脚本（`0 open bugs`、`49 verified features`、`1230 tests`、benchmark 数字、verify 脚本）全部进第二屏 `<details>` 块，标题"数据 / verify scripts / benchmark"。

**理由**：5 个 badge 堆叠产生视觉过载并触发"这人在自吹"防御反应；仅放 footer 则 30 秒内读者永远看不见。拆分确保信任信号在正确时机以正确密度出现。

---

### Leaf 4：价格定位 — **RESOLVED：方案 a（MIT badge 即声明）**

**决策**：Hero 的 MIT badge 本身即为许可/价格声明。不另加"永久免费"散文（开发者陈词滥调，且锁定商业模式选项）。不在第二屏设 Pricing 区块讨论未来付费（主动伤害转化——访客会联想"这是 freemium 试用"）。

**唯一附加内容**：CTA 下方一行小字：`开源 · 自托管 · 无云端依赖`。这是功能性保证（代码/规则/纠正历史仅存于本机），不是价格声明，化解合规/安全敏感受众的"会不会偷我代码"顾虑。

---

## 最终第一屏 Hero Markdown（完整定稿，逐字引用）

```markdown
# TeamAgent

[![tests](https://img.shields.io/badge/tests-1230%20passing-brightgreen)](#) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](#)

> **Claude Code 没有记忆。你纠正它的每一句话，下次都白说。**
> *— 不是 CLAUDE.md。是会自己进化的活规则库。*

| 时刻 | 你现在的方案<br>(CLAUDE.md / .cursorrules / 手动) | TeamAgent |
|---|---|---|
| 你说"不要 moment，用 dayjs" | 写进 CLAUDE.md，下次它不一定读 | 自动入库一条规则 |
| 下次 AI 又写 `moment().format()` | 你又得说一次 | PreToolUse 拦截：💡 推荐 dayjs (conf 0.83) |
| 工具失败、自己重试瞎猜 | 反复试，烧 token | 入库失败信号，未来同模式提示 |
| 你手动写"这个坑别再踩" | 飞书 / 笔记本 / 散落文档 | `teamagent pitfall` 一条命令进库 |

[ GIF: 25-30s 双瞬间合一，moment → dayjs ]

```bash
curl -fsSL https://raw.githubusercontent.com/libz-renlab-ai/TeamBrain/release/install.sh | sh && teamagent init
```

> 30 秒看到第一次拦截。语义匹配引擎背景升级（120MB，~10 分钟无感）。
> **开源 · 自托管 · 无云端依赖**——你的代码、规则、纠正历史都只在你自己机器上。
```

---

## 交叉引用

- ADR 0001：两阶段 install 决策 → `docs/adr/0001-two-stage-install.md`
- ADR 0002：stack pack 委托 coding agent → `docs/adr/0002-stack-detection-via-coding-agent.md`
- ADR 0003：demo 命令三模式设计 → `docs/adr/0003-demo-dual-mode.md`
- Feature #3, #4 实现状态 → `docs/PRODUCT-FEATURES.md`
- 现有对比表原始位置 → README.md（第 156 行附近）
- B+C+GIF 的新 feature 详细设计 → 待写（N1–N6 各自的 feature spec）
- 多工具适配现状 → `docs/features/multi-tool.md`
