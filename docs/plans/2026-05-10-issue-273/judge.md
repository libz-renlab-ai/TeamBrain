```text
            __        Judge harness for issue-273
       ___ ( o)>      MD playbook (NOT fixed bash).
       \   <_. )      9 probes → §V1 RUN, §V2 DUMP,
        `---'         §V3 READ. 3rd-party LLM-judge
                      reads raw JSON only.
```

# Judge harness: issue-273 — Agentic Coding Policy probes

> **Hard rule（per `docs/HOWTO-PLAN-PR.md` § 3b 与 `docs/PLAN-RESEARCH-REPORT.md` § 1）**: 本 harness 是 **md playbook**，由 MAIN agent 通过 subagents 或 `claudefast -p` 探针调度。**禁止固定 bash 脚本**作为 sole eval mechanism。被测代码 / plan 作者 / 执行 agent 均不得当裁判；裁判是另一只 `claudefast -p` 只读 `.judge/<run_id>/judge.json`。

---

## §V1 RUN — 跑固定工具

每条 probe 由 MAIN agent 直接 dispatch（Bash 工具 / Read 工具 / `claudefast -p`）；stdout/stderr 落盘到 `evidence_dir = .judge/<run_id>/probe-<N>/`。

### Probe 1 — POLICY 文件存在 + ≤200 行

```bash
test -f docs/AGENTIC-CODING-POLICY.md
wc -l docs/AGENTIC-CODING-POLICY.md
```

期望 `exit_code=0` 且 `wc -l` 输出 ≤200。

### Probe 2 — 不引入 FeatureIndex schema（Option α 守门）

```bash
! grep -rn "interface FeatureIndex" packages/
```

期望 `exit_code=0`（grep 命中 0 个 → 反向 `!` 为真）。

### Probe 3 — Verification subagent 在 driver skill，不在 packages/core/

```bash
grep -q "Verification subagent" .claude/skills/fixed-flow-driver/SKILL.md
! grep -rn "Verification subagent" packages/core/
```

两条均期望 `exit_code=0`。

### Probe 4 — claudefast 语义 probe 命中三联表

```bash
claudefast -p "TeamBrain 的 verification subagent 与 /review skill 与 calibration subagent 各做什么"
```

期望输出 organic 命中以下三类锚点（不允许 canned answer / regex 锚）：

- `Verification subagent` 描述「driver 内 fix-loop spawn」职责
- `/review skill` 描述「POSTPR loop 权威 gate（ADR-0007）」职责
- `Calibration subagent` 描述「rule maturity tier 重判（ADR-0004）」职责

### Probe 5 — ADR / fixture / wip 引用未漂移

```bash
grep -q "ADR-0007" docs/AGENTIC-CODING-POLICY.md
grep -q "tests/fixtures/scenarios" docs/AGENTIC-CODING-POLICY.md
grep -q "wip/\*\*" docs/AGENTIC-CODING-POLICY.md
```

三条均期望 `exit_code=0`。

### Probe 6 — squash-only + PR-PLAN 强制条款

```bash
grep -q "gh pr merge.*--squash" docs/AGENTIC-CODING-POLICY.md
grep -q "docs/plans/.*-pr-.*-fix-plan.md" docs/AGENTIC-CODING-POLICY.md
```

两条均期望 `exit_code=0`。

### Probe 7 — 12-field self-report 不被 policy 豁免

```bash
grep -q "self-report-fused.sh" docs/AGENTIC-CODING-POLICY.md
```

期望 `exit_code=0`。

### Probe 8 — CONTEXT.md 既有词条 0 删除

```bash
git diff origin/main -- docs/CONTEXT.md | grep -E "^-[^-]" | wc -l
```

期望输出 `0`（diff 中只有 `+` 行，没有 `-` 行）。

### Probe 9 — `/review` skill PASS（ADR-0007 权威 gate）

由 driver 在 step 4 fix-loop 调用 `/review` skill。期望 `/review` 报告 `PASS` 或 `no P1/P2 findings`。

---

## §V2 DUMP — 写 canonical JSON

每条 probe 落盘格式：

```json
{
  "probe_id": "<N>",
  "tool": "<command or skill>",
  "exit_code": <int>,
  "metrics": {
    "lines": <int>,
    "match_count": <int>,
    "anchors_hit": ["<anchor1>", "<anchor2>"]
  },
  "evidence_dir": ".judge/<run_id>/probe-<N>/",
  "stdout_path": ".judge/<run_id>/probe-<N>/stdout.txt",
  "stderr_path": ".judge/<run_id>/probe-<N>/stderr.txt"
}
```

aggregate 到 `.judge/<run_id>/judge.json`：

```json
{
  "run_id": "<iso>",
  "issue": 273,
  "branch": "feat/issue-273",
  "probes": [<probe-1>, <probe-2>, ..., <probe-9>],
  "summary": {
    "all_pass": <bool>,
    "fail_count": <int>,
    "uncertain_count": <int>
  }
}
```

---

## §V3 READ — LLM-judge 只读 raw JSON

```bash
claudefast -p "$(cat <<'EOF'
你是 issue-273 PR 的 third-party judge。
ONLY read .judge/<run_id>/judge.json + .judge/<run_id>/probe-*/stdout.txt。
不读 docs/AGENTIC-CODING-POLICY.md 全文，不读 plan.md，不读 grill comment。

判定：
- 9 条 probe 全部 exit_code=0（含 probe 4 的 organic semantic match）→ verdict=pass
- 任一 probe FAIL → verdict=fail，列出失败 probe + 修复建议
- 不确定（如 probe 4 organic match 边界）→ verdict=uncertain，列出哪几条 probe 需人审

输出 JSON：{"verdict": "pass|fail|uncertain", "failed_probes": [<N>], "next_action": "<text>"}
EOF
)"
```

---

## Escape hatch

- 若 probe 4 organic match 长期 uncertain（matcher 未 index 到本 PR 新增内容），允许 driver 在 PR comment 里写一段「人审锚点确认」并 append 到 `judge-overrides.jsonl`（per ADR-0010 类 escape）；不修改 policy 内容。
- 若 `/review` skill 长期不 PASS（>50 iter），driver 加 `needs-human` label 退出（per grill §9）。
