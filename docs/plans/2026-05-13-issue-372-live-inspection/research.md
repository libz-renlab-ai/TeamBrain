```
                   .--.        live inspection target
                  /    \           ↓
   ┌───────────┐ │  👤 │   ┌──────────────────────────┐
   │ team-lead │─┼─────┼──>│ inspect-member <member>  │
   │  click    │ │ alice│  │     --window 24h         │
   └───────────┘ │      │  └──────────────────────────┘
                  \____/                ↓
                                        ↓
  ┌──────────────────────────┐   ┌──────────────────┐
  │  events.db (#308 AI)     │──>│   correlate      │
  │  + GitHubActivityPort    │   │   summarize      │
  │     (commits/PRs/issues) │   │   detectAbnormal │
  └──────────────────────────┘   └──────────────────┘
                                        ↓
                              ┌──────────────────────┐
                              │  inspection.json     │
                              │  + incident.json     │
                              │   (if abnormal)      │
                              └──────────────────────┘
```

# research.md — issue #372 live inspection

> 真实上下文汇总，按 `AGENTS.md` §8 写在 plan.md 同目录。

## 背景

Issue #372 「实时知道项目成员进展的最新情况」grill verdict（[ADR-0014 §7 / issue
#372 grill comment](https://github.com/libz-renlab-ai/TeamBrain/issues/372)
裁决选 C）：**不**做后台永远重度采集，而是 **leader 点击 → 启动 live
inspection session**，拉最近 GitHub activity + 关联 #308 AI events + 生成
progress/abnormal summary；发现异常 → 冻结成 incident record。

默认窗口：
- 点击成员 → 最近 24 小时
- 点击项目 → 最近 7 天
- 点击 issue/PR → 从创建时间开始
- 点击 green light → 当前 session + 最近 24 小时

## 已有架构

### Functional Core / Imperative Shell（per `CLAUDE.md` 元约束）
- `packages/core/`：纯函数，禁止 `import "node:fs" / "node:child_process"`
- `packages/ports/`：Port interface + 契约测试
- `packages/adapters/`：IO 实现，符合 Port 契约
- `packages/cli/`：parse/execute/render 三函数模式

### 事件持久化
- `~/.teamagent/events.db`（SQLite）保存全部 #308 AI events（schema 见
  `packages/types/src/persisted-event.ts`）
- 读取入口：`SqliteEventLog`（`packages/adapters/src/storage/sqlite/sqlite-event-log.ts`）
  暴露 `readAll() / readByKind() / readLast(n)`
- `openDb` helper 在 `packages/adapters/src/storage/sqlite/schema.ts:221`
- 内存 bus：`InMemoryAttributionBus`（`packages/adapters/src/attribution/in-memory-bus.ts`）

### 已有 hook 发射的 #308 事件 kind（见 `persisted-event.ts`）
- `hook-pre.matched` / `hook-post.result`（Pre/Post tool）
- `ai.output.bad_pattern` / `ai.narrative.injected`（M4-A 叙事 loop）
- `extractor.extracted` / `pitfall.added` / `calibrator.adjusted` 等
- 还有 SessionStart / UserPromptSubmit / Stop 时间戳记录（#308 持续 presence）

### CLI registry
- `packages/cli/src/bin.ts`（1497 行）switch-case 路由
- 每条 subcommand 走 `parse → execute → render` 三函数：
  - `parseFooArgs(rest: string[]): FooArgs`（throws 形式校验）
  - `executeFoo(args: FooArgs): Promise<FooResult>`
  - `renderFooResult(r: FooResult): string`
- 注册示例：`m5-status`（`bin.ts:378-383`）

### 当前缺口
1. **没有 GitHubActivityPort**，只有 `packages/cli/src/github-api.ts` 做 branch
   SHA 查询，不能拉 commits/PRs/issues 列表。
2. **没有 live-inspection 核心模块**，core/ 下没有 `correlate / summarize /
   detectAbnormal / freezeIncident` 任何一处。
3. **没有 `inspect-member` / `inspect-project` 子命令**。
4. **incident 记录文件协议未定**——按 user-level memory 与 docs/ISSUE-TRACKING
   惯例放 `~/.teamagent/<project_slug>/incidents/<id>.json`。

## 相关 issue / PR

- #308「green light 持续 presence」— `grill-working`，bin-session-start.ts /
  bin-user-prompt-submit.ts 已落地；#372 复用其 SessionStart/UserPromptSubmit
  emitter 写到的 events.db。
- #371「日报总结功能」— sibling team-lead feature，扫的是同一份 GitHub
  activity 但聚合粒度是 day，不是 click-time live inspection。本 PR 故意
  与 #371 隔开（grill verdict §7 说 #372 是 click-time，不是日报）。
- #420（已合）— `feat(statusline): add 项目:<name> field` worktree-aware
  presence；与 #372 正交，不交集。

## 设计约束

1. **不做后台 daemon**。CLI 一次性执行，跑完落盘退出。
2. **只读 + append-only**。不修改 events.db，只读；incident 文件 append。
3. **GitHub adapter 用本地 `gh` CLI**（`execFile("gh", ["api", ...])`），不直
   接 `fetch()`——复用用户登录态，对 self-hosted GH Enterprise 也兼容。
4. **`gh` 不可用时降级到 git log**——adapter 优先 `gh`，回退 `git log
   --author=<member>`，再回退空数组（contract 允许）。
5. **time-window 必须由参数注入**（Functional Core 规则：`now` 由 caller
   传入）。
6. **incident 阈值是简单启发式**：
   - 24h 内 ≥3 个 `hook-pre.matched` 的 deny ⇒ abnormal: "repeated_deny"
   - 24h 内 ≥3 个 `ai.narrative.recurred`（教育失败）⇒ abnormal:
     "education_loop"
   - 24h 内 0 个 GitHub commit + ≥10 个 `user-prompt.injected`（很多对话但
     没产出）⇒ abnormal: "stuck"

## 引用

- 项目级 `plan.md` / `research.md` / `report.md` 规则：[`docs/PLAN-RESEARCH-REPORT.md`](../../PLAN-RESEARCH-REPORT.md)
- HOWTO plan PR：[`docs/HOWTO-PLAN-PR.md`](../../HOWTO-PLAN-PR.md)
- Business Features 四层证据矩阵：[`docs/BUSINESS-FEATURES.md`](../../BUSINESS-FEATURES.md) Feature #2
- Grill verdict：[ADR-0014 §7 / issue #372 comment](https://github.com/libz-renlab-ai/TeamBrain/issues/372#issuecomment-4436664614)
