```text
          init.ts (1537)                  bin.ts (488)
        ┌─────────────────┐            ┌────────────────────┐
        │ parseInitArgs   │ ◄── argv ──│ case "init":       │
        │ ──────────────  │            │   parseInitArgs    │
        │ ❌ no --cwd     │            │   executeInit      │
        │ ❌ no --home    │            │   renderInitResult │
        │ ❌ no --skip-seed            └────────────────────┘
        └─────────────────┘
               │ silently drops the flag
               ▼
        InitOptions = { skipImport, skipHook, skipWarmup }   ← cwd missing
               │
               ▼
        resolvePaths()  →  cwd = process.cwd()  (worktree, NOT sandbox)
               │
               ▼
        init runs against the WRONG dir; smoke says EXIT=0 but sandbox empty
```

# Research — Feature ① init-in-new-repo

## 1. 现状探针

Smoke 命令：

```
SMOKE=$(mktemp -d /tmp/teamagent-init-smoke.XXXXXX)
pnpm teamagent init --cwd="$SMOKE" --skip-import --skip-hook --skip-seed --skip-warmup
echo $?  # → 0
ls -la "$SMOKE"  # → empty
```

行为：`exit 0` + sandbox 完全空 + stdout 也几乎没东西。

## 2. 根因

`packages/cli/src/commands/init.ts:1537-1565` 的 `parseInitArgs`：

| Flag | 是否解析 | 是否生效 |
|------|----------|----------|
| `--dry-run` | ✅ | ✅ |
| `--skip-import` | ✅ | ✅ |
| `--skip-hook` | ✅ | ✅ |
| `--skip-warmup` | ✅ | ✅ |
| `--no-user-level-hook` | ✅ | ✅ |
| `--force-nested-init` | ✅ | ✅ |
| `--install-plugins` | ✅ | ✅ |
| `--target` / `--codex` / `--claude` / `--both` | ✅ | ✅ |
| `--pack` | ✅ | ✅ |
| **`--cwd=<path>`** | ❌ 静默丢弃 | ❌ |
| **`--home=<path>`** | ❌ 静默丢弃 | ❌ |
| **`--skip-seed`** | ❌ 静默丢弃 | ❌（注：seedStep 仍按 opts.skipSeed 走，但 CLI 没法置位） |

`InitOptions` 接口（`init.ts:51-108`）已经定义了 `cwd?: string`、`homeDir?: string`、`skipSeed?: boolean`——只缺 CLI parser 接线。`resolvePaths`（line 173-189）也已经把 `opts.cwd ?? process.cwd()` 落到 `paths.cwd`，所以**修 parser 就完事**。

`bin.ts:488-528` 的 `case "init"` 把所有 unknown flag 当作 noop，丢失了 mismatch 信号——harness 没法察觉自己被忽略了。

## 3. canonical install 入口

`INSTALL.md` 头部：

- Path A（end-user）：`curl -fsSL .../release/install.sh | bash` — tarball + 自动跑 `teamagent init`。
- Path B（contributor）：`bash scripts/bootstrap.sh` — 在 clone 出来的 TeamBrain checkout 里跑 `pnpm install + pnpm build + pnpm teamagent init`。

两条路径都最终调 `pnpm teamagent init`（无 `--cwd`，依赖 `process.cwd()`）。所以「在 new repo 跑通」对真实用户的等价命令是：`cd ~/my-app && pnpm --dir /path/to/teambrain teamagent init`（依赖 pnpm 把 cwd 切到 my-app；实测 pnpm scripts 默认 cwd = package dir，所以这条对 end-user 也是坑）。

**结论**：harness 跑 init 必须用 `( cd <sandbox> && tsx <REPO_ROOT>/packages/cli/src/bin.ts init --cwd=<sandbox> --skip-import --skip-warmup --skip-hook )`——既绕开 pnpm 的 cwd 语义，又用新加的 `--cwd` flag 作 sandbox 落点的权威信号。

## 4. 既有 judge harness 模板

参考 `docs/plans/docs--features--auto-capture--verify-canned-answer/judge.md`：

- §V1 RUN：subagent / `claudefast -p` 探针 dispatch；evidence 落 `.judge/<topic>/<run_id>/`。
- §V2 DUMP：canonical JSON：`{exit_code, metrics, evidence_dir, stdout_path, stderr_path, feature_status}`。
- §V3 READ：另一只 `claudefast -p` 只读 raw JSON + evidence，输出 `pass | fail | skip + reasoning`。

本 plan 的 judge.md 沿用此三段式。**evidence_dir 落 `docs/plans/2026-05-11-feature1-init-judge/evidence/<run_id>/`** 而不是 `.judge/<topic>/<run_id>/`——和其它 judge.md 略有差异，原因：本任务的产出之一就是「一份可被 git track 的 evidence snapshot」，丢在 plan 目录内方便 PR 一起 review。

## 5. mkTmp 模式参考

`packages/cli/src/__tests__/init.test.ts:15-29` 已有 `mkTmp()` helper，每个 case 隔离 `/tmp/init-XXXX/{project,home}` 两子目录，避免污染用户 home。本 plan 的新增 e2e case 沿用此 helper + 新增「fresh dir 必须落 `.teamagent/`」契约断言。

## 6. 已被验证的约束

- `findTeamagentRoot` 用 homeDir 作为 walk-up 终点，所以传 `--home=<tmp>` 能彻底脱离用户 `~/.teamagent` 副作用。
- `executeInit` 的 step 数组里 `create-dirs` / `compile-skills` 是产出 `.teamagent/` 与 skills mirror 的两个权威 step；judge 的 metric 只关心它们的 `status === "ok"` 与对应文件落地，不依赖具体 step 数量。
- `renderInitResult` 输出固定 ✅ / ⏭ / ❌ 三符号 + 中文 label，judge 可以 case-insensitive grep `✅` 数量作为 `stdout_mentions_ok_count` metric。
