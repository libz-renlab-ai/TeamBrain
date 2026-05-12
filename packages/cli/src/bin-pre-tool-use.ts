#!/usr/bin/env node
/**
 * PreToolUse Hook 入口 — HookShell + AttributionBus migration (M6 commit 6).
 *
 * 全部 stdin / paths / store / eventLog / bus / lifecycle 走 `runHook`。本 bin
 * 只负责 channel-specific business：
 *
 *   1. parseInput 把 raw 收窄为 SDK `PreToolUseHookInput`；缺 tool_name 的
 *      hook 调用走 fast-allow 路径（envelope 仍包 hookSpecificOutput）。
 *   2. matcher closure：三层 retriever (personal/team project + global) +
 *      knowledge_tool_vec retriever + 语义 vs legacy keyword 切换。
 *   3. warmup state probe (issue #91)：semantic 仅在 `status === "ready"` 时
 *      启用；否则降级到 legacy keyword matcher。这块 channel-specific，按
 *      ADR-0008 Q3 lock 留在 handler，不下沉到 shell。
 *   4. mergeSemanticAndLegacyMatches。
 *   5. 把 `PreToolUseResult` 包成 `{ hookSpecificOutput: { ... }, systemMessage? }`
 *      的 envelope；issue #50542 systemMessage stderr mirror 通过
 *      `ctx.mirrorSystemMessage` 而不是直接 `process.stderr.write`。
 *   6. user-visible attribution 通过 `ctx.bus.emit({ kind: "hook-pre.matched"|
 *      "hook-pre.passed", ... })` 发，由 shell 注入的 StdoutRenderer 渲染。
 *
 * Matcher 策略（feature-flag via TEAMAGENT_MATCHER env var）：
 *   default / "semantic" : 先走 semanticMatch（XenovaRuleEmbedder +
 *                          SqliteSemanticRetriever），失败时自动降级到 legacy
 *                          keyword matcher
 *   "legacy"             : 直接走 keyword matcher，不加载 embedder
 *
 * cjs top-level await fix：bin 被 tsup 打包成 cjs（`bin-pre-tool-use.cjs`），
 * cjs 不支持 top-level await。所以包一层 `void main()` 立即调用，main 里用
 * await。runHook 自带 try/finally 保证不抛出，main 不需要 .catch。
 */
import type { PreToolUseHookInput } from "@anthropic-ai/claude-agent-sdk";
import {
  createPreToolUseHandler,
  openDb,
  SqliteSemanticRetriever,
  SqliteToolRetriever,
  type DualLayerStore,
  type SqliteEventLog,
} from "@teamagent/adapters";
import { DaemonFirstEmbedder } from "./daemon-first-embedder.js";
import { matchRulesAsync, semanticMatch } from "@teamagent/core";
import { runHook } from "./hook-shell/index.js";
import { buildToolActionSummary } from "./pre-tool-use-context.js";
import { mergeSemanticAndLegacyMatches } from "./pre-tool-use-merge.js";
// Static import (performance-specialist /review on PR #152): the dynamic
// `await import("./warmup-state.js")` inside the hot PreToolUse handler ran
// once per invocation, defeating tsup tree-shake/inline and adding module-load
// latency to every tool call. The module is small + pure, no circular dep risk.
import { describeWarmupReadiness, defaultWarmupStatePath } from "./warmup-state.js";

// ---- Lazy singleton for semantic path (per-process, reused if process is long-lived) ----
// Issue #164: DaemonFirstEmbedder tries the long-running embedder daemon over
// HTTP first (per-call ~5ms); only falls back to in-process XenovaRuleEmbedder
// (per-call ~3-4s cold load) when the daemon is unreachable. The fallback is
// itself lazy — nothing loads into the hook process unless daemon path fails.
let _embedder: DaemonFirstEmbedder | null = null;
function getEmbedder(): DaemonFirstEmbedder {
  if (!_embedder) _embedder = new DaemonFirstEmbedder();
  return _embedder;
}

/**
 * Sentinel returned by `parseInput` when stdin lacks `tool_name`. The handler
 * sees this sentinel and short-circuits to a fast-allow envelope without
 * touching the matcher / retrievers / warmup probe. We can't return `null`
 * because that would skip stdout entirely; we still need the
 * `hookSpecificOutput.permissionDecision: "allow"` envelope on stdout.
 */
const FAST_ALLOW = "fast-allow" as const;

type ParsedInput =
  | { kind: "ok"; input: PreToolUseHookInput }
  | { kind: typeof FAST_ALLOW };

interface PreToolUseEnvelopeOut {
  permissionDecision: "allow" | "deny" | "ask";
  permissionDecisionReason?: string;
  systemMessage?: string;
}

async function main(): Promise<void> {
  await runHook<ParsedInput, PreToolUseEnvelopeOut>({
    channel: "PreToolUse",
    parseInput: (raw) => {
      if (!raw || typeof raw !== "object") return null;
      const obj = raw as Record<string, unknown>;
      // 缺少 tool_name 的 hook 调用静默放行，避免输出 "undefined 放行"。
      // 走 FAST_ALLOW sentinel，让 envelope 仍写出标准 hookSpecificOutput。
      if (!obj.tool_name) return { kind: FAST_ALLOW };
      return { kind: "ok", input: raw as PreToolUseHookInput };
    },
    handler: async (ctx) => {
      // Issue #343 PR-1: master kill switch. When TEAMAGENT_DISABLED=1 the
      // PreToolUse hook returns an unconditional allow without touching
      // matcher / retriever / attribution, so paired TB-ON vs TB-OFF
      // ablation runs see zero TB-side token cost.
      if (ctx.env.TEAMAGENT_DISABLED === "1") {
        return { permissionDecision: "allow" };
      }

      // Fast-allow path: missing tool_name. Envelope still wraps to the proper
      // hookSpecificOutput shape so the SDK respects the decision.
      if (ctx.input.kind !== "ok") {
        return { permissionDecision: "allow" };
      }
      const sdkInput = ctx.input.input;

      // Issue #91: fall back to legacy keyword matcher whenever the vector
      // model isn't ready. This includes:
      //   - first install: state file exists with status="downloading"
      //   - crashed warmup: status="downloading" but pid is dead (stale)
      //   - failed warmup: status="failed"
      //   - missing state: never ran (treat as not ready)
      // The user can still force legacy with TEAMAGENT_MATCHER=legacy. When
      // the detached warmup completes and writes status="ready", the very
      // next PreToolUse invocation reads the new value and switches to
      // semantic. Per ADR-0008 Q3, this stays channel-specific (in handler)
      // rather than sinking to the shell.
      const warmup = describeWarmupReadiness(defaultWarmupStatePath(ctx.home));
      const explicitlyLegacy =
        (ctx.env.TEAMAGENT_MATCHER ?? "").toLowerCase() === "legacy";
      const useLegacy = explicitlyLegacy || !warmup.ready;

      const store = ctx.store as unknown as DualLayerStore;
      const eventLog = ctx.eventLog as unknown as SqliteEventLog;

      let lastRuleCount = 0;
      const matcher = {
        match: async ({
          tool_name,
          tool_input,
        }: {
          tool_name: string;
          tool_input: unknown;
        }) => {
          const rules = store.findActive();
          lastRuleCount = rules.length;
          const legacyResult = await matchRulesAsync(
            {
              ...(typeof tool_input === "object" && tool_input !== null
                ? tool_input
                : {}),
              tool_name,
            },
            rules,
            {},
          );
          const legacyMatches = legacyResult.matched;

          if (!useLegacy) {
            // --- Semantic path ---
            try {
              const actionText = buildToolActionSummary(tool_name, tool_input);
              const contextText = actionText; // No AI message context in PreToolUse stdin

              const embedder = getEmbedder();

              // Query both DB layers (project=personal, global=global) and merge results
              const projectDb = openDb(ctx.paths.projectDbPath);
              const globalDb = openDb(ctx.paths.globalDbPath);
              const projectRetriever = new SqliteSemanticRetriever(projectDb);
              const globalRetriever = new SqliteSemanticRetriever(globalDb);

              let projectPersonalResults: import("@teamagent/core").SemanticMatch[];
              let projectTeamResults: import("@teamagent/core").SemanticMatch[];
              let globalResults: import("@teamagent/core").SemanticMatch[];
              try {
                [projectPersonalResults, projectTeamResults, globalResults] =
                  await Promise.all([
                    semanticMatch({
                      contextText,
                      actionText,
                      embedder,
                      retriever: projectRetriever,
                      scope: { level: "personal" },
                    }),
                    semanticMatch({
                      contextText,
                      actionText,
                      embedder,
                      retriever: projectRetriever,
                      scope: { level: "team" },
                    }),
                    semanticMatch({
                      contextText,
                      actionText,
                      embedder,
                      retriever: globalRetriever,
                      scope: { level: "global" },
                    }),
                  ]);
              } finally {
                try { projectDb.close(); } catch { /* ok */ }
                try { globalDb.close(); } catch { /* ok */ }
              }

              const allSemanticMatches = [
                ...projectPersonalResults,
                ...projectTeamResults,
                ...globalResults,
              ];

              // 工具操作语义检索（查 knowledge_tool_vec）
              let toolResults: import("@teamagent/core").SemanticMatch[] = [];
              try {
                const toolProjectDb = openDb(ctx.paths.projectDbPath);
                const toolGlobalDb = openDb(ctx.paths.globalDbPath);
                const toolProjectRetriever = new SqliteToolRetriever(toolProjectDb);
                const toolGlobalRetriever = new SqliteToolRetriever(toolGlobalDb);
                try {
                  const [tpRes, tgRes] = await Promise.all([
                    semanticMatch({
                      contextText,
                      actionText,
                      embedder,
                      retriever: toolProjectRetriever,
                      scope: { level: "personal" },
                    }),
                    semanticMatch({
                      contextText,
                      actionText,
                      embedder,
                      retriever: toolGlobalRetriever,
                      scope: { level: "global" },
                    }),
                  ]);
                  toolResults = [...tpRes, ...tgRes];
                } finally {
                  try { toolProjectDb.close(); } catch { /* ok */ }
                  try { toolGlobalDb.close(); } catch { /* ok */ }
                }
              } catch { /* tool retrieval best-effort */ }

              // Keyword matches are always preserved so non-migrated rules still fire.
              const merged = mergeSemanticAndLegacyMatches(
                [...allSemanticMatches, ...toolResults],
                legacyMatches,
              );

              // 传回原始语义命中（按分数降序，最多 5 条），供 verbose pass 消息展示
              const semanticHits = [...allSemanticMatches, ...toolResults]
                .sort((a, b) => b.score - a.score)
                .slice(0, 5)
                .map((m) => ({
                  id: m.rule.id,
                  trigger: (m.rule.trigger ?? "").slice(0, 60),
                  score: m.score,
                }));

              return { matched: merged, semanticHits };
            } catch (_semErr) {
              // Silent fallback to legacy on any semantic error.
              // B-147 (preserved through merge): emit a one-liner reason; full
              // stack only when TEAMAGENT_HOOK_DEBUG=1 (otherwise users see a
              // 30-line Node crash dump every PreToolUse when onnxruntime-node
              // is missing).
              const msg =
                _semErr instanceof Error ? _semErr.message : String(_semErr);
              if (process.env.TEAMAGENT_HOOK_DEBUG === "1") {
                const stack =
                  (_semErr instanceof Error ? _semErr.stack : String(_semErr)) ??
                  String(_semErr);
                process.stderr.write(
                  `teamagent pre-hook: semantic match failed, falling back to legacy: ${stack}\n`,
                );
              } else {
                process.stderr.write(
                  `teamagent pre-hook: semantic match unavailable (${msg.slice(0, 200)}); using legacy keyword matcher\n`,
                );
              }
            }
          }

          // --- Legacy keyword path (default fallback or TEAMAGENT_MATCHER=legacy) ---
          return { matched: legacyMatches };
        },
      };

      const handler = createPreToolUseHandler({
        matcher,
        eventLog,
        visibility: ctx.visibility,
        get ruleCount() {
          return lastRuleCount;
        },
      });
      const result = await handler(sdkInput);

      // user-visible attribution → bus. The default-layer shell wires a
      // StdoutRenderer subscriber so these events become stderr lines per
      // visibility. Pre-tool-use uses two AttributionEvent kinds:
      //   - hook-pre.matched  for each rule that fired (severity tracks decision)
      //   - hook-pre.passed   for clean-pass (no rules fired)
      const tsIso = new Date().toISOString();
      if (result.permissionDecision !== "allow" || result.permissionDecisionReason) {
        // A rule influenced the decision (deny/ask, or allow-with-reason).
        // Emit a "hook-pre.matched" event. ruleId is best-effort: we don't
        // surface the matched rule's id at this layer, so use the reason
        // string as the synthetic id.
        ctx.bus.emit({
          kind: "hook-pre.matched",
          source: "hook-pre",
          severity: result.permissionDecision === "allow" ? "info" : "warning",
          timestamp: tsIso,
          ruleId: result.permissionDecisionReason ?? "<unknown>",
          permissionDecision: result.permissionDecision,
        });
      } else {
        // Clean pass — no rules fired. Useful in verbose mode to confirm hook
        // ran. Severity "info" → suppressed in smart/silent.
        ctx.bus.emit({
          kind: "hook-pre.passed",
          source: "hook-pre",
          severity: "info",
          timestamp: tsIso,
          ruleCount: lastRuleCount,
        });
      }

      // CC 2.1.x systemMessage UI 渲染回归 (issue #50542): 终端不再显示 hook 的
      // systemMessage。镜像到 stderr 作为 workaround；CC 在 verbose / debug 模式
      // 下会展示 hook stderr。可用 TEAMAGENT_HOOK_STDERR=0 关闭（由 shell 处理）。
      if (result.systemMessage) {
        ctx.mirrorSystemMessage(result.systemMessage);
      }

      return {
        permissionDecision: result.permissionDecision,
        ...(result.permissionDecisionReason
          ? { permissionDecisionReason: result.permissionDecisionReason }
          : {}),
        ...(result.systemMessage ? { systemMessage: result.systemMessage } : {}),
      };
    },
    // Wrap handler return in hookSpecificOutput envelope so both the Claude
    // Code CLI and the @anthropic-ai/claude-agent-sdk query() respect the
    // decision. Without the wrapper, the SDK ignores the flat
    // { permissionDecision } shape and tool calls execute even when the
    // handler returned "deny".
    envelope: (out) => ({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: out.permissionDecision,
        ...(out.permissionDecisionReason
          ? { permissionDecisionReason: out.permissionDecisionReason }
          : {}),
      },
      ...(out.systemMessage ? { systemMessage: out.systemMessage } : {}),
    }),
  });
}

void main();
