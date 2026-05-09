```
   ____  _____  _____  _____   _   ____  ____  __  __
  | __ )| ____|/ ____||  ___| / \ |  _ \/ ___||  ||  |
  |  _ \|  _|  \___ \ |  _|  / _ \| |_| | |    |  ||  |
  | |_) | |___  ___) || |___/ ___ \  _ <| |___ |  ||  |
  |____/|_____|/____/ |_____/_/   \_|_| \_\_____||__||__|

  Issue #218 research — claim → merged-code init guidance
  research → plan → annotate → implement → report (Boris workflow)
```

# Issue #218 research

针对 [issue #218](https://github.com/libz-renlab-ai/TeamBrain/issues/218) 「[fixedflow] init 输出无 FIXEDFLOW 引导」实现前的上下文汇总。计划本身见 [issue #218 grill 评论](https://github.com/libz-renlab-ai/TeamBrain/issues/218#issuecomment-4412373351)。

## 现状盘点

`pnpm teamagent init` 执行入口是 `packages/cli/src/commands/init.ts:executeInit`（line 173）。完成后 `bin.ts:504` / `bin.ts:511` 把 `renderInitResult(result)`（line 1297-1371）写入 stdout。stdout 末尾是 `下一步:` + 编号项（重新打开 Claude Code、teamagent doctor、teamagent stats 等）+ 可选 pack prompt。

关键发现：`grep -r "FIXEDFLOW\|grill-ready\|fixed-flow-driver\|claim" packages/` 命中 0 处。init 完成后没有任何位置把 TeamBrain 的 FIXEDFLOW（[docs/FIXEDFLOW.md](../../FIXEDFLOW.md)）+ PR-PLAN（[docs/PR-PLAN.md](../../PR-PLAN.md)）+ POSTPR（[docs/POSTPR.md](../../POSTPR.md)）full chain 告诉新初始化的 agent / 人。

## 关键 ADR / Doc

- [ADR-0007 local-review-skill-as-review-gate](../../adr/0007-local-review-skill-as-review-gate.md) — 本地 `/review` skill 是 PR review 权威；同时禁止向 `CLAUDE.md` / `AGENTS.md` 写 FIXEDFLOW canned-answer block。
- [docs/FIXEDFLOW.md](../../FIXEDFLOW.md) L74-79 — grill 评论必须满足：作者 = issue 作者本人 / 整段 `/grill-with-docs` 输出 / 末尾 `--- end grill ---` 或 ≥60s 不再编辑。
- [docs/FIXEDFLOW.md](../../FIXEDFLOW.md) L125 — 验证不向 `CLAUDE.md` / `AGENTS.md` 写 canned-answer block；走 `claudefast -p` 语义 probe。
- [project CLAUDE.md](../../../CLAUDE.md) — `pnpm teamagent compile` 默认不动 `CLAUDE.md`（除非 `--legacy-claude-md`）；项目级 skill 双镜像 `.claude/skills` + `.codex/skills`，`.codex/skills` 必须随 git 跟踪。

## 设计决策（来自 grill-with-docs 五题）

| 决策 | 选择 |
|------|------|
| skill 内容深度 | 纯 routing ≤80 行，不复制 doc 内容（避免 drift） |
| skill mirror 范围 | `.claude` + `.codex` 双镜像 + `compile-skills` 后新 step `mirror-claim-to-merge-skill` 入用户级 |
| banner 内容额度 | 产品特性（claim → merged code 描述）+ 复制即用的 verify prompt + 详情链接 |
| banner 位置 | 紧贴「✅ TeamAgent 安装成功！」之后，「下一步:」之前 |
| feature-verification 组合 | V1 unit + V2 integration dump + V3 LLM 裁判 + canonical probe（全套） |
| `--target codex` banner | 也打（`bin.ts:511` 同样调用 `renderInitResult`） |

## 路径与命名

| 路径 | 角色 |
|------|------|
| `.claude/skills/claim-to-merge/SKILL.md` | project-level routing skill（Claude Code 端） |
| `.codex/skills/claim-to-merge/SKILL.md` | project-level routing skill（Codex 端，与上同内容） |
| `~/.claude/skills/teamagent/claim-to-merge/SKILL.md` | 用户级 mirror（init 期复制） |
| `packages/cli/src/commands/init.ts:doMirrorClaimToMergeSkill` | 新增 step 函数（在 `doCompileSkills` 之后调用） |
| `packages/cli/src/commands/init.ts:renderInitResult` (1297-1371) | 加 FIXEDFLOW banner 段 |
| `packages/cli/src/__tests__/init.test.ts` line 769+ | 追加 3 个 case 到 `describe("renderInitResult — new UX", ...)` |

## 偏差记录

实现严格按 [grill 评论](https://github.com/libz-renlab-ai/TeamBrain/issues/218#issuecomment-4412373351) 全 4 段计划执行。

### 已知 pre-existing failure（与本 PR 无关）

`packages/cli/src/__tests__/bin-stop.test.ts > calls analyze with transcript_path and commit=true` 在 `origin/main` (`ef6924d`) 上**已经是 fail**——根本原因是 test 在 line 72 / line 80 用 `process.cwd()` 同时作为输入与期望值，但 `runStopPipeline` 会通过 `findTeamagentRoot` 从 cwd 向上 walk 找到祖先 `.teamagent/`，而 worktree (`.codex/worktrees/issue-218/`) 嵌在主 checkout (`/Users/m1/projects/TeamBrain`) 内部，walk-up 命中外层并把 cwd 改写成主 checkout 路径。在外层主 checkout 跑测试时不会出现该现象。

复现：在仓库 base SHA `ef6924d` 上 `npx vitest run packages/cli/src/__tests__/bin-stop.test.ts` 同样 fail。

不在本 PR 范围内修复（按 [docs/PR-PLAN.md](../../PR-PLAN.md) 也不开 follow-up issue；如果要修，应单独在 main checkout 起 PR 改 test 用 `findTeamagentRoot` 的实际值而非 `process.cwd()`）。

后续如出现 `/review` finding，按 [docs/PR-PLAN.md](../../PR-PLAN.md) 在同一 PR branch 上写 fix-plan 并修，禁开 follow-up issue。
