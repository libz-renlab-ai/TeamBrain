# M5 Rule Propagation L4 — verification harness

> 用户 ↔ 用户 运行时规则传染管线 (m5-share + m5-sync) 的 deterministic
> third-party verdict harness for issue #332. 不要跟 INIT-PROPAGATION 混淆——
> 这是 user-to-user 规则同步，不是 project-to-user 配置传播。

## 跑什么 / 跑哪里

| Layer | 工具 | 跑哪里 | Verdict |
|-------|------|--------|---------|
| **Regression Replay** | `pnpm teamagent m5-replay --slug <id>` | PR-CI + nightly | byte-level: B 的 `.teamagent/team/<author>/<rule_id>.json` 必须与 A 的 fixture rule.json 在 unmasked 字段上完全一致 |
| **Counterfactual Ablation** | `scripts/ablation/ttest_l4.py` (scipy) | nightly only | `scipy.stats.ttest_rel` paired t-test on rule-ON vs rule-OFF observations，p ≤ 0.01 且 Δ > 0 |
| Cold-path runner | (deferred — needs real claudefast harness) | (future slice) | 收集真实 hook fire / block / citation 观测值喂给 ablation |

两条 deterministic harness 都 PASS = verdict 通过；任一 FAIL = nightly 红灯。
**没有 LLM-as-judge 参与 verdict 决策**——per `docs/verify/E2E-LEARNING.md` canonical contract。

## Fixture scenarios

3 个 sub-scenario 在 `tests/fixtures/scenarios/m5-rule-propagation-l4/`：

| Kind | Slug | N prompts | Effect size (expected) | Observable |
|------|------|-----------|------------------------|------------|
| avoidance | `m5-rule-propagation-l4/avoidance` | 10 | d > 5.0 (hard signal) | PreToolUse `block` event count per prompt |
| practice  | `m5-rule-propagation-l4/practice`  | 30 | d ≈ 0.5–1.0 | UserPromptSubmit injection count per prompt |
| learning  | `m5-rule-propagation-l4/learning`  | 10 | d > 2.0 | KB `hit_count` delta per prompt |

Per-scenario layout：

```
tests/fixtures/scenarios/m5-rule-propagation-l4/<kind>/
├── rule.json           # TeamRuleFile that A's m5-share would produce
├── prompts/
│   └── prompts.json    # 10 or 30 trigger paraphrases + (avoidance) 5 negatives
└── README.md
```

## 当前覆盖范围

✅ **L1+L2 byte-level propagation**（这一轮 ship）
- `m5-replay` 通过 dual-HOME 仿真 + fs-copy 转运 + FsTeamRuleStore，证明 B 拿到与 A byte-equivalent 的 team rule file
- 跑过的 mask 字段：无（fixture 完全 deterministic，不需要 mask）

✅ **Counterfactual Ablation 数学层** (这一轮 ship)
- `ttest_l4.py` 在 sample data 上 nightly smoke——证明 scipy harness 自身可工作

⏳ **L3 matcher firing**（待补 slice）
- 不在本次 issue-332 范围；需要把现有 `matchRules()` API + `KnowledgeEntry` builder 接到 m5-replay
- 决定理由：fixture 的 TeamRuleFile shape 极简（content 是 free-form 文本），转换到完整 KnowledgeEntry shape 需要 ~30 个 default 字段；做完整 transformer 单独成 slice

⏳ **L4 cold-path real claudefast**（待补 slice）
- 需要把真 `claudefast -p` 子进程 + stream-json parse + attribution event capture 串起来
- 然后用观测值喂给 `ttest_l4.py` 做 real ablation 而不是 smoke ablation

⏳ **bare-git transit channel**（待补 slice）
- `m5-replay --transit=bare-git` 当前直接报错；slice 1 的 `setupBareGitBridge` 已就位，挂上只是 wiring 工作

## Verdict thresholds

| Threshold | Value | Why |
|-----------|-------|-----|
| α (ablation p-value) | 0.01 | per grill plan — 0.05 假阳率累计 14%/晚 太高，0.01 让累计 ~3% |
| Byte-diff mask | 5 fields | `timestamp` / `uuid` / `tmpdir_prefix` / `pid` / `cwd_abs_path`——上限 5，超出需 PR review |
| Replay tier | `--tier=a` only | tier=b/c 当前 unimplemented；E2E-LEARNING.md 锁 byte-diff 为主门禁 |

## CI 触发

| Trigger | Workflow | What runs |
|---------|----------|-----------|
| Every PR | `ci.yml` | 包含 `m5-replay` 与 m5 propagation 的 vitest cases |
| Nightly (cron `0 3 * * *` UTC) | `.github/workflows/m5-propagation-nightly.yml` | Replay 3 fixtures + scipy ablation smoke + budget guard |
| Manual | `workflow_dispatch` 同 workflow | Override `budget_usd` input 看 budget guard 行为 |

## 跑 nightly 失败怎么办

1. Replay step 红：scenario 文件已变 / `m5-replay` regression →
   `pnpm vitest run packages/cli/src/__tests__/m5-replay.test.ts` 本地复现
2. Ablation step 红：scipy 升级 broke 输出 schema →
   `python scripts/ablation/ttest_l4.py --help` 本地复现，对比 `scripts/ablation/README.md` verdict schema
3. Budget guard 红：fixture / prompt 数量膨胀超过 estimated_usd →
   决策：要么 raise budget，要么拆 scenario

## 相关文档

- `docs/verify/E2E-LEARNING.md` — canonical 锚点：scipy + byte-diff 是 LLM-unfakeable 主门禁
- `docs/adr/0010-bottom-level-fixtures.md` — fixture replay 设计
- `docs/adr/0013-inner-loop-on-ci.md` — `MINIMAX_API_KEY → ANTHROPIC_API_KEY` wiring
- `docs/adr/0014/332.md` — grill log for this issue
- `docs/INIT-PROPAGATION.md` — **相邻 feature**（project→user 配置传播），与本文档不同
- `scripts/ablation/README.md` — ablation harness usage
- `packages/cli/src/commands/m5-replay.ts` — replay command
- `packages/adapters/src/m5/testing/` — slice 1 scaffolding (dual-HOME + bridges + mock LLM)
