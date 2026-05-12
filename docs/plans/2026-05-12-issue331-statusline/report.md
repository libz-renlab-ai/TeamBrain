```text
        ┌──────────────────────────────────────────────────┐
        │  report.md · issue #331 statusline 扩展          │
        │                                                  │
        │   plan ✓  →  implement ✓  →  judge ✓  →  PR ⏳    │
        └──────────────────────────────────────────────────┘
```

# Report — Issue #331: TeamAgent 状态栏暴露 Claude Code 运行时状态

> 配套：[`plan.md`](./plan.md)、[`research.md`](./research.md)、[`judge.md`](./judge.md)。issue：https://github.com/libz-renlab-ai/TeamBrain/issues/331 。

## TL;DR — 实施结果

**全部 5 个 judge probe（J1..J5）PASS**。interactive `claude` 在 tmux 里真渲染出新状态栏：

```
TeamAgent | 规则:146 | 帮过:0今/597周 | 拦过:2今 | 模型:MiniMax-M2.7-highspeed | 5h:12.4M | 7d:12.4M | 会话:OK | 护航中
```

老 4 字段（规则/帮过/拦过/hint）+ 新 4 字段（模型/5h/7d/会话）共 8 项同时渲染。`上下文:` / `用量:` 在本次截屏 session 里因 transcript 无 usage 行 + cost=0 自动跳过——按 [`plan.md`](./plan.md) §"字段渲染契约" 设计。

## Commits (6 个，原子，按 `docs/COMMIT-FLOW.md`)

| # | sha | subject |
|---|-----|---------|
| 1 | `40a9263` | `docs(m6): add plan/research/judge for issue #331 statusline expansion` |
| 2 | `8a56fa5` | `feat(m6): expose CC runtime status in teamagent statusline (#331)` |
| 3 | `36307de` | `test(m6): lock 6 new statusline fields driven by CC stdin (#331)` |
| 4 | `7520807` | `docs(m6): extend STATUSLINE.md field cheatsheet for 6 new fields (#331)` |
| 5 | `12e3d37` | `fix(m6): fan out CC stdin to both chained statusline segments (#331)` |
| 6 | (this report) | `docs(m6): report verdicts + judge evidence index (#331)` |

## Judge harness — verdicts

`run_id = 2026-05-12-issue331-113852`，证据：`.judge/2026-05-12-issue331-113852/`（gitignored）。

| Probe | Verdict | 关键 metric |
|---|---|---|
| **J1** legacy regression (empty stdin) | **PASS** | `legacy_anchors_present: 8/8`，`new_fields_leaked: 0`。空 stdin → 老 4 字段 byte-identical |
| **J2** new-fields render (mock stdin) | **PASS** | `all_present: true`（6/6 新字段都拼出来） |
| **J3** `teamagent install-hook` 端到端 | **PASS** | `.claude/settings.local.json::statusLine.command` 含 `teamagent-statusline.cjs` 且 `_teamagentTag` 正确 |
| **J4** `docs/STATUSLINE.md` 锚点 | **PASS** | 10/10 文档锚点齐全（含 `exceeds_200k_tokens` / `transcript_path` / `total_cost_usd` / `model.display_name`） |
| **J5** tmux + interactive `claude` 真渲染 | **PASS** | 4 个新字段（`模型:`、`5h:`、`7d:`、`会话:`）+ 3 个老字段（`规则:`、`帮过:`、`拦过:`）同时出现在状态栏 |

**Pinned thresholds (T1..T4)**：

- **T1** statusline 相关 vitest 全过：`statusline-format.test.ts` 21/21 + `install-hook.test.ts` 54/54 ✓
- **T2** ≥ 4/5 probe PASS：5/5 ✓
- **T3** 空 stdin 老格式 byte-identical（J1 `new_fields_leaked.length === 0`）✓
- **T4** STATUSLINE.md anchor ≥ 8/10：实际 10/10 ✓

→ **Verdict: PASS** —— 可进入 `/review` PASS + squash-merge。

## 关键发现（grilled by implementation）

### 隐藏 bug：stdin 被第一个 chained 段吃光

实施过程中 J5 第一次跑（commit `7520807`、fan-out 修复前）发现：**chain wrap `bash -c '<user>; echo; <team>'` 这套 PR #124 引入的形态，在第一个 segment 用 `input=$(cat)` 时会把整个 stdin 吃光**，第二段（我们的 cjs）拿到 EOF，所有 CC 字段 silently 跳过 → 用户看到的还是老 4 字段。

修复（commit `12e3d37`）：把 stdin 快照成 shell 变量 `_TS_IN=$(cat)`，然后用 `printf %s "$_TS_IN" | { ... }` **分别**喂给两个段。零 tmpfile / 零 FIFO，工作时与 user 现有 `input=$(cat)` 习惯无冲突。

新 lock 测试 `fans out stdin to BOTH chained segments so CC JSON reaches teamagent (#331)`（`install-hook.test.ts`）防回归。

### 设计取舍记录

1. **"限额 / reset 时间" 不报**：CC 没原生 API；本地拍脑袋会误导用户。STATUSLINE.md 明文说明。
2. **`用量:` 在 cost === 0 时跳过**：避免新 session 永远显示 `用量:$0.00` 噪声。
3. **`会话:OK` / `会话:⚠超长` 都显示**：让用户随时看到 200K 阈值离得多远。
4. **5h / 7d 用 token sum 不用 cost sum**：cost 维度不稳（minimax / 第三方 endpoint 不返回 cost）；token 是直接从 transcript 数出来的可信值。
5. **每个新字段 try/catch 独立**：任何 throw → 该字段单独跳过，老 4 字段绝不挂。

## 偏差 / Risk 复盘

vs [`plan.md`](./plan.md) 原计划：

| 项 | 计划 | 实际 | 备注 |
|---|---|---|---|
| commit 数 | 5 个（plan / stdin reader / ctx / 5h-7d / render） | 5 个 + 1 个 fan-out fix + 1 个 report = 7 | fan-out 是 J5 暴露出来的真问题，加了独立 commit |
| 风险 R1 (transcript 大文件) | tail 256 KB cap | 实施 ✓ | |
| 风险 R2 (minimax 不返 cost) | 字段跳过 | 实施 ✓ J5 实证：cost=0 时 `用量:` 不渲染 | |
| 风险 R3 (CC 改 stdin shape) | `?.` 链 + try/catch | 实施 ✓ | |
| 风险 R4 (跨 worktree 同 cwd) | V1 接受 + doc 写明 | 实施 ✓ STATUSLINE.md 写明 | |
| 风险 R5 (无 API key SKIPPED) | judge 接受 SKIPPED | 实施时本机有 MiniMax key，没走 SKIPPED 路径，但 judge.md 仍保留 SKIPPED 出口给 CI | |

## 后续 / Follow-ups

- ❌ **不开 follow-up issue**（per `docs/PR-PLAN.md` 严禁 PR 后开 follow-up）。
- ✅ **PR 内已全部覆盖** 用户 issue 原话的 6 项需求：
  - 模型 ✓（`model.display_name`）
  - 上下文 ✓（transcript usage tail）
  - 用量 ✓（`cost.total_cost_usd`）
  - 5h ✓（5h transcript token sum；**不报 limit/reset**——明文记入 STATUSLINE.md）
  - 7d ✓（同上）
  - 会话健康 ✓（`exceeds_200k_tokens` → OK / ⚠超长）
- ❌ **不实现 5h / 7d quota 真正 limit** —— CC 没原生 API；如果将来 CC 暴露，新开独立 issue。

## PR

- 分支：`worktree-dynamic-popping-newt`
- PR：（在本 commit 之后开）
- 验证 anchor sentence：`make atomic commits everything make file edits, then open a normal PR and squash-merge it after /review PASS.`（per `docs/COMMIT-FLOW.md`）
