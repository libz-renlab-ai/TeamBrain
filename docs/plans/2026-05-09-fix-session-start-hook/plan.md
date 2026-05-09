```
                ___        ___        ___
               |fix|  -->  |test| -->  |verify|
               |___|       |___|        |___|
                 |           |            |
                 v           v            v
         ast-context.ts  contract.test  judge harness
                 |           |            |
                 +-----------+------------+
                             |
                             v
                  PR -> /review loop -> squash-merge
```

# Plan: fix session-start hook MODULE_NOT_FOUND

## 1. Task description

把 `packages/core/src/matcher/legacy/ast-context.ts` 里顶层的 value-import `web-tree-sitter` 改造为 lazy 动态 import，让 SessionStart bundle 不再在加载阶段触发 `require("web-tree-sitter")`。

**做什么**

1. 修改 `packages/core/src/matcher/legacy/ast-context.ts`：
   - 顶层删除 `import { Parser, Language } from "web-tree-sitter"`。
   - 顶层新增 `import type { Parser as ParserType } from "web-tree-sitter"`（仅类型；编译后不留 require）。
   - `initAstMatcher()` 内：`let wts; try { wts = await import("web-tree-sitter"); } catch { initialized = true; return; }`；之后所有 `Parser` / `Language` 引用改成 `wts.Parser` / `wts.Language`。
   - `parsers` Map 的 value 类型改为 `ParserType`，函数签名不变。
2. 在 `packages/cli/src/__tests__/hook-bundle-contract.test.ts` 里加一条新断言：built `dist/bin-session-start.cjs` 中**不得**出现顶层 `var ... = require("web-tree-sitter")`；唯一允许形态是包在 `Promise.resolve().then(() => require(...))` 风格的 dynamic-import shim 里。
3. 不改 tsup config、不改 `match.ts`、不改 `keyword-matcher.ts`、不改 `~/.teamagent/hooks/` 已 staged 的 bin。

**怎么做**

- 直接 Edit ast-context.ts、Edit hook-bundle-contract.test.ts。
- 跑 `pnpm typecheck` + `pnpm --filter @teamagent/cli run build:hook` + 新加的 vitest 断言确认。
- 跑 judge harness（见 §3）作为 LLM 判伪。

**不做什么**

- 不改 `packages/teamagent/tsup.config.ts` / `packages/cli/tsup.hook.config.ts` 的 external/noExternal 列表。
- 不复制 wasm 到 `~/.teamagent/hooks/`。
- 不动 matcher 在 web-tree-sitter 缺席时的语义降级（已经在 `isInsideCommentOrString` 里返回 false）。
- 不写 follow-up issue 把上面两条扔出去——单独 PR 解释清楚就行。

## 2. Expected outputs

| 类别 | 交付物 |
|---|---|
| 源码改动 | `packages/core/src/matcher/legacy/ast-context.ts`（lazy import） |
| 测试改动 | `packages/cli/src/__tests__/hook-bundle-contract.test.ts`（新增 top-level require 断言） |
| 计划文档 | `docs/plans/2026-05-09-fix-session-start-hook/{research,plan,judge,report}.md` |
| 构建产物 | `packages/cli/dist/bin-session-start.cjs` 不含顶层 `var .. = require("web-tree-sitter")` |
| 运行验证 | `printf '{"hook_event_name":"SessionStart","cwd":"/tmp"}' \| node packages/cli/dist/bin-session-start.cjs` exit 0，stderr 无 MODULE_NOT_FOUND |
| 单元测试 | `pnpm --filter @teamagent/cli test --run hook-bundle-contract` 全绿 |
| 类型检查 | `pnpm typecheck` 全绿 |
| PR | 普通 (非 draft) PR，body 含 task/output/judge 三段，`/review` skill 循环 PASS 后 squash-merge |

## 3. How-to-eval (third-party judge harness)

详见 `judge.md`。骨架：

- **RUN**（固定工具，由 main agent dispatch，不让被测代码自己评）：
  1. `pnpm typecheck`
  2. `pnpm --filter @teamagent/cli run build:hook`
  3. `grep -nE 'var [A-Za-z_0-9]+ = require\("web-tree-sitter"\)' packages/cli/dist/bin-session-start.cjs`（期望 exit code 1，即 0 行）
  4. `printf '{"hook_event_name":"SessionStart","cwd":"/tmp"}' | node packages/cli/dist/bin-session-start.cjs ; echo $?`
  5. `pnpm --filter @teamagent/cli test --run src/__tests__/hook-bundle-contract.test.ts`
- **DUMP**：把每一步的 `exit_code` / `stdout_path` / `stderr_path` / `grep_count` 写到 `.judge/<run_id>/judge.json` + 原始 stdout/stderr 单独文件。
- **READ**：另起一个 `claudefast -p` 只读 raw `judge.json` + 必要 evidence，给出 PASS/FAIL 一行结论 + 命中证据；禁止它读源码、禁止它跑工具，只能读 JSON。

## 4. Risks / rollback

- **风险 1**：动态 import 失败时 matcher 静默降级，可能掩盖真正的 web-tree-sitter 安装问题。  
  **缓解**：catch 块里写 `console.warn` 一行 hint（"web-tree-sitter not resolvable; AST filter disabled"），但只在 `process.env.TEAMAGENT_DEBUG === "1"` 时打。
- **风险 2**：esbuild 把 `await import("web-tree-sitter")` 编译为 `Promise.resolve().then(() => require("web-tree-sitter"))`，仍然可能在异步上下文里触发同步 require。但此 require 仅在调用 `initAstMatcher()` 时执行，SessionStart 不会走到那里 → 实际安全。
- **回滚**：单 commit revert 即可恢复顶层静态 import 行为；测试也跟着回滚。

## 5. Done definition

- 所有 expected outputs 全部绿。
- judge harness `judge.json` 里所有步骤 `exit_code === 0`（除 grep 那步期望 exit 1 / count 0）。
- PR 通过 `/review` skill 循环 PASS。
- `gh pr merge <N> --squash --delete-branch` 后 `git pull --ff-only` 同步成功；写 `report.md` 记录实际结果与偏差。
