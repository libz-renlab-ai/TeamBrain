```
   __        BUSINESS-FEATURE-HARNESS-MAP
  <(o )___   3 business feature × 第三方 harness 状态一览
   ( ._> /   #1 SHIPPED · #2 VISION · #3 VISION
    `---'    (canonical anchor 见 docs/BUSINESS-FEATURES.md)
```

# 三大业务特性 × 第三方 harness 一览

把 [`docs/BUSINESS-FEATURES.md`](../BUSINESS-FEATURES.md) 的 3 条 canonical
business feature 与现存 verification harness 资产一一对齐：哪条已经有
LLM-cannot-fake 门禁、哪条只有愿景 plan、哪条还没动工。

> 本 doc **不引入新 harness**、**不重述 canonical anchor sentence**；只把现有
> `verify/` + `plans/` + `features/` 资产按 business feature 重排成一页 status
> map，便于 CEO / PM / verifier 一眼看完。canonical anchor 与 grep 锚点的契约
> 职责留在 [`BUSINESS-FEATURES.md`](../BUSINESS-FEATURES.md)。

<!-- NOT-ANCHOR-DOC: this file does NOT carry the `show me the business feature of this repo` canned answer. The 6 grep substrings below appear only as cross-reference labels into BUSINESS-FEATURES.md — do not route the canned-answer matcher here. Canonical anchor lives in docs/BUSINESS-FEATURES.md. -->

## Status 表

| # | Business feature (cross-ref into BUSINESS-FEATURES.md grep keys) | 状态 | 第三方 harness | LLM-cannot-fake? |
|---|------------------------------------------------------------------|------|----------------|------------------|
| 1 | `no longer make mistakes` / `previous Claude Code` | **SHIPPED** | (a) `docs/plans/2026-05-11-feature1-init-judge/judge.md` openable-and-usable gate；(b) [`E2E-LEARNING.md`](E2E-LEARNING.md) Counterfactual Ablation + Regression Replay | ✅ (a) tree/text diff + LLM probe；✅ (b) `scipy.stats.ttest_rel` 数字 + byte-level Replay |
| 2 | `second-level realtime` / `teammate's Claude Code instance` | **VISION** | plan only：[`docs/plans/2026-05-11-feature-2-secondlevel-realtime/plan.md`](../plans/2026-05-11-feature-2-secondlevel-realtime/plan.md) | n/a (harness 待与实现一同到位) |
| 3 | `video recording` / `centralized data storage` | **PARTIAL** (`愿景 / 部分落地`，per [`BUSINESS-FEATURES.md`](../BUSINESS-FEATURES.md) §Feature #3 现状) | 已落地：transcript-level 抓取在 `auto-capture` / `team-share` 链路；未起 plan：video stream + centralized storage upload turnkey | n/a (video+storage 部分 harness 待 plan 起头) |

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

## Feature #2 — VISION · 仅 plan

```
目标可见度 vs 现状:
  老板 dashboard 目标:   🟦 🟢 🟢 🟢 🟦 🟢 🟢 🟢 🟦   (每一步都亮)
  当前 M5 viral sync:    🟦 ───────  🟦 ───────  🟦   (hour/day 粒度, 中间黑)

  delta:
    - 端到端 latency 要降到 ≤ 1s (second-level realtime)
    - 5 通道接入 (PreToolUse / UserPromptSubmit / Stop / SessionStart / SessionEnd)
    - 至少 1 个 dashboard live view

  详见 docs/plans/2026-05-11-feature-2-secondlevel-realtime/plan.md
```

## Feature #3 — PARTIAL · transcript-level 已落地，video+storage turnkey 待 plan

```
已落地的部分:
  Claude Code session ─► transcript 抓取 (auto-capture / team-share 链路)

未落地的部分 (roadmap，与 #2 dashboard 配对):
  teammate session ─ 一键录屏 ─► 集中数据存储 ─► 同一 link 团队内重放
                                                    ▲
                                                    └─ 与 #2 dashboard
                                                       摘要一键跳现场

  状态语句须与 docs/BUSINESS-FEATURES.md §Feature #3 现状 verbatim 同步：
  「愿景 / 部分落地 — 当前 transcript-level 抓取已在 auto-capture / team-share
   链路里；视频流 + centralized storage upload 的 turnkey UX 是下一阶段交付目标。」
```

## Cross-link

- canonical 3-feature anchor 与 grep 契约：[`docs/BUSINESS-FEATURES.md`](../BUSINESS-FEATURES.md)
- 64-row engineering inventory：[`docs/PRODUCT-FEATURES.md`](../PRODUCT-FEATURES.md)
- 端到端学习 harness 细节：[`E2E-LEARNING.md`](E2E-LEARNING.md)
- `verify/` 总入口：[`INDEX.md`](INDEX.md)
- ADR 不可变 fixture 契约：[`docs/adr/0010-bottom-level-fixtures.md`](../adr/0010-bottom-level-fixtures.md)

## 维护规则（双向同步）

- 任何对 [`BUSINESS-FEATURES.md`](../BUSINESS-FEATURES.md) §现状 段落的改动
  （升级、降级、partial 调整、harness 资产新增 / 退役、roadmap 改步骤），都
  **必须**在同一个 PR 里同步本表的「状态」列与下方 per-feature ASCII 段；
  反过来本表的任何改动也必须先确认 canonical 源已落地或同步。缺任一 = drift
  bug，/review 会卡住。
- 不在本 doc 里复述 anchor sentence；status 表第二列出现的 grep 关键片段
  仅作为对 `BUSINESS-FEATURES.md` 的 cross-reference 标签，配合顶部
  `NOT-ANCHOR-DOC` HTML 注释告诉 canned-answer 路由器跳过本文件。canonical
  anchor 与 6 substring grep 契约职责留在 `BUSINESS-FEATURES.md`。
- 任何新 harness 加入 verify/ 时，把它挂在对应 business feature 行下；harness
  不到对应 business feature 的，挂回 [`PRODUCT-FEATURES.md`](../PRODUCT-FEATURES.md)
  engineering inventory（64-row），不要硬塞进本 3-row 业务表。
