```text
   issue-250 iter-1 fix plan
   ─────────────────────────
   /review found 1 INFORMATIONAL (confidence 6/10)
        ↓
   AUTO-FIX: append disambiguation to CONTEXT.md _Avoid_ line
        ↓
   judge harness: claudefast -p × 2 (semantic probes, 3rd-party LLM judge)
```

# Iter-1 fix plan — issue #250

## Task

`/review` iter-1 在 `docs/CONTEXT.md:113` 发现一处 INFORMATIONAL (confidence 6/10)：
仓库 CONTEXT.md 已有 **Tier**（calibration / rule maturity 6 档枚举：
`experimental | probation | stable | canonical | enforced | dormant`），
本 PR 新增 **Three replay tiers**（verification 三层 (a) byte-diff / (b) seq+DB-state /
(c) LLM-judge）一词二义，潜在域语义碰撞。

修法：保持 `Three replay tiers` 表述不动（已用 `replay` 限定），
在该条目下方 `_Avoid_` 行追加显式区分，把"两个 tier 不同义、写时分别用
`replay tier` / `verification tier` 显式限定"写明，让未来读者
读到 CONTEXT.md 时不会混淆两个概念。

## Expected outputs

- `docs/CONTEXT.md:128` `_Avoid_` 行追加约 24 字 disambiguation 子句
- `docs/CONTEXT.md` 行数 ≤ 200（fix 后仍 198，无溢出）
- 不动 ADR-0010 / feature-verification.md / verify/INDEX.md
- iter-2 `/review` critical pass 不再产 INFO finding（同源 fingerprint 不再触发）
- 本 plan 文件由 fixed-flow-driver step 5 PR 开后 rename 为 `docs/plans/2026-05-09-pr-<PR_NUMBER>-fix-plan.md`

## Third-party judge harness

跑两条 `claudefast -p` semantic probe，结果由 main agent 派 subagent
读 raw output 写 verdict JSON 当 3rd-party LLM judge（符合 docs/PR-PLAN.md
三段铁律 + memory rule "judge harness = MD playbook, not fixed bash"）：

```bash
# Probe 1 — disambiguation 是否传达
claudefast -p \
  "in TeamBrain, what is the difference between calibration Tier (per ADR-0004) and replay tier (per ADR-0010)?"

# Probe 2 — 原 Three replay tiers 概念仍可被发现
claudefast -p \
  "list TeamBrain bottom-level testing replay tiers (a)/(b)/(c) and what each does"
```

**Expected anchors**:

- Probe 1 raw output 必须命中 (i) calibration Tier 是 rule maturity 6 档枚举；
  (ii) replay tier 是 verification 三层 ((a)/(b)/(c))；
  (iii) 写时用 `replay tier` / `verification tier` 限定避免混淆
- Probe 2 raw output 必须命中 (a) byte-diff per commit；(b) seq + DB-state per PR；
  (c) LLM-judge dual-consensus PR-blocking——证明 disambiguation 修订没破坏
  原概念的可发现性

任一锚点缺失 → judge JSON `verdict: fail` → 重 grill 修订；
全命中 → `verdict: pass` → 进 driver step 5 (PR + squash-merge)。
