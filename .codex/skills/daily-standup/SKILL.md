---
name: daily-standup
description: TeamBrain repo **24h window delta** report — 拉过去 N 小时窗口内 PR/issue 的创建/合并/关闭事件，按主题（features/bugfixes/docs/infra）分组，鸭语汇报。仅当用户问 `what happened since yesterday` / `explore today's issues and PRs` / `daily standup` / `/daily-standup` / `今天的 issue 和 PR` / `昨天到今天发生了啥` / `show me yesterday's activity` / `过去 24 小时 GitHub 活动` / `9 点到 9 点发生了什么` 这类**时间窗口 delta 类**问题时触发。**不要在以下情况触发**：(a) 用户问当前快照（`status of all issues` / `所有 open issue` → 用 `repo-issues-status` skill）；(b) 用户问今日开工晨报（`/newday` → 用 `newday` skill，覆盖 worktree + 当前开放工作而非 24h delta）；(c) 用户问单 issue/PR 状态（`#330 怎么样` → 用 `gh issue view`/`gh pr view`）。匹配命中后默认拉 yesterday 09:00 +0800 → today 09:00 +0800 的窗口，事件按 PRs merged / created / closed-without-merge / 还开着 + Issues created / closed / 还开着 六桶分组，再按主题二次归类，全文用 呷呷~ 鸭鸭 口吻包裹。
---

```
   ____    _    ___ _  __   __    ___ _____  _    _   _ ___  _   _ ____
  |  _ \  / \  |_ _| | \ \ / /   / __|_   _|/ \  | \ | |   \| | | |  _ \
  | | | |/ _ \  | || |  \ V /    \__ \ | | / _ \ |  \| | |) | | | | |_) |
  | |_| / ___ \ | || |___| |     ___) || |/ ___ \| |\  | __/| |_| |  __/
  |____/_/   \_\___|_____|_|    |____/ |_/_/   \_\_| \_|____/ \___/|_|

  TeamBrain 24h delta → PRs/Issues 六桶分组 → 主题归类 → 鸭语汇报
     ┌─────────────┐    ┌──────────────┐   ┌──────────────┐
   gh ─→ 时间窗过滤 ─→ 6 桶事件分组 ─→ 主题归类 ─→ 鸭语 + still-open 待办
     └─────────────┘    └──────────────┘   └──────────────┘
```

# daily-standup — TeamBrain 24h delta report

本 skill 是 **TeamBrain 专用**。它依赖 `libz-renlab-ai/TeamBrain` 的 issue/PR 命名公约（fixedflow / issue-N 子任务）和 label 公约（`grill-ready` / `docs-grill-ready` / `grill-working` / `ready-for-human` / `epic`），用于让维护者在每天早上一眼看清「昨天上班到今早上班之间，repo 上发生了什么事」。

## 与邻居 skill 的边界

| 用户在问什么 | 跑哪个 skill |
|---|---|
| 「过去 24h 发生了什么」「since yesterday」 | **本 skill (daily-standup)** ← 时间窗 delta |
| 「所有 open issue」「issue 全景」 | `repo-issues-status` ← 当前快照 |
| 「今日开工晨报」「`/newday`」 | `newday` ← worktree + open work，不限 24h |
| 「#330 怎么样」 | 裸 `gh issue view 330` / `gh pr view 330` |

## 触发条件

只要用户说出下列任一意图（中英都算），立即跑这个 skill，**不要**先口头说「让我看看」就裸跑 `gh pr list`：

- `what happened since yesterday` / `what happened since yesterday 9am` / `since yesterday morning`
- `explore today's issues and PRs` / `today's issues and PRs`
- `daily standup` / `/daily-standup` / `daily report`
- `show me yesterday's activity` / `yesterday → today` / `last 24 hours on GitHub`
- `今天的 issue 和 PR` / `昨天到今天发生了啥` / `过去 24 小时 GitHub 活动`
- `9 点到 9 点发生了什么` / `北京 9 点到北京 9 点`

如果用户**没**指定时间窗，默认 = **昨天 09:00 北京时间 → 今天 09:00 北京时间**。如果用户给了别的 cutoff（"过去 12h"、"上周一到今天"、"since Monday morning"），按用户的时间窗算。

## 执行步骤

### 1. 算出 UTC 窗口

北京时间 = UTC+8。默认 cutoff = 09:00 +0800 = **01:00 UTC**。所以默认窗口：

```
[yesterday 01:00 UTC, today 01:00 UTC)
```

先跑 `date -u` 拿当前 UTC，确认实际窗口端点：

```bash
date -u                                  # 当前 UTC，决定 today
date -u -v-1d +%Y-%m-%dT01:00:00Z 2>/dev/null \
  || date -u -d 'yesterday' +%Y-%m-%dT01:00:00Z    # yesterday 01:00 UTC
```

macOS `date -v` 和 GNU `date -d` 两种语法都要试一下，跨平台兼容。

把两个端点存到 shell 变量：

```bash
WIN_START="2026-05-12T01:00:00Z"   # 示例值，按当前日期算
WIN_END="2026-05-13T01:00:00Z"
```

### 2. 拉 PR 和 issue 原始 JSON（两次 gh 调用并行）

`gh pr list` / `gh issue list` 的 `--search "updated:..."` 接受**日期粒度**（`YYYY-MM-DD..YYYY-MM-DD`），所以要把窗口稍微放宽一天（前后各 +1 day），然后用 jq 在客户端精确过滤到 UTC 端点。

```bash
# PRs (state=all 包含 OPEN + CLOSED + MERGED)
gh pr list --repo libz-renlab-ai/TeamBrain \
  --state all --limit 150 \
  --search "updated:2026-05-11..2026-05-14" \
  --json number,title,state,author,createdAt,updatedAt,closedAt,mergedAt,isDraft,labels \
  > /tmp/teamagent/daily-standup-prs.json

# Issues (gh search prs/issues 有 graphql EOF flake，优先 gh issue list)
gh issue list --repo libz-renlab-ai/TeamBrain \
  --state all --limit 200 \
  --search "updated:2026-05-11..2026-05-14" \
  --json number,title,state,author,createdAt,updatedAt,closedAt,labels \
  > /tmp/teamagent/daily-standup-issues.json
```

**注意**：
- 用 `gh pr list --search` / `gh issue list --search`，**不要**用 `gh search prs` —— 后者会撞 graphql EOF flake。
- `mergedAt` 只在 `gh pr list` JSON 字段里有，`gh search prs` 没有，再多一个不能用的理由。
- limit 给到 PR=150 / issue=200 是因为 TeamBrain 一天可能 merge 60+ PR（实测 2026-05-12 一天 60 PR），不要给小数字。如果实际返回数等于 limit，加 ⚠️ 标注 「数据可能被截断」。

### 3. 用 jq 精确过滤 + 六桶分组

复用同一份 jq 模板，把 `WIN_START` / `WIN_END` 插进去：

```bash
cat /tmp/teamagent/daily-standup-prs.json | jq -r --arg s "$WIN_START" --arg e "$WIN_END" '
  def inwin(t): t >= $s and t < $e;
  "=== PRs MERGED in window ===",
  (map(select(.mergedAt != null and inwin(.mergedAt))) | sort_by(.mergedAt) |
    .[] | "[\(.mergedAt | .[5:16])] #\(.number) \(.title) — \(.author.login)"),
  "",
  "=== PRs CREATED in window ===",
  (map(select(inwin(.createdAt))) | sort_by(.createdAt) |
    .[] | "[\(.createdAt | .[5:16])] #\(.number) [\(.state)] \(.title) — \(.author.login)"),
  "",
  "=== PRs CLOSED-without-merge in window ===",
  (map(select(.closedAt != null and .mergedAt == null and inwin(.closedAt))) | sort_by(.closedAt) |
    .[] | "[\(.closedAt | .[5:16])] #\(.number) \(.title) — \(.author.login)"),
  "",
  "=== PRs still OPEN as of now ===",
  (map(select(.state == "OPEN")) | sort_by(.updatedAt) |
    .[] | "[\(.updatedAt | .[5:16])] #\(.number) \(.title) — \(.author.login)")
'

cat /tmp/teamagent/daily-standup-issues.json | jq -r --arg s "$WIN_START" --arg e "$WIN_END" '
  def inwin(t): t >= $s and t < $e;
  "=== Issues CREATED in window ===",
  (map(select(inwin(.createdAt))) | sort_by(.createdAt) |
    .[] | "[\(.createdAt | .[5:16])] #\(.number) [\(.state)] \(.title) — \(.author.login)"),
  "",
  "=== Issues CLOSED in window ===",
  (map(select(.closedAt != null and inwin(.closedAt))) | sort_by(.closedAt) |
    .[] | "[\(.closedAt | .[5:16])] #\(.number) \(.title) — \(.author.login)"),
  "",
  "=== Issues still OPEN (updated in window) ===",
  (map(select(.state == "OPEN" and inwin(.updatedAt))) | sort_by(.updatedAt) |
    .[] | "[\(.updatedAt | .[5:16])] #\(.number) \(.title) — \(.author.login) — labels: \([.labels[].name] | join(\",\"))")
'
```

六桶 = (PRs merged / PRs created / PRs closed-w/o-merge / PRs still open) + (Issues created / Issues closed / Issues still open in window)。注意 `PRs created` 列出来的 PR 可能同时出现在 `PRs merged` 桶（因为它在同一窗口内被创建并合并）—— 这是 feature，不是 bug，方便维护者一眼看 same-day-merge 的速度。

### 4. 主题归类（汇报时按主题排，不按编号）

读完六桶后，按主题二次归类：

| 主题 | 怎么识别 |
|---|---|
| **Feature N（业务特性）** | 标题含 `feat(m{N})` / `feature-N` / `Feature 1/2/3`，参考 [docs/BUSINESS-FEATURES.md](../../../docs/BUSINESS-FEATURES.md) 三大特性定位 |
| **Frontend / Landing** | 标题含 `landing` / `RocketTeam` / `frontend` / `apps/landing` |
| **Symphony 第二 driver** | 标题含 `symphony` |
| **FIXEDFLOW / driver / grill** | 标题含 `fixedflow` / `grill` / `driver` / `cross-host mutex` |
| **m5 propagation** | 标题含 `m5` / `propagation` / `slice` + 编号 |
| **救火 / bug fix** | label 含 `bug`，或标题含 `fix(...)` 且**非** `fix(ci)` / `fix(docs)` |
| **CI / infra** | 标题含 `fix(ci)` / `chore` / `infra` |
| **Docs / canned answer** | 标题含 `docs(...)` |

汇报时按上表顺序组织段落，每个主题一段，每段列出 PR/issue 编号 + 一句话翻译（不写实现细节，写「用户能感知的功能」）。

### 5. 还开着、需要看一眼（最重要的一段）

最后给一张「⚠️ 还开着」表格，4 列：

```
| PR/Issue | 状态 | 谁的 | 建议下一步 |
```

只列：
- PR：state == OPEN 且在窗口内更新过的，或在窗口内 created 但 still open
- Issue：state == OPEN 且 (label 含 `grill-ready` + `docs-grill-ready` 即 driver-dispatchable)，或在窗口内被 mention/close-attempted 但还开着的 `epic`/`ready-for-human`

「建议下一步」要具体，比如：
- 「driver-dispatchable，可直接 `/fixed-flow-driver <N>`」
- 「等 `/review` PASS 再 squash-merge」
- 「epic，等 child issue 全 close 再人工 close（`ready-for-human` 不允许 agent close）」

### 6. 鸭语包裹 + self-report

按 user-level memory `feedback_always_duck_voice.md`：

- 开场一句 `呷呷~ 鸭鸭把过去 24 小时的 GitHub 活动捋完了。窗口 = ... 北京时间。`
- 收尾一句 `🦆 鸭语小结` 段，用 ASCII 颜文字 `(>ω<)` / `呷呷~`
- 结尾给 `result:` 一行 self-contained 完成信号（per session bg-job contract）

最后挂 12-field `<self-report>` block（project Stop hook 强制要求）。

## 不要做的事

- **不要**裸 `gh pr list` 然后口头描述 —— 必须走 jq 客户端过滤，时间端点对齐到 UTC 1-minute 粒度。
- **不要**用 `gh search prs` —— graphql EOF flake，且没 `mergedAt` 字段。
- **不要**漏掉「PRs created」桶 —— 用户想看 24h 内**多少新工作流入**，不只是多少合并。
- **不要**把 limit 给得太小 —— TeamBrain 单日 PR 流量可破 60，PR=150 / Issue=200 是 floor。
- **不要**忽略 `closedAt && !mergedAt` 的 PR —— 那些是 superseded / abandoned，对维护者复盘很关键。
- **不要**把「还开着」段省掉 —— 这是 standup 报告**最重要**的一段，决定维护者今天先点哪个。
- **不要**自动跑 `git pull` / `/fixed-flow-driver` / 任何写操作 —— 本 skill 是**只读**报告 skill，不能改 repo 状态。
