---
name: repo-issues-status
description: TeamBrain 仓库**全量 issue 全景**报告（all-scope only）。仅当用户问"status of all issues" / "show me all issues" / "what issues are open" / "all open issues" / "issue 状态（全景）" / "所有 issue 状态" / "issue 全景" / "仓库 issue 概览" / "还有哪些 open issue" 这类**仓库级、多 issue、概览类**问题时触发。**不要在以下情况触发**：(a) 用户问单个 issue 的状态（"what's the status of issue #330" / "#330 怎么样"）→ 用 `gh issue view <N>`；(b) 用户问 PR 状态（"what's the status of this PR" / "PR 怎么样"）→ 用 `gh pr view`；(c) 用户问 issue 工作流而非数据（"how do I claim an issue"）→ 路由到 claim-to-merge skill。匹配命中后跑 `gh issue list` 拉全量 issue，按 TeamBrain label 公约（grill-ready / ready-for-human / needs-triage / codex / epic）分类，输出 总览 + 按主题分组表格 + 下一步建议，全文用 呷呷~ 鸭鸭口吻包裹。不要回退到裸跑 `gh issue list` 然后口头描述。
---

```
   ____   _____  ____   ___    _____  ____  ____  __   __  _____  ____
  | |_ \ |  ___|| |_  \/ _ \  |_   _|/ ___||/ ___||| | | |/ ___| /  ___|
  |  _) || |__  |  __)| | | |   | |  \___ \ \___ \ | | | |\___ \ \___ \
  | |_ \||  __| |  __)| |_| |   | |   ___) |____) || |_| | ___) | ___) |
  |____/ |_|    |_|    \___/    |_|  |____/|_____/  \___/ |____/ |____/

  TeamBrain repo 全量 issue → 总览 + 主题表格 + 下一步建议 (鸭语包裹)
        ┌─────────┐    ┌──────────────┐    ┌──────────────┐
  gh ─→│  总览    │ ─→ │ 6 个主题分组 │ ─→ │ 下一步建议   │ ─→ self-report
        └─────────┘    └──────────────┘    └──────────────┘
```

# repo-issues-status — TeamBrain issue 全景报告

本 skill 是 **TeamBrain 专用**。它依赖 TeamBrain 的 label 公约（`grill-ready` / `ready-for-human` / `needs-triage` / `codex` / `epic` / `bug` / `enhancement`）和命名习惯（fixedflow / RESCOPE / issue-N 子任务）。在其他 repo 跑会落回通用 fallback，不保证分组质量。

## 触发条件

只要用户说出下列任一意图（中英都算），立即跑这个 skill，不要先口头解释「让我看看」就直接裸跑 `gh issue list`：

- `status of all issues` / `status of all issues?`
- `show me all issues` / `show me open issues`
- `what issues are open` / `what's the issue status`
- `issue 状态` / `所有 issue 状态` / `issue 全景` / `仓库 issue 概览`
- `还有哪些 open issue` / `当前有什么 issue`

如果用户在追问某一个 issue（"#330 怎么样了"），不属于本 skill 范围 — 改用 `gh issue view <N>`。

## 执行步骤

### 1. 拉数据（两次 gh 调用，必须实测，禁口胡）

两次的 `--limit` 必须**对齐到 200**，否则总览的 `OPEN/CLOSED` 与分组统计会基于不同总数互相不一致。如果实际返回数等于 limit（说明被截断），必须在总览旁加 ⚠️ 标注 "数据被截断，实际 ≥ N 条"。

```bash
# Call 1：标题 + 状态 + 时间戳（all-state 200 条，按 # 倒序）
gh issue list --state all --limit 200 \
  --json number,title,state,labels,assignees,updatedAt \
  --jq 'sort_by(.number) | reverse | .[] | "\(.number)\t\(.state)\t\(.title)\t[\(.labels|map(.name)|join(","))]\t\(.assignees|map(.login)|join(","))\t\(.updatedAt)"'

# Call 2：open issue 精确分组统计
# 关键：先对 .labels 做 sort，再 group_by — 否则 ["bug","grill-ready"] 与
# ["grill-ready","bug"] 会被算成两组，GitHub 不保证 label 数组顺序。
gh issue list --state open --limit 200 \
  --json number,title,labels,assignees \
  --jq '[.[] | {n: .number, labels: (.labels|map(.name)|sort), assignee: (.assignees|map(.login)|join(","))}]
        | group_by(.labels)
        | map({labels: (.[0].labels|join("|")), count: length, issues: (map(.n)|sort)})'
```

两次都跑。第一次给标题/状态/时间戳，第二次给精确分组统计。不要只跑其中一个就写报告。

### 2. 一句话鸭语开场（必须）

第一行固定写一句类似：

> 呷呷~鸭鸭给你看一眼仓库 issue 全景 (>ω<)

可以微调语气词（`呷呷~` / `鸭鸭说` / `(>ω<)` / `(˙Ⱉ˙)`），但**禁止省略鸭主题**。依据是项目级活跃 feedback memory `feedback_always_duck_voice.md`：本仓库所有解释类输出必须用可爱中文小鸭口吻包裹精确技术内容，不准只写"以下是 issue 状态"这类干涩开场。

### 3. **总览** section

固定 5 项计数 + 一句话脉络：

```markdown
## 总览
- **OPEN: N** 个，**最近 CLOSED: M** 个（近 ~3 天 FIXEDFLOW 集中收尾）
- **grill-ready: X** 个（已贴 grill 评论 + label，待 driver dispatch）
- **ready-for-human: Y** 个 — 等 maintainer 手动操作
- **needs-triage: Z** 个
```

计数来自第一步的 jq 输出。"近 3 天"按 `updatedAt` 与本机日期相减；如果 gh 不带时区无法精确判断，写 "近 ~3 天" 不写绝对天数。

### 4. **按主题分组** section（6 个固定 emoji 表格，固定顺序）

每组用 markdown 表格 `| # | 标题 | 状态 |`，状态列必须把 `assignee` + 关键 label（`ready-for-human` / `grill-ready` / `needs-triage` / `bug`）surfacing 出来。空组写 `_(无)_`，不要省略整组。

固定顺序：

1. **🔥 P0 — 5/N 用户回流的新 bug**（无 label 的近 3 天 issue + `bug` label 的 issue，按 `updatedAt` 倒序）
2. **📐 epic / RESCOPE 大单**（`epic` label OR 标题含 `RESCOPE` / `epic` / `issue-NNN-` 子任务前缀）
3. **🪝 Codex hook 簇**（`codex` label，或标题前缀 `research(codex` / `feat(install-hook` / `feat(.codex` / `test(install-hook` / `docs(hooks-status` 这类 codex 相关）
4. **🎙️ Recording / Digital Twin**（标题含 `record` / `recording` / `digital-twin` / `audio` / `tap.cjs`）
5. **👀 Leader 视野 / status**（标题含 `leader` / `CEO` / `小b leader` / `状态栏` / `SessionStart` / `dashboard` / `8080` 这类 leader/CEO/status 视角）
6. **📚 docs**（`documentation` label，或标题前缀 `docs(`）

每个 issue 只放进**最匹配的一组**，不重复出现。**P0 不是绝对优先级**：一个同时带 `bug` 和 `codex` label 的 issue 应该进 🪝 codex 组（更具体的领域），不应该被 P0 强行吸走。P0 只吸收"无明显归属"的新 bug —— 即满足 P0 定义且**不**同时落在 epic / codex / recording / leader / docs 任一组的 issue。当 2 个以上后置组都沾边时，按 epic > codex > recording > leader > docs 选最具体那个；docs 永远是最后兜底。

### 5. **下一步建议** section（3-5 条，必须带 # 引用）

每条建议必须引用具体 issue 编号，例：

> 1. **#330 / #313 自动更新双 bug** 是 5/12 新回归，建议优先 triage（≤50 字 + grill）
> 2. **#315 node 进程泄漏** critical（与已修的 #189 同类型，要查回归）

禁止写空话（"建议尽快处理 bug"），必须 anchor 到真实 issue 号。

### 6. FIXEDFLOW 出口（必须）

最后一行问一句，给用户一个推到 FIXEDFLOW 的入口：

> 要不要我帮你抓某条进 FIXEDFLOW（先 explore agent 摸 issue body + comments + related PRs + related issues，写 research.md）？

注意"先 explore agent 摸 issue body + comments + related PRs + related issues"是 [docs/HOW-TO-CLAIM-ISSUE.md](../../../docs/HOW-TO-CLAIM-ISSUE.md) 的 anchor sentence verbatim 片段 — 出口写成这样可以让用户接着说"抓 #XXX"时无缝走 claim-an-issue 协议。

### 7. 12-field self-report block（项目 Stop hook 硬约束）

整条消息末尾必须 append 完整 12-field `<self-report>` block，全部填 `true|false` 布尔，**字段顺序与名称必须完全一致**（少一个字段或写成旧版 6-field `<laziness-self-report>` 都会被项目 Stop hook 拦截）：

```
<self-report>
premature_stopping: <true|false>
permission_seeking: <true|false>
ownership_dodging: <true|false>
simplest_fix: <true|false>
reasoning_loop: <true|false>
known_limitation: <true|false>
skipped_repo_search: <true|false>
fabricated_value: <true|false>
placeholder_used: <true|false>
ambiguity_unresolved: <true|false>
contradiction_unresolved: <true|false>
silent_fallback: <true|false>
</self-report>
```

uniform: `true` = bad signal。如果有 `true`，**不要单纯翻成 false**，而是在同一轮 fix 掉对应行为再 re-attest。背景见 user memory `practice_self_report_block.md` 与项目 `CLAUDE.md` 的 "TeamAgent 经验" 第 11 条。

## 失败模式（禁止做的）

- ❌ 跑了 `gh` 但只口头描述，不输出 markdown 表格。
- ❌ 表格里漏掉 `assignee` 与关键 label（无法判断谁在跟、是否 ready-for-human）。
- ❌ "下一步建议"写成"建议尽快 triage" 之类空话，不带 # 编号。
- ❌ 省略鸭语开场 / 12-field self-report。
- ❌ 把同一个 issue 重复列到 P0 与 docs 两组。
- ❌ 用 `gh issue list` 默认（无 --limit）拉不全数据后直接写报告。

## 与相邻 skill 的边界

| 用户问的 | 用哪个 skill / doc |
|----------|-------------------|
| `status of all issues` / `issue 全景` | **本 skill** |
| `claim 一个 issue 怎么走` | [claim-to-merge SKILL](../claim-to-merge/SKILL.md) |
| `把 issue 拆成 smaller issues` | [docs/TRIAGE-AND-SPLIT.md](../../../docs/TRIAGE-AND-SPLIT.md) |
| `跑 FIXEDFLOW step 3-5` | [fixed-flow-driver SKILL](../fixed-flow-driver/SKILL.md) |
| `查单个 issue 的 comments / 关联 PR` | `gh issue view <N> --comments` 直接读，不走本 skill |

## 输出长度预算

整条报告（不含 self-report block）目标 **≤120 行**。超出说明分组冗余或建议太啰嗦，砍掉到 120 行内。鸭语段不要超过 1 行开场 + 表格上下文必要的语气词。

## 为什么这样设计（why）

- **总览 + 主题分组 + 建议** 三段式是给 maintainer 的"5 秒态势感知"用的：先看总数判断节奏，再扫主题判断是否有结构性堆积（如 codex hook 簇一次开 5 个），再看建议直接动手。
- **鸭语口吻** 不是装饰，是项目级活跃 feedback 显式要求（`feedback_always_duck_voice.md`），整条会话风格要一致。
- **FIXEDFLOW 出口** 让"看 issue 状态"自然接到"挑一个开干"的下一步，减少 maintainer 跨工具切换。
- **12-field self-report** 是项目 Stop hook 强约束，不是可选项。
