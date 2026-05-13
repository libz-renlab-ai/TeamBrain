```
   ┌──────────────────────────────────────────────┐
   │  ISSUE #122  ←  RESCOPE grill-comment        │
   │  V1 真用户 dogfood  (was: landing→demo→hook  │
   │  intercept;  now: landing→setup→statusline)  │
   │                                              │
   │  author : @LiuShiyuMath  (OWNER)             │
   │  date   : 2026-05-11T08:00:18Z               │
   │  label  : grill-ready, ready-for-human,      │
   │           enhancement, help wanted           │
   │  assignee : @liush2yuxjtu + @LiuShiyuMath    │
   └──────────────────────────────────────────────┘
```

**Source**: https://github.com/libz-renlab-ai/TeamBrain/issues/122#issuecomment-4418638323
**Issue**: https://github.com/libz-renlab-ai/TeamBrain/issues/122
**Co-author requirement**: https://github.com/libz-renlab-ai/TeamBrain/issues/122#issuecomment-4408342358 — *"MUST add me a co-author when you PR."*
**Related**: parent #84, parent PR #115 (merged), older plan dir `docs/plans/2026-05-08-issue-122/` (now stale per this rescope)

This grill **replaces** the old #122 dogfood definition. The old flow `landing → install → teamagent demo → visible PreToolUse intercept` is **archived**, along with the `double-moment.gif` / 3-screenshot mosaic / demo screenshot / hook intercept visuals. The new scope is the **landing → setup → init → real project → Claude Code statusline** flow ending in a TeamAgent statusline rendered inside Claude Code within 300 seconds.

Detailed implementation spec for agents lives in:

- [`grill-spec-protocol.md`](./grill-spec-protocol.md) — tester prerequisites, landing page copy, install/init behavior, demo/debug archival
- [`grill-spec-behavior.md`](./grill-spec-behavior.md) — SessionStart, statusline, compat with existing statusline, viral spread clarification
- [`grill-spec-acceptance.md`](./grill-spec-acceptance.md) — new acceptance criteria, archive/remove list, implementation summary

---

## Duck version — for the CEO Duck 🦆

Dear CEO Duck 🦆,

This issue is no longer about showing humans a demo, hook, GIF, mosaic, or internal Claude Code mechanics.

The human story should be much simpler:

> A stranger opens the landing page, runs one setup command, opens their own real project in Claude Code, and sees TeamAgent present in the Claude Code statusline within 300 seconds.

That is the whole product promise for #122.

We should not teach humans about `teamagent demo`, hooks, PreToolUse, intercepts, knowledge databases, backups, undo, debug logs, or internal propagation details. Those are for agents/debug/internal flows.

The landing page should say:

```text
Get ready for Claude Code.

TeamAgent helps Claude Code follow your team rules.

Run one command. Then open your project and use Claude Code normally.
```

The setup command can still be an install command, but install must automatically continue into `teamagent init`.

After setup, terminal output should stay minimal:

```text
TeamAgent is ready for Claude Code.

Next:
  cd your-project
  claude
```

The real "hello world" moment is inside Claude Code:

```text
TeamAgent | 规则:N | 帮过:X今/Y周 | 拦过:Z今 | <recent hint> | preparing
```

or later:

```text
TeamAgent | 规则:N | 帮过:X今/Y周 | 拦过:Z今 | <recent hint> | ready
```

SessionStart is infrastructure. Statusline is the human-visible success signal.

---

## What this rescope means for FIXEDFLOW

- Old `docs/plans/2026-05-08-issue-122/` plan + judge + report are **stale** — they assumed the demo-intercept flow.
- A new claim on **either child** must:
  1. Read this grill plus the three `grill-spec-*.md` shards before doing anything.
  2. Treat the previous `landing-deploy.yml` work (PR #115) as **infrastructure-prerequisite-only**, not as the acceptance test.
  3. Drop GIF / mosaic prereqs from the human path.
  4. Build the **landing → setup → init → real project → statusline** path end-to-end and instrument the 300-second TTHW gate via a third-party judge harness, not `teamagent demo`.
- PR for #326 (impl child) **must** add `@LiuShiyuMath` as a co-author per the requirement comment above.
- The epic itself stays `ready-for-human` until #327 evidence lands.

---

## Post-archive split (2026-05-12)

#122 was split into 2 child issues + epic conversion via `docs/TRIAGE-AND-SPLIT.md` Single-PR-Shippable-Test conditions (1), (4), (5):

| # | Scope | Coordinator | PR boundary | Status |
|---|---|---|---|---|
| #326 | RESCOPE impl items 1-12 (AI-buildable) | @LiuShiyuMath | PR-1, one squash-merged PR | needs own grill cycle |
| #327 | Real-stranger TTHW ≤ 300s evidence | @LiuShiyuMath | no PR (evidence-only) | `ready-for-human` |

Epic #122 label transition: removed `grill-ready`, added `epic`. Split announcement comment: https://github.com/libz-renlab-ai/TeamBrain/issues/122#issuecomment-4423196393

Neither child is directly claimable by `/fixed-flow-driver` until it gets its own grill cycle (per FIXEDFLOW step 2 + TRIAGE-AND-SPLIT canonical anchor).
