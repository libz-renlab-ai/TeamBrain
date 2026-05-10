```text
   ┌────────────────────────────────────────────────────────────────────┐
   │   plan.md — toohot session                                         │
   │   "inner-loop tests on dedicated CI workflow"                      │
   │                                                                    │
   │   ① task description  ② expected outputs                           │
   │   ③ judge harness     ④ pending decisions                          │
   └─────────────────────────────────┬──────────────────────────────────┘
                                     │
   loadavg 274 / thermal normal      │      公共 GitHub Actions
   8 node procs in queue, ~16% CPU   │      (无限分钟数)
   = scheduler-overload, NOT thermal │
                                     ▼
   ┌──────────────┐    git push     ┌──────────────────────────┐
   │ Mac session  │ ──────────────▶ │ inner-loop.yml on wip/** │
   │ (any of N)   │                 │  pnpm install            │
   │              │ ◀── PASS/FAIL   │  pnpm test               │
   │ targeted     │  gh run watch   │  pnpm verify             │
   │ vitest path  │                 │  ubuntu-latest only      │
   │ stays LOCAL  │                 └──────────────────────────┘
   └──────────────┘
        本地 inner loop:                CI inner loop:
        单文件 vitest = 秒级             全套 = 2-5 分钟
        scheduler 不 overflow            机器永远不烫
```

---

## CHANGELOG

- **v3 (2026-05-10)** — secret 命名校正为仓库既有约定 `MINIMAX_API_KEY`（`.github/workflows/claudefast-anchors.yml` 早已使用同名 secret）。inner-loop.yml `env:` 块同时暴露 `ANTHROPIC_API_KEY`（claudefast wrapper 用此名）与 `MINIMAX_API_KEY`（与 secret 名匹配，方便直接读 env 的代码路径）。原因：v1/v2 拍板时 skipped_repo_search，未发现仓库已有同义 secret。dogfood 已在 v2 push 中绿灯（run #25622100341），本次重 push 验证 rename 不破坏。
- **v2 (2026-05-10)** — secret 命名拍板：`MINIMAX_TOKEN`（已被 v3 校正为 `MINIMAX_API_KEY`），YAML 内 alias `ANTHROPIC_API_KEY` env。§1.6 / §2 / §3 J3 / §4 同步闭合。
- **v1 (2026-05-10)** — 初版，对应 grill 7 题闭合（③ → α → 🅱️ → 🅱️ → A+B → verify-in → judge-🅲️）。secret 命名 §4 待用户拍板。

---

## 1 Task description

### 做什么

1. **新建** `.github/workflows/inner-loop.yml`，触发条件 `push: branches: [wip/**]`，单 lane `ubuntu-latest`，跑 `pnpm install --frozen-lockfile` + `pnpm test` + `pnpm verify`。
2. **新建** `docs/adr/0013-inner-loop-on-ci.md`，归档「秒级 inner loop → 分钟级 CI inner loop 换 macOS 永远不进 scheduler-overload 区」决策与所有 reject 的 alternative。
3. **新建** `docs/INNER-LOOP-TESTING.md`（活文档），写：怎么 push wip 分支、Claude Code 怎么 `gh run watch` 读结果、targeted 单文件本地例外的具体边界、CI 红了怎么 debug、secret rotate 流程。
4. **修改** `CLAUDE.md`，加 5-10 行 pointer 段链 ADR-0013 + INNER-LOOP-TESTING.md。
5. **修改** `docs/CONTEXT.md`，新增四个 term 词条：**inner-loop testing** / **wip 分支** / **single-file targeted exception** / **scheduler-overload**。
6. **配置** repo secret `MINIMAX_API_KEY`（rotate 完旧 MiniMax token 后，用户自跑 `gh secret set MINIMAX_API_KEY -b"$NEW_MINIMAX_API_KEY"`）；YAML `env:` 块用 alias `ANTHROPIC_API_KEY: ${{ secrets.MINIMAX_API_KEY }}` —— 因为 claudefast wrapper 把 MiniMax token 当 `ANTHROPIC_API_KEY` 用，CI 沿用同语义。

### 怎么做

- 现有 `ci.yml` 触发条件 `[master, main]` + `pull_request` **保持不变**——inner-loop 是新独立 workflow，PR-gate 关卡职责不动。
- inner-loop.yml `env` 块直接展开 MiniMax 非敏感 config（base URL / 模型名 / timeout / disable flags），唯一 secret 是 token 本体（通过 `${{ secrets.X }}` 引用）。
- secret 注入：用户在 rotate 完旧 MiniMax token 之后，本地 `gh secret set <NAME> -b"$NEW_TOKEN"` 一次性注入；本计划不携带 token 值，提交物里也不出现。

### 不做什么

- 不动 `ci.yml`（PR-gate 职责保持）
- 不写 SSH 远端测试通道（β）—— rsync/版本同步/macOS↔Linux 漂移 4 个新坑全 reject
- 不动 `docs/TEAMWORK.md`（worker 编排话题与测试通道正交）
- 不强制本地禁 `vitest path/single.test.ts`（targeted 例外条款明确放行）
- 不写 toohot preflight 闸门（①+②）—— ③ 落地后 toohot 不会复发，闸门变 over-engineering
- 不在 inner-loop.yml 跑 `windows-latest`（windows lane 是 PR 时由 ci.yml 兜底的跨平台 smoke，不是 inner loop 关切）
- 不开 draft PR（项目规则禁止）

---

## 2 Expected outputs

PR-ready 验收清单：

| Artifact | 路径 | 验收标准 |
|---|---|---|
| 新 workflow | `.github/workflows/inner-loop.yml` | push `wip/judge-pass` 后 `gh run list --workflow=inner-loop.yml -L 1 --json status,conclusion` 返回 `{status:"completed", conclusion:"success"}` |
| ADR | `docs/adr/0013-inner-loop-on-ci.md` | 五段：Status / Context / Decision / Consequences / Alternatives；Alternatives 列出 ①+② / 🅰️改 ci.yml / 🅲️ workflow_dispatch / (β) SSH / (γ) 双栈 五个 reject 方案 |
| How-to 活文档 | `docs/INNER-LOOP-TESTING.md` | 五段：push 流程 / Claude Code 读 CI / targeted 例外边界 / 红 CI debug / secrets rotate |
| CLAUDE.md 引用 | `CLAUDE.md` | 新增 pointer 段，链 ADR-0013 + INNER-LOOP-TESTING.md |
| GitHub secret | repo secret `MINIMAX_API_KEY` | `gh secret list` 输出含 `MINIMAX_API_KEY`；YAML alias 给 `ANTHROPIC_API_KEY` env；token 真值绝不在 git / transcript / 文档 |
| CONTEXT.md 词条 | `docs/CONTEXT.md` | 新增四 term 定义 |

---

## 3 How-to-eval-from-3rd-party-harness

按 CLAUDE.md 三段铁律：第三方 judge harness 跑固定工具、dump 大量 JSON、最后由另一只 LLM 只读 raw JSON + evidence 当裁判。**禁止本计划作者、实施 agent、被测代码自评。**

### Harness 形式

- 入口：`docs/plans/2026-05-10-inner-loop-on-ci/judge.md`（MD playbook，**不是** `scripts/*.sh`）
- 主 agent dispatch subagents 或 `claudefast -p` probe 按 playbook 跑 5 项验证
- 全部输出落 `docs/plans/2026-05-10-inner-loop-on-ci/judge/<probe-id>/{stdout.log, result.json}`
- 终判：`claudefast -p "read all judge/*/result.json then emit overall PASS/FAIL with reasoning"`

### 五项验证（🅲️ Comprehensive）

| Probe | 输入 | dump 字段 | 期望裁判结论 |
|---|---|---|---|
| **J1 CI green** | push `wip/judge-pass`（已知能过） | `{run_id, conclusion, duration_sec, evidence_url}` | `conclusion = "success"` |
| **J2 CI red** | push `wip/judge-fail`（故意改一行让 1 个测试失败） | `{run_id, conclusion, failed_test_count, evidence_url}` | `conclusion = "failure"` ∧ `failed_test_count ≥ 1` |
| **J3 secret OK** | push `wip/judge-secret`（依赖 MiniMax env 的测试） | `{run_id, conclusion, env_dump_redacted}` | `conclusion = "success"` ∧ `env_dump_redacted` 含 `ANTHROPIC_BASE_URL=https://api.minimaxi.com/anthropic` ∧ token 字段为 `[redacted]` |
| **J4 local targeted** | 本地 `vitest packages/cli/src/__tests__/init.test.ts`（在仓库根目录跑） | `{exit_code, duration_sec, ran_files}` | `exit_code = 0` ∧ `duration_sec < 10` |
| **J5 toohot regression** | 用户**手动**开 1/2/3/4 session，每个 push wip 跑 inner-loop（不本地 pnpm test），每档 sample `toohot` loadavg | `loadavg-curve.json` = `[{n_sessions:1, loadavg_1m, ...}, {n:2,...}, {n:3,...}, {n:4,...}]` | `n=4` 时 `loadavg_1m < 100`（vs 改造前 274） |

### J5 人工配合环节

J5 需用户**亲自**开 N session 多窗口，鸭鸭无法纯自动化。`judge.md` 把这条 probe 写成「人工 step」，由用户跑完把数据塞回 `judge/J5/result.json`，再让 `claudefast -p` 当裁判。

---

## 4 决策记录

| 决策 | 拍板时间 | 内容 |
|---|---|---|
| secret 命名 | 2026-05-10 (v3) | `MINIMAX_API_KEY` —— 沿用仓库既有约定（`claudefast-anchors.yml` 已使用），避免双 secret 维护成本。v2 曾拟用 `MINIMAX_TOKEN`，因 skipped_repo_search 错过现有约定。 |
| YAML env 暴露 | 2026-05-10 (v3) | 同时设 `ANTHROPIC_API_KEY: ${{ secrets.MINIMAX_API_KEY }}`（claudefast wrapper 习惯）与 `MINIMAX_API_KEY: ${{ secrets.MINIMAX_API_KEY }}`（与 secret 名一致，照顾 `process.env.MINIMAX_API_KEY` 直读路径）。 |

**计划无 pending 决策。** §1.6 / §2 secret 行 / §3 J3 probe 已同步闭合。

---

## 5 显式不在范围

- (β) SSH 远端 / paperclipmini / jushi 通道 —— reject
- ①+② 本地 cap + preflight 闸门 —— ③ 自然消解
- (γ) 双栈 —— 维护成本翻倍
- 改 `ci.yml` —— 关卡职责保持
- nightly-llm-smoke.yml / claudefast-anchors.yml 等其它 workflow —— 不动
- frame-level 屏幕录制 / 浏览器/视频 —— 不相关
