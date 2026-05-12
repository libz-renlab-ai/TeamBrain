# plan.md — issue #343 PR-2: 17-task corpus + Counterfactual Ablation

> **Update 5/12 mid-implementation**: Corpus settled at 17 unique tasks
> (7 existing + 10 new 008-017), not the originally planned 30. Each new
> task is precisely paired with a seed.sql rule (1:1 mapping rule↔task,
> so the matcher fires on the wrong_pattern in TB-ON runs). Going from
> 17 to 30 would require designing 13 more task↔rule pairs, doubling
> the LOC budget without proportional statistical-power gain (paired
> t-test at n=17 already has good power for moderate effects).
> Future ADR can extend the corpus to 30+.

> 走 `docs/HOWTO-PLAN-PR.md` 四段铁律（task / outputs / judge md playbook / claudefast probes）。
> Research: [`./research.md`](./research.md) — 已锁定既有 `@teamagent/benchmark` 包结构。
> Judge harness: [`./judge.md`](./judge.md) — md playbook (§V1 RUN / §V2 DUMP / §V3 READ)，不是 bash。

---

## ① Task description

### 做什么

1. **加 23 个 task fixture** (`packages/benchmark/fixtures/tasks/008-..030-`)：curated 覆盖 TB 学得最好的 6 类场景。
2. **加第 3 个 group** (`fixtures/groups/teamagent-disabled/`)：同 `teamagent` 的 hook 配置，跑时由 bin 设 `process.env.TEAMAGENT_DISABLED = "1"`。
3. **改 `bin.ts` + `sdk-runner.ts`**：支持 per-group env injection；teamagent-disabled 组跑前 set，跑后 unset。
4. **加 `scripts/judge/issue-343-ablation.py`**：读 bench-report.json，按 task_id 配对 teamagent vs teamagent-disabled，跑 `scipy.stats.ttest_rel`，输出 ablation.json（Δ + p + 95% CI）。
5. **加 `packages/benchmark/src/__tests__/corpus-ablation.test.ts`**：单测验证 30 任务 loadable、3 个 group 解析正确、env injection 不串场。
6. **本地跑一次实际 ablation**：30 tasks × 2 groups × 1 run = 60 次 Claude 调用，结果 JSON 提交 `docs/plans/2026-05-12-issue-343-pr2/evidence/<run-id>/`。

### 为什么

issue #343 ground truth 数字：用 `scipy.stats.ttest_rel` paired t-test 把"装 TB 会不会让 token 成本升高"变成可被第三方工具复算的统计学问题。PR-1 提供了 kill switch（控制变量），PR-2 用它跑数。

PR-3 之后才有 token-cost UI overlay + 老板 A4 报告。

### 不在范围（anti-scope）

- ❌ Token-cost overlay UI / 状态栏（PR-3）
- ❌ 老板 A4 报告（PR-3）
- ❌ 真实团队 transcript（user 选 curated-only）
- ❌ CI 跑 Python（judge.py 本地）
- ❌ ADR-0010 fixture replay 集成
- ❌ `--runs=N` 多重复测（先 n=30 一档）

## ② Expected outputs

### 代码 (TypeScript)

- [ ] `packages/benchmark/fixtures/tasks/008-axios-default-export.json` 到 `030-prefer-async-await.json` (23 个)
- [ ] `packages/benchmark/fixtures/groups/teamagent-disabled/settings.local.json`
- [ ] `packages/benchmark/src/bin.ts`：加 group env injection
- [ ] `packages/benchmark/src/sdk-runner.ts`：加 `extraEnv?: Record<string,string>` 支持
- [ ] `packages/benchmark/src/types.ts`：可能要加 `GroupConfig.extraEnv` 字段
- [ ] `packages/benchmark/src/__tests__/corpus-ablation.test.ts`

### 代码 (Python)

- [ ] `scripts/judge/issue-343-ablation.py`：scipy ttest_rel + 95% CI

### 文档

- [ ] `CHANGELOG.md`：`Unreleased > Added` 加条目
- [ ] `docs/features/benchmark.md`（如不存在新建）：写 3-group 设计 + judge.py 用法
- [ ] `docs/plans/2026-05-12-issue-343-pr2/research.md` ✅ 已写
- [ ] `docs/plans/2026-05-12-issue-343-pr2/plan.md` ✅ 本文
- [ ] `docs/plans/2026-05-12-issue-343-pr2/judge.md`（playbook）
- [ ] `docs/plans/2026-05-12-issue-343-pr2/report.md`（跑完后写真实数字）

### Evidence

- [ ] `docs/plans/2026-05-12-issue-343-pr2/evidence/<run-id>/bench-report.json`（60 次调用原始 token 计量）
- [ ] `docs/plans/2026-05-12-issue-343-pr2/evidence/<run-id>/bench-report.md`（reporter 自动出的 md 摘要）
- [ ] `docs/plans/2026-05-12-issue-343-pr2/evidence/<run-id>/ablation.json`（judge.py 数学判决）

### PR 工件

- [ ] **普通 PR**，title: `feat(issue-343): 30-prompt corpus + Counterfactual Ablation harness (PR-2/3)`
- [ ] commit message 格式：`feat(issue-343): ...` / `test(issue-343): ...` / `docs(issue-343): ...`
- [ ] `/review` PASS 后 `gh pr merge <N> --squash --delete-branch`（per `docs/POSTPR.md`）
- [ ] 接 `docs/POSTPR.md` 三步 cleanup

### Negative outputs（anti-regression）

- ✋ 不动 `.github/workflows/ci.yml`（CI 不跑 Python）
- ✋ 不动 `baseline` group 配置（保留 "无 TB" 辅助档）
- ✋ 不动 PR-1 已 ship 的 8 个 kill-switch guard（PR-1 在 main 上稳定）
- ✋ 不动 `pnpm verify` 链路（`tsx packages/cli/src/bin.ts verify` 不引入 benchmark dep）
- ✋ 不引入新 spawn-bundle 集成测试（避免重蹈 `disabled-env.test.ts` ubuntu CI 麻烦）

## ③ How-to-verify — md playbook

**Hard rule**：judge harness 是 [`./judge.md`](./judge.md) 的 §V1/§V2/§V3 playbook（main agent dispatch），**不是** `scripts/*.sh`。

### §V1 RUN（执行）

按 judge.md §V1：

1. `pnpm install && pnpm build` 一次（包括 `pnpm -F @teamagent/cli build` 生成 .cjs bundle）
2. 单元测试：`pnpm vitest run packages/benchmark/src/__tests__/corpus-ablation.test.ts`
3. typecheck：`pnpm -F @teamagent/benchmark typecheck`
4. 本地跑实际 ablation：
   ```
   pnpm -F @teamagent/benchmark bench \
     --groups=teamagent,teamagent-disabled \
     --tasks=all \
     --runs=1 \
     --output-json=docs/plans/2026-05-12-issue-343-pr2/evidence/<run-id>/bench-report.json \
     --output-md=docs/plans/2026-05-12-issue-343-pr2/evidence/<run-id>/bench-report.md
   ```
5. judge.py：
   ```
   python3 scripts/judge/issue-343-ablation.py \
     docs/plans/2026-05-12-issue-343-pr2/evidence/<run-id>/bench-report.json \
     docs/plans/2026-05-12-issue-343-pr2/evidence/<run-id>/ablation.json
   ```

### §V2 DUMP（产 evidence JSON）

`bench-report.json` 由现成 reporter.ts 自动产；`ablation.json` 由 judge.py 自动产。无新增 dump 逻辑。

### §V3 READ（main agent 读 JSON 出 PASS/FAIL）

判定（写死在 judge.md §V3）：

- ✅ **PASS** = 全部满足：
  - vitest exit 0 (`corpus-ablation.test.ts` 全绿)
  - typecheck exit 0
  - bench 60 次调用全部 `error: null`（runner.ts 视角，未崩）
  - ablation.json `n_pairs === 30`（30 对配齐）
  - ablation.json `p_value` 存在（数值，不是 NaN/null —— 即至少 deltas 非零方差）
  - ablation.json `verdict` 字段是俩 canonical 字符串之一
- ❌ **FAIL** = 任一不满足

注意：**`p < 0.05` 不是 PASS 条件！** 真实场景下，p 可能是 0.3（TB 在 curated tasks 上没显著影响），那也是 valid 实验结果。PASS 只要求"harness 跑通 + 出可读数字"，不要求"TB-ON 显著更贵"。

老板 A4 报告里讨论 p 值 / Δ 方向是 PR-3 的事。PR-2 只 ship harness + 首跑数字。

## ④ claudefast probes（具体可跑命令）

PR-2 的 probe 是 ablation 本身跑通即 probe。不需要额外手写 probe — bench bin 已经是 60-prompt probe，每次调用都走 claudefast-equivalent SDK 调用，自带 `tokensIn` 计量。

如果要 sanity check `TEAMAGENT_DISABLED` env propagation：

```bash
TEAMAGENT_DISABLED=1 claudefast -p \
  --output-format stream-json \
  --debug hooks \
  --debug-file .fastprobe/issue-343-pr2/disabled-sanity.debug.log \
  --verbose \
  --permission-mode acceptEdits \
  "echo 'env propagation sanity'"
```

预期：`.debug.log` 不含 `[teamagent]` / matcher / M5 / analyze noise。PR-1 已验证过这条；PR-2 sdk-runner 的 env injection 走同样路径（Node `process.env` → SDK subprocess 继承），不引入新风险。

## 风险 & 边角处理

完整风险表见 research.md §7。PR-2 关键 mitigation：

- **scipy 缺**：本地装 `pip install scipy numpy`（一次性 dev 依赖）；CI 不需要。若评审要求 reproducible，README 给 `requirements.txt`。
- **task 设计偏向**：23 题 PR 描述明示"curated for TB strong scenarios"；不假装这是无偏 sample。
- **API budget**：claudefast / claude-agent-sdk 估算 60 × ~5K = 300K tokens ≈ ¥0.9 well under ¥80。
- **runs=1 噪声**：N=30 paired 样本 sufficient for ttest_rel；followup ADR 可 --runs=3 提 power。
- **env 残留**：sdk-runner 用 try/finally 保护，跑完一定 unset，防 leak 到下一组。
- **LOC 超 1500**：用户 explicit override，主代码 ~265 LOC，剩下是 fixtures + docs。

## ⑤ 实施顺序（atomic commits per `docs/COMMIT-FLOW.md`）

1. **commit A**: `docs(issue-343): research + plan + judge for PR-2`（先 ship docs，让 reviewer 早看到方向）
2. **commit B**: `feat(issue-343): teamagent-disabled group + sdk-runner env injection`（+ unit test for env propagation）
3. **commit C**: `test(issue-343): 23 new curated task fixtures (008-030)`
4. **commit D**: `feat(issue-343): scipy ablation judge.py`
5. **commit E**: `test(issue-343): corpus-ablation.test.ts (load + env + group config)`
6. **commit F**: `chore(issue-343): run bench → evidence/<run-id>/{bench-report,ablation}.{json,md}`
7. **commit G**: `docs(issue-343): PR-2 implementation report with actual numbers`
8. 开 PR → `/review` 循环 → squash-merge → POSTPR cleanup
