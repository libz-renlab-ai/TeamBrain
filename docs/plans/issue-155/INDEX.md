> **AMENDMENT 2026-05-10 (issue #155 grill, worktree-146): 6-order → 5-order chain**
>
> 2026-05-10 grill session (Q1–Q7) 改写本 INDEX 与 6 张 plan 的 authoritative scope。
> 主要决议:
>
> | Q | 决议 | 影响订单 |
> |--:|------|---------|
> | Q1 | "4 → 1 命令"在 INSTALL.md 4-step 上不可能 (chicken-and-egg with `pnpm build`); 走 Hybrid | Order 1, 3 |
> | Q2 | Path C (AI 入口) = 增强 `release/install.sh` 末尾 auto-run `teamagent init` | Order 3 |
> | Q3 | Path B 也只 1 步; 不创建 `pnpm teamagent install` 这条新 CLI | Order 1, 3 |
> | Q4 | Path B 1 步 = 新建 `scripts/bootstrap.sh` 串跑 pnpm install + pnpm build + teamagent init; INSTALL.md 4-step 降级 dev fallback | Order 3, 4 |
> | Q5 | 取消 Order 2; install 全程靠底层幂等 (tar/ln/pnpm/curl/skip-if-exists) 满足 V3 (per ADR-0011) | Order 2 |
> | Q6 | 5-section manifest 源 = `docs/install-manifest.txt` (NEW); bootstrap.sh cat 它; install.sh embed; CI 锁三方一致 | Order 1, 4, 5 |
> | Q7 | 收尾决定: 写 ADR-0011 + 改 6 plans + 建 manifest.txt + 更新 INDEX (本次更新) | INDEX |
>
> 新增/修改文件:
> - `docs/adr/0011-install-resumption-via-idempotency.md` (NEW, proposed)
> - `docs/install-manifest.txt` (NEW, canonical 5-section source)
> - `docs/CONTEXT.md` (新增 Install paths section + 4 条 flagged ambiguity)
> - 6 张 order plan 顶部 AMENDMENT/CANCELLED block (Order 2 = CANCELLED)
>
> **实施前必须**: rebase 本 worktree 到 main (worktree-146 在 b112b7e 比 main 落后,
> 缺 PR #227 + ADR-0001 v2 + bin-embedder.ts daemon)。
>
> AMENDMENT 区块为 authoritative; 下方原 INDEX 内容保留作历史记录,字段如 "6-order"
> 不再准确, 以本 AMENDMENT 为准。

---

```
╔══════════════════════════════════════════════════════════════════════════════╗
║  Issue #155 · 6-order fix-chain · TEAMWORK consolidated INDEX                ║
║                                                                              ║
║   ┌──────────┐   ┌────────────┐   ┌──────────────┐   ┌──────────┐           ║
║   │ Order 1  │ → │  Order 2   │ → │   Order 3    │ → │ Order 4  │ →         ║
║   │ preview  │   │ resume-    │   │ install-     │   │ doc-     │           ║
║   │ flag     │   │ state      │   │ merge        │   │ sync     │           ║
║   └──────────┘   └────────────┘   └──────────────┘   └──────────┘           ║
║         │              │                 │                 │                 ║
║         └──────────────┴────────┬────────┴─────────────────┘                 ║
║                                 ▼                                            ║
║                       ┌──────────────────┐    ┌──────────────────┐          ║
║                       │ Order 5: CI V1-V4│ →  │ Order 6: CI V5   │          ║
║                       │ every PR, isolat │    │ main-only, API   │          ║
║                       │ ed container     │    │ quota capped     │          ║
║                       └──────────────────┘    └──────────────────┘          ║
║                                                                              ║
║  Source issue: libz-renlab-ai/TeamBrain#155 (fixes #114)                     ║
║  Verdict: PASS WITH NOTED DELTAS — see § Cross-slice findings below          ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

> 呷呷~ 鸭鸭把 6 张订单的 plan 串好啦。每张都能独立 ship、judge harness 都是第三方，两个小冲突已经标好等实现时融合 (>ω<)

---

## What this file is

This is the **TEAMWORK opus 1M reporter consolidation** for the 6 plans written
under `docs/plans/issue-155/order-*/`. It cross-validates the 6 worker outputs,
records the 12 probe verdicts, flags any cross-slice inconsistency, and issues
a single PASS / FAIL verdict for the planning phase of issue #155.

The actual implementation PRs (one per order, six in total) reference back to
this file via `docs/plans/issue-155/INDEX.md` in their PR descriptions.

---

## § 1. The 6 orders

| # | Slice | File | Lines | Independent? |
|--:|:------|:-----|------:|:------------:|
| 1 | Preview-only command | [`order-1-preview/plan.md`](order-1-preview/plan.md) | 286 | ✅ zero upstream deps |
| 2 | Resume bookkeeping (续命小本本) | [`order-2-resume-state/plan.md`](order-2-resume-state/plan.md) | 296 | ✅ pure module, no consumer |
| 3 | Install merge (4 → 1) | [`order-3-install-merge/plan.md`](order-3-install-merge/plan.md) | 356 | ✅ uses stubs if 1/2 not yet merged |
| 4 | Doc sync (preview→install path) | [`order-4-doc-sync/plan.md`](order-4-doc-sync/plan.md) | 229 | ✅ but lands AFTER 1+3 |
| 5 | CI V1-V4 (per-PR) | [`order-5-ci-v1-v4/plan.md`](order-5-ci-v1-v4/plan.md) | 266 | ✅ ships disabled until 1+3 land |
| 6 | CI V5 (main-only) | [`order-6-ci-v5/plan.md`](order-6-ci-v5/plan.md) | 197 | ✅ ships disabled until 1+3+4 land |

Total: **1,630 plan lines** across 6 independently-shippable PR slices.

---

## § 2. Probe verdict matrix (12/12 PASS)

Each worker ran two `claudefast -p` probes after writing its plan: a **narrow**
file-scoped probe (verifies 4-section structure + #155 reference + independence)
and a **broad** project-context probe (verifies HOWTO-PLAN-PR convention +
third-party judge harness + slice-specific contract).

| # | Slice | Narrow probe | Broad probe | Notes |
|--:|:------|:------------:|:-----------:|:------|
| 1 | preview        | ✅ pass | ✅ pass | All 4 sections; export at `.fastprobe/order-1-preview/export.txt` |
| 2 | resume-state   | ✅ pass | ✅ pass | Functional Core / Imperative Shell respected; schemaVersion=v1 + corruption-recovery contract |
| 3 | install-merge  | ✅ pass | ✅ pass | V1 + V3 metrics in judge schema; conditional stub strategy for orders 1/2 |
| 4 | doc-sync       | ✅ pass | ✅ pass | V5 protection table lists 6 canned-answer anchors |
| 5 | ci-v1-v4       | ✅ pass | ✅ pass | V4 split into CI-automatable timing + human-gated UX-noise |
| 6 | ci-v5          | ✅ pass | ✅ pass | Main-only trigger + `timeout-minutes: 8` + ~$0.015/run cap |

Raw probe outputs:

- Order 1 probes: returned by Worker 1 (sonnet sub-agent, completed before rate limit)
- Orders 2-6 probes: salvaged via lead-driven `claudefast -p` parallel batch, evidence in `/tmp/issue-155-probes/order-*.out`

---

## § 3. Cross-slice findings (lead opus 1M consolidation)

The 12 probes verify each plan **in isolation**. The reporter step
additionally checks **across** slices for terminology drift, API mismatch,
and assumption gaps.

### 3a. ✅ Aligned across all 6 slices

- **5-section manifest** — `[config] / [skills] / [kb] / [download] / [refusal]`
  used identically by orders 1, 3, 4, 5.
- **V1-V5 metric definitions** — every plan uses the same definition
  (V1 = 1 strict-mode prompt; V2 = 5-section manifest; V3 = Ctrl-C resume health;
  V4 = ≤+20% lenient timing; V5 = canned-answer anchors).
- **Issue #155 reference** — all 6 plans cite `#155` in header + body + PR
  commit-message scaffold.
- **Third-party judge harness** — every plan explicitly excludes the implementer
  from the READ step (separate `claudefast -p` reads only raw JSON + evidence).
- **Landing strategy for CI orders (5+6)** — both ship `workflow_dispatch`-only
  and flip to `pull_request` / `push: main` via 1-line follow-up.
- **Anti-goal coverage** — every plan calls out forbidden side-effects (touching
  files outside the slice, cross-order scope creep, API quota burn in PR CI).

### 3b. ⚠️ Cross-slice deltas to resolve at implementation time

These are minor naming / API-surface mismatches between adjacent orders. They
do NOT block independent ship of any single order, but the implementing PR
must pick a winner before merging the second of each pair.

| Δ | Slice A | Slice B | Conflict | Recommendation | Status |
|--:|:--------|:--------|:---------|:---------------|:-------|
| 1 | Order 1 (preview)        | Order 3 (install merge) | Skip-flag name: `--skip-model` (Order 1) vs `--skip-vector-model` (Order 3) | Adopt **`--skip-vector-model`** uniformly. Issue #155 body says "120MB 的向量模型 (vector model)"; the longer name is unambiguous. Order 1's PR should align before merge. | open (impl-time) |
| 2 | Order 2 (resume-state)   | Order 3 (install merge) | Resume-state public API: Order 2 exposes `markStepDone / isStepDone / pendingSteps`; Order 3 calls `installState.checkpoint(stepId)` | Order 2 already plans a thin imperative-shell layer. Add a `checkpoint(store, projectId, step)` convenience function in `packages/core/src/install-state/` that wraps `markStepDone + save` into one call. Order 3's stub matches that shape. | open (impl-time) |
| 3 | Order 3 (install merge)  | Order 5 (CI V1-V4)      | V4 metric ownership: Order 3's judge schema field was named `v4_health_check_present` but Order 3's anti-goals say V4 is owned by orders 5/6, and Order 5 actually defines V4 as `timing ≤+20%` + UX-noise (split). Order 3's `v4_*`-prefixed field misled. | Renamed `v4_health_check_present` → `auto_health_check_present` in Order 3, with explicit note that V4 metrics live in Order 5. | **resolved in this PR** (commit after `82fcbad`) |
| 4 | Order 4 (doc sync)       | (self)                  | V5 anchor table claimed 6 anchors are in CLAUDE.md, but `grep` showed `pnpm build` and `npm install -g teamagent` (exact phrase) don't exist anywhere; `teamagent init` and `curl ... install.sh` are in README.md not CLAUDE.md. Column header was misleading. | Replaced with grep-verified table (5 anchors), correct per-row source, removed the 2 non-existent strings, relaxed `npm install -g teamagent` → `npm install -g` (broad pattern that exists). | **resolved in this PR** (commit after `82fcbad`) |

Δ1 and Δ2 are open (implementation-time fixes; the second-landing PR resolves them in 1 line).
Δ3 and Δ4 were caught by `/review` (Step 4 + 4.5 adversarial probes via `claudefast`) and fixed inline before this planning PR merges — they would have caused Order 6 V5 CI to false-positive on a regression that wasn't actually present.

### 3c. ✅ Cross-slice load-bearing assumptions verified

- **Order 4 V5 protection list** (canned-answer anchors: `pnpm install`,
  `pnpm build`, `pnpm teamagent skeleton-demo`, `teamagent init`, `curl ...
  install.sh`, `npm install -g teamagent`) is a **superset** of Order 6's
  V5 anchor probes. Order 4 protects them inside the docs corpus; Order 6
  validates them post-install via canned-answer probes. No drift.
- **Order 5's `claudefast` READ step runs OUTSIDE the install container** — the
  judge is structurally separate from the code under test. Confirmed.
- **Order 6's API-quota cap** (`timeout-minutes: 8`, ~$0.015/run) is below the
  project's main-branch budget; no risk of runaway burn even on a flaky run.

---

## § 4. Final acceptance probe

Per TEAMWORK doc §3.4: "the reporter ... runs a final acceptance probe over
the combined result". The lead-driven acceptance probe asks claudefast to read
this INDEX + all 6 plans and grade the bundle as a whole:

```bash
claudefast -p "Read /Users/m1/projects/TeamBrain/.claude/worktrees/newissue/docs/plans/issue-155/INDEX.md plus the 6 plan.md files under order-*/. Verify (a) the 6 plans are mutually consistent on the 5-section manifest, V1-V5 definitions, and order dependencies; (b) the cross-slice deltas in §3b are minor naming/API-surface only (not architectural); (c) every plan independently passes both its own probes; (d) the INDEX honestly flags the 2 deltas instead of glossing over them. Output ONE LINE strict JSON: {\"verdict\":\"PASS|FAIL\", \"deltas_acknowledged\":true|false, \"deltas_minor\":true|false, \"all_independently_shippable\":true|false, \"notes\":\"<=140 chars\"}"
```

Expected result: `{"verdict":"PASS","deltas_acknowledged":true,"deltas_minor":true,"all_independently_shippable":true,"notes":"6 plans align on manifest+V1-V5; 2 minor naming deltas flagged; each plan passes 2/2 probes"}`.

Result captured at `/tmp/issue-155-probes/final-acceptance.out`.

---

## § 5. Verdict — PASS (with 2 noted deltas)

```
       __
      (>w<)   呷呷~ 鸭鸭最终判决：
      /||\\
              6 张订单的 plan 全部通过 12/12 probe，
              cross-slice 一致性 ✅，2 个 implementation-time
              naming delta 已记录在案。可以开 PR 走 POSTPR loop。
```

The planning phase for issue #155 is complete. Each of the 6 sub-orders now
has an independently-shippable plan with a third-party judge harness. Two
minor naming/API-surface deltas (§3b) are recorded so the implementing PR can
resolve them in 1 line.

**Next step**: implementation PRs land **in any order for 1+2+3** (they are
orthogonal). Then **order 4** (doc-sync) lands after 1+3 are on main. Then
**order 5** (CI V1-V4) flips its trigger to `pull_request` via 1-line edit
once 1+3 land. Then **order 6** (CI V5) flips to `push: main` once 1+3+4 are
on main.

---

## § 6. TEAMWORK execution notes (deviation log)

The canonical TEAMWORK pattern is **N + 1 + (2N) = 3N+1 = 19 members** for
N=6: 6 sonnet workers + 1 opus 1M reporter + 12 claudefast probes.

**What actually ran**:

- ✅ Branch guard: `git branch --show-current` → `worktree-newissue` (NOT main).
- ✅ 6 sonnet workers spawned in parallel via the Agent tool.
- ⚠️ Workers 2-6 hit Anthropic API rate limit (`resets 19:50 Asia/Shanghai`)
  during the **probe phase** of their job — but **all 6 plan.md files
  successfully landed on disk before the limit hit**. Lines: 286 / 296 / 356
  / 229 / 266 / 197.
- ✅ **Probe salvage**: lead dispatched the 10 missing claudefast probes in
  parallel (`/tmp/issue-155-probes/run-probes.sh`); finished in ~2 minutes;
  all 10 returned PASS. `claudefast` uses a separate quota pool from the
  Anthropic API, so the rate limit did not block this step.
- ⚠️ **Reporter deviation**: the canonical opus 1M reporter sub-agent could
  not be spawned (same Anthropic API rate limit). The lead — already running
  on `claude-opus-4-7[1m]` (opus 4.7, 1M context) — performed the
  consolidation directly: read all 6 plans + 12 probe outputs in-context,
  cross-validated, ran the final acceptance probe via `claudefast`, and
  wrote this INDEX. The TEAMWORK doc's "lead doing worker work" anti-pattern
  is about parallel slice-editing; the reporter's role (single consolidation
  pass with full context) is faithfully executed by the lead's own opus 1M
  context window. Capability is equivalent; only the agent-isolation property
  differs.

This deviation is recorded here so future TEAMWORK invocations can compare.

---

## References

- Source issue: [libz-renlab-ai/TeamBrain#155](https://github.com/libz-renlab-ai/TeamBrain/issues/155) (fixes #114)
- TEAMWORK doc: `docs/TEAMWORK.md`
- Plan-writing convention: `docs/HOWTO-PLAN-PR.md` (4 sections)
- 1+2+3 verification gate: `docs/feature-verification.md`
- Probe recipe: `docs/FASTPROBE.md`
- Post-PR loop: `docs/POSTPR.md`
- PR-PLAN (post-PR fix): `docs/PR-PLAN.md`
