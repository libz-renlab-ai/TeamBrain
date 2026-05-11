```text
            ┌─────────────────────────────────────────────┐
            │  RESEARCH: teamagent init crashes on Node22 │
            │  v0.10.1 (broken) ←──── npm i -g            │
            │  v0.11.0 (main HEAD, fix landed in 16e1a95) │
            └─────────────────────────────────────────────┘
                        │
                        ▼
              what is shipped where, and
              what needs to change to unbrick
              `~/projects/demo-repo && teamagent init`
```

# Research: teamagent init secure-crypto crash on Node 22

## 1. 复现现象

User session in `/Users/m1/projects/demo-space` (fresh `git init`) on Node v22.21.1:

```
$ teamagent init
file:///Users/m1/.nvm/versions/node/v22.21.1/lib/node_modules/teamagent/dist/bin.js:5994
  const err = new Error(message);
              ^
Error: secure crypto unusable, insecure Math.random not allowed
    at detectPrng (file:///.../dist/bin.js:6064:9)
    at factory    (.../dist/bin.js:6068:16)
    at <module top-level> (.../dist/bin.js:6077:12)
  source: 'ulid'
```

Crash happens at module-load — argv never gets parsed. Every subcommand is dead, including `--version` and `--help`.

## 2. 装的是什么

| field                  | installed (broken) | worktree main HEAD (fixed) |
|------------------------|---------------------|----------------------------|
| version                | 0.10.1              | 0.11.0                     |
| `ulid` in deps         | **absent**          | `^2.4.0`                   |
| tsup `NATIVE_EXTERNAL` | did not include ulid | includes `"ulid"`         |
| dist/bin.js            | ulid inlined (line 5994 ≈ ulid `createError`) | ulid externalized (real `require` resolves it at runtime) |
| npm registry           | n/a — `npm view teamagent` returns 404 | n/a |

Install source for v0.10.1 user copy: not npm public registry; either tarball from `release` branch (`curl install.sh`) or `npm install -g <tarball>` from an older checkout. Whatever the source, it predates fix commit `16e1a95`.

## 3. 真因 — 已在 16e1a95 修

```
16e1a95 fix(issue-158): externalize ulid so ESM entry doesn't die at module-load
```

Commit body (excerpt):

> Root cause: `ulid` is bundled into our ESM `dist/bin.js`. Inside that ESM bundle, tsup's `__require` shim is a Proxy that throws "Dynamic require not supported" the moment ulid evaluates `__require("crypto")`. The throw is caught by ulid's try/catch, which then falls through to `throw "secure crypto unusable"` at module-load — before argv parsing.

Fix:
- `packages/teamagent/tsup.config.ts:35` — `"ulid"` added to `NATIVE_EXTERNAL`
- `packages/teamagent/package.json:33` — `"ulid": "^2.4.0"` as direct sibling dep

Verified at fix-time by `npm pack` + sandbox install + `--version`/`--help`/`init` smoke. So the fix is already in main; the user's bug is just stale-install.

## 4. 当前 worktree 状态

- Branch: `main` HEAD `7162625` (clean)
- package.json: `version: 0.11.0`
- `packages/teamagent/dist/`: **does not exist** (no pre-built dist — need to `pnpm build`)
- pnpm install: triggered separately in background (`bga2eapsc`)

## 5. 修复目标 (what unblocks the user)

The user-visible verification is:

```bash
tmux new -d -s tb-verify
tmux send-keys -t tb-verify 'cd ~/projects/demo-repo && teamagent init' C-m
# expect: no ulid crash; exit 0; hooks/state seeded
```

Required pre-conditions:

1. `~/projects/demo-repo` exists and is a git repo (mirror what `~/projects/demo-space` was).
2. Global `teamagent` resolves to v0.11.0 (current main HEAD), not v0.10.1.
3. v0.11.0 binary has ulid **externalized** (verify by grepping built `dist/bin.js`).

## 6. 风险 / 约束

- **Destructive-adjacent**: `npm install -g <path>` overwrites the user's existing global install. Cheap reversal: re-run install.sh from `release` branch to restore.
- **Dist path mismatch**: `dist/bin.js` lives inside the source `packages/teamagent/`. `npm install -g <path>` triggers `prebuild` (which `rm -rf dist`) only if `build` is in package scripts — looking at it, it is (`"build": "tsup"`), but `npm install -g` runs `prepare` + `postinstall`, not `build`. So we must `pnpm build` first, *then* install.
- **postinstall.mjs**: gets executed during global install. Need to confirm it doesn't depend on dev-time files.

## 7. 相关历史

- Issue #158 — the original report of this exact crash; fix landed in PR around April-May.
- PR #224 — `fix(issue-158): npm i -g 失败不再炸用户 + tree-sitter root fix` — sibling fix.
- INSTALL.md has install paths but no callout for v0.10.x → v0.11 upgrade (gap to fill).
- CHANGELOG.md — should reference user-visible symptom (`secure crypto unusable`) for grep-ability.
