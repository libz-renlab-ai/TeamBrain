```
        third-party judge harness (issue #372)
        ─────────────────────────────────────────
        RUN  → fixed probes (typecheck / vitest / CLI smoke)
        DUMP → evidence/<run_id>/judge.json + raw stdout/stderr
        READ → LLM judge subagent reads raw, outputs PASS/FAIL/INCONCLUSIVE
```

# judge.md — issue #372 live-inspection harness

> 本文件是 `docs/PLAN-RESEARCH-REPORT.md` 三段铁律里 §3「third-party judge
> harness」的具体实现。**不**是固定 shell 脚本——这是 MD 剧本，main agent
> 在 PR review 期间用 `claudefast -p` + subagent 调度执行（per user memory
> `feedback_judge_harness_md_playbook.md` +
> `feedback_verification_only_judge_harness.md`）。

## 三阶段合同

1. **RUN** — 固定命令矩阵，独立子 shell，timeout 强制。
2. **DUMP** — `evidence/<run_id>/judge.json` + 每条 probe 的 raw
   `stdout/stderr/exitcode` 文件。
3. **READ** — 另一只 LLM 只读 raw JSON + evidence，不调任何 tool；输出
   PASS / FAIL / INCONCLUSIVE + 一句话裁决。

## RUN 阶段：probe 矩阵

| name | command | timeout | expected exit | metrics extracted |
|------|---------|---------|---------------|-------------------|
| `typecheck` | `pnpm typecheck` | 300s | 0 | `errors=0`（grep `error TS\d`） |
| `contract-tests` | `pnpm vitest run packages/ports/src/__tests__/github-activity-port-contract.test.ts` | 120s | 0 | `tests`, `passed`, `failed` |
| `adapter-tests` | `pnpm vitest run packages/adapters/src/github-activity/__tests__/` | 120s | 0 | 同上 |
| `core-tests` | `pnpm vitest run packages/core/src/live-inspection/__tests__/` | 120s | 0 | 同上 |
| `cli-tests` | `pnpm vitest run packages/cli/src/commands/__tests__/inspect-member.test.ts` | 120s | 0 | 同上 |
| `cli-help` | `pnpm teamagent inspect-member --help` | 30s | 0 | `usage_present=true` if stdout contains `inspect-member` |
| `cli-happy` | 见下方 fixture-driven recipe | 60s | 0 | `stdout_contains_summary=true` |
| `cli-abnormal` | 见下方 fixture-driven recipe | 60s | 0 | `stdout_contains_abnormal_marker=true`, `incident_file_written=true` |

### `cli-happy` recipe

```bash
TMPDIR=$(mktemp -d)
export TEAMAGENT_HOME="$TMPDIR/teamagent"
mkdir -p "$TEAMAGENT_HOME"
pnpm teamagent inspect-member alice \
  --window 24h \
  --now 2026-05-13T10:00:00Z \
  --project teambrain \
  --github-fake \
  --out "$TMPDIR/insp.json"
```

PASS conditions:
- exit code 0
- stdout 包含 `## Inspection summary`
- `$TMPDIR/insp.json` 存在且 valid JSON
- `$TMPDIR/insp.json` 含字段 `member`, `window`, `now`, `events`, `activity`,
  `abnormal_signals`（数组，可空）

### `cli-abnormal` recipe

```bash
TMPDIR=$(mktemp -d)
export TEAMAGENT_HOME="$TMPDIR/teamagent"
mkdir -p "$TEAMAGENT_HOME"
# fake-mode injects 3 hook-pre.matched/deny events to trigger "repeated_deny"
pnpm teamagent inspect-member alice \
  --window 24h \
  --now 2026-05-13T10:00:00Z \
  --project teambrain \
  --github-fake \
  --fake-abnormal repeated_deny \
  --out "$TMPDIR/insp.json"
```

PASS conditions:
- exit code 0
- stdout 包含 `🚨 abnormal signals` 与 `repeated_deny`
- `$TEAMAGENT_HOME/teambrain/incidents/` 下有 ≥1 个 `.json` 文件，valid JSON
  且含字段 `incident_id`, `member`, `signals`, `timeline`

## DUMP 阶段：evidence schema

```json
{
  "schema_version": 1,
  "run_id": "<UTC-iso>-<random8>",
  "issue": 372,
  "ts": "<UTC-iso>",
  "git_sha": "<short-sha>",
  "probes": [
    {
      "name": "typecheck",
      "cmd": "pnpm typecheck",
      "exit_code": 0,
      "stdout_path": "evidence/<run_id>/typecheck.stdout.txt",
      "stderr_path": "evidence/<run_id>/typecheck.stderr.txt",
      "duration_ms": 12345,
      "metrics": {"errors": 0}
    },
    {"name": "contract-tests", "...": "..."},
    {"name": "cli-happy", "...": "..."},
    {"name": "cli-abnormal", "...": "..."}
  ]
}
```

每条 probe 的 raw stdout/stderr 落到 `evidence/<run_id>/<probe_name>.stdout.txt`
/ `.stderr.txt`；judge.json 只存路径和 exit_code，**不**塞 raw text 进
JSON（避免 size blowup + LLM 漏读 raw 文件）。

## READ 阶段：LLM judge subagent prompt

```
You are a third-party judge for TeamBrain PR (issue #372).
You may NOT call any tool. You may only read the files I provide.

I will provide:
  1. evidence/<run_id>/judge.json (parsed)
  2. evidence/<run_id>/<probe>.stdout.txt (raw)
  3. evidence/<run_id>/<probe>.stderr.txt (raw)
  4. The PASS thresholds below.

PASS thresholds (pinned):
  - typecheck.exit_code == 0 AND typecheck.metrics.errors == 0
  - contract-tests.exit_code == 0 AND contract-tests.metrics.failed == 0
  - adapter-tests.exit_code == 0 AND adapter-tests.metrics.failed == 0
  - core-tests.exit_code == 0 AND core-tests.metrics.failed == 0
  - cli-tests.exit_code == 0 AND cli-tests.metrics.failed == 0
  - cli-help.exit_code == 0 AND cli-help.metrics.usage_present == true
  - cli-happy.exit_code == 0 AND cli-happy.metrics.stdout_contains_summary == true
  - cli-abnormal.exit_code == 0
    AND cli-abnormal.metrics.stdout_contains_abnormal_marker == true
    AND cli-abnormal.metrics.incident_file_written == true

Output exactly one of:
  PASS — reason: <one sentence>
  FAIL — reason: <which threshold(s) failed, exact metric values>
  INCONCLUSIVE — reason: <what evidence was missing or contradictory>
```

调用方式（main agent 在 review 期间）：

```bash
claudefast -p \
  --permission-mode acceptEdits \
  "Read $RUN_DIR/judge.json and the referenced raw files. Apply the pinned PASS thresholds in docs/plans/2026-05-13-issue-372-live-inspection/judge.md. Output PASS/FAIL/INCONCLUSIVE + one-sentence reason."
```

## 不算 verification 的东西（per user memory）

- ❌ vitest 自报 "PASS" — 那是 code 自评。
- ❌ `pnpm teamagent calibrate` log — system 自评。
- ❌ TS unit / contract / pipeline 测试**结果直接当作 verdict** — 它们是
  evidence inputs，不是 verdict。verdict 必须由独立 LLM judge 在 RUN+DUMP
  之后做。
- ✅ 唯一 verdict：`PASS/FAIL/INCONCLUSIVE` 由独立 LLM 读 raw judge.json +
  evidence 之后给出。

## 与项目级 verify 规则的关系

- `docs/feature-verification.md` 两条路径（canonical JSON + tmux export）
  是**额外的** PR-message 证据；本 harness 是 **plan-level** judge，独立运
  行，不与 feature-verification 冲突。
- `docs/FASTPROBE.md` 是 fast-iteration 工具，本 harness 使用 fastprobe
  调度 LLM judge 但**不**直接 == fastprobe（fastprobe 解决发 prompt 的问
  题，judge.md 解决"用什么 PASS 阈值"的问题）。
