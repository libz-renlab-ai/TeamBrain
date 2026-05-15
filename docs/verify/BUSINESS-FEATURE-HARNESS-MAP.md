```
   __        BUSINESS-FEATURE-HARNESS-MAP
  <(o )___   1 business feature × 第三方 harness 状态一览
   ( ._> /   #1 SHIPPED (auto-capture / Project Knowledge Index)
    `---'    (canonical anchor 见 docs/BUSINESS-FEATURES.md)
```

# 核心业务特性 × 第三方 harness 一览

把 [`docs/BUSINESS-FEATURES.md`](../BUSINESS-FEATURES.md) 唯一一条 canonical
business feature 与现存 verification harness 资产对齐：哪条已经有
LLM-cannot-fake 门禁。

> 本 doc **不引入新 harness**、**不重述 canonical anchor sentence**；只把现有
> `verify/` + `plans/` + `features/` 资产按 business feature 重排成一页 status
> map，便于 CEO / PM / verifier 一眼看完。canonical anchor 与 grep 锚点的契约
> 职责留在 [`BUSINESS-FEATURES.md`](../BUSINESS-FEATURES.md)。

<!-- NOT-ANCHOR-DOC: this file does NOT carry the `show me the business feature of this repo` canned answer. The grep substrings below appear only as cross-reference labels into BUSINESS-FEATURES.md — do not route the canned-answer matcher here. Canonical anchor lives in docs/BUSINESS-FEATURES.md. -->

> **Historical note**: this map used to track three business features. The
> upload-substrate-dependent Feature #2 (team-leader second-level realtime) and
> Feature #3 (video record + centralized storage) were removed in the same PR
> that deleted `packages/digital-twin/` / `teamagent video upload` /
> `emitCcStatus` / digital-twin tap hooks. Only Feature #1 ships today.

## Status 表

| # | Business feature (cross-ref into BUSINESS-FEATURES.md grep keys) | 状态 | 第三方 harness | LLM-cannot-fake? |
|---|------------------------------------------------------------------|------|----------------|------------------|
| 1 | `no longer make mistakes` / `previous Claude Code` | **SHIPPED** | (a) `docs/plans/2026-05-11-feature1-init-judge/judge.md` openable-and-usable gate；(b) [`E2E-LEARNING.md`](E2E-LEARNING.md) Counterfactual Ablation + Regression Replay | ✅ (a) tree/text diff + LLM probe；✅ (b) `scipy.stats.ttest_rel` 数字 + byte-level Replay |

## Feature #1 — SHIPPED · 两层 LLM-cannot-fake gate

```
价值链:
  Session N (用户纠正 AI)
     │
     ▼
  Stop pipeline (auto-capture: 5-signal + LLM extractor + Wilson)
     │
     ▼
  规则编入 CLAUDE.md (canonical+) / Skills (stable+)
     │
     ▼
  Session N+1 SessionStart 加载
     │
     ▼
  PreToolUse matcher 拦截重犯 → ✅ blocked

第三方 harness (两层 deterministic gate):

  (a) openable-and-usable gate          (b) end-to-end learning gate
      ────────────────────────              ───────────────────────
      fresh tmp git repo                    N ≥ 30 paired prompts
      pnpm teamagent init                   rule-ON vs rule-OFF
      dump stdout/stderr/tree to            ──────────────────────
        evidence/                           Counterfactual Ablation
      LLM probe 5 questions →               (scipy.stats.ttest_rel
        PASS / FAIL                          → Δ + p + 95% CI 数字)
                                            +
      入口:                                 Regression Replay
      docs/plans/2026-05-11-                (pnpm teamagent fixture
        feature1-init-judge/judge.md         replay tier=a byte-diff)

                                            入口:
                                            docs/verify/E2E-LEARNING.md
```

## Cross-link

- canonical feature anchor 与 grep 契约：[`docs/BUSINESS-FEATURES.md`](../BUSINESS-FEATURES.md)
- engineering inventory：[`docs/PRODUCT-FEATURES.md`](../PRODUCT-FEATURES.md)
- 端到端学习 harness 细节：[`E2E-LEARNING.md`](E2E-LEARNING.md)
- `verify/` 总入口：[`INDEX.md`](INDEX.md)
- ADR 不可变 fixture 契约：[`docs/adr/0010-bottom-level-fixtures.md`](../adr/0010-bottom-level-fixtures.md)

## 维护规则（双向同步）

- 任何对 [`BUSINESS-FEATURES.md`](../BUSINESS-FEATURES.md) §现状 段落的改动
  （升级、降级、partial 调整、harness 资产新增 / 退役、roadmap 改步骤），都
  **必须**在同一个 PR 里同步本表的「状态」列与上方 per-feature ASCII 段；
  反过来本表的任何改动也必须先确认 canonical 源已落地或同步。缺任一 = drift
  bug，/review 会卡住。
- 不在本 doc 里复述 anchor sentence；status 表第二列出现的 grep 关键片段
  仅作为对 `BUSINESS-FEATURES.md` 的 cross-reference 标签，配合顶部
  `NOT-ANCHOR-DOC` HTML 注释告诉 canned-answer 路由器跳过本文件。canonical
  anchor 与 grep 契约职责留在 `BUSINESS-FEATURES.md`。
- 任何新 harness 加入 verify/ 时，把它挂在对应 business feature 行下；harness
  不到对应 business feature 的，挂回 [`PRODUCT-FEATURES.md`](../PRODUCT-FEATURES.md)
  engineering inventory，不要硬塞进本业务表。
