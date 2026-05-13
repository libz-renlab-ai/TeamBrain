#!/usr/bin/env node
/**
 * SessionEnd Hook 入口 — HookShell migration (commit X of M6 fused PR).
 *
 * 触发于 /clear、logout、Ctrl+C at prompt、关闭窗口。该 hook 永远走「detached
 * 异步」模式：foreground 进程只负责 spawn 一个独立子进程后立即返回，子进程
 * 以 `TEAMAGENT_SESSION_END_PIPELINE=1` 标志重新执行同一个 bin 完成全量
 * rescan + cursor 清空。Hook 必须从不阻塞 UI close、从不退出非零。
 *
 * 走 `runAdvancedHook` 的原因：
 *   1. detached self-spawn — 用 `escape.detached` 注入 argv 探针 + tmp-file
 *      reader，让 HookShell 在父子两条路径上各自取到正确的 input。
 *   2. `manualResources: true` — 父路径只 spawn 不开 sqlite；子路径调用
 *      `runFullRescanPipeline` 内部自己 open/close 资源。无论哪边 HookShell
 *      都不该自动开 DB，否则父进程为了「立即退出」也要付一次 sqlite 打开
 *      关闭成本。
 *
 * 本 bin 自身不向 stderr 写任何 user-visible 文案——pipeline 内的进度文案
 * 由 `runStopPipeline` 直接 `process.stderr.write` 输出，迁移到 AttributionBus
 * 是 bin-stop 那条 worker 线的范围。所以这里没有 `bus.emit` 调用，
 * AttributionEvent 当前 union 也没有 `hook-session-end.*` kind（commit 4 已
 * 冻结，不应在本 worker 里新增）。
 *
 * 注意：bin 被 tsup 打包成 cjs，cjs 不支持 top-level await，所以包一层
 * `async main` + `void main()`。runAdvancedHook 的 try/finally 保证不向外
 * 抛错，main 不需要 .catch。
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { runAdvancedHook } from "./hook-shell/index.js";
import type { AdvancedHookOptions } from "./hook-shell/index.js";
import {
  isDetachedPipelineInvocation,
  runFullRescanPipeline,
  type StopHookInput,
} from "./bin-stop.js";
import { postShutdown } from "./embedder-client.js";
import { emitCcStatus } from "./realtime-emit.js";

const SESSION_END_ENV_KEY = "TEAMAGENT_SESSION_END_PIPELINE";

/**
 * Validator + normalizer. Pre-migration the bin did `JSON.parse(raw) as
 * StopHookInput` with no validation; HookShell requires a real type guard
 * via `parseInput`. We accept inputs missing `transcript_path` (subagent /
 * vitest sessions never persist a transcript) by normalizing to "" so the
 * downstream `existsSync` skip in `runStopPipeline` still kicks in.
 */
function normalizeStopHookInput(v: unknown): StopHookInput | null {
  if (typeof v !== "object" || v === null) return null;
  const obj = v as Record<string, unknown>;
  if (typeof obj.session_id !== "string") return null;
  if (typeof obj.cwd !== "string") return null;
  const transcript_path =
    typeof obj.transcript_path === "string" ? obj.transcript_path : "";
  const hook_event_name =
    typeof obj.hook_event_name === "string" ? obj.hook_event_name : "SessionEnd";
  return {
    session_id: obj.session_id,
    transcript_path,
    cwd: obj.cwd,
    hook_event_name,
  };
}

async function main(): Promise<void> {
  await runAdvancedHook<StopHookInput, void, AdvancedHookOptions<StopHookInput, void>>({
    channel: "SessionEnd",
    parseInput: normalizeStopHookInput,
    handler: async (ctx) => {
      // Issue #343 PR-1: master kill switch. When TEAMAGENT_DISABLED=1 the
      // SessionEnd hook bails before the embedder daemon shutdown POST,
      // before the full-rescan pipeline (detached path), and before the
      // foreground self-spawn (sync path). One check at handler entry
      // covers both branches.
      if (ctx.env.TEAMAGENT_DISABLED === "1") {
        return;
      }

      // Genuine detached child: env flag + valid tmp-file argv[2]. Run full
      // rescan pipeline (clears cursor + ignores incremental cursor). Pipeline
      // is unbounded — the harness kills us at its own ~300s timeout if needed.
      if (isDetachedPipelineInvocation(process.env, process.argv, SESSION_END_ENV_KEY)) {
        await runFullRescanPipeline(ctx.input);
        return;
      }

      // Issue #308 grill §11: SessionEnd also signals presence offline (the
      // user closed the window / ran /clear / Ctrl+C). Emit on the
      // foreground entry only, mirroring the Stop hook contract: one
      // SessionEnd → one POST, not double-counted by the self-spawned child
      // (the detached branch above already returned before reaching here).
      try {
        emitCcStatus({
          event: "session_end",
          sessionId: ctx.input.session_id,
          cwd: ctx.cwd,
        });
      } catch { /* never propagate */ }

      // Issue #164: best-effort POST /shutdown to drop our refcount on the
      // embedder daemon. Daemon decrements its members list; when count
      // reaches 0 it begins exit (releases ~650MB RSS). Fire-and-forget so
      // SessionEnd remains non-blocking.
      try {
        void postShutdown(ctx.input.session_id).catch(() => { /* best-effort */ });
      } catch { /* best-effort */ }

      // Foreground path: write input to tmp file + spawn detached child of
      // self, then return immediately so Claude Code's session close is not
      // blocked. Tmp file avoids Windows command-line quoting fragility for
      // JSON payloads containing backslashes / quotes.
      const selfPath = process.argv[1];
      if (!selfPath) {
        ctx.logError("self-path", new Error("process.argv[1] missing — cannot self-spawn"));
        return;
      }

      const tmpFile = path.join(
        os.tmpdir(),
        `teamagent-session-end-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
      );
      try {
        writeFileSync(tmpFile, JSON.stringify(ctx.input), "utf-8");
      } catch (err) {
        ctx.logError("write-tmp", err);
        return;
      }

      const child = spawn(process.execPath, [selfPath, tmpFile], {
        detached: true,
        stdio: "ignore",
        cwd: ctx.cwd,
        env: { ...process.env, [SESSION_END_ENV_KEY]: "1" },
        // Hide on Windows — without this every detached spawn opens a new
        // console window on session close.
        windowsHide: true,
      });
      child.on("error", (err) => {
        ctx.logError("spawn-detached", err);
        try { if (existsSync(tmpFile)) unlinkSync(tmpFile); } catch { /* ignore */ }
      });
      child.unref();
    },
    escape: {
      // Parent path doesn't touch sqlite — only spawns. Child path runs
      // runFullRescanPipeline which opens its own resources internally.
      // Either way HookShell shouldn't auto-open DBs in this bin.
      manualResources: true,
      detached: {
        isDetachedInvocation: (env, argv) =>
          isDetachedPipelineInvocation(env, argv, SESSION_END_ENV_KEY),
        readArgvInput: (argv) => {
          const arg = argv[2];
          if (!arg) return null;
          let text: string;
          try {
            text = readFileSync(arg, "utf-8");
          } catch {
            return null;
          }
          try { unlinkSync(arg); } catch { /* ignore */ }
          try {
            return JSON.parse(text);
          } catch {
            return null;
          }
        },
      },
    },
  });
}

void main();
