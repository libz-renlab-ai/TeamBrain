```text
        ┌──────────────────────────────────────────────────┐
        │  plan.md · issue #331 statusline 扩展            │
        │                                                  │
        │  (1) task           做什么 / 怎么做              │
        │  (2) expected outputs  可验收交付物              │
        │  (3) judge harness     第三方 JSON 评判          │
        └──────────────────────────────────────────────────┘
```

# Plan — Issue #331: TeamAgent 状态栏暴露 Claude Code 运行时状态

> 三段铁律按 `CLAUDE.md` + `docs/PLAN-RESEARCH-REPORT.md`；上下文见 [`research.md`](./research.md)；评判见 [`judge.md`](./judge.md)。

## CHANGELOG

- **v1**（2026-05-12，本次）：从零，covers 模型 / 上下文 / 用量 / 会话健康 / 5h / 7d 用量 6 个字段。

---

## (1) Task description

**做什么**：扩展 `scripts/teamagent-statusline.cjs`，让 statusbar 在每次 CC 渲染时多出 **模型 / 上下文 / 用量 / 会话健康 / 5h 用量 / 7d 用量** 共 6 项 Claude Code 运行时信息，并把同一份 cjs 通过 `pnpm teamagent init` 自动落到 `<repo>/.claude/settings.local.json::statusLine.command`。

**怎么做**（5 个原子 commit）：

1. **`feat(m6): read CC statusline stdin in teamagent-statusline.cjs`** — 在 cjs 顶部加 `readStdinJsonSync(timeoutMs=200)`，拿 `model.display_name` / `transcript_path` / `cost.total_cost_usd` / `exceeds_200k_tokens`；空 stdin / 解析失败 → `null` 静默回落，老测试全绿。
2. **`feat(m6): derive context tokens from transcript_path tail`** — 反向读 `transcript_path` JSONL 找最近一条 assistant `message.usage`，算 `input_tokens + cache_creation + cache_read` → `ctxTokens`。
3. **`feat(m6): aggregate 5h/7d token usage from local transcripts`** — 同 `~/.claude/projects/<encoded-cwd>/*.jsonl` 中 `mtime > now-7d` 的文件，按 timestamp 累加 5h / 7d 窗内 assistant usage。
4. **`feat(m6): append model/ctx/cost/health/5h/7d fields to status line`** — `render(...)` 把 6 个新字段按"有 stdin 才追加"原则拼到老 4 字段后面、`hint` 之前；任何字段拿不到写 `n/a`、不崩。
5. **`docs(m6): update STATUSLINE.md + add issue331 plan/research/judge/report`** — 把新字段速查表写进 `docs/STATUSLINE.md`，本目录四件套就绪。

**不做什么**：

- 不报"limit / reset"（CC 没原生 API，本地拍脑袋会误导）
- 不动 user-level `~/.claude/settings.json`
- 不删 / 重命名老 4 字段（规则 / 帮过 / 拦过 / hint）
- 不改 `install-hook.ts`（entry path 不变）
- 不引入新依赖

## (2) Expected outputs

可验收交付物清单：

| # | 交付物 | 期望状态 | 评判方法 |
|---|---|---|---|
| O1 | `scripts/teamagent-statusline.cjs` | 多出 stdin 读取 + 6 字段渲染逻辑；老 4 字段 byte-for-byte 保留 | unit test + judge harness |
| O2 | `packages/cli/src/__tests__/statusline-format.test.ts` | 新增 6 个测试锁定 stdin-driven 字段（模型 / 上下文 / 5h / 7d / cost / 会话健康） | `pnpm vitest run packages/cli/src/__tests__/statusline-format.test.ts` 全绿 |
| O3 | `docs/STATUSLINE.md` | "5 字段速查"扩展到"11 字段速查"，新增字段标注来源 + 容错策略 | 人读 + judge harness 检查锚点 |
| O4 | `docs/plans/2026-05-12-issue331-statusline/{research,plan,judge,report}.md` | 四件套齐全；report.md 在 PR merge 前更新（含 PR 链接 + judge.md verdict） | doc-integrity-check |
| O5 | `<repo>/.claude/settings.local.json::statusLine.command` | `pnpm teamagent init` 在干净 fixture repo 上跑完后包含 `node .../teamagent-statusline.cjs` | judge harness probe (J3) |
| O6 | tmux + interactive `claude` 真跑 | statusbar 渲染含锚点 `模型:` / `上下文:` / `5h:` / `7d:` 至少 3 项；老 `规则:` / `帮过:` / `拦过:` 也都还在 | judge harness probe (J5)，证据 dump 到 `.judge/<run_id>/` |

### 字段渲染契约（V1，固定）

老格式（`tests` 仍锁）：
```
TeamAgent | 规则:N | 帮过:T今/W周 | 拦过:T今 | <hint>
```

新格式（有 CC stdin 时）：
```
TeamAgent | 规则:N | 帮过:T今/W周 | 拦过:T今 | 模型:M | 上下文:CK | 用量:$X.XX | 5h:H | 7d:D | 会话:OK | <hint>
```

- `模型:M` — `model.display_name` 字面 trim，缺 → 跳过
- `上下文:CK` — `ctxTokens` 缺省 K（< 1000 算 0K；≥ 1024K 算 `1.2M`）；拿不到跳过
- `用量:$X.XX` — `cost.total_cost_usd` 2 位小数；`cost == null || 0` 跳过
- `5h:H` / `7d:D` — 数值规则同"上下文"；拿不到跳过
- `会话:OK` / `会话:⚠超长` — `exceeds_200k_tokens === true` 时显示 `⚠超长`，false 显示 `OK`，缺 → 跳过

**容错铁律**：任何一项 throw → catch + 该字段跳过；整行 fallback 到老 4 字段不挂。

## (3) How to eval (third-party judge harness)

判定全部走 [`judge.md`](./judge.md) 定义的固定 probe，**不允许**让计划作者、被改代码、`scripts/teamagent-statusline.cjs` 自己自证。每个 probe 产 `.judge/<run_id>/<probe_id>.json`：

```jsonc
{
  "probe_id": "J1",
  "exit_code": 0,
  "metrics": { "fields_present": ["模型","上下文","用量","5h","7d","会话"], "fields_missing": [] },
  "evidence_dir": ".judge/<run_id>/J1/",
  "stdout_path": ".judge/<run_id>/J1/stdout.txt",
  "stderr_path": ".judge/<run_id>/J1/stderr.txt"
}
```

最终由独立 LLM judge 只读所有 JSON + evidence 路径输出：

```jsonc
{ "verdict": "PASS|FAIL", "reasons": [...], "pinned_thresholds_met": [...] }
```

阈值（**pinned**，不允许后置改）：

- **T1** vitest 所有 statusline 相关测试 100% pass
- **T2** judge harness 5 个 probe（J1..J5）至少 4 个 PASS；J5（真跑 tmux + claude）允许在 sandbox 无 API key 时 SKIPPED but evidence 留有 reason
- **T3** 老 4 字段（规则 / 帮过 / 拦过 / hint）在空 stdin 调用下 byte-identical（J1 probe 中的 `legacy_invocation` 段）
- **T4** `docs/STATUSLINE.md` 字段速查表新增 ≥ 5 行、保留旧 5 行；J4 grep 锚点

任一 T-X 不过 → FAIL → 回到 implement，禁止"先 merge 再补"。

## 步骤分解（顺序，每条 = 1 commit）

| 步 | 标题 | commit prefix | 受影响文件 |
|---|---|---|---|
| 1 | plan/research/judge 四件套（不含 report） | `docs(m6):` | `docs/plans/2026-05-12-issue331-statusline/*` |
| 2 | stdin reader + parse | `feat(m6):` | `scripts/teamagent-statusline.cjs` |
| 3 | transcript ctx tokens | `feat(m6):` | `scripts/teamagent-statusline.cjs` |
| 4 | 5h / 7d 累加 | `feat(m6):` | `scripts/teamagent-statusline.cjs` |
| 5 | render + 字段拼接 | `feat(m6):` | `scripts/teamagent-statusline.cjs` |
| 6 | 测试用例锁字段 | `test(m6):` | `packages/cli/src/__tests__/statusline-format.test.ts` |
| 7 | docs/STATUSLINE.md 更新 | `docs(m6):` | `docs/STATUSLINE.md` |
| 8 | judge harness 跑、报告 verdict | `docs(m6):` | `docs/plans/2026-05-12-issue331-statusline/report.md` |
| 9 | 开普通 PR + `/review` 循环 PASS + squash-merge | (PR-level) | — |

## 风险 / 已知限制

- **R1**：transcript_path 文件几十 MB 时 `readFileSync` 慢 → mitigation：只读末尾 256 KB；找不到 usage 行 → 字段 n/a 不挂。
- **R2**：MiniMax / 第三方 endpoint 不返回 `cost.total_cost_usd` → 字段直接跳过。
- **R3**：CC 升级改 stdin shape → mitigation：所有 key 读取走 `?.` 链 + try/catch，新 key 缺失自动跳过。
- **R4**：5h/7d 累加可能跨项目误计（同 cwd 不同 worktree 共享 transcript dir）→ V1 接受（用户希望聚合视角；明文写进 STATUSLINE.md）。
- **R5**：interactive `claude` 在 tmux 里需要 API key 才能真跑——J5 probe 在无 key sandbox 标 SKIPPED + 留 reason，judge LLM 接受 SKIPPED 当非 FAIL。

## 回滚

- 全部改动落在 `scripts/teamagent-statusline.cjs` + 一份测试 + 一份 doc。`git revert <PR commit>` 单 commit 即可。
- 配置层（`.claude/settings.local.json`）不变 → 不需要任何 user 端清理动作。
