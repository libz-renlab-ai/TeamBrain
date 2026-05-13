```
                                                                   judge.md harness
   ┌────────────────────────────────────────────────┐              ┌──────────────────┐
   │  pnpm teamagent inspect-member <member>        │              │  RUN  fixed cmds │
   │     [--project <slug>] [--window 24h|7d|since] │──> raw JSON ─>│  DUMP judge.json │
   │     [--now <ISO>] [--out <path>]               │              │  READ another LLM│
   └────────────────────────────────────────────────┘              └──────────────────┘
            │
            ├──> reads events.db (#308 AI events)
            ├──> reads GitHubActivityPort (commits/PRs/issues, gh CLI)
            ├──> correlate (pure fn)  → progress summary
            ├──> detectAbnormal (pure fn) → optional incident
            └──> writes inspection.json (+ optional incident-<id>.json)
```

# plan.md — issue #372 live inspection (single PR)

> 三段必填 per [`docs/PLAN-RESEARCH-REPORT.md`](../../PLAN-RESEARCH-REPORT.md) +
> [`docs/HOWTO-PLAN-PR.md`](../../HOWTO-PLAN-PR.md)。本 PR 是 #372 的 single
> shippable slice（CLI primitive that the future Feature #2 dashboard sits on
> top of），不在本 PR 范围：dashboard UI、web push、多项目并行。

## 1. task description（做什么 / 怎么做 / 不做什么）

### 做什么

实现 grill verdict §7 选项 C 的 **click-time live inspection CLI primitive**——
一个 leader 可以在 terminal 里调的 subcommand，对单个 member（或单个 project）
拉最近 GitHub activity + 关联 #308 AI events，输出 progress/abnormal summary，
abnormal 时冻结成 incident。

### 怎么做

按 `CLAUDE.md` 元约束 Functional Core / Imperative Shell 分层：

1. **新 Port** `packages/ports/src/github-activity-port.ts`：
   ```ts
   export interface GitHubActivityPort {
     fetchCommitsByAuthor(opts: {
       author: string; project?: string;
       since: string; until: string;
     }): Promise<GitHubCommit[]>;
     fetchPullRequestsByAuthor(opts: {
       author: string; project?: string;
       since: string; until: string;
     }): Promise<GitHubPullRequest[]>;
     fetchIssuesByAuthor(opts: {
       author: string; project?: string;
       since: string; until: string;
     }): Promise<GitHubIssue[]>;
   }
   ```
2. **契约测试** `packages/ports/src/__tests__/github-activity-port-contract.ts`
   （走 `@teamagent/ports/contracts` subpath 暴露），任何实现必须复用。
3. **Adapter** `packages/adapters/src/github-activity/gh-cli-adapter.ts`：
   - 用 `execFile("gh", ["api", ...], { timeout: 10s })` 拉数据
   - `gh` 不可用 / timeout / 非 zero exit → 回退 `git log --author=<x>
     --since=<...> --until=<...>` 拿 commits 子集（PR/issue 列表回退空数组）
   - `git` 也不可用 → 三个方法都返回空数组（contract 允许）
4. **Fake adapter** `packages/adapters/src/github-activity/fake-adapter.ts`
   给契约测试和单元测试用，无 IO。
5. **核心纯函数** `packages/core/src/live-inspection/`：
   - `correlate.ts`：按 timestamp window join `#308 events × GitHub activity`，
     输出 timeline。
   - `summarize.ts`：把 timeline 压成 Markdown / structured summary。
   - `detect-abnormal.ts`：返回 `AbnormalSignal[]`（empty = healthy）。三条
     启发式见 research.md。
   - `freeze-incident.ts`：把 abnormal signals + timeline snapshot 序列化成
     `Incident` object（不写盘，写盘由 CLI layer）。
   - `__tests__/` 单元测试覆盖三条 abnormal 启发式 + correlate 时间窗边界。
6. **CLI** `packages/cli/src/commands/inspect-member.ts`：parse / execute /
   render 三函数。execute 读 events.db（SqliteEventLog）+ 调
   GitHubActivityPort + 调纯函数 → 写 `~/.teamagent/<project_slug>/inspections/<ts>.json`
   + abnormal 时写 `~/.teamagent/<project_slug>/incidents/<id>.json`。
7. **bin.ts 注册** 一个 `case "inspect-member":` 走 parse/execute/render。
8. **feature doc** `docs/features/live-inspection.md` 描述 CLI 协议、JSON
   schema、incident 阈值。
9. **judge.md harness** 见下方 §3。
10. **commits** 按 `feat(m{N}): / chore: / docs:` 原子风格分批，每个 commit
    跑得通（CLAUDE.md §开发节奏「小 commit」+ user-level
    `atomic-commits-on-edit.md`）。

### 不做什么（out of scope，留给后续 PR）

- Dashboard UI / web frontend（method 3 visual-proof PR 时机不到）。
- 实时 push / WebSocket 通知。
- 多 member 并行 inspection（单次只 inspect 一个 member 或一个 project）。
- 修改 events.db schema（只读，append-only contract 保留）。
- 修改 #308 / #371 emitter（complete independence）。
- 把 `GitHubActivityPort` 给 #371（#371 走自己的日报聚合 PR）。

## 2. expected outputs（可验收交付物清单）

### 文件（新增）

- `packages/ports/src/github-activity-port.ts`（≈40 LOC，types + interface）
- `packages/ports/src/__tests__/github-activity-port-contract.ts`（≈120 LOC）
- `packages/ports/src/contracts.ts`（追加 export，≈3 LOC）
- `packages/adapters/src/github-activity/gh-cli-adapter.ts`（≈180 LOC）
- `packages/adapters/src/github-activity/fake-adapter.ts`（≈60 LOC）
- `packages/adapters/src/github-activity/__tests__/gh-cli-adapter.test.ts`
- `packages/adapters/src/index.ts`（追加 export）
- `packages/core/src/live-inspection/correlate.ts`（≈80 LOC）
- `packages/core/src/live-inspection/summarize.ts`（≈70 LOC）
- `packages/core/src/live-inspection/detect-abnormal.ts`（≈90 LOC）
- `packages/core/src/live-inspection/freeze-incident.ts`（≈40 LOC）
- `packages/core/src/live-inspection/types.ts`（≈60 LOC）
- `packages/core/src/live-inspection/index.ts`（barrel）
- `packages/core/src/live-inspection/__tests__/*.test.ts`（4 个文件，覆盖
  correlate / summarize / detect-abnormal / freeze-incident）
- `packages/cli/src/commands/inspect-member.ts`（≈220 LOC：parse/execute/render）
- `packages/cli/src/commands/__tests__/inspect-member.test.ts`
- `packages/cli/src/bin.ts`（追加 import + case，≈10 LOC）
- `docs/features/live-inspection.md`（≈150 行 feature doc）
- `docs/plans/2026-05-13-issue-372-live-inspection/research.md`（done）
- `docs/plans/2026-05-13-issue-372-live-inspection/plan.md`（this file）
- `docs/plans/2026-05-13-issue-372-live-inspection/judge.md`
- `docs/plans/2026-05-13-issue-372-live-inspection/report.md`（在合并前补完）

### CLI 行为

- `pnpm teamagent inspect-member alice --window 24h --now 2026-05-13T10:00:00Z
  --out /tmp/insp.json` 必须：
  1. exit code 0（healthy）或 0（abnormal，但通过 stderr 一行报告 incident
     路径——非 zero exit 留给真正的执行错误）
  2. stdout：Markdown summary（健康时一段；abnormal 时多一段 `## 🚨
     abnormal signals`）
  3. `inspection.json` 写入 `--out` 指定路径 + always 写一份到
     `~/.teamagent/<project_slug>/inspections/<ts>.json`
  4. 若 abnormal → 额外写 `~/.teamagent/<project_slug>/incidents/<id>.json`
- `pnpm teamagent inspect-member --help` 列出全部 flags。

### 测试

- `pnpm vitest run packages/ports/src/__tests__/github-activity-port-contract.test.ts`
  绿（契约定义 + meta-test 自校验）。
- `pnpm vitest run packages/adapters/src/github-activity/__tests__/`
  绿（fake adapter 通过契约 + gh-cli adapter 在 mocked execFile 下通过契约）。
- `pnpm vitest run packages/core/src/live-inspection/__tests__/` 绿
  （四组单元测试，覆盖三条 abnormal 启发式 + 时间窗边界）。
- `pnpm vitest run packages/cli/src/commands/__tests__/inspect-member.test.ts`
  绿（execute 注入 fake port + fake event log，端到端走完 happy path +
  abnormal path + project flag missing 的 fallback）。
- `pnpm typecheck` 全绿。
- `pnpm teamagent inspect-member --help` 不抛错，打印 usage。

## 3. how-to-eval-from-3rd-party-harness（judge.md playbook）

具体 harness 在 sibling `judge.md`；这里只列 contract：

- harness = `docs/plans/2026-05-13-issue-372-live-inspection/judge.md`
  playbook（**不**是 `scripts/*.sh` —— 这是 main agent 调度 `claudefast -p`
  probe + subagent 的 MD 剧本，per user memory
  `feedback_judge_harness_md_playbook.md`）。
- 三阶段：
  1. **RUN**：固定命令矩阵跑（`pnpm typecheck`、四组 `pnpm vitest run`、
     `pnpm teamagent inspect-member --help`、fixture-driven CLI happy path、
     fixture-driven abnormal path），把每条命令 raw stdout / stderr /
     exit_code 落到 `evidence/<run_id>/<probe_name>.{stdout,stderr,exitcode}.txt`。
  2. **DUMP**：写一个 `evidence/<run_id>/judge.json`，schema：
     ```json
     {
       "run_id": "...", "issue": 372, "ts": "...",
       "probes": [
         {"name": "typecheck", "exit_code": 0,
          "stdout_path": "...", "stderr_path": "...",
          "metrics": {"errors": 0}},
         {"name": "contract-tests", "exit_code": 0,
          "metrics": {"tests": 8, "passed": 8, "failed": 0}},
         ...
       ]
     }
     ```
  3. **READ**：用 `claudefast -p` 调一个**只读 raw judge.json + evidence**
     的 LLM judge subagent，让它输出 PASS / FAIL / INCONCLUSIVE + reason，
     **绝不让被测代码或本 agent 自评**。pinned PASS thresholds 写在
     judge.md 里（per user memory
     `feedback_verification_only_judge_harness.md`）。

PASS 阈值（写死在 judge.md）：
- `typecheck.exit_code == 0`
- 所有 `*-test.exit_code == 0` 且 `metrics.failed == 0`
- `inspect-member-happy.exit_code == 0` 且 stdout 含 `## Inspection summary`
- `inspect-member-abnormal.exit_code == 0` 且 stdout 含 `🚨 abnormal signals`
  且 `evidence/<run_id>/incident.json` 存在且 valid JSON
- LLM judge 读 raw 后给 PASS

## 4. 实施顺序（commits）

1. `docs(m6): add research/plan/judge for issue #372`
2. `feat(m6): add GitHubActivityPort + contract`
3. `feat(m6): add gh-cli + fake GitHub activity adapter`
4. `feat(m6): add live-inspection core (correlate/summarize/detect/freeze)`
5. `feat(m6): add inspect-member CLI command`
6. `feat(m6): wire inspect-member into bin.ts`
7. `docs(m6): add live-inspection feature doc`
8. `docs(m6): append report.md after /review PASS`

每个 commit 跑得通；最后整条 PR 必须满足 §2 expected outputs 全部勾选；判定
权交给 §3 judge.md harness。
