# Research — newsboard-session-start

```
       __
   __ ( o )>     呷呷~ 鸭鸭挖了一圈水塘
  ( O )      
   \  /        findings before plan.md
    \/
    ^^
  ┌────────────────────────────────────────────┐
  │ ground truth gathered during /grill-with-  │
  │ docs session, settled before drafting plan │
  └────────────────────────────────────────────┘
```

## 1. Existing SessionStart hooks on this machine

- **User level (`~/.claude/settings.json`)**：
  - `~/.teamagent/hooks/bin-session-start.cjs` — tsup-bundled node, 7629 行, 复杂的 instinct
    injection / observer lease / project detect 链路
  - `~/.claude/skills/gstack/bin/gstack-session-update` — bash, 1h-throttled (`THROTTLE_FILE`),
    fork 后台跑 git pull, 主进程立即 `exit 0`
- **Project level (`.claude/settings.json`)**：**目前只有 Stop hooks**
  （`self-report-fused.sh` + `digital-twin-tap.sh`）。**SessionStart 槽位为空**。

新 newsboard hook 是 **本仓库第一个项目级 SessionStart hook**。

## 2. Output channel reality（critical finding）

`packages/cli/src/bin-session-start.ts:31` 注释写明：
> "SessionStart has no `hookSpecificOutput` envelope wired today (this bin..."

stream-json 实测证据 (`docs/specs/hook-add-laziness/verify/L3a-stream.jsonl`)：
- stdout JSON `{"hookSpecificOutput":{"additionalContext":"..."}}` → **进 Claude 系统提示**
  (= "to cc"，用户不要)
- stderr → Claude Code UI 把 hook stderr 当灰字逐行渲染在 session header 下
- **没有 `systemMessage` 字段**支持 SessionStart 事件（与 PreToolUse / Stop 不同）

→ **结论：stderr 是唯一满足 "to user, not to cc, non-blocking" 的通道**。

## 3. Feature catalog source of truth

| 候选 | 行数 | 评估 |
|---|---|---|
| `docs/PRODUCT-FEATURES.md` | 286 | **canonical** — 64 numbered VERIFIED features，自带 ASCII 头（"VERIFIED ──► 64"） |
| `docs/features/INDEX.md` | 109 | 较旧，count 49，已声明 `PRODUCT-FEATURES.md` 是权威 |
| `docs/features/<slug>/` | many dirs | per-feature md playbook，适合做 "deep link" 但不适合做随机池 |

→ **采用 `docs/PRODUCT-FEATURES.md` numbered list 作为 random-feature 池**。

## 4. "Newly pushed" data source（offline-safe）

`gh pr list --state merged --limit 10 --json number,title,mergedAt` 可用，但需 GitHub API 网络。

`git log --since="7 days ago" --pretty="%h %s" --grep="^feat\\|^fix" -3` 完全本地 + 0 网络。

最近 14 天该仓库每天 ship 5-10 个 PR，"newly pushed" 永远不缺数据。

→ **采用 git log 本地路径**。

## 5. Why no telemetry（unused 检测被简化）

用户在 grill round 3 直接说："we are just making a demo"。

构造真 invocation tracking 需要改：
- PreToolUse hook 加 emit
- 每个 SKILL.md 的 preamble 加 record 调用
- CLI 入口（50+ 个 `packages/cli/src/commands/*.ts`）每个都要 record
- 加 `~/.teamagent/usage.jsonl` schema + ADR + migration

→ 远超 demo 预算。**结论：第 (2) 格 unused 改为静态文案 *"haven't tried?"***，不真验证。

## 6. Project conventions surfaced during exploration

- 所有 bash hook **永不阻塞**（`exit 0`），见 `docs/CONTEXT.md:108`
- 现有项目级 hook 都是 bash `*.sh`，没有 node
- 计划目录 `docs/plans/<date>-<slug>/` 内含 `plan.md` + `research.md` + `judge.md`
- `AGENTS.md` rule 10：每个 md 头部加 ASCII art（服务于阅读理解）
- `inside-project-edits.md`：编辑 `docs/` + `AGENTS.md` + `CLAUDE.md` 不受限；hook 代码改动
  应先经过 plan 阶段（这就是为什么先写 plan）
- `plan-content.md`：plan 必须含 task / outputs / 3rd-party judge harness 三段
- `testing-judge-harness.md`：代码不评价自己；judge 走固定工具 + dump JSON + 独立 LLM 只读 evidence

## 7. Decisions table

| Decision | Choice | Reason |
|---|---|---|
| Audience | repo demo | 用户原话 "this is this repo demo" |
| Output channel | stderr | 唯一可行 "to user not to cc"；与 `gstack-session-update` 同源 |
| "Unused" detection | dropped, faked label | demo 预算约束 |
| Cadence | 每 session 都打，无 throttle | 用户选 *"demo 快乐最大化"* |
| Theme | ASCII duck | 用户原话 "鸭主题"；user-level memory 锁定 "always cute Chinese duck voice" |
| Location | `.claude/hooks/`（项目级） | git 跟踪；跟随 repo 分发，符合 "demo for this repo" 定位 |
| Implementation lang | bash | 一致项目其他 hook；零运行时依赖 |
| ADR? | No | 不够 hard-to-reverse / surprising / 无大 trade-off |
| User-level 改动? | No | 用户明确不动 user-level |
