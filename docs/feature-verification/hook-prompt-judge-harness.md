```text
RUN → DUMP → READ

  ┌──────────────────────┐     ┌──────────────────────┐     ┌──────────────────────┐
  │  RUN                 │────▶│  DUMP                │────▶│  READ                │
  │  跑固定工具           │     │  写 judge.json        │     │  裁判 LLM 只读 JSON  │
  │  记录 exit_code       │     │  + 原始 stdout/stderr │     │  输出 {pass, reasons}│
  └──────────────────────┘     └──────────────────────┘     └──────────────────────┘

  被测代码 / 执行 agent 不能同时当裁判。
```

# Hook Prompt Judge Harness — issue #86

本文档是 `scripts/hook-prompt-verify.sh` 的配套规范，说明如何独立验证 issue #86 的
两项交付：人性化 hook 提示格式（task 1）和 matcher 假阳性修复（task 4）。

---

## 为什么需要这个 harness

根据项目用户级规则 `~/.claude/docs/rules/testing-judge-harness.md`：**代码不能自己评价
自己**。必须有独立的第三方裁判，只读固定工具产出的 raw JSON 与原始 evidence，不依赖
执行 agent 的主观判断。本 harness 正是为 issue #86 提供这道独立的裁判链路。

---

## RUN — 跑固定工具

运行顺序固定，脚本退出前完整保存所有 stdout / stderr。

### 1. 人性化格式快照测试

```bash
pnpm test --filter @teamagent/adapters \
  packages/adapters/src/hook/claude-agent-sdk/__tests__/format-snapshot.test.ts \
  > .judge/hook-prompt-<run_id>/format-snapshot.txt 2>&1
```

测试文件在 #86 实现后存在。harness 记录 exit_code；测试本身包含快照断言，
验证第一行 ≤ 80 字符、`⚠️ TeamAgent 提醒` 前缀、无 `Error:` 字面量、
`细节:` 后缀行格式。

### 2. Matcher 假阳性回归测试

```bash
pnpm test --filter @teamagent/core \
  packages/core/src/matcher/legacy/__tests__/keyword-matcher.test.ts \
  > .judge/hook-prompt-<run_id>/matcher-fp.txt 2>&1
```

测试文件将包含 `META_COMMAND_PREFIXES` 相关新 fixture（详见 §假阳性回归库）。

### 3. 真实 PreToolUse 模拟

使用合成 fixture 驱动 CLI 入口，模拟含 `moment` 的 `gh issue create` 命令经过
完整 hook 管道后的真实 stderr 输出：

```bash
node packages/cli/dist/bin-pre-tool-use.js \
  < .judge/fixtures/pre-tool-use-meta-cmd.json \
  > .judge/hook-prompt-<run_id>/sim-out.json \
  2> .judge/hook-prompt-<run_id>/sim-err.txt
```

#### Fixture 文件位置与结构

`.judge/fixtures/pre-tool-use-meta-cmd.json`：

```json
{
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": {
    "command": "gh issue create --title 'cleanup' --body 'moment is bad, we should migrate'"
  }
}
```

`tool_name=Bash` + `tool_input.command` 包含 `gh issue create` 前缀，因此
`META_COMMAND_PREFIXES` 白名单应阻止 `wrong_pattern: "moment"` 规则触发，
`sim-err.txt` 应为空（meta-cmd 跳过，无拦截输出）。

---

## DUMP — 写 judge.json + 原始 stdout

所有输出写入 `.judge/hook-prompt-<run_id>/`，`run_id` 默认为 Unix 时间戳。

### 目录结构

```
.judge/hook-prompt-<run_id>/
├── format-snapshot.txt   # pnpm test 完整 stdout+stderr
├── matcher-fp.txt        # matcher 测试完整 stdout+stderr
├── sim-out.json          # PreToolUse 模拟的 stdout（hook decision JSON）
├── sim-err.txt           # PreToolUse 模拟的 stderr（用户可见 hook 提示，可能为空）
└── judge.json            # 量化指标汇总（供裁判 LLM 读取）
```

### judge.json 字段说明

| 字段 | 类型 | 含义 |
|------|------|------|
| `format_snapshot_pass` | 0/1 | format-snapshot 测试是否全 PASS |
| `matcher_fp_pass` | 0/1 | matcher 假阳性回归测试是否全 PASS |
| `first_line_chars` | int | sim-err.txt 第一行字符数（meta-cmd 跳过时为 0） |
| `details_line_present` | 0/1 | sim-err.txt 中 `^细节:` 行出现 ≥1 次 |
| `error_literal_present` | 0/1 | sim-err.txt 中含字面 `Error:` 的行数（必须为 0） |
| `meta_cmd_skipped` | 0/1 | sim-err.txt 为空，即 meta-cmd 未触发拦截 |

### 示例 judge.json

```json
{
  "run_id": "1746614400",
  "exit_code": 0,
  "metrics": {
    "format_snapshot_pass": 1,
    "matcher_fp_pass": 1,
    "first_line_chars": 0,
    "details_line_present": 0,
    "error_literal_present": 0,
    "meta_cmd_skipped": 1
  },
  "evidence_dir": ".judge/hook-prompt-1746614400",
  "stdout_path": ".judge/hook-prompt-1746614400/sim-err.txt"
}
```

---

## READ — 让裁判 LLM 只读 raw JSON 评

执行 agent、计划作者、被测代码均**不得**充当裁判。裁判必须是独立的 `claudefast -p`
调用，输入仅限 raw judge.json 与 evidence 文件：

```bash
claudefast -p "Read .judge/hook-prompt-<id>/judge.json + sim-err.txt. \
Grade against: \
(1) first-line ≤ 80 chars and conveys what-tried + why-caught + what-to-do; \
(2) details suffix line present once; \
(3) no 'Error:' literal; \
(4) matcher-fp test green; \
(5) meta-cmd false positive blocked. \
Output JSON {pass: bool, reasons: [string]}."
```

裁判只读 raw JSON，不运行代码，不依赖主观判断。

---

## Acceptance criteria

issue #86 tasks 1 + 4 对应指标阈值：

| 指标 | 阈值 | 对应 issue 任务 |
|------|------|----------------|
| `first_line_chars` | ≤ 80（sim-err 有内容时）或 0（meta-cmd 跳过） | task 1 — 第一行简洁 |
| `details_line_present` | == 1（真实拦截时）| task 1 — 细节折叠到后缀行 |
| `error_literal_present` | == 0 | task 1 — 无 `Error:` 红色框 |
| `format_snapshot_pass` | == 1 | task 1 — 快照测试全绿 |
| `matcher_fp_pass` | == 1 | task 4 — 假阳性回归测试全绿 |
| `meta_cmd_skipped` | == 1 | task 4 — gh issue create + quoted moment 未被拦截 |

全部阈值满足时，裁判 LLM 应输出 `{pass: true}`。

---

## False-positive regression bank

以下命令用于回归，`SKIP` = 不应触发 `wrong_pattern: "moment"` 规则，
`HIT` = 应触发（真实违规）。

| 命令 | 期望 | 原因 |
|------|------|------|
| `gh issue create --body "moment is bad, we should migrate"` | SKIP | meta-cmd 前缀；`moment` 在引号参数内，非真实安装意图 |
| `git commit -m "fix: stop using moment in date utils"` | SKIP | meta-cmd 前缀；`moment` 出现在 commit message 引号内 |
| `gh pr create --title "remove moment dep" --body "closes #42"` | SKIP | meta-cmd 前缀；title 引号内含 `moment` |
| `npm install moment` | HIT | 无 meta-cmd 前缀；`moment` 作为真实包名出现在安装命令中 |
| `yarn add moment@2.29` | HIT | 无 meta-cmd 前缀；真实包名安装 |

回归库随实际发现持续扩充；新 meta-cmd 前缀加入 `META_COMMAND_PREFIXES` 数组后，
须同步在此添加对应 SKIP 行。
