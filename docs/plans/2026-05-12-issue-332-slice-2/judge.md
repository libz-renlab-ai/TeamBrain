```text
   judge harness — md playbook (NOT fixed bash)
   ─────────────────────────────────────────────
      §V1 RUN ─► §V2 DUMP ─► §V3 READ ─► verdict
      tools     judge.json    LLM judge    pass|fail|uncertain
        │           │            │
        │           │            └── only reads raw JSON + evidence,
        │           │                NOT the source code
        │           └── canonical schema:
        │               {tool, exit_code, metrics, evidence_dir, stdout_path}
        └── stdout/stderr to evidence_dir/<probe>.log
```

# Judge harness — issue #332 slice 2a

Third-party judge harness md playbook for `docs/plans/2026-05-12-issue-332-slice-2/plan.md`.

**Hard rule reminder** (`docs/HOWTO-PLAN-PR.md` §Hard rules + `~/.claude/docs/rules/testing-judge-harness.md`):

- **forbidden fixed scripts** — 本 judge **不是** `.sh` / 固定 bash pipeline
- **MUST use md playbook** — MAIN agent 按本文档 §V1 / §V2 / §V3 派 subagents 与 `claudefast -p` 探针
- PR 作者、执行 agent、被测代码（mock responder + pipeline test）**均不得当裁判**
- §V3 必须由**另一只 LLM** 只读 raw `judge.json` + `evidence_dir` 内容判定，不再 reread 源码

Run-id schema：`run_id = ISO date + "-" + short SHA of plan.md`，例 `2026-05-12-abc1234`。
Evidence root：`.judge/<run_id>/`（git-ignored 已在仓库 `.gitignore` 配置）。

---

## §V1 RUN — 跑固定工具，落 evidence

MAIN agent 在 worktree 根 `cd /Users/m1/projects/TeamBrain/.claude/worktrees/issue-332-slice-2` 派 5 个 probe（顺序 V1.1 → V1.5；V1.2/V1.3 可并行）。每个 probe 把 stdout + stderr 落 `.judge/<run_id>/evidence/<probe-slug>.log`，并把 exit code 记到 `.judge/<run_id>/evidence/<probe-slug>.exit_code`。

### V1.1 typecheck 全仓
- 工具：`pnpm typecheck`
- 落盘：`.judge/<run_id>/evidence/v1.1-typecheck.log` + `.exit_code`
- 期望：exit_code = 0

### V1.2 vitest targeted — mock responder unit
- 工具：`pnpm vitest run packages/adapters/src/m5/__tests__/mock-llm-responder.test.ts --reporter=json`
- 落盘：`.judge/<run_id>/evidence/v1.2-mock-responder.log`（stdout = JSON reporter）+ `.exit_code`
- 期望：exit_code = 0，JSON reporter 的 `numTotalTests >= 6`、`numFailedTests = 0`

### V1.3 vitest targeted — L4 fs-copy pipeline integration
- 工具：`pnpm vitest run packages/adapters/src/m5/__tests__/l4-fs-copy-pipeline.test.ts --reporter=json`
- 落盘：`.judge/<run_id>/evidence/v1.3-l4-pipeline.log` + `.exit_code`
- 期望：exit_code = 0，JSON reporter 的 `numTotalTests >= 1`、`numFailedTests = 0`

### V1.4 vitest broad — adapters 包不破其它测试
- 工具：`pnpm vitest run packages/adapters/ --reporter=json`
- 落盘：`.judge/<run_id>/evidence/v1.4-adapters-broad.log` + `.exit_code`
- 期望：exit_code = 0，no failed tests in slice 1 utilities

### V1.5 PR diff scope guard — `git diff` 不动 anti-goals 文件
- 工具：

  ```bash
  git diff --name-only origin/main...HEAD | sort
  ```

- 落盘：`.judge/<run_id>/evidence/v1.5-diff-files.log`
- 期望：行集合**只包含**下列文件（多一个就 fail）：

  ```
  docs/plans/2026-05-12-issue-332-slice-2/judge.md
  docs/plans/2026-05-12-issue-332-slice-2/plan.md
  docs/plans/2026-05-12-issue-332-slice-2/report.md
  docs/plans/2026-05-12-issue-332-slice-2/research.md
  packages/adapters/src/m5/__tests__/l4-fs-copy-pipeline.test.ts
  packages/adapters/src/m5/__tests__/mock-llm-responder.test.ts
  packages/adapters/src/m5/testing/index.ts
  packages/adapters/src/m5/testing/mock-llm-responder.ts
  ```

### V1.6（可选 + advisory）feature-verification tmux `/export` — 路径 2

- 工具：tmux 启动 `claudefast`，跑一句 prompt 让其 `Read` `mock-llm-responder.ts` 并 `/export <path>`
- 落盘：`.judge/<run_id>/evidence/v1.6-feature-verify-export.txt`
- 期望：export 文件存在、非空、含 `mock-llm-responder` 字符串
- **如果 tmux 不可用（CI 无 TTY），跳过这步，§V3 判定为 `uncertain`-but-not-blocker**

---

## §V2 DUMP — canonical `judge.json`

V1 全部跑完后，MAIN agent 写 `.judge/<run_id>/judge.json`：

```json
{
  "schema_version": 1,
  "plan": "docs/plans/2026-05-12-issue-332-slice-2/plan.md",
  "run_id": "<ISO-date>-<short-sha>",
  "evidence_dir": ".judge/<run_id>/evidence/",
  "tools": [
    {
      "name": "v1.1-typecheck",
      "tool": "pnpm typecheck",
      "exit_code": <int>,
      "stdout_path": ".judge/<run_id>/evidence/v1.1-typecheck.log",
      "metrics": { "errors": <int> }
    },
    {
      "name": "v1.2-mock-responder",
      "tool": "pnpm vitest run packages/adapters/src/m5/__tests__/mock-llm-responder.test.ts --reporter=json",
      "exit_code": <int>,
      "stdout_path": ".judge/<run_id>/evidence/v1.2-mock-responder.log",
      "metrics": { "numTotalTests": <int>, "numFailedTests": <int>, "numPassedTests": <int> }
    },
    {
      "name": "v1.3-l4-pipeline",
      "tool": "pnpm vitest run packages/adapters/src/m5/__tests__/l4-fs-copy-pipeline.test.ts --reporter=json",
      "exit_code": <int>,
      "stdout_path": ".judge/<run_id>/evidence/v1.3-l4-pipeline.log",
      "metrics": { "numTotalTests": <int>, "numFailedTests": <int>, "numPassedTests": <int> }
    },
    {
      "name": "v1.4-adapters-broad",
      "tool": "pnpm vitest run packages/adapters/ --reporter=json",
      "exit_code": <int>,
      "stdout_path": ".judge/<run_id>/evidence/v1.4-adapters-broad.log",
      "metrics": { "numTotalTests": <int>, "numFailedTests": <int>, "numPassedTests": <int> }
    },
    {
      "name": "v1.5-diff-files",
      "tool": "git diff --name-only origin/main...HEAD | sort",
      "exit_code": <int>,
      "stdout_path": ".judge/<run_id>/evidence/v1.5-diff-files.log",
      "metrics": { "file_count": <int>, "unexpected_files": [<str>...] }
    },
    {
      "name": "v1.6-feature-verify-export",
      "tool": "tmux + claudefast /export",
      "exit_code": <int|-1>,
      "stdout_path": ".judge/<run_id>/evidence/v1.6-feature-verify-export.txt",
      "metrics": { "export_file_size_bytes": <int|0>, "skipped": <bool> }
    }
  ]
}
```

**`metrics.numTotalTests` / `numFailedTests` 从 vitest JSON reporter 的 `numTotalTests` / `numFailedTests` 字段直接取**（不是从人读 stdout 摘出来）。

---

## §V3 READ — 另一只 LLM 判 verdict

派一个 fresh `claudefast -p` (cache-cold) 实例，**只读** `.judge/<run_id>/judge.json` + 必要 evidence 文件（不再 reread 源码、不再 reread plan.md），输出 verdict。

Probe prompt（顶 ≤ 800 tokens）：

```
You are an independent verdict judge for a TeamBrain slice 2a PR (issue #332).
You can ONLY read these files:
- {run_id}/judge.json (canonical metrics)
- {run_id}/evidence/v1.1-typecheck.log
- {run_id}/evidence/v1.2-mock-responder.log
- {run_id}/evidence/v1.3-l4-pipeline.log
- {run_id}/evidence/v1.4-adapters-broad.log
- {run_id}/evidence/v1.5-diff-files.log

Do NOT read the source code. Do NOT read the plan. Do NOT speculate.

Verdict rules (all hard):
  V1.1 PASS  iff tools[v1.1-typecheck].exit_code == 0 AND metrics.errors == 0
  V1.2 PASS  iff tools[v1.2-mock-responder].exit_code == 0
             AND metrics.numFailedTests == 0
             AND metrics.numTotalTests >= 6
  V1.3 PASS  iff tools[v1.3-l4-pipeline].exit_code == 0
             AND metrics.numFailedTests == 0
             AND metrics.numTotalTests >= 1
  V1.4 PASS  iff tools[v1.4-adapters-broad].exit_code == 0
             AND metrics.numFailedTests == 0
  V1.5 PASS  iff tools[v1.5-diff-files].metrics.unexpected_files is empty array
             AND metrics.file_count between 7 and 8 inclusive
             (8 includes optional report.md)
  V1.6 may be SKIPPED iff metrics.skipped == true (does not block verdict)
       else PASS iff exit_code == 0 AND export_file_size_bytes > 0

Overall verdict:
  - "pass" iff V1.1 + V1.2 + V1.3 + V1.4 + V1.5 all PASS
    (V1.6 PASS or SKIPPED both OK)
  - "fail" iff any of V1.1..V1.5 FAIL
  - "uncertain" iff any required metric is missing / malformed
    (e.g. numFailedTests is null because reporter crashed)

Output JSON ONLY, no prose:
{
  "verdict": "pass" | "fail" | "uncertain",
  "v1_results": {
    "v1.1": "pass" | "fail",
    "v1.2": "pass" | "fail",
    "v1.3": "pass" | "fail",
    "v1.4": "pass" | "fail",
    "v1.5": "pass" | "fail",
    "v1.6": "pass" | "fail" | "skipped"
  },
  "next_step": "<one short sentence>"
}
```

落盘：`.judge/<run_id>/verdict.json`。

**Verdict gate（PR 不能开除非这一步 PASS）**：
- `verdict == "pass"` → main agent 可继续走 atomic commits + open PR
- `verdict == "fail"` → main agent 回 implementation 修，写完后 re-run §V1（不重写本 judge.md）
- `verdict == "uncertain"` → main agent 复审 raw evidence，决定是 (a) re-run V1 拿 cleaner reporter output；(b) 把对应 V1 标 `skipped: true` 然后接受 partial pass

---

## 项目级 feature-verification gate 与本 judge.md 的关系

- `docs/feature-verification.md` 是仓库通用的 feature gate，定义两条路径（CLI canonical JSON / tmux `/export`）
- 本 slice 不引入新 CLI，所以路径 1 inapplicable；路径 2 在本 judge 的 V1.6 covered（advisory，不阻塞）
- 这一安排对齐 `docs/HOWTO-PLAN-PR.md` §3a 的语义：feature-verification gate 是 plan-wide gate，本 judge.md 是 plan-specific 的 V1/V2/V3 harness，**两者并列、不互相替代**

## 拒绝以下任何替代 verdict 路径（已被 user-memory 锁死）

- ❌ `pnpm test` exit code 自评（代码自己当裁判 → `feedback_verification_only_judge_harness.md`）
- ❌ MAIN agent 自己读完 vitest 输出后总结 "看起来都过了"（self-evaluation → `feedback_judge_harness_md_playbook.md`）
- ❌ `pnpm teamagent calibrate` self-report log（CLI 跑自己 → `feedback_verification_only_judge_harness.md`）
- ❌ `scripts/*.sh` 固定 bash judge（hard rule → `docs/HOWTO-PLAN-PR.md` §3b）
- ❌ ChatGPT / Codex web review（不在本仓库 trust boundary 内）
