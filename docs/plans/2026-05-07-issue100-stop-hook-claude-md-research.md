```text
                ┌──────────────────────────────────────────┐
                │  issue #100 research — 谁在写 CLAUDE.md  │
                └──────────────────────────────────────────┘

   .claude/hooks/teamagent-stop.sh  ──► node bin-stop.cjs
                                            │
                                            ▼
                          packages/cli/src/bin-stop.ts:246
                                            │
                                  executeCompile({ cwd })
                                            │
                                            ▼
                  packages/cli/src/commands/compile.ts:80
                       resolveLegacyFlag()
                              │
                              ▼
                  process.env["TEAMAGENT_LEGACY_CLAUDE_MD"]   ◄── 泄漏入口
                              │
                       ┌──────┴──────┐
                       │             │
                  legacy=true    legacy=false（应有的默认）
                       │             │
                       ▼             ▼
              MarkdownCompiler   markdownCompiler=undefined
              .writeToFile       runCompile 短路（不写）
                       │
                       ▼
                  CLAUDE.md 被刷新
```

# Research — issue #100 上下文

## 时间线

| commit | 日期 | 说明 |
|--------|------|------|
| `d6c4a7a` | 2026-04-?? | feat(compile): nested user-level rule store replaces CLAUDE.md (#42) |
| `7e044b5` | 2026-04-?? | feat(m4): replace CLAUDE rule dump with docs propagation (#63) |
| `6ffaf19` | 2026-04-?? | docs: document teamagent compile Skills-default behavior (#79) |
| `cdebe6e` | 2026-05-06 15:49 | docs(claude-md): drop auto-managed TEAMAGENT block — 用户**第一次**手动删块、**禁用** Stop hook |
| `40886a0` | 2026-05-06 23:02 | chore: install 9 mattpocock skills + **pickup teamagent block** (#80) — auto-block 又被 regen 进了 commit（active rule count 75→55） |
| 当前 worktree | 2026-05-07 | `.claude/settings.json` 重新注册 Stop hook；`CLAUDE.md` 行 320–350 是 auto-block |

## 数据流分析

### 现有 Stop hook 链路（packages/cli/src/bin-stop.ts:151-435）

```
runStopPipeline(input)
  ├── Step 1: executeAnalyze  (会议 transcript 抽取规则；写 SQLite，不写 CLAUDE.md)
  ├── Step 2: executeCalibrate (改 confidence；触发条件下调 runCompile，但 markdownCompiler=undefined)
  ├── Step 3: executeCompile({ cwd })   ◄── 唯一会写 CLAUDE.md 的入口
  │             └─ resolveLegacyFlag() 读 env TEAMAGENT_LEGACY_CLAUDE_MD
  ├── Step 4: appendHarvest   (写 .teamagent/harvest.md，与 CLAUDE.md 无关)
  ├── Step 5: scan-errors     (写 candidates.db，与 CLAUDE.md 无关)
  └── Step 6: narrative scan  (写 events.db，与 CLAUDE.md 无关)
```

### 关键源码段

`packages/cli/src/commands/compile.ts:80-85`：

```ts
function resolveLegacyFlag(opts: CompileOptions): boolean {
  if (opts.legacyClaudeMd !== undefined) return opts.legacyClaudeMd;
  const env = process.env["TEAMAGENT_LEGACY_CLAUDE_MD"];
  if (env === undefined) return false;
  return env === "1" || env.toLowerCase() === "true" || env.toLowerCase() === "yes";
}
```

`packages/cli/src/bin-stop.ts:246`：

```ts
const r = await executeCompile({ cwd });   // ◄── 没传 legacyClaudeMd
```

→ 当 caller（claudefast / claude / pnpm script）的环境里有
`TEAMAGENT_LEGACY_CLAUDE_MD=1`，Stop hook 就会经过 legacy 分支
写 `MarkdownCompiler.writeToFile(entries)`，刷新 CLAUDE.md。

### 其他可能写 CLAUDE.md 的入口（已排除）

| 文件:行 | 行为 | 是否本 issue 范围 |
|---------|------|-------------------|
| `packages/cli/src/commands/calibrate.ts:326` | `runCompile` 不传 `markdownCompiler` / `writeMarkdown` | **不写** CLAUDE.md，不在范围 |
| `packages/cli/src/commands/doctor.ts:83` | `fs.writeFileSync(claudeMdPath, after)` 但**只剥离** legacy block，且仅 `--fix` 路径 | 友好方向，不在范围 |
| `packages/cli/src/commands/uninstall.ts:99` | 卸载时清理 CLAUDE.md 区块 | 卸载路径，不在范围 |
| `packages/cli/src/commands/e2e-evaluate.ts:407` | 断言 `!fs.existsSync(claudeMdPath)`，是验证而非写入 | 测试，不在范围 |

唯一 hook-time 还能进 legacy 写入分支的是 `executeCompile`，所以本 PR 锁这一处即可。

## 全局二进制问题

`.claude/hooks/teamagent-stop.sh` 找 binary 的优先级：

1. `<repo>/packages/cli/dist/bin-stop.cjs`（开发 build；本 worktree 没有）
2. `<repo>/packages/teamagent/dist/bin-stop.cjs`（替代开发 build）
3. `$(npm root -g)/teamagent/dist/bin-stop.cjs`（全局安装；**当前用户机器上存在**）

```
$(npm root -g)/teamagent/dist/
├── bin-post-tool-use.cjs
├── bin-pre-compact.cjs
├── bin-pre-tool-use.cjs
├── bin-session-end.cjs
├── bin-session-start.cjs
├── bin-stop.cjs              ◄── 当前实际跑的
├── bin-user-prompt-submit.cjs
├── bin.js
└── ...
```

→ 修源码后必须 `pnpm build`（或 `npm install -g <release>`）才能让 fix 落到实际跑的二进制；
否则 V1..V3 用 dev dist 验证（这是计划里 V1 / V3 走 `packages/cli/dist/bin-stop.cjs`
而不是 global dist 的原因）。

## 与项目承诺的明文冲突

`docs/knowledge/INDEX.md`：

> Generated rule dumps must not be written back into root CLAUDE.md.
> Stop hook propagation completes missing vector/index data and refreshes
> the project-facing knowledge surfaces.

`packages/cli/src/bin.ts:981-982`（`teamagent compile --help` 打印的内容）：

> `编译 Agent Skills (stable+)；CLAUDE.md 规则块输出已禁用`
>
> `--legacy-claude-md: 显式恢复旧 CLAUDE.md managed block 输出`

`packages/cli/src/commands/compile.ts:32-34`：

> `Legacy opt-in: compile rules into the generated CLAUDE.md managed block.`
> `Default commands do not write CLAUDE.md; propagation happens through Skills/docs.`

→ 三处文档化承诺与 Stop hook 实际行为不一致。本 PR 让实际行为对齐承诺。

## 已排查的"非根因"

- ❌ `MarkdownCompiler` 实例化即副作用：构造函数只存 path，不写文件。
- ❌ `runCompile` 在 `writeMarkdown=false` 仍写：源码确认 `if (deps.writeMarkdown && deps.markdownCompiler && !deps.dryRun)` 必须三者全 true 才写。
- ❌ `installHook` 写 CLAUDE.md：grep 确认它只改 `.claude/settings.json`。
- ❌ analyze 直接写 CLAUDE.md：`AnalyzeOptions.claudeMdPath` 已在 `analyze.ts:48-49` 标 `@deprecated`。

→ 唯一 hot path 是 Stop hook 经 `executeCompile` 走 env 决定 legacy。本 PR 改 `bin-stop.ts:246` 一行 + 加测试 + 删 committed block。

## fix surface 大小

| 文件 | 行数变化 | 说明 |
|------|----------|------|
| `CLAUDE.md` | -31（删 320–350 行） | docs |
| `packages/cli/src/bin-stop.ts` | +1 / -1 | 一处入参 |
| `packages/cli/src/__tests__/bin-stop.test.ts` | +30..+50（新增 1 个 test case） | regression |
| `docs/plans/2026-05-07-issue100-*.md` × 3 | +600..+800 | plan / research / report |

→ 可控、原子、易 review。

## 与近期 PR 的依赖关系

- 本 PR 不依赖任何 in-flight PR。
- main 分支 `866cb9a` 之上做。
- 不与 PR #95 / #99 / #101 / #102 / #103 重叠（它们都是 docs PR，未碰 bin-stop / CLAUDE.md auto-block）。
