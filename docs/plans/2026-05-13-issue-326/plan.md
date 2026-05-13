```text
   ┌────────────────────────────────────────────────────────┐
   │  PLAN · issue #326 RESCOPE 实现 12 项 (PR-1)           │
   │                                                        │
   │  landing → setup → init → real project → statusline    │
   │  primary delta: item 4 (landing trim) + item 6 (init)  │
   │                                                        │
   │  items 1/2/3/5/8/10/11/12 = already PRESENT on main    │
   │  item 7 = sweep stale "hook/PreToolUse/intercept" copy │
   │  item 9 = statusline format (PR #420 already wired in) │
   └────────────────────────────────────────────────────────┘
```

# Plan: TeamBrain issue #326 RESCOPE implementation (12 items)

> Three-section plan per `docs/PLAN-RESEARCH-REPORT.md` + `docs/HOWTO-PLAN-PR.md`.
> Coordinator: @LiuShiyuMath. Parent epic: #122 (now `epic` + `ready-for-human`).
> Sibling: #327 (real-stranger TTHW ≤ 300s recording — out of scope for this PR).
> Grill source: [issue comment](https://github.com/libz-renlab-ai/TeamBrain/issues/326#issuecomment-4436663365)
> + saved batch grill at `docs/adr/0014/326.md` + restored 3-shard spec under
> `docs/plans/2026-05-11-issue-122/grill-spec-*.md` (this PR re-imports them
> from archived commit `5e89e73e`).

---

## ① Task description

Ship the human-facing copy + UX trim of the #122 RESCOPE so the "landing →
setup → init → real project → Claude Code statusline" path stops mentioning
the old `teamagent demo` / PreToolUse / intercept / hook vocabulary, and the
`teamagent init` success block collapses to the minimal `TeamAgent 已就绪 +
Next: cd / claude` block specified in `grill-spec-acceptance.md §Implementation
summary` items 4, 6, 7.

Concrete edits:

1. **`apps/landing/src/index.html`** (item 4 + item 7, **legacy mirror only**):
   The live landing deploy goes through `landing/rocketteam` (Next.js submodule)
   per `.github/workflows/landing-deploy.yml` + `landing/build-static.sh`.
   RocketTeam is already clean of the forbidden strings (verified via
   `grep -rE 'PreToolUse|拦截 PreToolUse|拦截机制|TeamAgent 安装成功' landing/rocketteam`
   → no hits). The edits below trim the **legacy static-HTML mirror** so it
   stops drifting away from the live RocketTeam copy and the judge-harness P1
   probe stays green; the live site behaviour is unchanged by this PR.
   - Drop `PreToolUse interception` from `<meta name="description">`.
   - Drop `PreToolUse hook` clause from hero `<img alt="...">`.
   - Collapse install-box from two lines (`curl ... | bash` + `teamagent init`)
     to a single one-liner — `release/install.sh` already auto-runs init
     (item 5 PRESENT).
   - Comparison-table row 2 `工具调用前拦截 PreToolUse` → neutral
     `团队规则自动应用` (matches grill verdict §12B "presence state two views",
     no hook/intercept jargon in the human display).
   - Headache-bullets line 3 `想让 AI 在执行危险操作前停下来，但没有拦截机制`
     → drop the "拦截机制" wording, restate as positive-form rule discovery.

2. **`packages/cli/src/commands/init.ts`** (item 6 + item 7):
   - Replace the trailing success block (current lines 1996–2020):
     `✅ TeamAgent 安装成功！` + 4-item `下一步:` list + `💡 团队标配插件…` tip
     ⟶ a 5-line minimal block: separator + `✅ TeamAgent 已就绪` + blank line
     + `下一步：` + `  cd your-project` + `  claude`.
   - Reorder `appendFixedflowBanner(lines)` so the FIXEDFLOW guidance prints
     **before** the minimal success block (it stays installable-context info,
     not part of the success block per item 6).
   - Rename step-group label `🔗 注册 Hook` → `🔗 注册集成` (item 7: no
     `hook` word in normal human display; `audit-orphan-hooks` step's own
     detail string stays intact because it surfaces only inside `--verbose`
     audit output already).
   - Drop the post-init `🆕 本次新增` CHANGELOG tail (`buildPostInitWhatsNewTail`)
     from the default success path. Function + helpers stay in the file so
     `teamagent doctor` or a future `--verbose-init` flag can reuse them.

3. **`docs/plans/2026-05-11-issue-122/`** (item 1):
   - Restore four shards (`grill-comment.md`, `grill-spec-acceptance.md`,
     `grill-spec-behavior.md`, `grill-spec-protocol.md`) from commit
     `5e89e73e` so the dangling reference in `#326` body resolves on main.

### What we are NOT doing

- We are **not** rewriting the landing page to plain text only (verdict §23
  option E = "只取 landing → init → statusline 的必要部分", not "delete
  everything visual"). GIF, comparison table, headache bullets stay — only
  the demo/intercept/hook copy is trimmed.
- We are **not** changing the statusline format. PR #420 already shipped
  `项目:<name>` per grill verdict §12B (presence-state two-views), and item 10
  explicitly says "Do not change recent hint logic in this issue."
- We are **not** producing TTHW recording evidence. That is #327 (sibling
  child, `ready-for-human`).
- We are **not** deleting `apps/landing/public/double-moment.gif` — item 3
  about "GIF prerequisites" is scoped to the human dogfood path (which
  previously gated #122 on issue #120 finishing); the landing page still
  uses the GIF for value-prop demonstration, which is independent.

## ② Expected outputs

| Artifact | Path | Acceptance bytes |
|---|---|---|
| Restored grill spec shards | `docs/plans/2026-05-11-issue-122/grill-{comment,spec-acceptance,spec-behavior,spec-protocol}.md` | 4 files, totalling ≥ 540 lines, content matches commit `5e89e73e` |
| Landing copy trim | `apps/landing/src/index.html` | no occurrence of `PreToolUse` / `拦截 PreToolUse` / `拦截机制` substrings; install-box has exactly **one** `<pre>` element |
| Init success trim | `packages/cli/src/commands/init.ts` | trailing block contains `✅ TeamAgent 已就绪` + `下一步：` + `  cd your-project` + `  claude`; no `TeamAgent 安装成功`, no `4-item 下一步` list, no `💡 团队标配插件` line, no post-init `🆕 本次新增` tail by default |
| Step-group rename | `packages/cli/src/commands/init.ts` line 1971 | label string is `"🔗 注册集成"`, not `"🔗 注册 Hook"` |
| Unit tests updated | `packages/cli/src/__tests__/init.test.ts` | assertions reflect new success copy; FIXEDFLOW banner still asserted (now appears **before** success block); 4-item 下一步 assertions removed; plugin-tip + 🆕 tail assertions removed |
| Plan / research / judge | this dir | `plan.md` (this file) + `research.md` + `judge.md` all present |

## ③ Judge harness (md playbook — § 3b of HOWTO-PLAN-PR.md)

The judge harness for this PR is `docs/plans/2026-05-13-issue-326/judge.md`.
It defines:

- **§V1 RUN**: 6 fixed probes (grep for forbidden substrings in landing copy,
  grep for the new minimal success block in `init.ts`, `pnpm vitest run` on
  init tests, `pnpm vitest run` on landing snapshot tests if any, `pnpm
  typecheck`, archive-file existence check).
- **§V2 DUMP**: each probe writes `exit_code` + `stdout` to `.judge/<run_id>/
  <probe>.json` under the worktree (not committed).
- **§V3 READ**: a separate LLM judge (`claudefast -p`) reads ONLY the raw
  JSON dumps + the diff-summary; it does not re-grade by re-running probes.
  PASS thresholds pinned: every probe must have `exit_code=0`; vitest must
  show no new red tests; typecheck must report zero errors.

The judge is the **only** acceptance signal. `/review` PASS (ADR-0007) is
the merge gate; judge harness is the pre-`/review` smoke gate.

## ④ `claudefast` probes (canonical, run before opening the PR)

```bash
# 1. forbidden-substring sweep on landing copy
claudefast -p "grep landing copy for PreToolUse/intercept/拦截机制 — report counts" < apps/landing/src/index.html

# 2. canonical success-block grep
claudefast -p "does this init.ts render a minimal 5-line success block with TeamAgent 已就绪 + 下一步 + cd + claude and NO 安装成功 wording? answer PASS/FAIL with line numbers" < packages/cli/src/commands/init.ts

# 3. orchestration sanity (re-run after edits)
pnpm vitest run packages/cli/src/__tests__/init.test.ts
pnpm typecheck

# 4. archive restoration spot-check
test -f docs/plans/2026-05-11-issue-122/grill-spec-acceptance.md && head -1 docs/plans/2026-05-11-issue-122/grill-spec-acceptance.md
```

All four probes must succeed before `/review` is launched. `/review` runs
last, after probes pass — it is the merge gate (ADR-0007), not the judge.
