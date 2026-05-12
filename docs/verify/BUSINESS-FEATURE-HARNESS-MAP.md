```
   __        BUSINESS-FEATURE-HARNESS-MAP
  <(o )___   3 business feature × 第三方 harness 状态一览
   ( ._> /   #1 SHIPPED · #2 VISION · #3 WEDGE-SHIPPED + VISION
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
| 3 | `video recording` / `centralized data storage` | **WEDGE-SHIPPED + VISION** (per [`BUSINESS-FEATURES.md`](../BUSINESS-FEATURES.md) §Feature #3 现状) | (a) [`docs/plans/2026-05-13-feature-3-video-easy/judge.md`](../plans/2026-05-13-feature-3-video-easy/judge.md) — fixture mp4 round-trip + SHA-256 byte equality + MIME correctness, three probes dumping raw JSON to `evidence/<run-id>/`; (b) sibling assets unchanged — `auto-capture` / `team-share` transcript chain | ✅ (a) byte-level SHA-256 equality + HTTP status / Content-Type header diff; ⚠️ (b) queue retry / signed ACL / browser recorder Vision items not yet covered |

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
  老板 dashboard 目标:   🟦 ──────  🟦 ──────  🟦   (prompt 边界粒度, ≤1s)
  当前 M5 viral sync:    🟦 ───────  🟦 ───────  🟦   (hour/day 粒度)

  delta:
    - 端到端 latency 要降到 ≤ 1s (second-level realtime)
    - 2 通道接入 (SessionStart + UserPromptSubmit) 推送 prompt-boundary 事件
    - 至少 1 个 dashboard live view

  out-of-scope (2026-05-12 撤回):
    - per-tool-call 中间步可见 (PreToolUse / Stop / SessionEnd 不接, 见
      docs/BUSINESS-FEATURES.md § Feature #2 Scope 边界)

  详见 docs/plans/2026-05-11-feature-2-secondlevel-realtime/plan.md
```

## Feature #3 — WEDGE-SHIPPED + VISION

```
价值链 (2026-05-13 起 PRESHIP wedge):
  用户用 OS-native 录屏 (screencapture -v / x11grab / gdigrab)
     │
     ▼
  teamagent video upload <file.mov>     ← 单次 HTTP POST
     │
     ▼
  digital-twin collector  POST /v1/videos
     │     ── 写 <user>/<date>/<id>.<container> 到 outputDir
     ▼
  返回 share link  /api/file?user=…&date=…&id=…&ext=mov|mp4|webm|mkv
     │
     ▼
  recipient curl link → 200 OK, Content-Type: video/<container>, 原始 bytes

第三方 harness (deterministic gate):

  (a) round-trip SHA-256 byte equality gate
      ───────────────────────────────────
      generate fixture mp4 via ffmpeg
      teamagent video upload --json
      curl returned link → /tmp/round.mp4
      shasum -a 256 fixture.mp4 round.mp4 → 必须相等
      probe dumps {expected_sha, observed_sha, status, content_type}
      到 evidence/<run-id>/round-trip.json
      ──────────────────────────────────
      LLM judge 只读 raw JSON 判 PASS/FAIL

      入口:
      docs/plans/2026-05-13-feature-3-video-easy/judge.md

未落地的部分 (Vision，roadmap 列在 docs/features/video-record-upload.md §Roadmap):
  - queue / daemon retry + backoff (重用 daemon/queue.ts / uploader.ts)
  - signed ACL share link (per-recipient 鉴权)
  - browser-side recorder (无 native 工具依赖)
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
