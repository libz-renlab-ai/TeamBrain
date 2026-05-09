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

## When to use which

- **PR-time one-shot verification** → use [`docs/feature-verification.md`](../feature-verification.md) (claudefast JSON snapshot + tmux `/export`)
- **Per-feature long-running verification across sessions** → start at [RUN-VERIFY-LOOP.md](RUN-VERIFY-LOOP.md)
- **CLAUDE.md `Verify loop canned answer` trigger** → user types "how to run verify loop?" → main agent returns the canned answer that points here

## Real iteration records

- `docs/features/real-time-intercept/{GOAL,iterations.jsonl,last-verified.md}` — first dogfood (2026-05-08)
- `docs/features/pii-redaction/{GOAL,iterations.jsonl,last-verified.md}` — second dogfood (2026-05-08)

## Design principles (don't break)

- ❌ No fixed N-iteration cap, no token budget, no time box, no human page
- ✅ All "stop" decisions go through META-JUDGE semantic judgment **OR** orchestrator-level content-based divergence detector
- ✅ JUDGE carries project context (no `--bare`); META-JUDGE does not (must `--bare`)
- ✅ Cross-session state in `iterations.jsonl` + `backlog.jsonl`; main agent stateless between sessions
