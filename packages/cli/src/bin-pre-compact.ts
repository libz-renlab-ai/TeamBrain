#!/usr/bin/env node
/**
 * PreCompact Hook entry point — HookShell migration (commit 6 of M6 fused PR).
 *
 * Fires when Claude Code is about to compact the transcript. Performs a full
 * rescan BEFORE compaction so learnings from the soon-to-be-summarized turns
 * are captured in the knowledge base.
 *
 * Two modes (kept identical to bin-session-end's pattern):
 *
 *   1. Foreground hook entry (Claude Code → stdin JSON). Reads input via
 *      `runHook`, spawns a detached child re-entering this same bundle with
 *      env flag `TEAMAGENT_PRE_COMPACT_PIPELINE=1` + the JSON payload as
 *      argv[2]. Returns immediately so compaction UX is never blocked.
 *
 *   2. Detached child (env flag set + argv[2] holds the JSON payload). Skips
 *      HookShell entirely and calls `runFullRescanPipeline` directly — that
 *      pipeline opens its own DualLayerStore / SqliteEventLog / bus and emits
 *      its own AttributionEvents. Wrapping it in `runHook` would double-open
 *      sqlite handles and contend on .teamagent locks for no benefit.
 *
 * Why `runHook` (not `runAdvancedHook`) for the foreground branch: the
 * foreground only spawns a child and returns; HookShell's eager store /
 * eventLog open is a few-ms cost paid once per compaction trigger. Adding
 * `escape.detached` + `manualResources` would complicate the call site to
 * save that cost, so we keep the simpler default-layer wiring per the plan
 * (`docs/plans/2026-05-07-hookshell-attribution-fused-plan.md` commit 6).
 *
 * Note: this bin does NOT emit AttributionEvents itself — the pipeline body
 * inside `runFullRescanPipeline` emits hook-stop.* events for the rescan
 * progress. The foreground branch is a pure "spawn and forget" launcher.
 *
 * NEVER exits non-zero. `runHook` (try/finally → exit 0) and `main().catch`
 * both guarantee that.
 *
 * Note: bin is bundled to cjs (`bin-pre-compact.cjs`); cjs has no top-level
 * await. Wrapped in `async main` + `void main()` per the canary commit (5).
 */
import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runFullRescanPipeline, type StopHookInput } from "./bin-stop.js";
import { runAdvancedHook } from "./hook-shell/index.js";

function isValidStopHookInput(v: unknown): v is StopHookInput {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as StopHookInput).session_id === "string" &&
    typeof (v as StopHookInput).transcript_path === "string" &&
    typeof (v as StopHookInput).cwd === "string"
  );
}

async function main(): Promise<void> {
  // Detached child branch: bypass HookShell entirely. The pipeline body
  // opens its own resources and emits its own AttributionEvents.
  if (process.env["TEAMAGENT_PRE_COMPACT_PIPELINE"] === "1") {
    const input = JSON.parse(process.argv[2] ?? "{}") as StopHookInput;
    await runFullRescanPipeline(input);
    return;
  }

  // Foreground branch: HookShell owns stdin parse + cwd resolution + exit-0
  // guarantee; the handler only schedules the detached child and returns.
  //
  // `escape.manualResources: true` (performance-specialist finding on PR #152
  // /review, same root cause as Codex P1 for bin-updater): default `runHook`
  // eagerly opens DualLayerStore + SqliteEventLog before the handler runs,
  // and DualLayerStore's ctor creates `<cwd>/.teamagent/knowledge.db` even
  // when no rows are written. Foreground PreCompact only spawns a detached
  // child and returns — never touches `ctx.store` / `ctx.eventLog` — so
  // opening sqlite is wasted work AND has the side effect of marking a
  // project as "already initialized" which would flip the next SessionStart
  // auto-init detection. With manualResources the shell never opens sqlite
  // unless the handler explicitly calls the lazy getters, which we don't.
  await runAdvancedHook<StopHookInput, undefined, {
    channel: "PreCompact";
    parseInput: (raw: unknown) => StopHookInput | null;
    escape: { manualResources: true };
    handler: (ctx: { input: StopHookInput; cwd: string }) => undefined;
  }>({
    channel: "PreCompact",
    parseInput: (raw) => (isValidStopHookInput(raw) ? raw : null),
    escape: { manualResources: true },
    handler: (ctx) => {
      // Issue #343 PR-1: master kill switch. When TEAMAGENT_DISABLED=1 the
      // PreCompact hook bails before scheduling the detached child re-entry,
      // so no compact-time analyze pipeline runs. PreCompact's handler type
      // signature (declared above) intentionally narrows ctx to { input, cwd }
      // without env, so read process.env directly here.
      if (process.env.TEAMAGENT_DISABLED === "1") {
        return undefined;
      }
      const selfPath = process.argv[1]!;
      const child = spawn(
        process.execPath,
        [selfPath, JSON.stringify(ctx.input)],
        {
          detached: true,
          stdio: "ignore",
          cwd: ctx.cwd,
          env: { ...process.env, TEAMAGENT_PRE_COMPACT_PIPELINE: "1" },
          windowsHide: true,
        },
      );
      child.unref();
      return undefined;
    },
  });
}

main().catch((e) => {
  try {
    const logPath = path.join(os.homedir(), ".teamagent", "stop-errors.log");
    appendFileSync(
      logPath,
      `[${new Date().toISOString()}] pre-compact-crash err=${String(e)}\n`,
      "utf-8",
    );
  } catch { /* silent */ }
  process.exit(0);
});
