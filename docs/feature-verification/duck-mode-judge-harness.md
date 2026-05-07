```text
  RUN                    DUMP                   READ
  ─────────────────────  ─────────────────────  ─────────────────────
  固定工具               写 judge.json           裁判 LLM
  engineer.txt           + 原始 stdout           只读 raw JSON
  duck.txt          ──►  .judge/<run_id>/   ──►  输出 {pass, reasons}
  postinstall-*.txt      所有 evidence            执行 agent 不得评分
```

# Duck Mode 第三方裁判 Harness

> 文档位置：`docs/feature-verification/duck-mode-judge-harness.md`
> 覆盖问题：#116 — 可爱 CEO 小鸭解释模式
> 对应脚本：`scripts/duck-mode-verify.sh`

---

## 为什么需要这个 harness

TeamBrain 的自演化规则体系（`~/.claude/docs/rules/testing-judge-harness.md`）要求：
**代码不得给自己打分**。必须有一层独立的第三方裁判，先跑固定工具产出原始 JSON，再由另一只 LLM 只读 raw JSON 做归纳结论。duck mode 功能影响多条输出渠道（stats / postinstall / init / warmup），若让实现代码自行验证，假阳性率极高。该 harness 是 V1–V5 验收的唯一入口。

---

## RUN — 跑固定工具

在项目根目录执行 `bash scripts/duck-mode-verify.sh`，内部按顺序运行以下固定命令：

```bash
#!/usr/bin/env bash
set -euo pipefail
run_id="${RUN_ID:-$(date +%s)}"
out=".judge/duck-mode-${run_id}"
mkdir -p "$out"

# V4 基准：无 duck 模式，记录工程师视图行数
TEAMAGENT_EXPLAIN_LIKE_CEO_DUCK=0 pnpm teamagent stats \
  > "$out/engineer.txt" 2>"$out/engineer.err" || true

# V1/V2/V3：开启 duck 模式，记录 stats 输出
TEAMAGENT_EXPLAIN_LIKE_CEO_DUCK=1 pnpm teamagent stats \
  > "$out/duck.txt" 2>"$out/duck.err" || true

# V2（持久性）：install 时路径，使用 dry-run 沙箱
TEAMAGENT_DRY_RUN=1 TEAMAGENT_EXPLAIN_LIKE_CEO_DUCK=1 \
  node packages/teamagent/postinstall.mjs \
  > "$out/postinstall-duck.txt" 2>&1 || true

TEAMAGENT_DRY_RUN=1 TEAMAGENT_EXPLAIN_LIKE_CEO_DUCK=0 \
  node packages/teamagent/postinstall.mjs \
  > "$out/postinstall-eng.txt" 2>&1 || true

# V5：FASTPROBE anchor 回归检查
claudefast -p "what project tools we have?" \
  > "$out/fastprobe-anchor.txt" 2>&1 || true
```

所有命令均写入 `$out/` 目录，失败不中止（`|| true`），由后续 judge 根据 exit_code 字段判断。

---

## DUMP — 写 judge.json + 原始 stdout

脚本计算以下指标并写入 `$out/judge.json`：

| 字段 | 含义 |
|------|------|
| `jargon_terms_found` | duck.txt + postinstall-duck.txt 中被识别的术语去重数量（Skills/hooks/PreToolUse/RAG/embedding 等） |
| `duck_lines_emitted` | 匹配 `/(呷呷\|鸭鸭\|\(>ω<\))/` 的行数（两个文件之和） |
| `engineer_view_lines` | engineer.txt 总行数（本次 run，env=0） |
| `duck_view_lines` | duck.txt 总行数（本次 run，env=1） |
| `baseline_engineer_lines` | `docs/baselines/stats-engineer-baseline.txt` 中记录的功能实现前基准行数（由 `scripts/update-baseline.sh` 在 main 分支上提前写入） |
| `engineer_view_diff` | `(engineer_view_lines - baseline_engineer_lines) / (baseline_engineer_lines + 1)`——**与基准对比**，而非与 duck 视图对比 |
| `signal_token_per_duck_line.min` | 每条 duck 行至少含几个信号 token（最小值，应 ≥ 1） |
| `signal_token_per_duck_line.avg` | 每条 duck 行平均信号 token 数 |
| `fastprobe_has_FASTPROBE` | fastprobe-anchor.txt 中是否出现字面 `FASTPROBE` |
| `fastprobe_has_POSTPR` | 是否出现 `POSTPR` |
| `fastprobe_has_TEAMWORK` | 是否出现 `TEAMWORK` |

### 输出路径清单（`.judge/duck-mode-<run_id>/`）

```
engineer.txt          # stats 无 duck 模式完整 stdout
engineer.err          # stats 无 duck 模式 stderr
duck.txt              # stats duck 模式完整 stdout
duck.err              # stats duck 模式 stderr
postinstall-eng.txt   # postinstall dry-run 无 duck 模式
postinstall-duck.txt  # postinstall dry-run duck 模式
fastprobe-anchor.txt  # claudefast "what project tools we have?" 输出
judge.json            # 汇总指标（裁判 LLM 唯一入口）
```

### judge.json 样本形状

```json
{
  "run_id": "1746624000",
  "exit_code": 0,
  "metrics": {
    "jargon_terms_found": 18,
    "duck_lines_emitted": 23,
    "engineer_view_lines": 42,
    "duck_view_lines": 65,
    "baseline_engineer_lines": 40,
    "engineer_view_diff": 0.0238,
    "signal_token_per_duck_line": { "min": 1, "avg": 1.4 },
    "fastprobe_has_FASTPROBE": true,
    "fastprobe_has_POSTPR": true,
    "fastprobe_has_TEAMWORK": true
  },
  "evidence_dir": ".judge/duck-mode-1746624000",
  "stdout_path": ".judge/duck-mode-1746624000/duck.txt"
}
```

---

## READ — 让裁判 LLM 只读 raw JSON 评

执行者和被测代码不得参与评分。由独立 `claudefast` 进程读 raw JSON：

```bash
claudefast -p "Read .judge/duck-mode-<run_id>/judge.json, duck.txt,
postinstall-duck.txt, and fastprobe-anchor.txt.
Grade pass/fail against V1 through V5:
  V1 — every jargon term in duck.txt/postinstall-duck.txt has a duck explanation line within ±2 lines.
  V2 — duck_lines_emitted >= 1 (duck mode works outside install, in stats command).
  V3 — every duck line matches /(呷呷|鸭鸭|\(>ω<\)|🦆)/ and is Chinese-dominant.
  V4 — engineer_view_diff <= 0.05 (engineer_view_lines vs baseline_engineer_lines, NOT vs duck_view_lines).
  V5 — fastprobe_has_FASTPROBE, fastprobe_has_POSTPR, fastprobe_has_TEAMWORK are all true.
Output strictly JSON: {pass: bool, V1: bool, V2: bool, V3: bool, V4: bool, V5: bool, reasons: [string]}."
```

重要约束：
- 执行 agent（负责跑 duck-mode-verify.sh 的 agent）**不得充当裁判**。
- 被测代码（teamagent stats / postinstall.mjs）**不得充当裁判**。
- 裁判 LLM 只能读取 `judge.json` 与 evidence 文件，不能直接运行被测命令。

---

## Acceptance criteria

| 验收条款 | 指标与阈值 |
|----------|-----------|
| **V1** 术语覆盖 100% | `duck.txt` 和 `postinstall-duck.txt` 中每个识别到的术语，在该术语所在行的 ±2 行内必须存在至少一条 duck 行。覆盖率 `coverage_rate >= 1.0`（即无遗漏术语）。 |
| **V2** install 外持久可用 | `duck_lines_emitted >= 1`：不仅 postinstall 路径，`pnpm teamagent stats` 命令也需输出 duck 行。 |
| **V3** 中文 + 信号 token | 每条 duck 行匹配正则 `/(呷呷|鸭鸭|\(>ω<\)|🦆)/`，且行内中文字符占比 > 50%（中文主导）。`signal_token_per_duck_line.min >= 1`。 |
| **V4** 工程师视图不退化 | `engineer_view_diff <= 0.05`：`engineer_view_diff = (engineer_view_lines - baseline_engineer_lines) / (baseline_engineer_lines + 1)`，其中 `baseline_engineer_lines` 来自 `docs/baselines/stats-engineer-baseline.txt`（功能实现前在 main 分支记录）。比较的是**本次无 duck 模式输出 vs 预先固化基准**，而非 duck 视图 vs 工程师视图。偏差绝对值 ≤ 5%。 |
| **V5** FASTPROBE anchors 不回归 | `fastprobe_has_FASTPROBE == true`、`fastprobe_has_POSTPR == true`、`fastprobe_has_TEAMWORK == true`。任一为 false 即整体 FAIL。 |

最终判断：裁判 LLM 输出 `{pass: true, ...}` 且五条均为 `true` 时，该功能验收通过。

---

## 如何反向复现（engineer view 不退化）

快速复现 V4，验证无 duck 模式行数未被功能引入膨胀：

```bash
# 1. 确认功能实现前基准（需在 main 分支上预先记录）
wc -l < docs/baselines/stats-engineer-baseline.txt  # 基准行数，例如 42

# 2. 在 feature 分支上重跑，env 强制关闭 duck 模式
TEAMAGENT_EXPLAIN_LIKE_CEO_DUCK=0 pnpm teamagent stats > /tmp/engineer-now.txt

# 3. diff 并计算偏差
baseline=$(cat docs/baselines/stats-engineer-baseline.txt | wc -l)
now=$(wc -l < /tmp/engineer-now.txt)
awk "BEGIN{
  diff = ($now - $baseline) / ($baseline + 1);
  printf \"engineer_view_diff=%.4f (threshold<=0.05): %s\n\",
    diff, (diff <= 0.05 ? \"PASS\" : \"FAIL\")
}"
```

若 `engineer_view_diff > 0.05`，检查 `duckify()` 是否在 env=0 时仍注入了额外空行或注释行；正确实现应返回原始 `[line]` 单元素数组。
