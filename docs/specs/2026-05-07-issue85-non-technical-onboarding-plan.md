---
title: "Issue #85 — Non-technical onboarding (vertical slice plan)"
issue: 85
date: 2026-05-07
status: draft
owner: LiuShiyuMath
---

```text
                       INSTALL.md
                (single source of truth)
                  /                  \
                 /                    \
        installer parses          agent narrates
        & runs commands           explanations
              |                          |
              +---> on error: agent reads `fix`
              |                          |
              +---> stuck: panic-mode -> prefilled GitHub issue

   PR1 vertical slice  ──►  PR2 glossary/persona  ──►  PR3 error UX
                                                             │
                                                             ▼
                                                    PR4 plugin eval
                                                             │
                                                             ▼
                                                    PR5 CLI 中文 sweep
```

# Issue #85 Plan — non-technical onboarding

CC 用户 ≠ dev。我们不能假设用户会 pnpm / git / PATH。这个 plan 把 install
流程做成单一来源 markdown，installer 与 agent 共读同一份文件。

## 1. Task description

### PR1 — Vertical slice (本 plan 的实施目标)

把「INSTALL.md schema + parser + agent reader」打通一条最小竖切。能跑成功路径，
能跑一个故障路径。其它任务后续 PR 拆开。

做什么：

- 定义 `INSTALL.md` schema：每个 step 是一个 fenced YAML block，字段
  `id` / `command` / `explanation` / `progress` / `common_errors[].pattern`
  / `common_errors[].fix`。schema 同时被 parser 和 agent 消费。
- 写 `scripts/install-from-md.ts`（或 `.sh`，TBD）：解析 `INSTALL.md`，按
  step 顺序执行 `command`，捕获 stderr/exit，匹配 `common_errors.pattern`
  并 stdout 打印 `fix`，**不抛 raw stack trace**。
- 写 `.claude/skills/install-walkthrough/SKILL.md`：agent 读同一份
  `INSTALL.md`，按当前 step 念 `explanation`；用户报错时根据 step + error
  pattern 念 `fix`。
- 写 `packages/.../__tests__/install-md-parser-contract.test.ts`：parser
  契约测试，覆盖 schema 全字段 + 1 个 happy path + 1 个 missing-pnpm fixture。
- 在 worktree 根填一份真实的 `INSTALL.md`（≥3 个 step，覆盖 pnpm install /
  pnpm build / 首次启动）。

不做什么：

- 不做 GUI 包装（`.pkg` / `.dmg` / Electron）。
- 本 PR 不做 glossary / persona spec / panic-mode / plugin 评估 / CLI 中文
  sweep —— 留给后续 PR。
- 不动 `~/.zshrc` / `~/.bashrc` / PATH 自动注入（issue 验收明确禁止）。
- 不引入新的 i18n 框架。
- 不重写现有 `install.sh`：本 PR 只新增 `install-from-md` 路径，旧脚本保留。

### PR2–PR5 — 后续切片（仅列名，不在本 plan 实施）

| PR | 范围 | 解锁条件 |
|----|------|----------|
| PR2 | `docs/onboarding/glossary.md` + `docs/onboarding/personas.md` | PR1 merged |
| PR3 | `install.sh` 错误友好化 + panic-mode 接 `bugreport-collect` + `gh issue create --web` 预填 | PR1 merged |
| PR4 | `docs/onboarding/cc-plugin-evaluation.md`：CC plugin 化 go/no-go | PR1 merged |
| PR5 | CLI 默认中文 + jargon footnote sweep（存量逐步迁移） | PR2 merged |

## 2. Expected outputs (PR1)

| 类别 | 路径 | 形态 |
|------|------|------|
| Schema/Spec | `INSTALL.md`（worktree 根） | markdown，含 ≥3 step |
| Parser | `scripts/install-from-md.ts` | 可执行，`pnpm install:from-md` 入口 |
| Agent skill | `.claude/skills/install-walkthrough/SKILL.md` | project-level skill |
| Parser test | `packages/cli/src/__tests__/install-md-parser-contract.test.ts` | vitest |
| Fixture | `packages/cli/src/__tests__/fixtures/install-md/missing-pnpm.md` | fixture |
| 文档 | `docs/features/non-technical-onboarding.md` | 6 节模板 |
| Verify 脚本 | `scripts/verify-issue85-pr1.sh` | bash，调度下方 T1–T5 |

## 3. How-to-verify (claudefast judge harness)

固定第三方 harness：`scripts/verify-issue85-pr1.sh` 跑 T1–T5，每个 task 写
`.judge/<run_id>/T_i/judge.json` + raw stdout/stderr/evidence。最后由
独立 claudefast judge 只读 raw JSON + evidence 出 PASS / FAIL。**禁止
parser / agent / 实现作者自评**。

### Claudefast probe drafts

每个 probe 都用项目 canonical 模板 (`--output-format stream-json --debug
hooks --debug-file ... --include-partial-messages --verbose --permission-mode
acceptEdits`)。`<run_id>` 是脚本生成的 timestamp。

```bash
# T1 — Parser schema contract probe
claudefast -p \
  --output-format stream-json \
  --debug hooks --debug-file .judge/<run_id>/T1/hooks.log \
  --include-partial-messages --verbose --permission-mode acceptEdits \
  "Run 'pnpm vitest run install-md-parser-contract --reporter=json'.
   Read the JSON. Return ONLY a JSON object:
   {pass: bool, total: int, failed: int, missing_fields: string[],
    schema_fields_validated: string[], evidence: stdout_path}"
```

```bash
# T2 — Happy-path INSTALL.md execution probe (isolated tmp dir)
claudefast -p \
  --output-format stream-json \
  --debug hooks --debug-file .judge/<run_id>/T2/hooks.log \
  --include-partial-messages --verbose --permission-mode acceptEdits \
  "In a fresh tmp dir, run 'bash scripts/install-from-md.ts --dry-run INSTALL.md'.
   Capture exit_code, every step's command, every step's narrated explanation.
   Return JSON: {exit_code, steps:[{id, command, explanation, exit, stdout_path}],
   any_raw_stack_trace: bool}"
```

```bash
# T3 — Injected-failure fix narration probe
claudefast -p \
  --output-format stream-json \
  --debug hooks --debug-file .judge/<run_id>/T3/hooks.log \
  --include-partial-messages --verbose --permission-mode acceptEdits \
  "PATH 中移除 pnpm 后跑 'bash scripts/install-from-md.ts INSTALL.md'.
   断言 missing-pnpm fixture 的 common_errors.pattern 命中、对应 fix 被
   stdout 打印、且没有 raw stack trace 泄漏。
   Return JSON: {pattern_matched: bool, fix_text, fix_is_copy_pasteable: bool,
   raw_stack_trace_leaked: bool, evidence: stderr_path}"
```

```bash
# T4 — Agent narration via install-walkthrough skill
claudefast -p \
  --output-format stream-json \
  --debug hooks --debug-file .judge/<run_id>/T4/hooks.log \
  --include-partial-messages --verbose --permission-mode acceptEdits \
  "调用 install-walkthrough skill 念 INSTALL.md 第 1/2/3 step。
   每个 explanation 必须 < 200 字、不含 stack trace、不含 raw shell error。
   Return JSON: {steps:[{id, explanation, len, contains_jargon:[..],
   contains_stack_trace: bool}]}"
```

```bash
# T5 — Zshrc/bashrc immutability probe
claudefast -p \
  --output-format stream-json \
  --debug hooks --debug-file .judge/<run_id>/T5/hooks.log \
  --include-partial-messages --verbose --permission-mode acceptEdits \
  "Compute sha256 of ~/.zshrc and ~/.bashrc.
   Run 'bash scripts/install-from-md.ts INSTALL.md' end-to-end in tmp HOME.
   Recompute sha256. Return JSON:
   {zshrc_before, zshrc_after, zshrc_changed: bool,
    bashrc_before, bashrc_after, bashrc_changed: bool}"
```

```bash
# Final judge — verdict from raw JSON only
claudefast -p \
  --output-format stream-json \
  --include-partial-messages --verbose --permission-mode acceptEdits \
  "你只能读 .judge/<run_id>/T*/judge.json + linked evidence path。
   不许凭感觉，不许引用 JSON 里没有的事实。
   Acceptance gates:
     G1 (T1) parser schema 全字段验证 + tests pass
     G2 (T2) 所有 step 都有非空 explanation；any_raw_stack_trace=false
     G3 (T3) pattern_matched=true && fix_is_copy_pasteable=true && raw_stack_trace_leaked=false
     G4 (T4) 每个 explanation len<200 && contains_stack_trace=false
     G5 (T5) zshrc_changed=false && bashrc_changed=false
   Return JSON: {verdict: 'PASS'|'FAIL', failed_gates: [..],
   missing_evidence: [..], notes: string}"
```

### Acceptance gate 汇总（必须全 PASS 才能合 PR）

- G1 parser 契约测试全绿。
- G2 happy path：所有 step 都念出 explanation，无 raw stack trace。
- G3 missing-pnpm fixture：pattern 命中 → fix 打印 → 可复制粘贴 → 无 stack
  trace 泄漏。
- G4 agent 念的每一段 explanation < 200 字、不含 stack trace。
- G5 全程 `~/.zshrc` 与 `~/.bashrc` 哈希未变。

## 4. Decisions（已拍板）

- **Parser 语言：TypeScript**。与 `packages/cli` 同栈，CLI 入口
  `pnpm install:from-md`；契约测试复用 vitest。鸡生蛋：parser 服务于「已
  clone + 已装 pnpm」之后；pnpm 本身留 `install.sh` 兜底。
- **`INSTALL.md` 位置：worktree 根**。`git clone` 完一眼可见，GitHub 首页
  直接展示。`docs/onboarding/` 留给 PR2 的 glossary / persona。
- **Agent skill：`install-walkthrough`，project-level，不查冲突**。落在
  `.claude/skills/install-walkthrough/SKILL.md`，PR review 阶段再处理冲突。

下一步：同目录写 `research.md` 沉淀现有 `install.sh` 行为，开始 PR1。
