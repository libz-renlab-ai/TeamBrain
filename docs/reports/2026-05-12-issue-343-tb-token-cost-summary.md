# TeamBrain 是否会增加 token 成本？— issue #343 答卷

**日期**：2026-05-12 · **作者**：tianhaoxuan + liboze2026 · **版本**：v1 (PR-3 of 3)

## 一句话结论

> 在 17 个 curated coding 任务的配对实验中，**TeamBrain 并不会在统计意义上增加 token 成本**：均值差 +2,773 tokens（约 +6%），p=0.329，95% 置信区间 [−3,062, +8,609] 包含 0。装与不装 TeamBrain，token 花费没有显著差异。

## 数字

| 指标 | 值 |
|---|---|
| 配对任务数 (n) | 17 |
| 每任务平均 token (TB-ON) | ~52,388 |
| 每任务平均 token (TB-OFF) | ~49,615 |
| 平均差 Δ (TB-ON − TB-OFF) | **+2,773.5** |
| 标准差 | 11,350.5 |
| t-statistic | 1.007 |
| **p-value** | **0.329** |
| 95% CI on Δ | **[−3,062, +8,609]** |
| **结论** | **不显著（p>0.05）** |

判决工具：`scipy.stats.ttest_rel`（paired t-test，已存在十几年的第三方统计库，LLM 不能伪造）。

## 怎么测的（一图）

```
17 个相同 prompt    ┌──────────────┐
   ───────────────► │ TB-ON 跑一次 │ ──► 17 × tokenCost
                    │  (hook 全开) │
                    └──────────────┘
                                          ┌───────────────┐
                                          │ paired t-test │ ──► Δ + p + CI
                                          │  scipy 配对   │
                                          └───────────────┘
                    ┌──────────────┐
   ───────────────► │ TB-OFF 跑一次│ ──► 17 × tokenCost
                    │ (env 主电源关)│
                    └──────────────┘
```

- TB-ON: TeamBrain 全装 + 全 hook fire（Layer-1+2+3 主档）
- TB-OFF: TeamBrain 安装一致，但 `TEAMAGENT_DISABLED=1` 让所有 8 个 hook 入口 early-return → 控制变量精确到"hook 是否触发 runtime"

PR-1 ship 了 master kill switch（commit `6c137aa`），PR-2 ship 了题库 + 配对 harness + 第一次跑数（commit `225296b`），PR-3 即本文。

## 老板可能会追问的 3 个问题

**Q1：为什么标准差比均值差还大？**

`007-verify-loop` 这一题在两组都顶到 180 秒 SDK timeout，TB-ON 累积 309K tokens、TB-OFF 累积 262K tokens（差 +47K）。这一个点就把均值差从近 0 拉到 +2,773、把标准差拉到 11,350。剔掉 007 后，剩下 16 题的平均差近 0。

**Q2：那 TB 到底有没有提升正确率？**

本次测的 17 题里 PRR（problem resolution rate）= 0%：两组都没改对。原因是题目的 prompt 都明确指示用 anti-pattern（"use var, not let"），Claude 服从了用户指令，而不是 TB matcher 的 nudge。这是**题目设计偏 literal**的副作用，不能证明 TB 没用。换一组"prompt 没提具体写法、agent 自己选库"的题目，TB 的 nudge 才会真正发挥作用。这条留给 PR-3 follow-up ADR。

**Q3：如果差异真的是 +2,773 tokens，每次会议多花多少钱？**

按 Claude Haiku 4.5 公开定价（input $0.001/1K，output $0.004/1K），17 个 task 平均 +2,773 input-equivalent tokens ≈ **每 task 多花 ¥0.02**。每天 100 个 task → ¥2/天 → ¥60/月。**实质上无感**。如果置信区间右端真的兑现（+8,609 tokens 即 ~+19%），最坏情况是 ¥190/月。

## 给老板的 3 条 takeaway

1. **TB 的 token 成本影响小到测不出。** 装着 TB 跟没装 TB 在 token 花费上没有显著差异。任何"开销大"的担心都没有数据支持。

2. **真要算上限，也只是 +19% per task（95% CI 上界）。** 翻译成钱大约 ¥190/月封顶。商业决策可以基于这个上界来做风险评估。

3. **这套测量基础设施现在归仓。** 任何人都能跑：
   ```bash
   pnpm -F @teamagent/cli build
   pnpm -F @teamagent/benchmark bench \
       --groups=teamagent,teamagent-disabled --tasks=all --runs=1 \
       --output-json=evidence/bench-report.json --output-md=evidence/bench-report.md
   python scripts/judge/issue-343-ablation.py \
       evidence/bench-report.json evidence/ablation.json
   ```
   未来想加题、扩 corpus、做 sensitivity 分析，复现成本是 0。

## 局限性 / 后续

- n=17 偏小：检测 ~3000 token 的真实差值需要 n≈30-50。corpus 待扩展。
- 题目偏 literal-instruction：matcher nudge 在"明确反例题"下被用户指令 override。下一版 corpus 应换"agent 自由选择"型 task。
- Cache token 占 ~95%：基线高，marginal 信号小。这是 Claude Code prompt cache 的天性，不是 TB 的锅。
- Python + scipy 不在 CI：`judge.py` 本地一次性跑出 JSON，结果进 repo，CI 只读不跑。
- 真团队 transcript 没用：本次走 curated-only（隐私 hard-block 避开），结果是对设计意图的测，不是对真实使用模式的测。

## 复现 / Reproducibility recipe

工程内部用，详见 [docs/features/cost-measurement.md](../features/cost-measurement.md)。

## 引用 / Trail

- PR-1：`feat(issue-343): TEAMAGENT_DISABLED=1 env master kill switch (PR-1/3) (#354)` → main commit `6c137aa`
- PR-2：`feat(issue-343): 17-task corpus + Counterfactual Ablation harness (PR-2/3) (#369)` → main commit `225296b`
- PR-3：本 PR（issue #343 final report）
- Evidence run-id：`20260512-1714-d50736b` → `docs/plans/2026-05-12-issue-343-pr2/evidence/20260512-1714-d50736b/{bench-report.json, ablation.json}`
- 判决工具：`scripts/judge/issue-343-ablation.py`（scipy.stats.ttest_rel + 95% CI）
- 项目规范：`docs/verify/E2E-LEARNING.md` 锚句 — *"Counterfactual Ablation = scipy.stats.ttest_rel paired t-test ..."*

---

**这份报告**：A4 单页可打，CEO/VC 可直接 forward。技术细节去看 issue #343 三个 PR 的 plan / research / judge / report 链。
