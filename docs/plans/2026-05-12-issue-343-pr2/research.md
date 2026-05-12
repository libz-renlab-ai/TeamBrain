# research.md — issue #343 PR-2: 30-prompt corpus + Counterfactual Ablation

> 走 `docs/HOWTO-PLAN-PR.md` 与 `docs/PLAN-RESEARCH-REPORT.md`：research 在 plan / judge 之前，锁定"已存在什么 / 要新增什么 / 风险面"。

---

## 1. Issue context

**Issue #343** (5/12 by liboze): "领导：需要测量使用 teambrain 会增加了多少 token 成本"

PR-1 已落地 `TEAMAGENT_DISABLED=1` master kill switch (commit `6c137aa`, merged to main 5/12)。

PR-2 任务：给 30 个 curated coding prompt 跑 TB-ON vs TB-OFF（用 kill switch 隔离）的 paired 测试，用 `scipy.stats.ttest_rel` 出 Δtoken + p-value + 95% CI。

Maintainer 已决定（5/12）：corpus = curated-only，不用真实历史 transcript（隐私 hard-block 避开）。

## 2. 已存在的资产（重大发现 — 不用从零造）

### 2.1 `@teamagent/benchmark` 包已存在

源在 `packages/benchmark/`，是个**几乎现成**的 ablation harness：

| 文件 | 作用 |
|---|---|
| `src/bin.ts` | CLI: `--groups`, `--tasks`, `--runs`, `--output-json`, `--output-md` |
| `src/task-loader.ts` | 从 `fixtures/tasks/*.json` 读题 |
| `src/isolator.ts` | 给每个 group × task 准备隔离 workdir + 写 `.claude/settings.local.json` |
| `src/sdk-runner.ts` | 走 `@anthropic-ai/claude-agent-sdk` 的 `query()` API，**自带 token 计量** (`tokensIn`, `tokensOut`, `cacheRead`, `cacheCreation`) |
| `src/runner.ts` | 单 task 跑一次，组合 isolator + sdk-runner + evaluator |
| `src/evaluator.ts` | regex pattern matcher（correct / wrong patterns）→ binary correctness |
| `src/reporter.ts` | aggregate → bench-report.json + bench-report.md |
| `fixtures/groups/baseline/` | settings.local.json: **空 hooks**（无 TB） |
| `fixtures/groups/teamagent/` | settings.local.json: 3 hooks (PreToolUse + PostToolUse + UserPromptSubmit) wired |
| `fixtures/tasks/001..007.json` | 7 个现成 task（moment vs dayjs / axios cancel / react key / multi-trap / xhr vs fetch / react class / verify loop） |

### 2.2 既有 token 计量已经做完

`sdk-runner.ts:117-126` 在每个 result 消息里读 `msg.usage`：

```ts
const u = msg.usage as {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
};
tokensIn = u.input_tokens ?? 0;
tokensOut = u.output_tokens ?? 0;
cacheReadTokens = u.cache_read_input_tokens ?? 0;
cacheCreationTokens = u.cache_creation_input_tokens ?? 0;
```

每个 task run 都写进 `bench-report.json` 的 `runs[].tokensIn/tokensOut/cacheRead/cacheCreation`。

### 2.3 项目 canon：`scipy.stats.ttest_rel`

`docs/verify/E2E-LEARNING.md` 已把 Counterfactual Ablation 钦定为 ② 端到端学习的**主门禁**：

> Counterfactual Ablation = `scipy.stats.ttest_rel` paired t-test on rule-ON vs rule-OFF runs of the same prompt set, producing numeric Δ + p-value + 95% CI.

判决是**数字 / bytes**，不用 LLM-as-judge — 模型无法伪造。

## 3. 缺什么 / 要新增什么

| # | 需要 | 现状 | 工作量 |
|---|---|---|---|
| A | 23 个新 task fixture（008..030）覆盖 TB 学习强项 | 已有 7 个，需要 +23 | +1100 LOC JSON |
| B | 第 3 个 group：`teamagent-disabled`（同 hook 配置，env TEAMAGENT_DISABLED=1）| 缺 | +30 LOC + sdk-runner 改 ~20 LOC |
| C | `judge.py`：读 bench-report.json，对 TB-ON vs TB-disabled 按 task_id 配对，跑 `ttest_rel`，输出 Δ + p + 95% CI | 缺 | +80 LOC Python |
| D | `packages/benchmark/src/__tests__/` 里加 `corpus-ablation.test.ts` 验证 30 任务可加载 + 3 个 group 设置正确 | 缺 | +100 LOC TS |
| E | 跑一次实际 ablation 出真实数字（60 次 Claude 调用 ≈ 300K tokens）| 未跑 | 钱 + 时间 |
| F | docs/plans 全套（research/plan/judge/report）| 已开 research（本文件）| +600 LOC md |

## 4. 23 个新 task 设计原则

TB 学得最好的场景（参 commit history + ADR-0010 fixture tier 设计 + `docs/verify/E2E-LEARNING.md` 实证场景）：

1. **tech-choice 偏好**（已有 001 moment→dayjs）— 库选择、版本偏好（再加 5 题）
2. **anti-pattern 屏蔽**（已有 005 xhr→fetch, 006 react class→functional）— 已淘汰 API、过时模式（再加 4 题）
3. **security guardrails**（缺）— 不暴露 secret、避免 SQL injection、validate input（加 4 题）
4. **testing discipline**（已有 007 verify loop）— 必须先写 test、不 mock DB（加 3 题）
5. **naming / convention enforcement**（缺）— 命名规范、文件组织（加 3 题）
6. **multi-step compliance**（已有 004 multi-trap）— 串联多个易错点（加 4 题）

每题 evaluator 用 `pattern` 类型（regex correct + wrong patterns），与现有 001-007 风格一致 — 让现有 evaluator.ts 直接复用，无新增评判代码。

## 5. `teamagent-disabled` group 实现细节

### 5.1 group 配置文件

`packages/benchmark/fixtures/groups/teamagent-disabled/settings.local.json` 与 `teamagent/settings.local.json` **完全一致**（同 3 个 hook 同 matcher），区别只在跑时 env。

为什么用一致的 settings：本组测的是"TB 安装但 kill switch 拉掉"的成本，不是"TB 没装"。后者由 `baseline` 组负责。三组结构：

| group | settings.local.json | env | 测的是 |
|---|---|---|---|
| `baseline` | 空 hooks | 无 | "TB 没装" — 真零 TB |
| `teamagent` | 3 hooks 全开 | 无 | "TB 装了且开" — 实际使用形态 |
| `teamagent-disabled` | 3 hooks 全开 | `TEAMAGENT_DISABLED=1` | "TB 装了但 kill 掉" — paired 对照 |

issue #343 主门禁用 `teamagent` vs `teamagent-disabled` 配对（控制变量：同 install footprint），**不是** `teamagent` vs `baseline`（多变量：install + 设置）。

### 5.2 env 注入

`sdk-runner.ts` 的 `query()` 在同一 Node 进程里跑，SDK 把 hooks 当 subprocess 起，subprocess 继承父 env。所以：

```ts
// 跑 teamagent-disabled 组前
process.env.TEAMAGENT_DISABLED = "1";
try {
  await runner.run(prompt, workdir);
} finally {
  delete process.env.TEAMAGENT_DISABLED;
}
```

`bin.ts` 在 group loop 里按 group name 切 env。改动 ~20 LOC。

## 6. `judge.py` 设计

### 6.1 输入

`bench-report.json` 结构（参 reporter.ts）：

```json
{
  "groups": ["baseline", "teamagent", "teamagent-disabled"],
  "results": [
    { "task": "001-moment-vs-dayjs", "group": "teamagent", "tokensIn": 1234, "tokensOut": 567, ... },
    { "task": "001-moment-vs-dayjs", "group": "teamagent-disabled", "tokensIn": 890, "tokensOut": 432, ... },
    ...
  ]
}
```

### 6.2 输出

`evidence/<run-id>/ablation.json`：

```json
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

### 6.3 代码骨架（~80 LOC）

```python
#!/usr/bin/env python3
"""issue-343 PR-2 Counterfactual Ablation judge.
Reads bench-report.json, pairs TB-ON vs TB-OFF by task_id, runs scipy.stats.ttest_rel.
"""
import json, sys
from scipy import stats
import numpy as np

def main(report_path, out_path):
    with open(report_path) as f:
        report = json.load(f)
    pairs = {}
    for r in report["results"]:
        if r["group"] not in ("teamagent", "teamagent-disabled"):
            continue
        pairs.setdefault(r["task"], {})[r["group"]] = r["tokensIn"] + r["tokensOut"]
    tb_on = []
    tb_off = []
    per_task = []
    for task, g in sorted(pairs.items()):
        if "teamagent" not in g or "teamagent-disabled" not in g:
            continue
        on, off = g["teamagent"], g["teamagent-disabled"]
        tb_on.append(on); tb_off.append(off)
        per_task.append({"task": task, "tb_on": on, "tb_off": off, "delta": on - off})
    deltas = np.array(tb_on) - np.array(tb_off)
    t, p = stats.ttest_rel(tb_on, tb_off)
    ci = stats.t.interval(0.95, len(deltas)-1, loc=deltas.mean(), scale=stats.sem(deltas))
    out = {
        "n_pairs": len(deltas),
        "groups_compared": ["teamagent", "teamagent-disabled"],
        "metric": "total_tokens (tokensIn + tokensOut)",
        "mean_delta": float(deltas.mean()),
        "stddev_delta": float(deltas.std(ddof=1)),
        "t_statistic": float(t),
        "p_value": float(p),
        "ci_95": [float(ci[0]), float(ci[1])],
        "verdict": ("REJECT_NULL — TB-ON consumes significantly more tokens (p<0.05)"
                    if p < 0.05 else
                    "FAIL_TO_REJECT — no significant token diff (p>=0.05)"),
        "per_task": per_task,
    }
    with open(out_path, "w") as f:
        json.dump(out, f, indent=2)
    print(json.dumps(out, indent=2))

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
```

## 7. 风险表

| # | 风险 | 影响 | mitigation |
|---|---|---|---|
| R1 | `scipy` 不在 CI（项目纯 TypeScript）| `judge.py` 只能本地跑 | 本地跑出 `ablation.json` 提交进 repo；CI 只读 JSON 不跑 Python |
| R2 | 23 个任务 curate 偏（任务设计本身偏向 TB 强项）| 结果有偏，p<0.05 不代表真实场景 | 任务设计公开放在 fixtures，PR description 写明"curated for TB-strong scenarios"，未来用真实历史复测 |
| R3 | 60 次 Claude 调用 burn 钱 | 钱花掉 | 用 `claudefast`（MiniMax-routed haiku/sonnet fast profile）；估算 60 × ~5K tokens × $0.003/1K = $0.9，well under ¥80 budget |
| R4 | 单次 run 噪声大（一次随机性 = 一次显著性）| 假阳性 / 假阴性 | --runs=1 出 N=30 配对样本，scipy 自带 n=30 t-检验 sufficient；ADR-0010 后续可 --runs=3 复测 |
| R5 | env `TEAMAGENT_DISABLED` propagation 到 hook subprocess 失败 | TB-disabled 没真禁掉，污染 TB-OFF 档 | 跑前 sanity check：`process.env.TEAMAGENT_DISABLED === "1"` 时，sdk 跑一题 → grep stderr 不应含 `[teamagent]` 字样 |
| R6 | `tasks.length × groups × runs = 30 × 3 × 1 = 90 次` 包含 baseline 但 baseline 是辅助档不必跑 30 次 | 浪费 budget | bin.ts 加 `--groups=teamagent,teamagent-disabled` 默认（baseline 仅当 explicit --groups 包含时跑）|
| R7 | LOC > 1500 触发 TRIAGE-AND-SPLIT 红线 | PR 应拆 | maintainer 已 explicitly override（"不用拆，直接 3 PR 完成"），且大头是 23 个 task fixtures（review 成本低）— 在 PR 描述中明示 LOC breakdown |
| R8 | 现有 7 个 task 在 TB 引导下确实改对了吗？还是 TB-OFF 也改对？没有现成 ablation 跑过 | 验证 TB 实际有效性的前提缺失 | PR-2 跑 ablation 时本身就在验证；如果首次跑 deltas 都接近 0 → 说明 TB 没起作用 → 跑结果照实写进 report.md，让老板看真相 |
| R9 | `pnpm verify` 在 CI 跑 `tsx packages/cli/src/bin.ts verify`，不跑 benchmark | 现有 CI 不会跑 ablation | 本 PR **不动 CI**；ablation 在本地手动跑、JSON 提交进 repo |
| R10 | `disabled-env.test.ts` 在 ubuntu CI 因 bundle 没 build 就 skip — PR-2 同理需 build | 老问题再来一次 | PR-2 不引入新 spawn-bundle 集成测试 — 单测在同进程内验证 env injection 即可 |

## 8. LOC 预算

| 类目 | LOC |
|---|---|
| 23 个 task JSON (`fixtures/tasks/008-..030-`) | ~1150 |
| `fixtures/groups/teamagent-disabled/settings.local.json` | ~25 |
| `src/bin.ts` env injection 改动 | ~25 |
| `src/sdk-runner.ts` 加 `extraEnv` 支持 | ~15 |
| `src/__tests__/corpus-ablation.test.ts` | ~120 |
| `scripts/judge/issue-343-ablation.py` | ~80 |
| `docs/plans/2026-05-12-issue-343-pr2/{research,plan,judge,report}.md` | ~700 |
| `docs/plans/2026-05-12-issue-343-pr2/evidence/<run>/{bench-report,ablation}.json` | ~150 |
| **Total** | **~2265** |

超过 TRIAGE-AND-SPLIT 1500 LOC 红线 — **被 maintainer override 通过**（user 5/12 明确："不用拆，就直接在这个issue里完成，最后提3个pr就好了"）。Code review burden 集中在 ~265 LOC（bin / sdk-runner / judge.py / tests），其余是 fixtures + docs，review 成本低。

## 9. anti-scope（本 PR 不动）

- ❌ Token-cost overlay UI（PR-3）
- ❌ 老板 A4 报告（PR-3）
- ❌ baseline 组重新跑 30 题（保留 baseline 作辅助，但默认 `--groups=teamagent,teamagent-disabled`）
- ❌ ADR-0010 fixture replay 集成（teamagent-disabled 组不进 fixture suite — fixture suite 测的是 prompt → transcript byte 等价，ablation 测的是 token 数字，正交）
- ❌ CI 跑 Python — `judge.py` 本地一次性跑，结果 JSON 进 repo
- ❌ 真实团队 transcript（用户 5/12 选 "curated-only"）
- ❌ 多次 `--runs=N` 复测（PR-2 先出 n=30 paired 一档；后续 ADR follow-up 可 --runs=3 加 power）
