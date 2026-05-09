```
   ____ ____ ____ ____ ____ ____ ____ ____ ____ ____
  /    /    /    /    /    /    /    /    /    /    \
 |    SessionStart hook MODULE_NOT_FOUND research    |
  \____\____\____\____\____\____\____\____\____\____/
              |
              v
  hook fires --> require("web-tree-sitter") at top of bundle --> X
              ^                                                  |
              |                                                  v
   staged at ~/.teamagent/hooks/ (no node_modules sibling)   E_MOD_NOT_FOUND
```

# 现场观察 (2026-05-09)

## 错误复现

```
$ node /Users/m1/.teamagent/hooks/bin-session-start.cjs
node:internal/modules/cjs/loader:1386
  throw err;
  ^

Error: Cannot find module 'web-tree-sitter'
Require stack:
- /Users/m1/.teamagent/hooks/bin-session-start.cjs
    at ...
    at Object.<anonymous> (/Users/m1/.teamagent/hooks/bin-session-start.cjs:4398:30)
```

Bundle 4398 行：

```js
// ../core/src/matcher/legacy/ast-context.ts
init_cjs_shims();
var import_node_module = require("module");
var import_web_tree_sitter = require("web-tree-sitter");   // ← top-level eager require
var require2 = (0, import_node_module.createRequire)(importMetaUrl);
```

## 调用链

| 层 | 文件 | 触发 |
|---|---|---|
| hook entry | `packages/cli/src/bin-session-start.ts` | `import ... from "./session-start-logic.js"` |
| session-start-logic | (transitively) `@teamagent/core` re-exports | `from "@teamagent/core"` |
| core barrel | `packages/core/src/index.ts` 间接挂到 matcher | 任意 import 都把 `match.ts` 拉进 |
| matcher entry | `packages/core/src/matcher/match.ts:3` | `import { initAstMatcher, isInsideCommentOrString } from "./legacy/ast-context.js"` |
| 病灶 | `packages/core/src/matcher/legacy/ast-context.ts:2` | `import { Parser, Language } from "web-tree-sitter"`（顶层、非动态） |

`bin-session-start.ts` 自己**完全没有**直接调用 matcher（运行时不会进 `initAstMatcher`），但顶层 import 在 ESM/CJS 静态导入图里立即解析，esbuild bundle 时 `web-tree-sitter` 在 `external` 列表（packages/teamagent/tsup.config.ts NATIVE_EXTERNAL）里 → 留作 `require("web-tree-sitter")`。staged bin 在 `~/.teamagent/hooks/` 旁边没有 `node_modules`，于是直接挂掉。

## 同根问题，不同表现

`packages/cli/tsup.hook.config.ts`（dev 时 `pnpm build:hook` 用）`external` 只列 `["sharp", "onnxruntime-node", "jsdom", "sqlite-vec"]`——**未把 `web-tree-sitter` 列入 external**，于是 dev 构建会把 web-tree-sitter 内联进 bundle，运行没事。`packages/teamagent/tsup.config.ts`（npm publish 用）的 `NATIVE_EXTERNAL` 把 `web-tree-sitter` 也外置 → 发布版必崩。`~/.teamagent/hooks/` 里现存 bin 的来源不一致（旧的 pre-tool-use 是 inline 版本，新的 session-start 是 external 版本）。

## 修复方向

让 `ast-context.ts` 顶层不再静态依赖 `web-tree-sitter` 的运行时 value：

1. 顶层只保留 `import type { Parser as ParserType } from "web-tree-sitter"`（编译期擦除，不进 bundle）。
2. `initAstMatcher()` 内部 `await import("web-tree-sitter")` 动态加载；try/catch：找不到模块 → mark initialized + 返回，让 `isInsideCommentOrString` 走"无 parser → 不过滤"分支。

效果：
- SessionStart bundle 不再有 top-level `require("web-tree-sitter")`，dynamic import 包成 `Promise.resolve().then(() => require(...))` 仅在调用 `initAstMatcher()` 时触发；SessionStart 本身从不调用 matcher → 永不触发。
- 其它 hook（PreToolUse/PostToolUse）真正用 matcher 时仍然 try import；若 web-tree-sitter 不可解析则降级为"keyword 匹配 only"，不再硬崩。
- 不动 tsup config，不复制 wasm，不改公共 API（`initAstMatcher` / `isInsideCommentOrString` 签名不变）。

## 边界 / 未做

- `~/.teamagent/hooks/` 下已 staged 的 bin 不会原地修复——用户重新装包或跑 `teamagent install-user-hook` 后才拿到新 bundle。这是"复制 staged bin"问题，不在本 PR 范围。
- 不改 `packages/teamagent/tsup.config.ts` 的 `NATIVE_EXTERNAL`，也不改 `packages/cli/tsup.hook.config.ts` 的 `external`。两份配置之间的发散是另一个独立问题，建议下一个 PR 处理。
- 不动 matcher 的语义降级路径（`isInsideCommentOrString` 在没有 parser 时已经返回 false），现状即"保守不过滤"。
