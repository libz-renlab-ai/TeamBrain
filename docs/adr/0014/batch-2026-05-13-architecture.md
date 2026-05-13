---
Title: 'TeamBrain 12-issue unified batch grill — cross-cutting architecture'
Issues: "#290, #291, #296, #297, #306, #308, #309, #310, #320, #326, #371, #372"
Saved-at: 2026-05-13
Saved-by: /grill-with-docs save-mode (batch grill from ChatGPT share)
Grill-URL: https://chatgpt.com/s/t_6a03861d49b081918ed2c900f3870c46
---

# TeamBrain 12-issue unified batch grill — cross-cutting architecture

> Save-mode capture per **ADR-0014 §"Operational shape" step 3** — **not a re-grill**.
> Cross-cutting architectural decisions (storage, work-item, plugin, config source) that
> apply across all 12 issues but are not specific to any one. Overall verdict lives in
> `./batch-2026-05-13-overview.md`; feature specs in `./batch-2026-05-13-feature-specs.md`.
> Source: [chatgpt.com share](https://chatgpt.com/s/t_6a03861d49b081918ed2c900f3870c46).

## Sections inlined below

- §3 — Prompt 原文是否完整存储 (storage of full prompt text)
- §5 — Raw event 删除策略 (append-only deletion strategy)
- §9 — Work item 锚点 = Issue > PR > Branch > Commit > AI Session
- §16 — Plugin 配置：所有能力都是 plugin，leader 可配置
- §17 — Project config source-of-truth: leader app + server-generated PRs

# 3. prompt 原文是否完整存储？

## Grill 问题

既然 leader 要看 prompt evidence，`UserPromptSubmit` 是否只存 metadata？

## 可选答案

A. 只存 metadata
B. 存 redacted prompt
C. 存 summary，不存原文
D. 完整存 raw prompt
E. 默认 metadata + summary，leader 可选 raw

## 裁决

根据你前面的回答，选 **D：完整存 raw prompt**。

但显示层要可配置：

```txt
存储：
  raw prompt full store

展示：
  leader 可配置展示哪些字段
  可配置首页是否展示 prompt
  可配置异常详情是否展开 prompt
  可配置日报是否附 prompt evidence link
```

关键是分清楚：

```txt
store full
≠ everywhere display full
```

完整存储解决 evidence / replay；展示策略由 leader / plugin 配置决定。

---

# 5. raw event 删除策略：append-only，不代表永久不可清理

## Grill 问题

raw prompt 完整存储后，能不能删除？

## 可选答案

A. 绝对 append-only，永不删除
B. 允许 hard delete
C. append-only event，但 payload 可 redacted/deleted
D. leader 配 retention
E. C + D

## 裁决

选 **E**。

```txt
事件链：
  append-only

payload：
  可按 retention policy 删除 / 脱敏 / 隐藏

删除动作：
  追加 PayloadDeleted / PayloadRedacted 事件

策略继承：
  project > member > team
```

示例：

```txt
Project A:
  raw_prompt_retention = 30d

Project B:
  raw_prompt_retention = forever

Project C:
  raw_prompt_retention = 7d
```

这既满足“完整存储”，也避免 prompt 数据变成永远不能清理的风险。

---

# 9. work item 锚点：Issue > PR > Branch > Commit > AI Session

## Grill 问题

leader 看进展时，最小锚点是什么？

## 可选答案

A. GitHub Issue
B. PR
C. Branch / commit
D. AI session
E. 多锚点，优先级固定

## 裁决

选 **E**。

```txt
canonical work item priority:
  1. Issue
  2. PR
  3. Branch
  4. Commit
  5. AI Session only
```

原因：日报和异常都是给 leader 看，leader 最关心的是“哪个任务 / 哪个 issue / 哪个 PR 卡住”，不是“哪个 session 很长”。

每条 event 最终尽量解析成：

```txt
work_item_id
work_item_type
repo
issue_number
pr_number
branch
commit_sha
session_id
confidence
```

自动关联失败时：

```txt
fallback:
  AI Session only

之后允许：
  leader 手动绑定
  member 手动绑定
  AI 建议绑定
```

---

# 16. plugin 配置：所有能力都是 plugin，leader 可配置

## Grill 问题

日报、异常、prompt evidence、audio、statusline 这些是硬编码功能，还是 plugin？

## 可选答案

A. 全部硬编码
B. 只有日报是 plugin
C. 只有异常是 plugin
D. audio/statusline 不是 plugin
E. 全部作为 plugin 或 plugin event source

## 裁决

选 **E**。

```txt
event sources:
  Claude/Codex hooks
  GitHub
  Audio
  Statusline/agent health

plugins:
  GreenLightPresencePlugin
  DailySummaryPlugin
  LiveInspectionPlugin
  AbnormalDetectorPlugin
  PromptEvidencePlugin
  AudioTranscriptPlugin
  ProjectEvidencePlugin
```

配置方式按你指定：

```txt
project > member > team
```

并且不要做复杂 policy UI；按 CLAUDE.md 那种工作方式：

```txt
team instruction
member instruction
project instruction
plugin frontmatter + markdown intent
```

推荐配置文件：

```md
---
plugin: stuck-work-item
enabled: true
events:
  - UserPromptSubmit
  - GitHubActivity
warning_prompt_count: 5
critical_prompt_count: 10
window_minutes: 120
---

如果 AI 交互很高，但 GitHub 没有 commit、PR、issue comment 或 review，
把该 work item 标记为 stuck。
```

---

# 17. project config source of truth：leader app 改配置，server 生成 PR

## Grill 问题

leader 在 app 里改 plugin 配置后，最终配置在哪里？

## 可选答案

A. server DB 是唯一 source of truth
B. Git repo 是唯一 source of truth
C. team/member 在 server，project 在 Git
D. 本地机器是 source of truth
E. 不存配置

## 裁决

选 **C**。

```txt
team config:
  server DB

member config:
  server DB

project config:
  Git repo
  .teamagent/plugins/*.md

runtime merge:
  project > member > team
```

leader app 操作：

```txt
leader 在 app 里启用 plugin
  ↓
server 生成 .teamagent/plugins/*.md
  ↓
开 PR
  ↓
merge 后成为 project-level instruction
  ↓
agent / server runtime 读取并合并
```

这既符合 team lead 产品，也保留 CLAUDE.md 风格的项目级配置。

---

--- end ---
