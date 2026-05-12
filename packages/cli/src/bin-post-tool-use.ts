#!/usr/bin/env node
/**
 * PostToolUse Hook 入口 — HookShell canary (commit 5 of M6 fused PR).
 *
 * 全部 stdin/store/eventLog/bus lifecycle 走 `runHook`。本 bin 只负责：
 *   1. 把 `unknown` raw 收窄为 SDK 的 `PostToolUseHookInput`
 *   2. 让 `createPostToolUseHandler({ eventLog })` 写 `hook-post.result`
 *      事件到 SqliteEventLog
 *   3. 返回 handler 的 `{}` 输出，shell 直接 JSON.stringify 到 stdout
 *
 * 这个 channel 没有 `hookSpecificOutput` envelope（PostToolUse 协议直接吃
 * raw JSON），也没有 user-visible system message，因此不需要传 envelope，
 * 也不需要 mirrorSystemMessage。bus.emit 同样不写——AttributionEvent 当前
 * 没有 `hook-post.*` kind（commit 4 已冻结），加 kind 是后续 commit 的事。
 *
 * 注意 1：`ctx.eventLog` 在 HookShell types 里被收窄为 `{ close(): void }`，
 * 但 default layer 实际注入的是 `SqliteEventLog` 实例（`append`/`readLast`
 * 都在）。adapter 的 `createPostToolUseHandler` 只需要 append/readLast 这两
 * 个方法，所以做一次结构化 cast 即可——HookShell 的 minimal type 是给 shell
 * 自身的 lifecycle 用的，不阻碍 handler 拿到完整的 SqliteEventLog 接口。
 *
 * 注意 2：bin 被 tsup 打包成 cjs（`bin-post-tool-use.cjs`），cjs 不支持
 * top-level await。所以包一层 `void main()` 立即调用，main 里用 await。
 * runHook 自带 try/finally 保证不抛出，main 不需要 .catch。
 */
import type { PostToolUseHookInput } from "@anthropic-ai/claude-agent-sdk";
import { createPostToolUseHandler, type SqliteEventLog } from "@teamagent/adapters";
import { runHook } from "./hook-shell/index.js";

async function main(): Promise<void> {
  await runHook<PostToolUseHookInput, Record<string, never>>({
    channel: "PostToolUse",
    parseInput: (raw) =>
      raw && typeof raw === "object" ? (raw as PostToolUseHookInput) : null,
    handler: async (ctx) => {
      // Issue #343 PR-1: master kill switch. When TEAMAGENT_DISABLED=1 the
      // PostToolUse hook returns empty without writing a `hook-post.result`
      // event to SqliteEventLog. PostToolUse is pure observability — no
      // user-visible behaviour change either way.
      if (ctx.env.TEAMAGENT_DISABLED === "1") {
        return {};
      }
      const handler = createPostToolUseHandler({
        eventLog: ctx.eventLog as unknown as SqliteEventLog,
      });
      return handler(ctx.input);
    },
  });
}

void main();
