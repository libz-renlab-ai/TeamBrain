#!/usr/bin/env node
/**
 * Stop Hook entry point — HookShell migration (final M6 fused-PR bin).
 *
 * stdin: StopHookInput { session_id, transcript_path, cwd, hook_event_name }
 *
 * Mode selection:
 *   - sync (legacy default): runHook handler awaits runStopPipeline, then exits
 *   - async (recommended):    foreground handler spawns a detached child of self
 *                              and returns immediately; the child re-enters via
 *                              escape.detached and runs the pipeline
 *
 * Incremental vs full:
 *   - Stop hook: incremental (uses .teamagent/scan-cursor.json)
 *   - SessionEnd / PreCompact (via runStopPipeline({fullRescan:true})): full
 *
 * NEVER exits non-zero — runAdvancedHook always exits 0.
 *
 * 走 `runAdvancedHook` 的原因：
 *   1. detached self-spawn — 用 `escape.detached` 注入 argv 探针 + tmp-file
 *      reader，让 HookShell 在父子两条路径上各自取到正确的 input。
 *   2. `manualResources: true` — pipeline 内部按 step 自己 open/close DB
 *      （DualLayerStore + SqliteEventLog），HookShell 不该自动开 DB。
 *   3. `pipelineTimeoutMs` — 240s 上限，避免 harness 300s 强杀前没法清理。
 *      lock 文件仍由 `runStopPipeline` 自身 mkdir/写入/清理，不走 escape.lock：
 *      bin-stop.test.ts 在 `runStopPipeline` 直接调用层断言 lock 行为，shell
 *      escape.lock 只在 main 进入 handler 时持有，会 break 这些测试。
 *
 * 12+ 条 user-visible `process.stderr.write("TeamAgent: ...")` 改造：通过
 * `RunStopPipelineOptions.emit` 注入一个 `(AttributionEvent) => void`。
 *   - 从 `runAdvancedHook` 进来的调用，emit 绑到 `ctx.bus.emit` —— shell 注入
 *     的 StdoutRenderer 订阅会按 visibility 渲染到 stderr。
 *   - 测试 / `runFullRescanPipeline` 等直接调用层不传 emit，落到
 *     `process.stderr.write` 兜底，行为与迁移前一致。
 *
 * 这样三个外部消费点不动：
 *   - `bin-stop.test.ts`        直接 import { runStopPipeline } 不传 emit
 *   - `bin-session-end.ts`      调 `runFullRescanPipeline(input)` 不传 emit
 *   - `bin-pre-compact.ts`      调 `runFullRescanPipeline(input)` 不传 emit
 *
 * 这是 M6 fused PR 的最后一个简单 bin 迁移。
 */
import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync, existsSync, unlinkSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ClaudeCodeLLMClient,
  DualLayerStore,
  SqliteEventLog,
  openDb,
  syncRuleVectors,
  XenovaRuleEmbedder,
  SqliteSemanticRetriever,
} from "@teamagent/adapters";
import type { LLMClient } from "@teamagent/ports";
import type { AttributionEvent } from "@teamagent/types";
import { parseSessionFile, semanticMatch, buildSemanticDescriptions } from "@teamagent/core";
import { executeAnalyze, type AnalyzeMeta } from "./commands/analyze.js";
import { executeCalibrate } from "./commands/calibrate.js";
import { executeCompile } from "./commands/compile.js";
import { executeScanErrors } from "./commands/scan-errors.js";
import { readTeamAgentConfig } from "./commands/config.js";
import { readCursor, writeCursorAndSeen, clearCursor, readSeen } from "./scan-cursor.js";
import { appendHarvest } from "./harvest-writer.js";
import { makeFallbackLLMClient } from "./llm-with-fallback.js";
import { runStopNarrativeScan, readLastInjected, lastInjectedFilePath } from "./stop-narrative-scan.js";
import { rotateIfTooLarge } from "./log-rotate.js";
import { runAdvancedHook } from "./hook-shell/index.js";
import type { AdvancedHookOptions } from "./hook-shell/index.js";
import { findTeamagentRoot } from "./find-teamagent-root.js";

/**
 * 用户可见进度事件的注入入口。
 *
 * `runAdvancedHook` 路径会传 `(e) => ctx.bus.emit(e)`；其它直接调用方（测试、
 * `runFullRescanPipeline` 经由 bin-session-end / bin-pre-compact）不传，落到
 * stderr 兜底。这样既不破坏既有 stderr 输出契约，bin-stop 自己的 cjs entry
 * 又能把同样的进度事件走 AttributionBus → StdoutRenderer 渲染。
 */
type EmitFn = (event: AttributionEvent) => void;

function emitWithFallback(emit: EmitFn | undefined, event: AttributionEvent, fallbackText: string): void {
  if (emit) {
    emit(event);
    return;
  }
  try { process.stderr.write(fallbackText); } catch { /* best-effort */ }
}

function nowIso(): string { return new Date().toISOString(); }

// ---- Lazy singleton for semantic embedder (shared across Stop calls in same process) ----
let _stopEmbedder: XenovaRuleEmbedder | null = null;
function getStopEmbedder(): XenovaRuleEmbedder {
  if (!_stopEmbedder) _stopEmbedder = new XenovaRuleEmbedder();
  return _stopEmbedder;
}

/** 每次 Stop 补全最多 BATCH 条缺向量的规则（fire-and-forget，不阻塞主流程）。 */
async function catchUpVectorization(
  projectDbPath: string,
  embedder: XenovaRuleEmbedder,
  emit: EmitFn | undefined,
  batch = 15,
): Promise<void> {
  const vdb = openDb(projectDbPath);
  try {
    const rows = (vdb.prepare(
      `SELECT id, trigger, wrong_pattern, correct_pattern, reasoning
       FROM knowledge
       WHERE COALESCE(trigger_description, '') = '' AND status != 'archived'
       LIMIT ?`,
    ).all(batch) as Array<{ id: string; trigger: string; wrong_pattern: string; correct_pattern: string; reasoning: string }>);

    if (rows.length === 0) return;

    for (const r of rows) {
      const desc = buildSemanticDescriptions({
        trigger: r.trigger,
        wrong_pattern: r.wrong_pattern,
        correct_pattern: r.correct_pattern,
        reasoning: r.reasoning,
      });
      const [tv, pv] = await embedder.embed([desc.trigger_description, desc.pattern_description]);
      if (tv && pv) {
        vdb.prepare(
          "UPDATE knowledge SET trigger_description=?, pattern_description=?, embedder_model_id=? WHERE id=?",
        ).run(desc.trigger_description, desc.pattern_description, "Xenova/multilingual-e5-small", r.id);
        syncRuleVectors(vdb, r.id, new Float32Array(tv), new Float32Array(pv));
      }
    }
    emitWithFallback(
      emit,
      {
        kind: "hook-stop.rules-vectorized",
        source: "hook-stop",
        severity: "info",
        timestamp: nowIso(),
        count: rows.length,
      },
      `TeamAgent: 向量化补全 ${rows.length} 条规则\n`,
    );
  } finally {
    vdb.close();
  }
}

export interface StopHookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: string;
}

export interface RunStopPipelineOptions {
  /** true → 忽略 cursor,扫整个 session (SessionEnd/PreCompact 用) */
  fullRescan?: boolean;
  /** 模式标签,仅用于 harvest md 记录 */
  modeTag?: "incremental" | "full";
  /**
   * 用户可见进度事件 sink。HookShell 路径传 `ctx.bus.emit` 让 StdoutRenderer
   * 渲染；测试 / 其它 bin 直接调用时不传，stderr 兜底。
   */
  emit?: EmitFn;
}

/** Pipeline hard timeout. Harness kills us at its own timeout (~300s); we guard below. */
const PIPELINE_TIMEOUT_MS = (() => {
  const envVal = parseInt(process.env.TEAMAGENT_STOP_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(envVal) && envVal > 0 ? envVal : 240_000;
})();

function isRetryableAnalyzeError(e: unknown): boolean {
  const msg = String(e);
  return (
    msg.includes("Session not found") ||
    msg.includes("permission denied") ||
    msg.includes("EACCES") ||
    msg.includes("EPERM") ||
    msg.includes("EBUSY")
  );
}

/** Lock file used by the statusline to show "Stop 运行中" indicator. */
const STOP_LOCK_RELATIVE = path.join(".teamagent", ".stop-running.lock");

function writeStopLock(cwd: string): string {
  const lockPath = path.join(cwd, STOP_LOCK_RELATIVE);
  try {
    mkdirSync(path.dirname(lockPath), { recursive: true });
    writeFileSync(
      lockPath,
      JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() }),
      "utf-8",
    );
  } catch {
    // lock is best-effort — statusline will simply not show the indicator
  }
  return lockPath;
}

function removeStopLock(lockPath: string): void {
  try {
    if (existsSync(lockPath)) unlinkSync(lockPath);
  } catch {
    // silent
  }
}

/** Build the Haiku-primary Sonnet-fallback LLM client. Overridable by env. */
function buildLLMClient(): LLMClient {
  const primaryModel = process.env.TEAMAGENT_LLM_MODEL ?? "haiku";
  const fallbackModel = process.env.TEAMAGENT_LLM_FALLBACK_MODEL ?? "sonnet";
  const primary = new ClaudeCodeLLMClient({ model: primaryModel });
  if (primaryModel === fallbackModel) return primary;
  const fallback = new ClaudeCodeLLMClient({ model: fallbackModel });
  return makeFallbackLLMClient(primary, fallback);
}

export async function runStopPipeline(
  input: StopHookInput,
  opts: RunStopPipelineOptions = {},
): Promise<void> {
  const cwd = input.cwd;
  const fullRescan = opts.fullRescan === true;
  const modeTag = opts.modeTag ?? (fullRescan ? "full" : "incremental");
  const emit = opts.emit;
  const lockPath = writeStopLock(cwd);
  try {

  // Load incremental state
  const sessionId = input.session_id;
  const fromTurnIndex = fullRescan ? undefined : (readCursor(cwd, sessionId) >= 0 ? readCursor(cwd, sessionId) : undefined);
  const seen = fullRescan ? new Set<string>() : readSeen(cwd, sessionId);
  const newlySeen = new Set<string>();

  let analyzeMeta: AnalyzeMeta | undefined;

  // Step 1: analyze. Claude Code can fire Stop before the transcript jsonl
  // finishes flushing to disk, or the file may still be locked on Windows
  // (EACCES/EPERM). Retry up to 4 times with back-off.
  //
  // B-070: subagent / vitest / and other ephemeral session IDs never persist
  // a transcript to ~/.claude/projects/. For those, retry is wasted time + log
  // spam. Fast-path: if transcript_path is set but doesn't exist after the
  // initial wait, skip analyze entirely (calibrate/compile still run).
  try {
    emitWithFallback(
      emit,
      {
        kind: "hook-stop.analyze-started",
        source: "hook-stop",
        severity: "info",
        timestamp: nowIso(),
        modeTag,
      },
      `TeamAgent: 分析会话中 (${modeTag})...\n`,
    );
    // Small initial wait: Claude Code may still hold the transcript file lock
    // when Stop fires on Windows.
    await new Promise((r) => setTimeout(r, 300));

    if (input.transcript_path && !existsSync(input.transcript_path)) {
      // Subagent or vitest session — transcript will never appear. Skip
      // quietly (info-level stderr, no stop-errors.log entry).
      emitWithFallback(
        emit,
        {
          kind: "hook-stop.analyze-skipped",
          source: "hook-stop",
          severity: "info",
          timestamp: nowIso(),
          reason: "transcript 未落盘，可能是子任务/测试 session",
        },
        `TeamAgent: 跳过 analyze (transcript 未落盘，可能是子任务/测试 session)\n`,
      );
    } else {
      let lastErr: unknown;
      let analyzed = false;
      const llmClient = buildLLMClient();
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          const result = await executeAnalyze({
            session: input.transcript_path,
            commit: true,
            cwd,
            fromTurnIndex,
            llmClient,
            isMomentSeen: (sig) => seen.has(sig),
            markMomentSeen: (sig) => { newlySeen.add(sig); seen.add(sig); },
            onMeta: (m) => { analyzeMeta = m; },
            embedder: getStopEmbedder(),
          });
          const firstLine = result.split("\n")[0] ?? "分析完成";
          emitWithFallback(
            emit,
            {
              kind: "hook-stop.analyze-finished",
              source: "hook-stop",
              severity: "info",
              timestamp: nowIso(),
              firstLine,
            },
            `TeamAgent: ${firstLine}\n`,
          );
          analyzed = true;
          break;
        } catch (e) {
          lastErr = e;
          if (!isRetryableAnalyzeError(e) || attempt === 4) break;
          await new Promise((r) => setTimeout(r, attempt * 1500));
        }
      }
      if (!analyzed) throw lastErr;
    }
  } catch (e) {
    logError(cwd, "analyze", e);
  }

  // Persist cursor + seen so next incremental Stop can skip
  if (analyzeMeta) {
    try {
      // B-051: use atomic combined write to prevent TOCTOU race in async mode
      if (analyzeMeta.lastTurnIndex >= 0 || seen.size > 0 || newlySeen.size > 0) {
        writeCursorAndSeen(cwd, sessionId, analyzeMeta.lastTurnIndex, seen);
      }
    } catch (e) {
      logError(cwd, "persist-cursor", e);
    }
  }

  // Step 2: calibrate
  try {
    emitWithFallback(
      emit,
      {
        kind: "hook-stop.calibration-started",
        source: "hook-stop",
        severity: "info",
        timestamp: nowIso(),
      },
      "TeamAgent: 校准置信度中...\n",
    );
    await executeCalibrate({ cwd });
    emitWithFallback(
      emit,
      {
        kind: "hook-stop.calibration-finished",
        source: "hook-stop",
        severity: "info",
        timestamp: nowIso(),
      },
      "TeamAgent: 校准完成\n",
    );
  } catch (e) {
    logError(cwd, "calibrate", e);
  }

  // Step 3: Skill export
  try {
    emitWithFallback(
      emit,
      {
        kind: "hook-stop.skills-updating",
        source: "hook-stop",
        severity: "info",
        timestamp: nowIso(),
      },
      "TeamAgent: 更新 Skills 中...\n",
    );
    const r = await executeCompile({ cwd, legacyClaudeMd: false });
    emitWithFallback(
      emit,
      {
        kind: "hook-stop.skills-exported",
        source: "hook-stop",
        severity: "info",
        timestamp: nowIso(),
        count: r.skills.written.length,
      },
      `TeamAgent: Skills 导出 ${r.skills.written.length} 条；docs propagation 由新增规则调度\n`,
    );
    try {
      const { getRecentEntries } = await import("./commands/recent-entries.js");
      const recent = await getRecentEntries(cwd);
      if (recent.length > 0) {
        process.stdout.write(`✦ TeamAgent 本会话学到 ${recent.length} 条新经验\n`);
        for (const e of recent) {
          process.stdout.write(`  · ${e.tldr} [${e.confidence.toFixed(2)}]\n`);
        }
      }
    } catch {
      // summary failure must not affect main flow
    }
  } catch (e) {
    logError(cwd, "compile", e);
  }

  // Step 4: persist harvest markdown (always — even if meta missing, record that a run happened)
  try {
    appendHarvest(cwd, {
      sessionId,
      mode: modeTag,
      lastTurnIndex: analyzeMeta?.lastTurnIndex ?? -1,
      correctionsFound: analyzeMeta?.correctionsFound ?? 0,
      extracted: analyzeMeta?.extracted ?? 0,
      skipped: analyzeMeta?.skipped ?? 0,
      failed: analyzeMeta?.failed ?? 0,
      rejected: analyzeMeta?.rejected ?? 0,
      deduped: analyzeMeta?.deduped ?? 0,
      newEntries: analyzeMeta?.newEntries ?? [],
    });
  } catch (e) {
    logError(cwd, "harvest", e);
  }

  // Step 4.5: catch-up vectorization —补全缺向量的老规则（fire-and-forget，最多 15 条/次）
  const catchUpDbPath = path.join(findTeamagentRoot(cwd), ".teamagent", "knowledge.db");
  if (existsSync(catchUpDbPath)) {
    catchUpVectorization(catchUpDbPath, getStopEmbedder(), emit).catch(() => {/* best-effort */});
  }

  // Step 5: scan-errors → candidates.db (opt-out via config). Runs last so
  // the main rules pipeline (analyze/calibrate/compile/harvest) is already
  // durable by the time we do the extra LLM work.
  const stopScanCfg = readTeamAgentConfig(cwd);
  if (stopScanCfg.stop_scan_errors) {
    try {
      emitWithFallback(
        emit,
        {
          kind: "hook-stop.scan-errors-started",
          source: "hook-stop",
          severity: "info",
          timestamp: nowIso(),
        },
        "TeamAgent: 扫描工具失败信号 (scan-errors)...\n",
      );
      const scanTimeoutMs = stopScanCfg.stop_scan_errors_timeout_ms;
      const scanLlm = buildLLMClient();
      const out = await Promise.race<string | null>([
        executeScanErrors({
          mode: "efficient",
          minFreq: 2,
          dryRun: false,
          quiet: true,
          llmClient: scanLlm,
        }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), scanTimeoutMs)),
      ]);
      if (out === null) {
        emitWithFallback(
          emit,
          {
            kind: "hook-stop.scan-errors-timeout",
            source: "hook-stop",
            severity: "info",
            timestamp: nowIso(),
            timeoutMs: scanTimeoutMs,
          },
          `TeamAgent: scan-errors 超时 (>${scanTimeoutMs}ms)，跳过\n`,
        );
      } else {
        const lastLine = out.trim().split("\n").filter(Boolean).pop() ?? "";
        if (lastLine) {
          emitWithFallback(
            emit,
            {
              kind: "hook-stop.scan-errors-progress",
              source: "hook-stop",
              severity: "info",
              timestamp: nowIso(),
              lastLine,
            },
            `TeamAgent: scan-errors ${lastLine}\n`,
          );
        }
      }
    } catch (e) {
      logError(cwd, "scan-errors", e);
    }
  }

  // Step 6 (M4-A): narrative scan on the AI's last assistant turn.
  // Never fails the pipeline — all errors swallowed.
  try {
    const transcriptPath = input.transcript_path;
    if (transcriptPath && existsSync(transcriptPath)) {
      const raw = readFileSync(transcriptPath, "utf-8");
      const parsed = parseSessionFile(raw);
      const lastTurn = parsed.turns.length > 0
        ? parsed.turns[parsed.turns.length - 1]
        : undefined;
      // Run narrative scan whenever there's a last turn — even if aiText is empty.
      // Empty aiText is meaningful: previously-injected rules should be classified
      // as "complied" (the AI didn't repeat the mistake). Previously gating on
      // aiText alone silently skipped compliance scoring for tool-only turns.
      if (lastTurn) {
        const aiText = lastTurn.assistantText ?? "";
        const projectDbPath = path.join(findTeamagentRoot(cwd), ".teamagent", "knowledge.db");
        const globalDbPath = path.join(os.homedir(), ".teamagent", "global.db");
        const eventsDbPath = path.join(os.homedir(), ".teamagent", "events.db");
        const sessionsDir = path.join(os.homedir(), ".teamagent", "sessions");
        mkdirSync(path.dirname(projectDbPath), { recursive: true });
        mkdirSync(path.dirname(globalDbPath), { recursive: true });
        mkdirSync(path.dirname(eventsDbPath), { recursive: true });

        const store = new DualLayerStore({ projectDbPath, userGlobalDbPath: globalDbPath });
        const eventLog = new SqliteEventLog(openDb(eventsDbPath));
        const rules = store.findActive();
        const lastInjected = readLastInjected(sessionsDir, sessionId);

        try {
          runStopNarrativeScan({
            aiText,
            rules,
            sessionId,
            turnIndex: lastTurn!.turnIndex,
            now: new Date().toISOString(),
            pendingDir: sessionsDir,
            emit: (e) => eventLog.append(e),
            lastInjectedKnowledgeIds: lastInjected,
          });

          // Once we've classified (recurred/complied) the last-injected batch,
          // clear the marker so it doesn't re-classify next turn.
          if (lastInjected.length > 0) {
            try { unlinkSync(lastInjectedFilePath(sessionsDir, sessionId)); } catch { /* ignore */ }
          }
        } finally {
          store.close();
          eventLog.close();
        }

        // Step 6b (M4-B): semantic match on AI last turn — supplement to literal scanNarrative.
        // Skipped when TEAMAGENT_MATCHER=legacy or when the vector model is
        // not yet ready (issue #91 two-stage warmup). Never throws (all
        // errors swallowed).
        const { describeWarmupReadiness: descRdy, defaultWarmupStatePath: dwsp } = await import(
          "./warmup-state.js"
        );
        const stopWarmup = descRdy(dwsp(os.homedir()));
        const useLegacyMatcher =
          (process.env.TEAMAGENT_MATCHER ?? "").toLowerCase() === "legacy" ||
          !stopWarmup.ready;
        if (!useLegacyMatcher) {
          try {
            const contextText = lastTurn?.userMessage ?? "";
            const actionText = aiText.slice(0, 500);

            const embedder = getStopEmbedder();
            const semanticDb = openDb(globalDbPath);
            const semanticRetriever = new SqliteSemanticRetriever(semanticDb);

            let semanticHits: import("@teamagent/core").SemanticMatch[];
            try {
              semanticHits = await semanticMatch({
                contextText,
                actionText,
                embedder,
                retriever: semanticRetriever,
                scope: { level: "global" },
              });
            } finally {
              try { semanticDb.close(); } catch { /* ok */ }
            }

            if (semanticHits.length > 0) {
              const semanticEventsDb = openDb(eventsDbPath);
              const semanticEventLog = new SqliteEventLog(semanticEventsDb);
              const nowTs = new Date().toISOString();
              try {
                for (const hit of semanticHits) {
                  semanticEventLog.append({
                    id: `e-sem-bad-${sessionId}-${lastTurn!.turnIndex}-${hit.rule.id}`,
                    kind: "ai.output.bad_pattern",
                    knowledge_id: hit.rule.id,
                    session_id: sessionId,
                    turn_index: lastTurn!.turnIndex,
                    matched_snippet: `[semantic score=${hit.score.toFixed(3)}] ${actionText.slice(0, 80)}`,
                    timestamp: nowTs,
                    schema_version: 1,
                  });
                }
                emitWithFallback(
                  emit,
                  {
                    kind: "hook-stop.semantic-scan-hit",
                    source: "hook-stop",
                    severity: "info",
                    timestamp: nowIso(),
                    count: semanticHits.length,
                  },
                  `TeamAgent: semantic-scan 命中 ${semanticHits.length} 条规则\n`,
                );
              } finally {
                semanticEventLog.close();
              }
            }
          } catch (semErr) {
            logError(cwd, "semantic-scan", semErr);
          }
        }
      }
    }
  } catch (e) {
    logError(cwd, "narrative-scan", e);
  }

  } finally {
    removeStopLock(lockPath);
  }
}

/** Public helper used by bin-session-end / bin-pre-compact to force full scan + clear cursor. */
export async function runFullRescanPipeline(input: StopHookInput): Promise<void> {
  await runStopPipeline(input, { fullRescan: true, modeTag: "full" });
  try {
    clearCursor(input.cwd, input.session_id);
  } catch (e) {
    logError(input.cwd, "clear-cursor", e);
  }
}

/**
 * B-085: tests must be able to redirect TeamAgent state writes (logError,
 * main-crash log) to a tmp dir without monkey-patching `os.homedir()`. Honor
 * `TEAMAGENT_HOME` env var when set, fall back to `os.homedir()` otherwise.
 * In production this env is unset and behavior is unchanged.
 */
function teamagentHomeDir(): string {
  return process.env.TEAMAGENT_HOME ?? os.homedir();
}

function logError(cwd: string, step: string, err: unknown): void {
  try {
    const teamagentDir = path.join(teamagentHomeDir(), ".teamagent");
    mkdirSync(teamagentDir, { recursive: true });
    const logPath = path.join(teamagentDir, "stop-errors.log");
    // B-093: rotate before append so the file does not grow unbounded. The
    // existing 613KB / 3479-line pollution from B-085-era tests will rotate
    // out on the first new append.
    rotateIfTooLarge(logPath);
    const stack = err instanceof Error && err.stack ? `\n  stack: ${err.stack.split("\n").slice(1, 3).join(" | ")}` : "";
    const msg = `[${new Date().toISOString()}] step=${step} cwd=${cwd} err=${String(err)}${stack}\n`;
    appendFileSync(logPath, msg, "utf-8");
  } catch {
    // log write failure must not propagate
  }
}

/** Validator + normalizer used by HookShell.parseInput.
 *
 * Accepts inputs missing `transcript_path` (subagent / vitest sessions) by
 * normalizing to "" so the downstream `existsSync` skip in `runStopPipeline`
 * still kicks in. Mirrors bin-session-end's `normalizeStopHookInput`.
 */
function normalizeStopHookInput(v: unknown): StopHookInput | null {
  if (typeof v !== "object" || v === null) return null;
  const obj = v as Record<string, unknown>;
  if (typeof obj.session_id !== "string") return null;
  if (typeof obj.cwd !== "string") return null;
  const transcript_path =
    typeof obj.transcript_path === "string" ? obj.transcript_path : "";
  const hook_event_name =
    typeof obj.hook_event_name === "string" ? obj.hook_event_name : "Stop";
  return {
    session_id: obj.session_id,
    transcript_path,
    cwd: obj.cwd,
    hook_event_name,
  };
}

/**
 * B-068: env-var leak resilience.
 *
 * Detect whether this invocation is a genuine detached-pipeline child.
 * Requires BOTH env flag set AND argv[2] pointing to an existing tmp file —
 * the env flag alone is insufficient because TEAMAGENT_STOP_PIPELINE=1 has
 * been observed leaking into the foreground hook process (root cause:
 * upstream env inheritance in Claude Code's hook spawn). When env says "I'm
 * a child" but argv proves otherwise, fall through to the foreground stdin
 * path instead of erroring out — this restores the learning loop even when
 * env is polluted.
 */
export function isDetachedPipelineInvocation(
  env: NodeJS.ProcessEnv,
  argv: readonly string[],
  envKey: string = "TEAMAGENT_STOP_PIPELINE",
): boolean {
  if (env[envKey] !== "1") return false;
  const arg = argv[2];
  if (!arg) return false;
  if (!existsSync(arg)) return false;
  return true;
}

/** Read + unlink the tmp-file argv input. Returns null on any IO/parse error. */
function readDetachedInput(argv: readonly string[]): unknown {
  const arg = argv[2];
  if (!arg) return null;
  let text: string;
  try { text = readFileSync(arg, "utf-8"); } catch { return null; }
  try { unlinkSync(arg); } catch { /* ignore cleanup failure */ }
  try { return JSON.parse(text); } catch { return null; }
}

async function main(): Promise<void> {
  await runAdvancedHook<StopHookInput, void, AdvancedHookOptions<StopHookInput, void>>({
    channel: "Stop",
    parseInput: normalizeStopHookInput,
    handler: async (ctx) => {
      const emit: EmitFn = (event) => ctx.bus.emit(event);

      // Genuine detached child: env flag + valid tmp-file argv[2]. Run the
      // pipeline directly (sync mode below converges to same call). Pipeline
      // is unbounded — escape.pipelineTimeoutMs caps the handler at 240s.
      if (isDetachedPipelineInvocation(process.env, process.argv)) {
        await runStopPipeline(ctx.input, { emit });
        return;
      }

      // Normal Stop hook entry. Branch on configured mode.
      const config = readTeamAgentConfig(ctx.cwd);

      if (config.stop_mode === "async") {
        const selfPath = process.argv[1];
        if (!selfPath) {
          ctx.logError("self-path", new Error("process.argv[1] missing — cannot self-spawn"));
          return;
        }
        // Write JSON payload to a temp file instead of passing via argv[2].
        // Windows CreateProcess command-line quoting of JSON strings containing
        // backslashes and double-quotes is fragile; a temp file is unambiguous.
        const tmpFile = path.join(
          os.tmpdir(),
          `teamagent-stop-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
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
          env: { ...process.env, TEAMAGENT_STOP_PIPELINE: "1" },
          // CRITICAL on Windows: without this, every detached spawn opens a
          // new console window. In async mode that fires on every session
          // close, so users see a flurry of popups. Must hide.
          windowsHide: true,
        });
        child.on("error", (err) => {
          ctx.logError("spawn-detached", err);
          try { if (existsSync(tmpFile)) unlinkSync(tmpFile); } catch { /* ignore */ }
        });
        child.unref();
        return;
      }

      // sync mode: run pipeline inline. escape.pipelineTimeoutMs caps duration.
      await runStopPipeline(ctx.input, { emit });
    },
    escape: {
      // pipeline opens its own DBs per-step (DualLayerStore + SqliteEventLog
      // for narrative-scan, openDb for vectorization, etc). HookShell should
      // not auto-open and force handlers to share resources.
      manualResources: true,
      // Pipeline duration cap — harness kills us at its own ~300s timeout if
      // we don't return first. Override via TEAMAGENT_STOP_TIMEOUT_MS.
      pipelineTimeoutMs: PIPELINE_TIMEOUT_MS,
      detached: {
        isDetachedInvocation: (env, argv) => isDetachedPipelineInvocation(env, argv),
        readArgvInput: (argv) => readDetachedInput(argv),
      },
    },
  });
}

// Guard: only auto-invoke main() when this bundle IS the entry point.
// bin-session-end.ts and bin-pre-compact.ts import runFullRescanPipeline /
// isDetachedPipelineInvocation from this module, which causes tsup to inline
// all of bin-stop.ts (including this top-level call) into their .cjs bundles.
// Without this guard both bundles call main(), consuming stdin inside
// bin-session-end.cjs / bin-pre-compact.cjs and making their real main()
// see empty stdin. Check argv[1] to distinguish.
if (path.basename(process.argv[1] ?? "").startsWith("bin-stop")) {
  main().catch((e) => {
    try {
      // B-085: honor TEAMAGENT_HOME (matches logError/teamagentHomeDir).
      const logPath = path.join(teamagentHomeDir(), ".teamagent", "stop-errors.log");
      // B-093: same rotation policy as logError above.
      rotateIfTooLarge(logPath);
      appendFileSync(
        logPath,
        `[${new Date().toISOString()}] main-crash err=${String(e)}\n`,
        "utf-8",
      );
    } catch { /* silent */ }
    // Defensive — runAdvancedHook already does process.exit(0), but if main
    // throws synchronously before reaching the shell we still want exit 0.
    process.exit(0); // never block session close
  });
}

