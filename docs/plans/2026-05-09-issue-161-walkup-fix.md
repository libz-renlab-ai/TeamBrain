```
                          Issue #161 — fix-plan
                  ┌────────────────────────────────────┐
                  │  parent  /<root>/                  │
                  │  ├── .teamagent/knowledge.db  ◄────┼──┐
                  │  ├── .claude/settings.local.json   │  │ walk-up
                  │  └── sub/                          │  │ from cwd
                  │      └── (cwd here)  ──────────────┼──┘
                  └────────────────────────────────────┘
            Layer 1 fix    teamagent init  →  ~/.claude/settings.json
                           hook fires from ANY cwd (viral)
            Layer 2 fix    hook-shell.resolvePaths uses walk-up
                           DualLayerStore points at ANCESTOR knowledge.db
```

# Issue #161 — Walk-up Hook Resolution + Viral User-Level Install

- **Issue**: <https://github.com/libz-renlab-ai/TeamBrain/issues/161>
- **Branch**: `fix/issue-161-walkup-viral`
- **Worktree**: `/Users/m1/projects/TeamBrain/.claude/worktrees/161/`
- **Author**: lead agent (this session) + TEAMWORK N=5 sonnet workers + 1 opus 1M reporter
- **Date**: 2026-05-09

## ① Task description

### What we're fixing

When a user runs `teamagent init` in a parent directory and then launches Claude Code from a *child* directory, the project's TeamAgent hooks silently disappear and `DualLayerStore` degrades to read-only `~/.teamagent/global.db`. Two stacked bugs cause this:

| Layer | Where | Bug |
|-------|-------|-----|
| **L1** | Claude Code itself | reads `<cwd>/.claude/settings.local.json` only; does NOT walk up to parents. From a sub-directory cwd, project hooks are never registered with cc. |
| **L2** | TeamAgent hook entry points | `hook-shell/index.ts:68-74` (`resolvePaths`) and four direct sites in `bin-stop.ts` / `bin-session-start.ts` / `session-start-logic.ts` hardcode `path.join(cwd, ".teamagent", "knowledge.db")`. Even if L1 were fixed, the hook would still load the wrong DB. |

### How we fix

**Layer 1 — viral user-level install (so hooks fire from any cwd):**

- `packages/cli/src/commands/install-hook.ts` gains a `userLevel: boolean` option (default `true` going forward; configurable).
- When `userLevel=true`, hook entries are written to `~/.claude/settings.json` (idempotent, additive merge — never overwrite an existing user-level hook list, only append the TeamAgent-tagged entries).
- `packages/cli/src/commands/init.ts` calls `installHook({ ..., userLevel: true })` by default.
- A new escape hatch `--no-user-level-hook` keeps the old project-level-only behaviour for users who need it.

**Layer 2 — walk-up DB resolution inside every hook entry:**

- New shared util `packages/cli/src/lib/walk-up.ts` exporting:
  ```ts
  export function findTeamagentRoot(start: string): string | null;
  // Walks from `start` (inclusive) up to filesystem root. Returns the first
  // ancestor whose `<dir>/.teamagent/knowledge.db` exists as a regular file.
  // Returns null if none. Stops at fs.root. Uses fs.existsSync + fs.statSync.
  ```
- `hook-shell/index.ts:resolvePaths` (line 68-74) calls `findTeamagentRoot(cwd) ?? cwd` before joining `.teamagent/knowledge.db`. This single change covers all 8 channels routed through `runHook` / `runAdvancedHook`.
- Direct sites updated to use the same util:
  - `bin-stop.ts:418` (catch-up vectorization DB)
  - `bin-stop.ts:500` (narrative scan DB)
  - `bin-stop.ts:285,338` (the `cwd` passed into `executeAnalyze` / `executeCalibrate` is replaced with the walked-up root)
  - `bin-session-start.ts:119` (cleanupDbBackups target dir)
  - `session-start-logic.ts:56` (`decideAction` — when an ancestor already has `.teamagent/knowledge.db`, decision becomes `skip-already-initialized` instead of auto-init'ing a duplicate `.teamagent/` in the child)

### What we are NOT fixing in this PR (anti-goals)

- **CLI commands** anchored to cwd (`compile`, `analyze`, `doctor`, `init`, `recent-entries`, ~12 sites): these affect `pnpm teamagent <cmd>` from a sub-dir, not the issue's reported symptom. Tracked in a follow-up issue (TODO file path: `docs/plans/2026-05-09-issue-161/followup-cli-commands.md`).
- **Cross-machine "viral" propagation** (collaborator clones repo → hooks auto-install): this is a separate user-flow ("协作者 clone 全机器自动装"). Out of scope; this PR only covers the single-machine viral propagation via user-level settings.
- **Behaviour when `.teamagent/knowledge.db` exists in BOTH an ancestor and the cwd itself**: the walk-up util is "first match wins, starting at cwd inclusive", so cwd wins. Documented; not changed.
- **Existing `.claude/settings.local.json` files in user repos**: PR keeps backward-compat — projects that previously ran `teamagent init` continue working. The new user-level entry is additive.

## ② Expected outputs

### Files added

- `packages/cli/src/lib/walk-up.ts` — shared walk-up util
- `packages/cli/src/lib/__tests__/walk-up.test.ts` — unit tests (≥ 6 cases: cwd-has-db / parent-has-db / grandparent-has-db / no-db-anywhere / db-is-directory-not-file / fs-root-stop)
- `packages/cli/src/__tests__/issue-161-walkup-integration.test.ts` — integration regression test reproducing #161 (parent `teamagent init` → child cwd → hook bin reads parent DB)
- `docs/plans/2026-05-09-issue-161-walkup-fix.md` — this file
- `docs/plans/2026-05-09-issue-161/judge.md` — judge harness md playbook
- `docs/plans/2026-05-09-issue-161-walkup-fix-report.md` — written when the loop terminates with `/review` PASS

### Files edited

| File | Lines | Change |
|------|-------|--------|
| `packages/cli/src/hook-shell/index.ts` | 68-74 (`resolvePaths`) | use walk-up before `.teamagent/knowledge.db` join |
| `packages/cli/src/bin-stop.ts` | 285, 338, 418, 500 | walk-up before DB join / `cwd` pass-through |
| `packages/cli/src/bin-session-start.ts` | 119 | walk-up before `cleanupDbBackups` |
| `packages/cli/src/session-start-logic.ts` | 56 (`decideAction`) | check ancestors before deciding `auto-init` |
| `packages/cli/src/commands/install-hook.ts` | new `userLevel` option + `~/.claude/settings.json` writer | additive merge, idempotent |
| `packages/cli/src/commands/init.ts` | call `installHook({ userLevel: true })` by default | + `--no-user-level-hook` escape hatch |
| `packages/cli/src/__tests__/install-hook.test.ts` | add user-level cases | idempotency, merge, opt-out |
| `packages/cli/src/__tests__/session-start-logic.test.ts` | add ancestor-has-db case | `skip-already-initialized` returned for child cwd |

### CLI / behaviour outputs

- `pnpm teamagent init --help` lists `--no-user-level-hook`.
- `pnpm teamagent init` in a fresh project writes both `<cwd>/.claude/settings.local.json` (existing) AND `~/.claude/settings.json` hook block (new, idempotent merge).
- From a sub-directory, `claudefast -p "ls"` triggers `bin-pre-tool-use.cjs` (verified via `--debug hooks`).
- The triggered hook bin reads the ancestor's `.teamagent/knowledge.db` (project rules visible).

### Tests / CI

- `pnpm test` green (all packages).
- `pnpm typecheck` green (all packages).
- New tests fail without the fix and pass with it (the regression test specifically reproduces #161).

### PR artefacts

- Normal PR (NOT `--draft`) opened against `main`.
- Squash-only merge (`gh pr merge --squash`).
- Commit messages follow `fix(issue-161): ...` per project convention.
- `/export` transcript file attached to the PR description (per `docs/feature-verification.md` 1+2+3).

## ③ Judge harness — md playbook

> **Hard rule — third-party judge harness forbidden fixed scripts; MUST use md playbook.**
> The harness lives at `docs/plans/2026-05-09-issue-161/judge.md`. The MAIN agent
> dispatches the playbook through subagents (TEAMWORK `N+1+(2N)`) or `claudefast -p`
> probes (FASTPROBE max 8 parallel). Failed sections rerun by re-dispatching `§V<n>`,
> not by editing scripts.

See `docs/plans/2026-05-09-issue-161/judge.md` for the §V1 RUN / §V2 DUMP / §V3 READ playbook structure.

The harness covers four acceptance criteria:

1. **Unit-level walk-up correctness** — `findTeamagentRoot` returns the right ancestor for the 6 enumerated cases.
2. **Hook-shell integration** — `hook-shell/index.ts:resolvePaths` resolves to the ancestor DB when cwd is a child of a project root.
3. **End-to-end regression** — the exact scenario from the issue body (parent `teamagent init`, child cwd, run cc) shows project hooks loading and project rules visible.
4. **Idempotency** — running `teamagent init` twice doesn't duplicate the user-level hook entry.

## TEAMWORK execution plan (N=5)

Lead spawns:

| Worker | Slice | Files owned |
|--------|-------|-------------|
| **W1** | walk-up util + unit tests | `packages/cli/src/lib/walk-up.ts`, `packages/cli/src/lib/__tests__/walk-up.test.ts` |
| **W2** | wire `hook-shell.resolvePaths` (covers 4 channels via shell) | `packages/cli/src/hook-shell/index.ts` (lines 68-74) |
| **W3** | wire `bin-stop.ts` (4 sites) + `bin-session-start.ts` | `packages/cli/src/bin-stop.ts` (285, 338, 418, 500), `packages/cli/src/bin-session-start.ts` (119) |
| **W4** | wire `session-start-logic.decideAction` ancestor-aware + tests | `packages/cli/src/session-start-logic.ts` (56), `packages/cli/src/__tests__/session-start-logic.test.ts` |
| **W5** | Layer 1 user-level installer + `init.ts` wiring + integration regression test | `packages/cli/src/commands/install-hook.ts`, `packages/cli/src/commands/init.ts`, `packages/cli/src/__tests__/install-hook.test.ts`, `packages/cli/src/__tests__/issue-161-walkup-integration.test.ts` |

Each worker runs **2 claudefast probes** (one narrow, one broad). Then **1 opus 1M reporter** consolidates all worker diffs + probe outputs and runs the final acceptance probe described in `judge.md`.

API contract for `findTeamagentRoot`:

```ts
// packages/cli/src/lib/walk-up.ts
import * as fs from "node:fs";
import * as path from "node:path";

export function findTeamagentRoot(start: string): string | null {
  let cur = path.resolve(start);
  while (true) {
    const candidate = path.join(cur, ".teamagent", "knowledge.db");
    try {
      if (fs.statSync(candidate).isFile()) return cur;
    } catch { /* missing — keep walking */ }
    const parent = path.dirname(cur);
    if (parent === cur) return null;  // reached fs root
    cur = parent;
  }
}
```

All workers import from this exact path and trust the contract.

## Boris workflow stage

`research → plan → annotate → implement → report`

This file is the **plan**. The lead has already collected research silently (no `research.md` needed for this PR). After TEAMWORK execution, the lead opens a normal PR; after `/review` PASS, the lead writes `report.md` capturing what shipped, any deltas, and the deferred follow-up CLI-commands work.

## See also

- `docs/HOWTO-PLAN-PR.md` — the meta-plan-for-a-PR doc this file follows.
- `docs/TEAMWORK.md` — N+1+(2N) execution pattern.
- `docs/POSTPR.md` — the `/review` loop that runs after PR open.
- `docs/PR-PLAN.md` — what to do if `/review` finds issues mid-PR.
- `docs/feature-verification.md` — 1+2+3 verification gate.
- `~/.claude/docs/rules/testing-judge-harness.md` — why the harness must be third-party md.
