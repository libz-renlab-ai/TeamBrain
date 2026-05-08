# Trio Deep Chaos-QA — Wave 15 诊断报告

**报告日期**：2026-05-08
**baseline**：`origin/main` @ `96b9202`（含 PR #149 修复）
**branch**：`test/trio-deep`
**测试模式**：chaos-qa-hunter adversarial（Tier 2 sandbox 隔离，仅 `/tmp/teambrain-trio-deep-*`）
**完整 bug 清单**：[`BUGS.md` Wave 15 section](../../BUGS.md)（14 条 bug，附复现步骤 + 代码位置）

## Executive Summary

PR #149 修复了之前的 5 个 bug，但本轮深度对抗测试在三个模块上又发现 **14 个新 bug**（其中 1 个 Critical、6 个 High、6 个 Medium、1 个 Low），其中**7 个具备真实 security 或 silent-data-loss 风险**。覆盖率约 30% — 仍有 70% hypothesis 没碰，特别是并发、Tier 3/4 副作用边界、跨平台 (macOS NFD / Windows MAX_PATH) 没测。

PR #149 是好的修复，但**它修的是显式可见 bug**；本轮发现的 14 个 bug 多数是**沉默失败**——用户得不到警告。

## 三大功能健康度

| 模块 | bug 数 | 健康度 | 一句话评估 |
|------|--------|--------|------------|
| A. 全自动更新 (SELF-UPDATE) | 1 | 🟡 中 | 核心链路稳；唯一风险是 PR #149 引入的 ts-ext degrade regex 范围过宽，会把真错误掩盖 |
| B. 病毒式传播 (M5 viral) | 4 | 🔴 不及格 | 静默破坏用户已有 git hooks + 完整 SessionStart 校验绕过 = 任意 env 注入即感染 |
| C. 团队规则同步 (M5 team) | 9 | 🟠 偏低 | 主链路工作正常，但 secret-scanner 漏检面广（base64 / 分裂 / Slack webhook），scope-classifier 中英混合误判 |

## 关键发现 — 必读

### 🚨 Critical: BUG-W15-009 SessionStart 校验绕过

**这是本轮最严重的发现**。

任何能设 `CLAUDE_PROJECT_DIR` 环境变量的进程，在已装 TeamAgent 的机器上都会触发**完整 viral 链路**——auto-infect、auto-bootstrap、auto-commit。
B-145 校验只要求 3 个信号"任一"通过，env 单一信号就够。

**真实危害**：
- cron 跑 `CLAUDE_PROJECT_DIR=/path/to/repo claude ...` → 静默感染并 commit
- 用户写 wrapper 给 Codex / GPT 设 `CLAUDE_PROJECT_DIR` 全局 → 每开任意工具都感染
- 共享 dev 机 / CI runner 上 teammate 的 env export → 静默修改他人项目

复现步骤已在 BUGS.md 详细记录。

### 🚨 High: BUG-W15-002 + 003 双杀

**复合后果非常严重**：
- 用户已有 `.husky/` + `core.hooksPath=.husky` → m5-infect 静默改成 `.githooks` → husky 全停
- 用户已有 `.githooks/post-merge` → m5-infect 因 `wx` flag 跳过 → TeamAgent 自动同步永不触发

**双杀场景**：用户有 husky，跑 m5-infect → husky 死 + TeamAgent post-merge 装不上 → repo 进入"双失能"中间态，用户无任何提示。

### 🔐 Security: BUG-W15-004/005/006 secret-scanner 漏检

| 形态 | gate-1 | 行为 |
|------|--------|------|
| `c2tfcHJvajEyMzQ1Njc4OTAxMjM0NTY3ODkw` (base64 sk_proj key) | 0 命中 | promoted 到 L2 |
| `sk - proj-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA` (空格分裂) | 0 命中 | promoted 到 L2 |
| `https://hooks.slack.com/services/T012AB3C4/B567CD89EF/...` | 0 命中 | promoted 到 L2 |

**真实危害**：用户在 rule 文本里贴了一个看似无害的 webhook、或者复制 base64 凭据，TeamAgent 不仅不警告，**还自动 commit + push 到团队 git**。

## 模块层面的"模式"

测试中浮现的几个**重复出现的 anti-pattern**（不是单点 bug）：

1. **Silent fail 下毒** — m5-infect 因 file 已存在 `wx` skip / m5-bootstrap 错 manifest exit 0 / m5-share 不识别 `--confidence`：用户都看不到失败信号。**整个 M5 模块对"什么是用户期望的反馈"缺乏一致策略**。
2. **Pattern 边界保守不够** — secret-scanner 模式硬编码 prefix（`sk-`、`gh[psuro]_`），没考虑编码、空白、URL；scope-classifier 只 OR 不 AND（一个 shareable 关键字就足够，不看 personal context）。
3. **Env-var 信任过度** — B-145 三信号 OR 而非 AND 让单 env 即够；child spawn 全继承父 env 没有 sanitize。
4. **Path / boundary 假设跨平台** — 200-char rule_id 在路径前缀下变 274 chars (Windows MAX_PATH 风险)；secret-scanner regex 的 catastrophic backtracking 在 600 chars text 上 1.3 秒。

## 没测到的（Wave 16+ 应该补）

- **Tier 3 副作用**：动 `~/.teamagent/global.db` 看 cascade
- **Tier 4 真重装**：让 `npm install -g` 真跑一次（PACKAGE_SPEC tarball）
- **并发**：两个 worktree 同时 SessionStart / m5-publish race
- **跨平台**：macOS NFC vs NFD 文件名往返；Windows 没启 long-path
- **网络故障**：GitHub API 真返回 HTML 200（非 JSON）/ 真 rate-limit
- **时钟回拨**：手动改系统时间触发 throttle bypass
- **Symlink / shallow git / detached HEAD**：m5-infect 在这些 git 状态下行为
- **Codex review 闭合**：本报告未走 codex 二次确认（同 #149 connector 失效问题）

## 推荐下一步（按优先级）

**P0 — 立刻修（影响 Critical/High 可重现 bug）**
1. **BUG-W15-009** 加 AND 校验（env + (stdin payload | bare-allow)）
2. **BUG-W15-002** m5-infect 设 hookspath 前先 `git config --get core.hooksPath`，已有非 `.githooks` 值时 abort + 提示
3. **BUG-W15-003** applyInfection 用 `w` 而非 `wx`（或 detect existing hook 时 chain-load）+ 输出明确列出"应写但跳过"的文件
4. **BUG-W15-001** ts-ext degrade regex 改严：`/Unknown file extension "?\.ts"? for [^\n]*\.ts(\b|['"])/`

**P1 — 后续修（High security / data integrity）**
5. **BUG-W15-004/005/006** 扩 secret-scanner 模式：base64 候选解码 + 空白合并重扫 + 加常见 webhook URL（Slack/Discord/Teams）
6. **BUG-W15-014** m5-sync 把 skipped files 全列 + 按 reason 分类
7. **BUG-W15-007** scope-classifier 增加 personal context negative 信号（"我个人"、"私人"、"本地"等）

**P2 — UX 一致性**
8. **BUG-W15-010** parseM5ShareArgs 加 `--confidence` 解析 + range 校验
9. **BUG-W15-011** m5-bootstrap 错误时 exit non-zero
10. **BUG-W15-012** rule_id 长度限制考虑 path prefix（动态算）

**P3 — Diagnostics / Perf**
11. **BUG-W15-013** secret-scanner 加 input length cap (e.g., 4KB) + warn
12. **BUG-W15-008** api_token min-length 改 19 或调整 credit_card 优先级

## 修复打包建议

**不要一个 PR 修全部 14 个**——分组：

- **PR-A**（Critical + High security）：W15-009 / 002 / 003 / 001 + 004 / 005 / 006 — security/safety hardening
- **PR-B**（UX consistency）：W15-007 / 010 / 011 / 014 — let users know what happened
- **PR-C**（Boundary + Perf）：W15-012 / 013 — robustness

每个 PR 独立 review + Codex（先把 connector 修好）。

## 鸭鸭一句话

```
   __
  <(o )___       三大功能没炸，但骨架里藏着 14 个静默失败。
   ( ._> /       PR #149 修了能看到的，本轮挖出看不到的。
    `---'        14 中 7 是 security 或 data-loss，建议 P0 三个先修。
```
