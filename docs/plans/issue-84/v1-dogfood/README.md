```
  V1 真用户 TTHW 6-Step Pipeline (total budget: 300 s)
  ======================================================

  [陌生用户]
      │
      │ Step 1 ── Open landing URL ──────────── budget:  8 s
      │           libz-renlab-ai.github.io/TeamBrain
      │
      ▼
  [页面可见]
      │
      │ Step 2 ── Copy install one-liner ──────  budget:  5 s
      │           single curl | sh command visible on hero
      │
      ▼
  [命令已复制]
      │
      │ Step 3 ── Paste in terminal ───────────  budget:  5 s
      │           新终端窗口打开，命令粘贴到 prompt
      │
      ▼
  [终端已粘贴]
      │
      │ Step 4 ── curl … | sh runs ────────────  budget: 120 s
      │           安装 teamagent，输出 "teamagent installed ✓"
      │
      ▼
  [安装完成]
      │
      │ Step 5 ── teamagent demo ──────────────  budget:  30 s
      │           命令找到、demo 流程启动
      │
      ▼
  [demo 运行中]
      │
      │ Step 6 ── First PreToolUse intercept ──  budget:  20 s
      │           终端可见 hook 拦截事件输出
      │
      ▼
  [TTHW 完成]
      总计 ≤ 300 s 且无 abort 触发 → PASS
      触发任一 abort 信号 (见下方表) → STOP, 标记 PARTIAL/FAIL
```

> **阈值出处**：abort 信号（包括步骤 4 的 180 s 安装超时特例和总计
> 280 s 的早停线）以下方"Abort 信号 / Abort signals"表为准；本 ASCII
> 概览仅作流程示意，不替代该表。Stopwatch hook 章节的"60 s/90 s
> 无输出"用语指步骤 4 安装阶段的**无任何 stdout 输出**判据，与"任一
> 单步 > 90 s 总用时"是互补关系，不冲突。

# V1 真用户 Dogfood 执行协议

目录：`docs/plans/issue-84/v1-dogfood/`
关联：issue #84 acceptance R6 · issue #122 · PR #115

---

## 目标 / Goal

让 ≥1 名**真实陌生用户**（不得是队友 / AI agent / CI sandbox）在看到
landing page 之后、不借助任何人工协助，独立完成从"看到页面"到"跑通
`teamagent demo` 并亲眼看到第一次 PreToolUse hook 拦截输出"的全流程，
全程用时 **≤ 300 s（5 分钟）**。这是 issue #84 的人工验收门禁 R6，也是
issue #122 的核心交付目标。完成后，录屏 `.cast` 文件上传至本目录，
per-step 计时以 `template-comment.md` 格式评论到 issue #122，
最终在 issue #84 评论"acceptance R6 closed"。

---

## 前置门 / Prerequisites

在招募用户、开始录制之前，先在你自己的机器上验证以下门禁全部通过。
**任一门不通，dogfood 无意义。**

| 门禁 | 验证命令 | 通过标准 |
|------|----------|----------|
| Pages 网站可访问 | `curl -sIL https://libz-renlab-ai.github.io/TeamBrain/ \| head -5` | 第一行必须是 `HTTP/2 200` |
| 英雄 GIF 出现在页面 | `curl -s https://libz-renlab-ai.github.io/TeamBrain/ \| grep -c double-moment.gif` | 输出 ≥ 1 |
| install one-liner 可见 | 浏览器打开 landing page，检查 hero 区域有 curl 命令且可选中复制 | 目视可见、可单击复制 |
| install.sh 可下载 | `curl -sI https://libz-renlab-ai.github.io/TeamBrain/install.sh` | `HTTP/2 200`（可选，但推荐） |

若 Pages 返回 404，先看 `landing-deploy.yml` 最新 run 状态：

```bash
gh run list --workflow=landing-deploy.yml --limit=3
```

若状态为 `failure` 且错误是"branch not allowed"，需要先将 `main`
加入 `github-pages` environment 的 `custom_branch_policies`（见
`docs/plans/2026-05-08-issue-122/plan.md` Slice A）。

---

## 录制工具链 / Recording toolchain

录制使用 **asciinema**（终端录屏，生成 `.cast` 文件）。可选使用 **agg**
将 `.cast` 转换为 GIF 嵌入 issue 评论。

### macOS 安装（推荐）

```bash
brew install asciinema agg
```

### 跨平台备用（pip）

```bash
pip install asciinema        # Python 3.8+
# agg 需要 cargo，见 https://github.com/asciinema/agg
cargo install --git https://github.com/asciinema/agg
```

### 录制命令

```bash
# 在测试开始前执行，<user-handle> 换成陌生用户的 GitHub handle 或匿名标识
asciinema rec docs/plans/issue-84/v1-dogfood/<user-handle>.cast
```

录制结束后按 `Ctrl+D` 或输入 `exit` 停止。若要生成 GIF：

```bash
agg docs/plans/issue-84/v1-dogfood/<user-handle>.cast \
    docs/plans/issue-84/v1-dogfood/<user-handle>.gif
```

### 备用录制方案

若 asciinema 在测试环境不可用：
- **macOS**：QuickTime Player → 新建屏幕录制，保存为 `.mov`，
  重命名为 `<user-handle>.mov` 放入本目录。
- **Linux / Windows**：OBS Studio → mkv/mp4，同样放入本目录。
- `.mov` / `.mp4` 不自动计时；需由录制者手工记录每步开始时间戳
  并填入 `template-comment.md`。

---

## 执行协议 / Protocol

### 角色分工

| 角色 | 职责 |
|------|------|
| **陌生用户（被测者）** | 独立操作，不接受任何提示 |
| **录制者（你/队友）** | 旁观，不出声提示；负责 asciinema 录制和计时 |

### 秒表约定

1. 双方就绪后，录制者宣布 **"start"**，同时点击计时器开始。
2. 被测者在每步完成时**口述** "step N done"（或用动作示意）。
3. 录制者在 `template-comment.md` 对应行填入实际秒数。
4. 任意一步超过 60 s 时，录制者在旁边说 "60"；超过 90 s 时说 "time"
   并执行 **abort 流程**（见下一节）。

### 6 步 TTHW 预算表

| 步骤 | 内容 | 时间预算 | 失败信号 |
|------|------|----------|----------|
| **1** Open landing URL | 打开 `https://libz-renlab-ai.github.io/TeamBrain/` | 8 s | 404 / 空白 / GitHub Pages 未上线 |
| **2** Copy install one-liner | 在 landing page 找到并复制 curl 命令 | 5 s | 文字不可选中 / 无复制按钮 |
| **3** Paste in terminal | 打开新终端窗口，粘贴命令 | 5 s | 剪贴板为空 / 未打开终端 |
| **4** `curl … \| sh` runs | 命令执行，安装 teamagent 完成 | 120 s | 网络超时 / SHA mismatch / node 缺失 |
| **5** `teamagent demo` | 运行 demo 命令，输出正常 | 30 s | command not found / demo 路径错误 |
| **6** First PreToolUse intercept | 终端可见 hook 拦截事件输出 | 20 s | hook 未加载 / demo 未触发拦截 |
| **总计** | — | **300 s** | 任意步 > 90 s 或总计 > 280 s → abort |

### Stopwatch hook（计时操作）

- 被测者说 **"start"** → 录制者立即点击秒表 + `asciinema rec` 已在运行。
- 每步完成，被测者口述 "step N done"，录制者记录当前时刻，减去上步结束
  时刻，得到该步实际秒数，填入 `template-comment.md`。
- 步骤 4 开始后，如果安装进程卡住超过 60 s 无任何输出，口述 "60"；
  再过 30 s（共 90 s）仍无输出，口述 "time"，执行 abort。
- 全程不中断录制，即使 abort 也保留 `.cast` 文件作为故障证据。

---

## 招募 / Recruitment

### 符合资格

- 真实陌生用户：**未参与过本项目的开发、代码审查或文档讨论**。
- 对 TeamAgent 一无所知或仅听过名字但从未用过。
- 有基本 terminal 使用能力（会打开终端、会粘贴命令）。
- 网络环境正常，可访问 GitHub。

### 不符合资格（必须排除）

| 排除类别 | 原因 |
|---------|------|
| 本项目队友（含 PR reviewer） | 了解内部细节，测试结果失真 |
| AI agent / Codex bot | 不是"人"，无法体现真实用户心智模型 |
| GitHub Actions / sandbox session | CI 环境不代表真实用户设备 |
| 已看过 install 文档 / 跑过 demo 的人 | 已有先验知识，计时无效 |

### 推荐招募渠道

- Slack / Discord **dev tooling** 频道（#tools / #developer-experience）
- HN 帖子评论区或 X / Mastodon 发帖，说明需要 5 分钟时间测试安装流程
- 办公室偶遇的工程师（前提：此前没看过 TeamBrain 文档）
- 开源社区 office hours / pair programming 活动

**不要**找同事帮忙 "走个过场"。招募一个真正陌生的用户比招募一个方便的
队友更难，但这是 R6 的核心价值所在。

---

## Abort 信号 / Abort signals

以下任意条件触发后立刻停止测试：

| 条件 | 触发阈值 |
|------|----------|
| 单步用时过长 | 任意单步 > 90 s |
| 安装超时 | 步骤 4 (curl install) > 180 s |
| 连续失败 | 任意步骤连续失败 2 次（第 2 次失败即 abort） |
| 总时超限 | 全程总计 > 280 s |

### Abort 后做什么

1. **立刻停止**——说 "stop"，不要继续引导被测者。
2. **保留 `.cast` 文件**——即使 partial，也保存到本目录，命名
   `<user-handle>-abort.cast`。
3. **记录故障步骤**——在 `template-comment.md` 填写实际进展到哪步、
   失败信号是什么，并标记 `[ ] FAIL`。
4. **对每个摩擦点开一个 follow-up issue**，issue 标题格式：
   `ux: [dogfood abort] <摩擦点简述>`，正文粘贴 `.cast` 文件相关时段。
5. **不要悄悄重试**——不要换一个更容易通过的用户重测。先修复最高优先
   级的摩擦点（通常是 landing 文案或 install.sh 依赖检查），再找新陌
   生用户重新开始一轮完整的 dogfood。

---

## TTHW > 5 分钟怎么办 / If over budget

> 超时是有价值的信号，不是失败——正确响应是记录 + 修复 + 重测，而不是找
> 一个"更容易通过"的用户。

1. **记录哪步绊倒了用户**：填 `template-comment.md`，标记 `[ ] FAIL` 或
   `[ ] PARTIAL`，附完整计时。
2. **对每个摩擦点开 follow-up issue**：描述具体摩擦、实际耗时、`.cast`
   文件时间戳。
3. **修复最高影响项**（按频率排序）：
   - Landing page 文案不清晰 → 改 `apps/landing/src/index.html`
   - install.sh 缺少依赖检查（Node / curl 版本） → 改 `release/install.sh`
   - `teamagent demo` 路径错误 → 改 CLI 入口
4. **重测必须找新陌生用户**——同一个用户第二次测试已有先验，数据无效。

---

## 交付物 / Deliverables

一次成功的 dogfood run 产出以下所有物件：

| # | 交付物 | 存放位置 / 渠道 |
|---|--------|----------------|
| 1 | `<user-handle>.cast` 录屏文件 | `docs/plans/issue-84/v1-dogfood/<user-handle>.cast` |
| 2 | per-step 计时评论 | 粘贴 `template-comment.md` 填好的版本到 issue #122 评论区 |
| 3 | 摩擦笔记 | 即使 TTHW ≤ 5 min 也要填写，捕捉用户迟疑点 |
| 4 | issue #84 评论 | 评论 "R6 closed — TTHW ≤ 300s，cast attached"，附 issue #122 链接 |

### .cast 文件命名规则

```
<user-handle>.cast          # 完整成功 run
<user-handle>-abort.cast    # abort run（保留证据）
<user-handle>-2.cast        # 同一 handle 第二次 run（修复后重测）
```

---

## 参考 / References

- **issue #122**（本次 dogfood 任务）：
  `https://github.com/libz-renlab-ai/TeamBrain/issues/122`
- **issue #84**（acceptance R6 gate）：
  `https://github.com/libz-renlab-ai/TeamBrain/issues/84`
- **PR #115**（landing page + install one-liner 上线）：
  `https://github.com/libz-renlab-ai/TeamBrain/pull/115`
- **本次 PR 计划文件**：
  `docs/plans/2026-05-08-issue-122/plan.md`
- **judge harness 接受标准 R6**：
  `docs/plans/2026-05-08-issue-122/judge.md` §V3 R6
- **per-step 计时模板**：
  `docs/plans/issue-84/v1-dogfood/template-comment.md`（本目录）
