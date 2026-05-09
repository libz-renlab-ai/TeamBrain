```text
                ┌─────────────────────────────────────────┐
                │  JUDGE — issue 168 statusline           │
                │                                         │
                │  §V1 RUN  → 4 fixed tools                │
                │  §V2 DUMP → judge.json + evidence_dir    │
                │  §V3 READ → claudefast 只读 raw + 给裁决  │
                └─────────────────────────────────────────┘
```

# Judge harness — Issue 168

> **Hard rule (`docs/HOWTO-PLAN-PR.md` § 3b)**: third-party judge harness
> forbidden fixed scripts; MUST use md playbook. The MAIN agent dispatches
> sections via subagents or `claudefast -p` probes, not via `.sh` scripts.

## §V1 RUN — fixed tools

Run-id 由 dispatcher 生成（推荐 `iss168-<UTCISO>`）。所有命令在 worktree 根
`.claude/worktrees/168/` 跑。

| # | 命令                                                                                  | 收什么                  | 落到                                                |
|---|---------------------------------------------------------------------------------------|-------------------------|------------------------------------------------------|
| 1 | `pnpm test packages/cli/src/__tests__/statusline-format.test.ts -- --reporter=json`   | vitest JSON 结果        | `.judge/<run_id>/vitest-statusline.json`             |
| 2 | `pnpm typecheck`                                                                      | tsc 输出 + exit code    | `.judge/<run_id>/typecheck.{stdout,stderr,exit}`     |
| 3 | `echo {} \| node scripts/teamagent-statusline.cjs > .judge/<run_id>/statusline.stdout 2> .judge/<run_id>/statusline.stderr; echo $? > .judge/<run_id>/statusline.exit` | statusline 实际输出 + 任何 stderr | `.judge/<run_id>/statusline.{stdout,stderr,exit}`    |
| 4 | `pnpm tsx audit/runners/feature-19-statusline.ts`                                     | audit JSON / artifacts  | audit 自己写到 `audit/output/feature-19-statusline/` |

每条命令的 `stdout` / `stderr` / `exit_code` 都要落盘；不许只看终端打印。

### dispatch 方式

- 单 worker / sequential 即可（4 条命令 5 分钟内跑完）。
- 任何一条 fail 不要中止剩下的——四条都要跑完，由 §V3 综合判断。
- 失败重跑只重 dispatch 该 §V<n>，不要改这份 md。

## §V2 DUMP — judge.json schema

写到 `.judge/<run_id>/judge.json`。最小字段：

```json
{
  "run_id": "iss168-2026-05-09T08-00-00Z",
  "evidence_dir": ".judge/<run_id>/",
  "metrics": {
    "vitest_passed": true,
    "vitest_failed_count": 0,
    "typecheck_exit_code": 0,
    "statusline_exit_code": 0,
    "statusline_stdout_path": ".judge/<run_id>/statusline.stdout",
    "statusline_stderr_path": ".judge/<run_id>/statusline.stderr",
    "stderr_warning_lines": 0,
    "has_chinese_label_规则": true,
    "has_chinese_label_帮过": true,
    "has_chinese_label_拦过": true,
    "still_has_english_helped": false,
    "still_has_english_risk": false,
    "audit_exit_code": 0,
    "helped_kinds_overlap_count": 0,
    "risk_kinds_overlap_count": 0,
    "idle_hint_when_zero_present": true
  },
  "exit_code": 0,
  "stdout_path": "<top-level summary written by dumper>"
}
```

### 字段定义

- `vitest_passed` — vitest reporter JSON 顶层 `numFailedTests === 0`。
- `vitest_failed_count` — 直接拷 reporter JSON `numFailedTests`。
- `typecheck_exit_code` — `tsc --noEmit` 退出码（非 0 即 fail）。
- `statusline_exit_code` — `node scripts/teamagent-statusline.cjs` 退出码。
- `stderr_warning_lines` — 数 statusline.stderr 里非空行（任何残留行都算违反 D 修复）。
- `has_chinese_label_*` — `grep -c '规则:\|帮过:\|拦过:'` 三个分别检查。
- `still_has_english_helped` / `still_has_english_risk` — 检查 stdout 里是否仍有英文裸字段（应当 false）。
- `audit_exit_code` — `audit/runners/feature-19-statusline.ts` 进程退出码 + audit 自己产出的 `decision.json` 里 `status === "passed"` 双重确认。
- `helped_kinds_overlap_count` / `risk_kinds_overlap_count` — 静态扫 `scripts/teamagent-statusline.cjs` 里的两个常量数组，计算交集大小（必须为 0）。
- `idle_hint_when_zero_present` — 在 vitest case 1（全空 DB）输出里 grep `待命中（让我学几条规则吧）`。

### dumper 实现

dumper 不是固定 `.sh` —— MAIN agent 用一次 `claudefast -p` 或一个 subagent 把
四条 §V1 命令的产物拼成上面的 JSON。dumper 只做 reduce / aggregate，不做
judgement。

## §V3 READ — judge

唯一一次裁决。一个**新的** `claudefast -p`（或 `codex exec`）只读：

- `.judge/<run_id>/judge.json`
- 必要时再读 `.judge/<run_id>/statusline.stdout` 与 `statusline.stderr` 几行做
  cross-check（不读源码、不读 plan、不读 research）。

判定规则（READ agent 的 prompt 里硬编码）：

- **PASS** 当且仅当 metrics 同时满足：
  - `vitest_passed === true && vitest_failed_count === 0`
  - `typecheck_exit_code === 0`
  - `statusline_exit_code === 0`
  - `stderr_warning_lines === 0`
  - `has_chinese_label_规则 && has_chinese_label_帮过 && has_chinese_label_拦过`
  - `still_has_english_helped === false && still_has_english_risk === false`
  - `audit_exit_code === 0`
  - `helped_kinds_overlap_count === 0 && risk_kinds_overlap_count === 0`
  - `idle_hint_when_zero_present === true`
- **FAIL** 否则。FAIL 必须列出哪条 metric 没过，以及对应 `evidence_dir` 路径。

READ 的输出形态是一段简短文本结论 + 一个 `verdict: PASS|FAIL`。**被改的代码 / 实现的 agent / PR 作者**都不做 READ。

## §V4 -- relation to project 1+2+3 gate

项目级 1+2+3 gate（`docs/feature-verification.md`）针对 `{MODULE} --help` 出
canonical JSON。statusline 没有 `--help`，但它的 stdout 本身就是 canonical
single-line。本 PR 把它当成 gate 的"等价物"：

1. `claudefast -p "echo {} | node scripts/teamagent-statusline.cjs"` 收 stdout。
2. `codex exec --skip-git-repo-check -s read-only "echo {} | node scripts/teamagent-statusline.cjs"` 收 stdout。
3. 两份 stdout 必须**字符串完全相等**（没有第三方差异）。
4. tmux interactive `claudefast` `/export` 到 `docs/plans/2026-05-09-issue-168/exports/issue-168-export.txt`，附在 PR description 里。

1+2+3 失败也按 §V3 规则归 FAIL；不开新 issue 修——按 `docs/PR-PLAN.md` 在本 PR 里 PR-PLAN 修。

## 何时跑

- 写完 implementation 后第一次跑（验证基本功能）。
- 每次 `/review` POSTPR loop 修完后再跑（防止回归）。
- PR 即将 merge 前最后一次跑（pre-merge confidence check）。

每次跑都要新 `run_id`；旧的 `.judge/iss168-*` 保留作历史证据。
