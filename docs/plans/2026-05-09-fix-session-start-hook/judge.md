```
            judge harness (RUN -> DUMP -> READ)
              fixed tools, fixed JSON schema
                ____________________________
               |                            |
               |  third-party LLM judge     |  <-- 只读 raw JSON + evidence
               |____________________________|
                          ^
                          | judge.json
                ____________________________
               |                            |
               |  RUN steps + DUMP writer   |  <-- main agent / claudefast probe
               |____________________________|
```

# Judge harness — fix-session-start-hook

## 不变量

- 被测代码不允许评自己；plan 作者不允许评自己。最终 PASS/FAIL 由独立 LLM 仅基于 `judge.json` 给出。
- 所有 RUN 步骤的工具固定（pnpm / node / grep）；任何工具变化都要先改本文件再跑。
- DUMP 输出位置：`.judge/<run_id>/judge.json` + `.judge/<run_id>/{step_N}.{stdout,stderr}.txt`。

## RUN 步骤（main agent 执行）

| # | 描述 | 命令 | 期望 |
|---|---|---|---|
| 1 | 类型检查 | `pnpm typecheck` | exit 0 |
| 2 | hook 构建 | `pnpm --filter @teamagent/cli run build:hook` | exit 0；产物 `packages/cli/dist/bin-session-start.cjs` 存在 |
| 3 | top-level require guard | `grep -cE 'var [A-Za-z_0-9]+ = require\("web-tree-sitter"\)' packages/cli/dist/bin-session-start.cjs` | stdout = `0`（grep -c 在无匹配时输出 0 但 exit 1） |
| 4 | bin 烟测 | `printf '{"hook_event_name":"SessionStart","cwd":"/tmp"}' \| TEAMAGENT_M5_AUTOSESSION=0 node packages/cli/dist/bin-session-start.cjs` | exit 0；stderr 不含 `MODULE_NOT_FOUND` 与 `Cannot find module 'web-tree-sitter'` |
| 5 | contract test | `pnpm --filter @teamagent/cli test --run src/__tests__/hook-bundle-contract.test.ts` | exit 0；新增的 top-level-require 断言绿 |

## DUMP schema（写到 `.judge/<run_id>/judge.json`）

```json
{
  "run_id": "2026-05-09T<UTC>",
  "fix_pr": "<n or local>",
  "steps": [
    {
      "step": 1,
      "name": "typecheck",
      "cmd": "pnpm typecheck",
      "exit_code": 0,
      "stdout_path": ".judge/<run>/step_1.stdout.txt",
      "stderr_path": ".judge/<run>/step_1.stderr.txt"
    },
    {
      "step": 3,
      "name": "top-level-require-guard",
      "cmd": "grep -cE ... bin-session-start.cjs",
      "exit_code": 1,
      "metric": { "top_level_require_count": 0 },
      "stdout_path": "...",
      "stderr_path": "..."
    },
    {
      "step": 4,
      "name": "bin-smoke",
      "cmd": "printf {...} | node bin-session-start.cjs",
      "exit_code": 0,
      "metric": {
        "stderr_has_module_not_found": false,
        "stderr_has_web_tree_sitter": false
      },
      ...
    }
  ],
  "overall": {
    "pass": true,
    "summary": "no top-level require, smoke exit 0, contract test green"
  }
}
```

`overall.pass` **不允许** main agent 自己写——预填 `null`，由 reader-LLM 填。

## READ 步骤（third-party judge）

main agent dispatch 一个独立的 `claudefast -p`：

```bash
claudefast -p "你是 judge。只读 .judge/<run>/judge.json 与必要的 .judge/<run>/step_*.txt。\n\
判别：\n\
  - 步骤 1/2/4/5 exit_code 必须 0\n\
  - 步骤 3 必须 metric.top_level_require_count == 0\n\
  - 步骤 4 metric.stderr_has_module_not_found 必须 false\n\
  - 步骤 4 metric.stderr_has_web_tree_sitter 必须 false（无任何 web-tree-sitter 报错）\n\
任何一条不满足 → FAIL 并指出哪一条。\n\
输出格式：第一行 'VERDICT: PASS' 或 'VERDICT: FAIL'；之后列证据。\n\
禁止读源码、禁止跑命令、禁止依赖训练记忆——只看 JSON。"
```

reader-LLM 输出存 `.judge/<run>/verdict.txt`，作为 PR review 决断的输入。

## 失败时

- 任意 RUN step 失败 → 修源码或测试，重跑 RUN（不改 judge harness）。
- judge harness 本身有 bug → 改本文件，bump run_id，重跑。
- 不允许把 RUN/DUMP/READ 三段合成一个脚本逃避隔离。
