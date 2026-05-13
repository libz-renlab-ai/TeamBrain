```text
   ┌────────────────────────────────────────────────────────┐
   │  REPORT · issue #326 PR delivery                       │
   │                                                        │
   │  shipped vs planned · deviations · /review findings    │
   │  · open items (#327 sibling)                           │
   └────────────────────────────────────────────────────────┘
```

# Report: TeamBrain #326 RESCOPE 12 items implementation half

> Captured at PR open time (`2026-05-13`). Companion to `plan.md` + `research.md` + `judge.md` in the same directory.

## Branch / PR

- Branch: `feat/issue-326-rescope-impl` (worktree branch `worktree-issue-326-rescope`)
- PR: https://github.com/libz-renlab-ai/TeamBrain/pull/434
- Closes: #326 (issue body `Closes #326` in PR description)
- Parent epic: #122 (stays `epic` + `ready-for-human`; closed when #327 lands its TTHW evidence)
- Sibling out-of-scope: #327 (real-stranger TTHW ≤ 300 s recording, `ready-for-human`)

## Atomic commits (6, in landing order)

1. `75aab3e8` `docs(issue-326): plan/research/judge + restore 122 grill spec shards`
2. `b2d993c6` `feat(m4): trim landing copy to remove PreToolUse/拦截 vocabulary`
3. `468bc98c` `feat(m6): minimize teamagent init success block + rename Hook step group`
4. `b9b8f4e2` `chore(m7): sweep bin.ts --help text for item 7 consistency`
5. `19de077d` `fix(m6): update audit runner to accept new init success banner`
6. `013a7698` `docs(m4+m6): CHANGELOG entry + clarify apps/landing is legacy mirror`

(SHAs reflect pre-second-rebase state; post-rebase SHAs are equivalent content. Squash-merge produces a single commit on `main`.)

## 12-item delivery summary

| # | Pre-PR state | Delivered in this PR |
|---|---|---|
| 1 | PRESENT (via `docs/adr/0014/326.md`) | grill shards re-imported into `docs/plans/2026-05-11-issue-122/` from archive commit `5e89e73e` so the issue-body reference resolves on main |
| 2 | PRESENT | — |
| 3 | PRESENT | — |
| 4 | PARTIAL (legacy mirror dirty) | legacy `apps/landing/src/index.html` swept; live `landing/rocketteam` was already clean (verified) |
| 5 | PRESENT (`release/install.sh:440-454`) | — |
| 6 | MISSING | `renderInitResult` final block collapsed to 5 lines: separator + `✅ TeamAgent 已就绪` + blank + `下一步：` + `cd your-project` + `claude` |
| 7 | PARTIAL | step-group label `🔗 注册 Hook` → `🔗 注册集成` (init.ts), `--help` text `注册 Hook` → `注册集成` (bin.ts), landing copy swept of `PreToolUse` / `拦截 PreToolUse` / `拦截机制` |
| 8 | PRESENT (`session-start-logic.ts:97`) | — |
| 9 | PRESENT (PR #420 added `项目:<name>` per grill verdict §12B) | — |
| 10 | do-not-touch | — |
| 11 | PRESENT (`scripts/teamagent-statusline.cjs:838-849`) | — |
| 12 | sibling #327 | out of scope |

## Deviations from the plan

1. **bin.ts `--help` text was not in the original plan** but was caught by my own grep sweep after landing the step-group rename — added as commit `b9b8f4e2` for item 7 consistency. Also added one line documenting the new `TEAMAGENT_VERBOSE_INIT=1` opt-in env var.
2. **`audit/runners/feature-01-init.ts` patch was not in the original plan** but was caught as a `/review` CRITICAL finding (the audit runner grep'd the old `TeamAgent 安装成功` string and would have false-failed). Added as commit `19de077d` accepting both old + new banners for mid-rollout safety.
3. **CHANGELOG bump was not in the original plan** but the adversarial subagent flagged the omission — added a `### Changed` entry under `## Unreleased` summarising the delivery + the legacy-mirror clarification + the `TEAMAGENT_VERBOSE_INIT=1` escape hatch + an explicit note that `postinstall.mjs` npm-install banner is out of scope.
4. **Adversarial subagent caught a P1 clarification need** about `apps/landing` being the legacy GH Pages mirror (live deploy is `landing/rocketteam` via `.github/workflows/landing-deploy.yml` + `landing/build-static.sh`). Plan.md and research.md updated to clarify; the apps/landing edit is now correctly framed as defensive cleanup + judge-harness P1 probe parity, not a live-site change.

## /review fix-loop summary

- **CRITICAL findings**: 1 (audit runner grep regression) — fixed in commit `19de077d`.
- **INFORMATIONAL findings**: 4
  - bin.ts `--help` "注册 Hook" leftover — fixed in commit `b9b8f4e2`.
  - `apps/landing` is legacy mirror — documented in commit `013a7698` (plan.md / research.md / CHANGELOG.md).
  - Missing CHANGELOG entry — added in commit `013a7698`.
  - `postinstall.mjs` banner inconsistency — explicitly noted out-of-scope in CHANGELOG entry; future follow-up issue if needed.
- **Skipped findings**: 2 (verbose-block colon symmetry, ADR-0014/218 footnote — both P2 conf ≤ 7, cosmetic-only).

`/review` converged: no remaining CRITICAL findings, all INFORMATIONAL findings either fixed or explicitly out-of-scope. Adversarial subagent run dispatched once and reported `Recommendation: fix 1 item` (the P1 legacy-mirror clarification), which was addressed in commit `013a7698`. No second adversarial pass needed because the addressed finding was documentation-level, not code-level.

## Verification matrix

| Probe | Result |
|---|---|
| `pnpm vitest run packages/cli/src/__tests__/init.test.ts` | 78/78 PASS |
| `pnpm vitest run packages/cli/src/__tests__/init-pack-prompt.test.ts` | 12/12 PASS |
| `pnpm vitest run packages/cli/src/__tests__/init-static-user-skills.test.ts` | 4/4 PASS |
| `pnpm typecheck` | 0 errors |
| `grep -rE 'PreToolUse\|拦截 PreToolUse\|拦截机制' apps/landing/src/index.html` | 0 hits |
| `grep -rE 'PreToolUse\|拦截 PreToolUse\|拦截机制\|TeamAgent 安装成功' landing/rocketteam/` (post `git submodule update --init`) | 0 hits (live deploy was already clean) |
| `grep -nE '"🔗 注册 Hook"\|🔗 注册集成' packages/cli/src/commands/init.ts` | only `注册集成` matches |
| `grep -n '注册 Hook\|注册集成' packages/cli/src/bin.ts` | only `注册集成` + `TEAMAGENT_VERBOSE_INIT=1` line |
| `grep -nE 'TeamAgent 已就绪\|TeamAgent 安装成功' packages/cli/src/commands/init.ts` | only `已就绪` (production); `安装成功` appears 0× in `init.ts` |
| Audit runner accepts both banners | `audit/runners/feature-01-init.ts:289` `txt.includes("TeamAgent 已就绪") || txt.includes("TeamAgent 安装成功")` |

## Open / follow-up items

- #327 (real-stranger TTHW ≤ 300 s recording) — not blocked by this PR; stays `ready-for-human` for maintainer to recruit a stranger tester.
- `packages/teamagent/postinstall.mjs:563` banner consistency (`✨ TeamAgent 安装成功`) — would mirror the new `init` block wording. Out of scope for #326 item 6 (which is scoped to `teamagent init` success block, not npm postinstall). File a follow-up issue if alignment is desired.
- The verbose path emitted by `TEAMAGENT_VERBOSE_INIT=1` still uses the literal "hook" word in `重新打开 Claude Code（让 hook 生效）`. Acceptable since the verbose mode is power-user opt-in; tightening this would require finding a non-jargon replacement for "hook" in the action description, which is a separable design decision.
