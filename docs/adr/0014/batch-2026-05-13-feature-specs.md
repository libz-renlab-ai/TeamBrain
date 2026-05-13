---
Title: 'TeamBrain 12-issue unified batch grill — team-lead feature specs'
Issues: "#290, #291, #296, #297, #306, #308, #309, #310, #320, #326, #371, #372"
Saved-at: 2026-05-13
Saved-by: /grill-with-docs save-mode (batch grill from ChatGPT share)
Grill-URL: https://chatgpt.com/s/t_6a03861d49b081918ed2c900f3870c46
---

# TeamBrain 12-issue unified batch grill — team-lead feature specs

> Save-mode capture per **ADR-0014 §"Operational shape" step 3** — **not a re-grill**.
> Cross-cutting team-lead product feature specs §25–§29 (homepage, live inspection, daily
> summary, incident workflow, plugin permissions). Verdict + roadmap live in
> `./batch-2026-05-13-overview.md`; architecture in `./batch-2026-05-13-architecture.md`;
> per-issue grills in `./<issue>.md` siblings. Source: [chatgpt.com share](https://chatgpt.com/s/t_6a03861d49b081918ed2c900f3870c46).

## Sections inlined below

- §25 — Detailed spec: leader homepage
- §26 — Detailed spec: live inspection
- §27 — Detailed spec: daily summary
- §28 — Detailed spec: incident workflow
- §29 — Detailed spec: plugin permissions

# 25. 详细功能规格：leader 首页

## 页面目标

leader 打开 app，第一眼回答：

```txt
哪里异常？
谁正在推进？
今天做了什么？
```

## 布局

```txt
Top: Abnormal / Need Attention
  - stuck work item
  - no GitHub progress despite high AI activity
  - hook upload failed
  - project binding missing
  - member inactive on assigned project

Middle: Green Light Matrix
  rows: members
  columns: projects
  cell: active / idle / offline / error

Bottom: Daily Summary
  member × project one-liners
  project rollup
```

## green light cell

```txt
Alice × TeamBrain
  status: active
  last_event: UserPromptSubmit
  session_count: 2
  current_anchor: #291 / branch codex-init
  click: start live inspection
```

## abnormal card

```txt
TeamBrain / #291 may be stuck
Reason:
  12 UserPromptSubmit events in 90 min
  0 commits / PR updates / issue comments
Evidence:
  GitHub: no progress events
  Prompt: latest 5 prompts available
Action:
  inspect / assign / acknowledge / resolve
```

---

# 26. 详细功能规格：live inspection

## 触发

```txt
leader 点击：
  green light
  member
  project
  issue/PR
  abnormal card
```

## 启动窗口

```txt
member:
  last 24h

project:
  last 7d

issue/PR:
  since created

green light:
  current session + last 24h
```

## 数据源

```txt
GitHub:
  issues
  PRs
  commits
  reviews
  comments
  branches

AI events:
  SessionStart
  UserPromptSubmit
  Stop

Audio:
  optional, if plugin enabled

Statusline/agent:
  upload errors
  binding missing
  stale agent
```

## 生命周期

```txt
start live inspection
  ↓
fetch GitHub activity
  ↓
fetch normalized_events
  ↓
link work items
  ↓
compute progress / abnormal hints
  ↓
if abnormal:
    create incident
else:
    keep only telemetry
```

---

# 27. 详细功能规格：daily summary

## 粒度

```txt
primary:
  member × project × day

rollup:
  project × day

optional:
  member × day
```

## 生成逻辑

```txt
input:
  GitHub activity
  work item anchors
  optional AI event summary
  optional audio summary

not default:
  raw prompt text in body
```

## 输出

```txt
Alice / TeamBrain / 2026-05-13:
  今天推进 Codex hook 初始化和幂等 merge 策略，完成 adapter 边界设计，尚未打开 PR。

Project TeamBrain / 2026-05-13:
  今日主要推进 Claude/Codex hook、leader green light、日报和 audio 命名重构；#291 仍存在 init conflict 风险。
```

## 发送渠道

```txt
default:
  app 内

plugins:
  email
  Slack
  飞书
  企业微信
```

---

# 28. 详细功能规格：incident workflow

## incident 类型

```txt
stuck_work_item
hook_upload_failure
binding_missing
inactive_assigned_member
high_prompt_low_progress
audio_transcript_risk
github_no_progress
```

## severity

```txt
info
warning
critical
```

## 操作

```txt
acknowledge
assign owner
comment
resolve
link GitHub issue/PR
open live inspection
```

incident 不替代 GitHub issue。它是 leader dashboard 里的轻量工作流。

---

# 29. 详细功能规格：plugin 权限

每个 plugin 必须声明自己读什么：

```yaml
plugin: stuck-work-item
scopes:
  - normalized_events:read
  - github_activity:read
  - prompt_raw:read_optional
```

leader 配置：

```txt
team:
  default plugins

member:
  member-level preference/default

project:
  project-level override, highest priority
```

加载方式：

```txt
team instruction
member instruction
project instruction
current event
```

不要做复杂的“resolved policy UI”。按你指定，像 CLAUDE.md 那样工作。

---

--- end ---
