```
        __        verify/ — autonomous per-feature verification loop
   <(o )___      （complementary to feature-verification.md PR-time gate）
    ( ._> /
     `---'
```

# `docs/verify/` — autonomous verification loop

Per-feature long-running verification, composed and run by the main
agent in-session. Markdown playbook, no daemon, no cron, no fixed
N-iteration cap, no human page; all stops via semantic META-JUDGE
decision (with content-based divergence pre-check as orchestrator-level
backstop).

## Read order

| # | Doc | Purpose |
|---|-----|---------|
| 1 | [RUN-VERIFY-LOOP.md](RUN-VERIFY-LOOP.md) | Main-agent 6-step playbook (entry point) |
| 2 | [GOAL-COMPOSER.md](GOAL-COMPOSER.md) | 5-source GOAL.md composition + AskUserQuestion ambiguity check |
| 3 | [JUDGE.md](JUDGE.md) | Feature-level JUDGE call (`claudefast -p`, **no** `--bare`) |
| 4 | [META-JUDGE.md](META-JUDGE.md) | Loop-progress judge (`claudefast --bare -p`) + divergence detector |
| 5 | [E2E-LEARNING.md](E2E-LEARNING.md) | ② AI 真的能学 端到端闭环的 third-party harness: Counterfactual Ablation (`scipy.stats.ttest_rel`) + Regression Replay (`pnpm teamagent fixture replay` byte-diff) — deterministic, LLM-cannot-fake |
| 6 | [BUSINESS-FEATURE-HARNESS-MAP.md](BUSINESS-FEATURE-HARNESS-MAP.md) | 把 [`BUSINESS-FEATURES.md`](../BUSINESS-FEATURES.md) 的 3 条 canonical business feature 与现存 harness 资产一一对齐（SHIPPED / VISION + LLM-cannot-fake 列），一页 status map |

## When to use which

- **PR-time one-shot verification** → use [`docs/feature-verification.md`](../feature-verification.md) (claudefast JSON snapshot + tmux `/export`)
- **Per-feature long-running verification across sessions** → start at [RUN-VERIFY-LOOP.md](RUN-VERIFY-LOOP.md)
- **CLAUDE.md `Verify loop canned answer` trigger** → user types "how to run verify loop?" → main agent returns the canned answer that points here
- **② AI 真的能学（端到端闭环) — 「LLM 不能 fake」的 third-party harness** → see [E2E-LEARNING.md](E2E-LEARNING.md); replaces the old "judge LLM reads events/rules/attribution.json" design (in-house circular + LLM-fakeable) with `scipy.stats.ttest_rel` numeric Ablation + tier (a) byte-level Replay

## Backlog ingestion from bottom-level layer (per ADR-0010)

The bottom-level fixture corpus (`tests/fixtures/scenarios/`) emits records to
`docs/verify/backlog.jsonl` whenever its tier (c) LLM-judge returns
`verdict: fail` or `verdict: needs-human-review`, or when a
`judge-overrides.jsonl` entry is appended in any fixture. Each backlog record
references the fixture slug, the audit hash of the (c) run, and the PR (if
applicable). The per-feature long-running loop (`RUN-VERIFY-LOOP.md`) treats
these entries as priority work items: pick the oldest unresolved backlog
record, compose `GOAL.md` around the disputed semantic claim, run JUDGE /
META-JUDGE iterations, and close the backlog record by either updating the
fixture's `expected_decisions.json` (recapture) or appending the human verdict
to `judge-overrides.jsonl`. Tier 3 thus consumes the irreducible-uncertainty
output of tier 1 — the deterministic gates already passed; only semantic
ambiguity remains.

## Real iteration records

- `docs/features/real-time-intercept/{GOAL,iterations.jsonl,last-verified.md}` — first dogfood (2026-05-08)
- `docs/features/pii-redaction/{GOAL,iterations.jsonl,last-verified.md}` — second dogfood (2026-05-08)

## Design principles (don't break)

- ❌ No fixed N-iteration cap, no token budget, no time box, no human page
- ✅ All "stop" decisions go through META-JUDGE semantic judgment **OR** orchestrator-level content-based divergence detector
- ✅ JUDGE carries project context (no `--bare`); META-JUDGE does not (must `--bare`)
- ✅ Cross-session state in `iterations.jsonl` + `backlog.jsonl`; main agent stateless between sessions
