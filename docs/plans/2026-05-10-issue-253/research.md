```text
   .claude/settings.json (SoT)        packages/core/src/init/default-plugins.ts
   ───────────────────────────        ──────────────────────────────────────────
   6 plugins enabled                  3 plugins default ← drift
   1 marketplace                      2 marketplaces ← drift
       │                                  │
       └─────── must match ───────────────┘
                     ▼
              align via PR
```

# Research — Issue #253: codex skills 全镜像 + DEFAULT_PLUGINS 跟齐 `.claude/settings.json`

## Source of truth observed at session start

`/Users/m1/projects/TeamBrain/.claude/settings.json` (PR #207, `c621fe5`, project-level, git-tracked) declares one marketplace + six enabled plugins:

| key | value |
|-----|-------|
| `extraKnownMarketplaces.claude-plugins-official.source.url` | `https://github.com/anthropics/claude-plugins-official.git` |
| `enabledPlugins.playground@claude-plugins-official` | `true` |
| `enabledPlugins.claude-code-setup@claude-plugins-official` | `true` |
| `enabledPlugins.code-review@claude-plugins-official` | `true` |
| `enabledPlugins.code-simplifier@claude-plugins-official` | `true` |
| `enabledPlugins.commit-commands@claude-plugins-official` | `true` |
| `enabledPlugins.frontend-design@claude-plugins-official` | `true` |

`packages/core/src/init/default-plugins.ts` at `origin/main` (commit `a34cb84`) declared a different set:

```ts
DEFAULT_MARKETPLACES = [claude-plugins-official, knowledge-work-plugins]   // +1 vs SoT
DEFAULT_PLUGINS = [
  superpowers@claude-plugins-official,    // not in enabled list
  playground@claude-plugins-official,     // matches
  sales@knowledge-work-plugins,           // not in enabled list
]
```

So three of the four entries diverged from the project-level SoT, meaning `pnpm teamagent install-plugins` would attempt to add `superpowers` + `sales` (per user instruction: "do not install them") and never install the four that ARE actually enabled (`claude-code-setup` / `code-review` / `code-simplifier` / `commit-commands` / `frontend-design`).

## `.codex/skills/` mirror status observed

| side | count | entries |
|------|------:|---------|
| `.claude/skills/` | 20 | canary · claim-to-merge · design-html · design-shotgun · diagnose · fixed-flow-driver · grill-me · grill-with-docs · gstack · improve-codebase-architecture · install-walkthrough · mmx-cli (symlink → `../../.agents/skills/mmx-cli`) · office-hours · onboard · plan-ceo-review · prototype · to-issues · to-prd · triage · zoom-out |
| `.codex/skills/` | 8 | canary · claim-to-merge · design-html · design-shotgun · fixed-flow-driver · gstack · office-hours · plan-ceo-review |
| missing on codex side | 12 | diagnose · grill-me · grill-with-docs · improve-codebase-architecture · install-walkthrough · mmx-cli · onboard · prototype · to-issues · to-prd · triage · zoom-out |

`.claude/skills/mmx-cli` already follows a symlink-to-`.agents` pattern; mirror keeps the same target so both sides resolve to the single canonical implementation under `.agents/skills/mmx-cli/`.

## Verification matrix used (this PR)

| step | tool | pass criterion |
|------|------|----------------|
| V1.1 mirror equality | `diff <(ls -1 .claude/skills) <(ls -1 .codex/skills)` | empty diff |
| V1.2 marketplace count | `DEFAULT_MARKETPLACES.length` | `=== 1` |
| V1.3 plugin count + identity | `DEFAULT_PLUGINS.map(p => p.plugin+'@'+p.marketplace)` ≡ `Object.keys(.claude/settings.json#/enabledPlugins)` | sets equal |
| V1.4 unit tests | `vitest run packages/core/src/init/__tests__/default-plugins.test.ts` | 10/10 PASS |
| V1.5 root typecheck | `pnpm typecheck` (root, `tsconfig.base.json`) | exit 0 |

`@teamagent/core` 包级 `tsc -p packages/core` 报 `TS6059 fixtures/scenarios/*` rootDir 错误 —— 该错误在 `origin/main` 早已存在，与本 PR 无关，由 root 级 `pnpm typecheck` 跨 package 收纳。详见 `judge.md`。

## Out of scope (decisions)

- 不改 `.claude/settings.json`（保留 SoT 角色）。
- 不改 `packages/cli/src/commands/install-plugins.ts` 或 `packages/adapters/src/plugins/claude-plugin-installer.ts`：它们消费 `DEFAULT_PLUGINS`/`DEFAULT_MARKETPLACES`，对齐源即可。
- 不写 ADR：纯对齐操作，无新决策维度。
- 不重新引入 `knowledge-work-plugins` / `sales` / `superpowers`。
