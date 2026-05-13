```text
   ┌────────────────────────────────────────────────────────┐
   │  RESEARCH · issue #326 implementation half             │
   │                                                        │
   │  what is already on main vs what this PR delivers      │
   │  + paths to every site that needs editing              │
   └────────────────────────────────────────────────────────┘
```

# Research: TeamBrain #326 12-item implementation state

> Captured by exploring main HEAD on 2026-05-13 before any edits. This file
> describes WHAT was found on disk; `plan.md` describes WHAT will change.

## Source-of-truth references

- Issue: https://github.com/libz-renlab-ai/TeamBrain/issues/326
- Grill comment (issue): #326 issuecomment-4436663365 (batch grill 2026-05-13)
- Saved grill ADR: `docs/adr/0014/326.md`
- 12-item spec (now re-imported via this PR): `docs/plans/2026-05-11-issue-122/grill-spec-acceptance.md` §Implementation summary
- Verdict §12 (statusline / presence-state two views): option B
- Verdict §23 (#326 scope): option E ("只取 landing → init → statusline 的必要部分，并复用 presence state")
- Parent epic: #122 (`epic` + `ready-for-human`)
- Sibling: #327 (TTHW recording, `ready-for-human`, not blocked by this PR)

## Per-item state (12 items)

| # | Item summary | State on main | Notes |
|---|---|---|---|
| 1 | #122 protocol doc switched to landing→setup→init→statusline | PRESENT (in `docs/adr/0014/326.md` + restored grill shards) | This PR re-imports the 4 grill shards so the `docs/plans/2026-05-11-issue-122/` reference in `#326` body resolves on main. |
| 2 | `teamagent demo` removed from human onboarding | PRESENT | `apps/landing/src/index.html` does not invite `teamagent demo`. Internal `teamagent debug demo` still exists, which is allowed. |
| 3 | GIF/mosaic prerequisites removed from human dogfood | PRESENT | "prerequisites" word matters — landing still uses GIF visually, that's independent. Old `docs/plans/2026-05-08-issue-122/` is marked stale per archive commit message. |
| 4 | Landing page text-only minimal copy | **PARTIAL → this PR (legacy mirror only)** | The **live** deploy is `landing/rocketteam` (Next.js submodule pinned at `3922219`), built by `landing/build-static.sh` and uploaded to GH Pages by `.github/workflows/landing-deploy.yml`. RocketTeam is **already clean** of `PreToolUse` / `拦截 PreToolUse` / `拦截机制` / `TeamAgent 安装成功` strings (verified via `grep -rE` on the checked-out submodule). The legacy mirror `apps/landing/src/index.html` still has these strings; this PR trims them as defensive cleanup + judge-harness P1 probe parity, even though the legacy mirror is no longer served. |
| 5 | Setup/install command auto-runs init | PRESENT | `release/install.sh` lines 440–454 (per explore agent) auto-runs `teamagent init` unless `--skip-init`. |
| 6 | Init success output minimal | **MISSING → this PR** | Current trailing block (`init.ts` lines 1996–2020): `✅ TeamAgent 安装成功！` + 4-item `下一步:` list + `💡 团队标配插件…` tip + `🆕 本次新增` CHANGELOG tail. |
| 7 | No backup/undo/modified/hooks/PreToolUse/intercepts/demo/debug in human path | PARTIAL | Step-group label `🔗 注册 Hook` mentions `Hook`; landing copy mentions `PreToolUse` / `拦截`. This PR trims both surfaces. |
| 8 | SessionStart silent in non-project dirs | PRESENT | `packages/cli/src/session-start-logic.ts:97` returns `skip-not-a-project` for non-project cwd. |
| 9 | Statusline format `TeamAgent \| 规则:N \| 帮过:X今/Y周 \| 拦过:Z今 \| <hint> \| preparing\|ready` | PRESENT + PR #420 added 项目:<name> | grill verdict §12B explicitly allows the presence-state view in statusline + leader app, so the extra field is on-spec. |
| 10 | Do not change recent hint logic | PRESENT (do-not-touch) | Lives in `scripts/teamagent-statusline.cjs:245–296`. |
| 11 | Existing Claude Code statusline preserved + TeamAgent appended | PRESENT | `scripts/teamagent-statusline.cjs:838–849` merges CC stdin fields via `buildCcFields()`. |
| 12 | Tester sees TeamAgent statusline in Claude Code ≤ 300 s | N/A (acceptance for #327) | Not implementable in code. |

## Files touched by this PR

| Path | Reason |
|---|---|
| `apps/landing/src/index.html` | Item 4 + 7: trim PreToolUse / intercept / 拦截机制 copy; collapse install-box to one line. |
| `packages/cli/src/commands/init.ts` | Item 6 + 7: minimal success block; rename `🔗 注册 Hook` group; reorder FIXEDFLOW banner; skip post-init tail by default. |
| `packages/cli/src/__tests__/init.test.ts` | Update assertions for new success copy + reordered banner + dropped 4-item 下一步 / plugin-tip / 🆕 tail. |
| `docs/plans/2026-05-11-issue-122/grill-comment.md` | Restore from `5e89e73e` + `79bb3d8f` patch. |
| `docs/plans/2026-05-11-issue-122/grill-spec-acceptance.md` | Restore from `5e89e73e`. |
| `docs/plans/2026-05-11-issue-122/grill-spec-behavior.md` | Restore from `5e89e73e`. |
| `docs/plans/2026-05-11-issue-122/grill-spec-protocol.md` | Restore from `5e89e73e`. |
| `docs/plans/2026-05-13-issue-326/{plan,research,judge,report}.md` | New plan dir for this PR. |

## Files explicitly NOT touched

- `scripts/teamagent-statusline.cjs` — item 9/10/11 PRESENT, do-not-touch.
- `release/install.sh` — item 5 PRESENT.
- `packages/cli/src/session-start-logic.ts` — item 8 PRESENT.
- `apps/landing/public/double-moment.gif` / `double-moment-static.png` — keep, item 3 is about prerequisites not removal.

## Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Init tests assert exact 4-item `下一步` list — refactor breaks ~5 tests | High | Update tests in same PR, judge harness §V1 probe 3 catches regressions. |
| Removing `🆕 本次新增` tail surprises users who relied on it after upgrade | Medium | Keep the helper function in source so a future `--verbose-init` flag can re-surface it; mention in PR description. |
| Landing comparison-table row rename loses competitive differentiation | Low | Replace with positive-form `团队规则自动应用` (matches statusline `规则` field semantics). |
| Restoring archived grill shards reopens stale plan content | Low | Shards are spec text, not action items; they live under `docs/plans/2026-05-11-issue-122/` which is acknowledged as historical-context dir. |
| Worktree confusion with `worktree-curious-nibbling-prism` branch | Low | This PR's branch is `worktree-issue-326-rescope`, distinct. |
