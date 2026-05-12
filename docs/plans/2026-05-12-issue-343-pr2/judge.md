# judge.md — issue #343 PR-2 verification playbook

> Hard rule per `docs/HOWTO-PLAN-PR.md` & `docs/PLAN-RESEARCH-REPORT.md`：本文件是 **md playbook**，由 main agent dispatch 执行；**不是** `scripts/*.sh`。结构 §V1 RUN → §V2 DUMP → §V3 READ，evidence 落 `evidence/<run-id>/*.json`，main agent 读 JSON 出 PASS/FAIL — 不用 LLM-judge。

---

## §V0 RUN-ID

每次跑生成一个 `<run-id>` = ISO 短时间戳 + git short SHA，如 `20260512-1430-abc1234`。
全部 evidence 落 `docs/plans/2026-05-12-issue-343-pr2/evidence/<run-id>/`。

## §V1 RUN

### §V1.1 — typecheck

```
pnpm -F @teamagent/benchmark typecheck
```

期望 `exit 0`。失败 → §V3 FAIL on typecheck。

### §V1.2 — 单元测试（targeted vitest，per ADR-0013）

```
pnpm vitest run \
  packages/benchmark/src/__tests__/corpus-ablation.test.ts \
  packages/benchmark/src/__tests__/runner.test.ts
```

期望全绿，`disabled-env.test.ts` 在 ubuntu CI 已 PR-1 修过用 `describe.skipIf`，本 PR 不引入新 spawn-bundle 测试。

### §V1.3 — bundle build（ablation 跑前必要）

```
pnpm -F @teamagent/cli build
```

期望 `packages/cli/dist/bin-{pre-tool-use,post-tool-use,user-prompt-submit}.cjs` 三件齐全。若缺 → §V3 FAIL。

### §V1.4 — 本地实际 ablation

```
pnpm -F @teamagent/benchmark bench \
  --groups=teamagent,teamagent-disabled \
  --tasks=all \
  --runs=1 \
  --output-json=docs/plans/2026-05-12-issue-343-pr2/evidence/<run-id>/bench-report.json \
  --output-md=docs/plans/2026-05-12-issue-343-pr2/evidence/<run-id>/bench-report.md
```

期望：
- exit 0
- 60 次 SDK 调用全部 `result.error == null`（runner.ts 视角，无运行时崩）
- bench-report.json 写盘成功

如果一两个 task 因 SDK transient 失败但全局 exit 0，记录在 report.md "已知扰动"段，仍可继续 §V1.5。

### §V1.5 — scipy paired t-test

```
python3 scripts/judge/issue-343-ablation.py \
  docs/plans/2026-05-12-issue-343-pr2/evidence/<run-id>/bench-report.json \
  docs/plans/2026-05-12-issue-343-pr2/evidence/<run-id>/ablation.json
```

期望：
- exit 0
- ablation.json 写盘成功
- stdout 打印同样的 ablation.json 内容（让人眼能扫到数字）

依赖：`pip install scipy numpy`（一次性 dev 依赖；CI 不跑 Python）。

### §V1.6 — sanity：env propagation

bench 跑 teamagent-disabled 组时，第一个 task 跑完后立即在 evidence/ 下记 `env-sanity.txt`：在 sdk-runner 的 verbose 输出里 grep 是否出现 `[teamagent]` / `matcher` / `M5` / `analyze` 字样。期望 0 命中。

实现细节：bench bin.ts 跑 teamagent-disabled 组前后会 set/unset `process.env.TEAMAGENT_DISABLED`。runner.ts 的 verbose stdout 已被现成 reporter.ts pipe 进 bench-report.md — 直接搜 md 就能验。

## §V2 DUMP

bench → bench-report.json（reporter.ts 现成）。
judge.py → ablation.json（新增）。

无额外 dump 逻辑。

### bench-report.json schema（既有，参 `packages/benchmark/src/reporter.ts`）

```jsonc
{
  "config": {
    "groups": ["teamagent", "teamagent-disabled"],
    "tasks": "all",
    "runs": 1
  },
  "summary": [
    {
      "task": "001-moment-vs-dayjs",
      "group": "teamagent",
      "correct": true,
      "tokensIn": 1234,
      "tokensOut": 567,
      "cacheReadTokens": 890,
      "cacheCreationTokens": 0,
      "wallTimeMs": 12345,
      "error": null
    },
    ...
  ]
}
```

### ablation.json schema（PR-2 新增）

```jsonc
{
  "n_pairs": 30,
  "groups_compared": ["teamagent", "teamagent-disabled"],
  "metric": "total_tokens (tokensIn + tokensOut)",
  "mean_delta": 1234.5,
  "stddev_delta": 567.8,
  "t_statistic": 4.32,
  "p_value": 0.00012,
  "ci_95": [800.2, 1668.8],
  "verdict": "REJECT_NULL — TB-ON consumes significantly more tokens (p<0.05)",
  "per_task": [
    { "task": "001-moment-vs-dayjs", "tb_on": 1801, "tb_off": 1234, "delta": 567 },
    ...
  ]
}
```

## §V3 READ — main agent 判定

完全确定性，**不用 LLM**。判定 PASS 当且仅当全部满足：

```
PASS 当且仅当:
  V1.1 typecheck.exit_code == 0
  V1.2 vitest.json all suites: failed == 0
  V1.3 packages/cli/dist/bin-pre-tool-use.cjs exists
  V1.4 bench exit_code == 0  AND  bench-report.json.summary.length == 60
  V1.5 judge.py exit_code == 0  AND  ablation.json.n_pairs == 30
       AND  ablation.json.p_value is a finite number
       AND  ablation.json.verdict in {REJECT_NULL_pattern, FAIL_TO_REJECT_pattern}
  V1.6 env-sanity.txt has 0 matches for [teamagent]|matcher|M5|analyze
```

任一不满足 → FAIL，main agent 看 evidence/<run-id>/ 调查具体哪条。

**Critical 反 pattern**：
- ❌ "p < 0.05 才 PASS" — 错。p=0.3 也是合法实验结果，PR-2 只 ship harness。
- ❌ "delta > 0 才 PASS" — 错。TB 可能省 token 也可能费 token，方向是结果不是门禁。
- ❌ LLM 读 markdown 判 PASS — 错。判定是 grep / count / parse JSON 数字。

## §V4 follow-up

PR-2 跑完，report.md 把以下三件事写实：
1. **n=30 paired 数字**：30 个 task 各自的 tb_on / tb_off / delta。
2. **统计结论**：mean_delta、p、95% CI、verdict 字面。
3. **解释一句话**：是 TB-ON 显著贵了，还是显著省了，还是没显著差异。给老板看。

PR-3 才在 report 基础上写老板 A4 报告 + UI overlay。
