#!/usr/bin/env node
/**
 * UserPromptSubmit Hook entry point — HookShell migration (M6 fused PR).
 *
 * stdin JSON `{ prompt, session_id, cwd? }` → drain pending narrative warnings,
 * scan user prompt against `user-input` rules, run rule semantic retrieval and
 * recording-memory retrieval → write Claude Code injection envelope to stdout.
 *
 * After this commit, the imperative shell — stdin parse, sqlite open/close,
 * bus subscription, exit lifecycle — is owned by `runHook`. The bin only
 * declares (a) the channel-specific `parseInput` narrowing and (b) the
 * handler closure that fans out to the M4-A injection helpers, the rule
 * retriever, and the recording-memory retriever, then assembles the
 * `hookSpecificOutput` envelope.
 *
 * User-visible side effects move from raw `process.stderr.write` to
 * `ctx.bus.emit({ kind: "user-prompt.injected" | "user-prompt.flagged" })`.
 * The HookShell's wired `StdoutRenderer` turns those into stderr lines per
 * `TEAMAGENT_VISIBILITY`. The `terminalSummary` (rule retriever output) is
 * mirrored to stderr via `ctx.mirrorSystemMessage` so it still honors the
 * `TEAMAGENT_HOOK_STDERR=0` opt-out.
 *
 * Persisted events (`ai.narrative.injected`, `ai.user_input.flagged`,
 * `calibrator.user_reject`) keep going through `eventLog.append` —
 * AttributionEvent is the user-visible bus, PersistedEvent is the audit
 * sink, they don't collapse into one. Cast `ctx.eventLog` to
 * `SqliteEventLog` because HookShell's minimal type only exposes `close()`.
 *
 * Any error: shell catches and exits 0 (never block user input).
 */
import path from "node:path";
import type {
  AttributionEvent,
  KnowledgeEntry,
} from "@teamagent/types";
import {
  type DualLayerStore,
  type SqliteEventLog,
} from "@teamagent/adapters";
import {
  matchPrompt as matchDailyPrompt,
  parseExtraTriggersEnv as parseDailyTriggersEnv,
} from "@teamagent/core";
import { executeDaily } from "./commands/daily.js";
import {
  buildInjectionFromPending,
  persistLastInjected,
  scanUserInput,
  formatUserInputFlag,
} from "./user-prompt-inject.js";
import {
  retrieveRulesForPrompt,
  buildTerminalSummary,
} from "./user-prompt-rule-retriever.js";
import { retrieveRecordingMemoriesForPrompt } from "./commands/recording.js";
import {
  isFirstPrompt,
  appendSessionInjected,
  readSessionInjected,
  touchSessionInjected,
} from "./session-rule-injected.js";
import { runHook } from "./hook-shell/index.js";
import { DaemonFirstEmbedder } from "./daemon-first-embedder.js";
import { emitCcStatus } from "./realtime-emit.js";

const HOOK_TIMEOUT_MS = 5_000;

// ---- Lazy singleton for semantic path (per-process, reused if process is long-lived) ----
// Issue #315: UserPromptSubmit was the one hook that #164 missed wiring to
// the embedder daemon — every prompt submission loaded the 650MB ONNX model
// in-process via `new XenovaRuleEmbedder()` default in retrieveRulesForPrompt.
// Multi-session × per-prompt = RAM bomb → 卡死. Same pattern as
// bin-pre-tool-use / bin-stop: one singleton DaemonFirstEmbedder per process
// that talks to the long-running daemon over HTTP.
let _embedder: DaemonFirstEmbedder | null = null;
function getEmbedder(): DaemonFirstEmbedder {
  if (!_embedder) _embedder = new DaemonFirstEmbedder();
  return _embedder;
}

interface UserPromptInput {
  readonly prompt: string;
  readonly session_id?: string;
}

interface UserPromptOutput {
  readonly hookSpecificOutput: {
    readonly hookEventName: "UserPromptSubmit";
    readonly additionalContext: string;
  };
  readonly systemMessage?: string;
}

// Base time + short random suffix prevents millisecond collisions when the
// hook re-fires rapidly (harness retry, parallel agents, etc).
function stamp(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function main(): Promise<void> {
  await runHook<UserPromptInput, UserPromptOutput>({
    channel: "UserPromptSubmit",
    parseInput: (raw) => {
      if (!raw || typeof raw !== "object") return null;
      const obj = raw as { prompt?: unknown; session_id?: unknown };
      const prompt = typeof obj.prompt === "string" ? obj.prompt : "";
      if (!prompt) return null;
      const sessionId = typeof obj.session_id === "string" ? obj.session_id : undefined;
      return { prompt, session_id: sessionId };
    },
    handler: async (ctx) => {
      // Issue #343 PR-1: master kill switch. When TEAMAGENT_DISABLED=1 the
      // UserPromptSubmit hook bails before pending-injection drain, rule
      // retrieval (semantic + BM25 + embedder daemon round-trip), recording
      // memory retrieval, and Claude Code envelope assembly. Returning
      // undefined yields no injection — Claude Code proceeds with the
      // user's raw prompt only.
      if (ctx.env.TEAMAGENT_DISABLED === "1") {
        return undefined;
      }

      const { input, cwd, home, env, paths, bus } = ctx;
      const prompt = input.prompt;
      const sessionId = input.session_id ?? "";

      // Feature #2 v3: fire-and-forget cc-status push so the boss kanban
      // gets one snapshot per teammate prompt. The 2-channel scope in
      // docs/BUSINESS-FEATURES.md is exactly SessionStart + UserPromptSubmit —
      // this is the second channel. We fire BEFORE the (slow) rule retrieval
      // path so the kanban reflects "what prompt just landed" as early as
      // possible, even when the rest of the hook is still running.
      //
      // Issue #308 grill §3: when the leader has explicitly opted into raw
      // prompt evidence via TEAMAGENT_REALTIME_RAW_PROMPT=1, thread the
      // user's prompt text to the snapshot so the receiver can persist it to
      // raw_events for evidence / replay. Default OFF — the hook is the
      // policy boundary; realtime-emit is the transport. emitCcStatus also
      // enforces loopback-only-by-default + TEAMAGENT_REALTIME_ALLOW_REMOTE,
      // so even with the env opt-in a misconfigured remote URL still fails
      // closed.
      try {
        const includeRawPrompt =
          ctx.env.TEAMAGENT_REALTIME_RAW_PROMPT === "1" && prompt.length > 0;
        emitCcStatus({
          event: "user_prompt_submit",
          ...(sessionId ? { sessionId } : {}),
          cwd,
          ...(includeRawPrompt ? { rawPrompt: prompt } : {}),
        });
      } catch { /* never propagate */ }
      const sessionsDir = path.join(home, ".teamagent", "sessions");
      const eventLog = ctx.eventLog as unknown as SqliteEventLog;
      const store = ctx.store as unknown as DualLayerStore;

      const blocks: string[] = [];

      // M4-A: narrative warnings + user-input flag (fast path, runs first).
      if (sessionId) {
        try {
          const { text: injText, injectedIds } = buildInjectionFromPending({
            sessionsDir,
            sessionId,
          });
          if (injText) blocks.push(injText);

          const rules = store.findActive();
          const userHits = scanUserInput(prompt, rules);
          const flagText = formatUserInputFlag(userHits);
          if (flagText) blocks.push(flagText);

          // Persist injected ids for next Stop to classify recurrence/compliance.
          persistLastInjected(sessionsDir, sessionId, injectedIds);

          // PersistedEvent audit sink + AttributionEvent user-visible bus.
          if (injectedIds.length > 0 || userHits.length > 0) {
            const now = new Date().toISOString();
            if (injectedIds.length > 0) {
              eventLog.append({
                id: `e-inject-${sessionId}-${stamp()}`,
                kind: "ai.narrative.injected",
                knowledge_ids: injectedIds,
                session_id: sessionId,
                timestamp: now,
                schema_version: 1,
              });
              const event: AttributionEvent = {
                kind: "user-prompt.injected",
                source: "hook-user-prompt",
                injectedIds,
                severity: "info",
                timestamp: now,
              };
              bus.emit(event);
            }
            for (const h of userHits) {
              eventLog.append({
                id: `e-uflag-${sessionId}-${h.knowledge_id}-${stamp()}`,
                kind: "ai.user_input.flagged",
                knowledge_id: h.knowledge_id,
                session_id: sessionId,
                timestamp: now,
                schema_version: 1,
              });
              // Wire calibrator.user_reject: user typed the avoidance rule's
              // wrong_pattern → negative reinforcement signal consumed by the
              // v2 demerit engine.
              eventLog.append({
                id: `e-ureject-${sessionId}-${h.knowledge_id}-${stamp()}`,
                kind: "calibrator.user_reject",
                knowledge_id: h.knowledge_id,
                session_id: sessionId,
                timestamp: now,
                schema_version: 1,
              });
              const event: AttributionEvent = {
                kind: "user-prompt.flagged",
                source: "hook-user-prompt",
                ruleId: h.knowledge_id,
                severity: "warning",
                timestamp: now,
              };
              bus.emit(event);
            }
          }
        } catch {
          // M4-A injection is best-effort — never block user input.
        }
      }

      // issue #371: daily-summary short-circuit. When the operator types one
      // of the whitelist phrases (or `/daily`), bypass the slow rule retriever
      // and recording memory paths and inject a per-project digest of today's
      // Claude Code activity so the operator's own Claude window can write
      // the one-line-per-project summary.
      const dailyDisabled = env.TEAMAGENT_DAILY_DISABLED === "1";
      const dailyMatch = matchDailyPrompt(prompt, {
        disabled: dailyDisabled,
        extraTriggers: parseDailyTriggersEnv(env.TEAMAGENT_DAILY_TRIGGERS),
      });
      if (dailyMatch.fire) {
        try {
          const dailyOut = executeDaily({
            cwd,
            homeDir: home,
            projectsRoot: path.join(home, ".claude", "projects"),
            archive: true,
            format: "context",
            triggeredBy: dailyMatch.reason,
          });
          const out: UserPromptOutput = {
            hookSpecificOutput: {
              hookEventName: "UserPromptSubmit",
              additionalContext: [...blocks, dailyOut.contextMarkdown].join("\n\n"),
            },
          };
          return out;
        } catch {
          // Best-effort: fall through to the normal path on any unexpected error.
        }
      }

      // Rule semantic retrieval (Tier-1 / Tier-2).
      let matchedTier1: KnowledgeEntry[] = [];
      let matchedTier2: KnowledgeEntry[] = [];
      if (sessionId && prompt) {
        try {
          const seenIds = readSessionInjected(sessionsDir, sessionId);
          const firstPrompt = isFirstPrompt(sessionsDir, sessionId);
          const ruleResult = await Promise.race([
            retrieveRulesForPrompt({
              userMessage: prompt,
              cwd,
              projectDbPath: paths.projectDbPath,
              globalDbPath: paths.globalDbPath,
              sessionSeenIds: seenIds,
              isFirstPrompt: firstPrompt,
              embedder: getEmbedder(),
            }),
            new Promise<null>((resolve) =>
              setTimeout(() => resolve(null), HOOK_TIMEOUT_MS),
            ),
          ]);

          if (ruleResult) {
            if (ruleResult.injectionText) {
              blocks.push(ruleResult.injectionText);
            }
            matchedTier1 = ruleResult.tier1Rules;
            matchedTier2 = ruleResult.tier2Rules;
            if (ruleResult.allInjectedIds.length > 0) {
              appendSessionInjected(
                sessionsDir,
                sessionId,
                ruleResult.allInjectedIds,
              );
            } else if (firstPrompt) {
              // Even when no rules were found on the first prompt, touch the
              // session file so Tier-1 doesn't re-trigger on subsequent prompts.
              touchSessionInjected(sessionsDir, sessionId);
            }
          }
        } catch {
          // Rule retrieval is best-effort — never block user input.
        }
      }

      // Recording Memory retrieval: source-cited, small-by-default context.
      if (sessionId && prompt) {
        try {
          const seenIds = readSessionInjected(sessionsDir, sessionId);
          const recordingResult = await Promise.race([
            retrieveRecordingMemoriesForPrompt({
              userMessage: prompt,
              cwd,
              homeDir: home,
              sessionSeenIds: seenIds,
            }),
            new Promise<null>((resolve) =>
              setTimeout(() => resolve(null), HOOK_TIMEOUT_MS),
            ),
          ]);
          if (recordingResult?.injectionText) {
            blocks.push(recordingResult.injectionText);
          }
          if (recordingResult && recordingResult.injectedIds.length > 0) {
            appendSessionInjected(
              sessionsDir,
              sessionId,
              recordingResult.injectedIds,
            );
          }
        } catch {
          // Recording memory retrieval is best-effort — never block user input.
        }
      }

      if (blocks.length === 0) return undefined;

      const injectionText = blocks.join("\n\n");
      const rawVis = (env.TEAMAGENT_VISIBILITY ?? "verbose").toLowerCase();
      const terminalSummary =
        rawVis !== "silent" ? buildTerminalSummary(matchedTier1, matchedTier2) : "";

      // CC 2.1.x systemMessage UI regression (issue #50542): the terminal no
      // longer renders hook systemMessage. Mirror to stderr as the workaround
      // — `ctx.mirrorSystemMessage` honors `TEAMAGENT_HOOK_STDERR=0`.
      if (terminalSummary) ctx.mirrorSystemMessage(terminalSummary);

      const out: UserPromptOutput = terminalSummary
        ? {
            hookSpecificOutput: {
              hookEventName: "UserPromptSubmit",
              additionalContext: injectionText,
            },
            systemMessage: terminalSummary,
          }
        : {
            hookSpecificOutput: {
              hookEventName: "UserPromptSubmit",
              additionalContext: injectionText,
            },
          };
      return out;
    },
  });
}

void main();
