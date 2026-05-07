#!/usr/bin/env node
/**
 * PreToolUse Hook 入口 (v2 — Claude Agent SDK 版)
 *
 * 读 stdin JSON → matchRules → createPreToolUseHandler → stdout JSON
 * 任何异常都退化为 exit 0（不阻断工作流）
 *
 * Matcher 策略（feature-flag via TEAMAGENT_MATCHER env var）：
 *   default / "semantic" : 先走 semanticMatch（XenovaRuleEmbedder + SqliteSemanticRetriever），
 *                          失败时自动降级到 legacy keyword matcher
 *   "legacy"             : 直接走 keyword matcher，不加载 embedder
 */
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import {
  normalizeCwd,
  createPreToolUseHandler,
  DualLayerStore,
  SqliteEventLog,
  openDb,
  XenovaRuleEmbedder,
  SqliteSemanticRetriever,
} from "@teamagent/adapters";
import { matchRulesAsync, semanticMatch } from "@teamagent/core";
import type { KnowledgeEntry } from "@teamagent/types";
import { mergeSemanticAndLegacyMatches } from "./pre-tool-use-merge.js";
import { SqliteToolRetriever } from "@teamagent/adapters";
import { buildToolActionSummary } from "./pre-tool-use-context.js";

// ---- Lazy singletons for semantic path (per-process, reused if process is long-lived) ----
let _embedder: XenovaRuleEmbedder | null = null;
function getEmbedder(): XenovaRuleEmbedder {
  if (!_embedder) _embedder = new XenovaRuleEmbedder();
  return _embedder;
}

async function readStdinJson(): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
}

async function main(): Promise<void> {
  let input: any;
  try {
    input = await readStdinJson();
  } catch (err) {
    process.stderr.write(`teamagent pre-hook: stdin read/parse failed: ${String(err)}\n`);
    process.exit(0);
  }

  if (!input || typeof input !== "object") {
    process.exit(0);
  }

  // 缺少 tool_name 的 hook 调用静默放行，避免输出 "undefined 放行"
  if (!(input as Record<string, unknown>).tool_name) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" },
    }));
    process.exit(0);
  }

  try {
    const cwd = normalizeCwd(input.cwd ?? process.cwd());
    const home = os.homedir();

    const projectDbPath = path.join(cwd, ".teamagent", "knowledge.db");
    const globalDbPath = path.join(home, ".teamagent", "global.db");
    const eventsDbPath = path.join(home, ".teamagent", "events.db");

    fs.mkdirSync(path.dirname(projectDbPath), { recursive: true });
    fs.mkdirSync(path.dirname(globalDbPath), { recursive: true });
    fs.mkdirSync(path.dirname(eventsDbPath), { recursive: true });

    const store = new DualLayerStore({ projectDbPath, userGlobalDbPath: globalDbPath });
    const eventLog = new SqliteEventLog(openDb(eventsDbPath));

    // Issue #91: fall back to legacy keyword matcher whenever the vector
    // model isn't ready. This includes:
    //   - first install: state file exists with status="downloading"
    //   - crashed warmup: status="downloading" but pid is dead (stale)
    //   - failed warmup: status="failed"
    //   - missing state: never ran (treat as not ready)
    // The user can still force legacy with TEAMAGENT_MATCHER=legacy. When the
    // detached warmup completes and writes status="ready", the very next
    // PreToolUse invocation reads the new value and switches to semantic.
    const { describeWarmupReadiness, defaultWarmupStatePath } = await import(
      "./warmup-state.js"
    );
    const warmup = describeWarmupReadiness(defaultWarmupStatePath(home));
    const explicitlyLegacy =
      (process.env.TEAMAGENT_MATCHER ?? "").toLowerCase() === "legacy";
    const useLegacy = explicitlyLegacy || !warmup.ready;

    let lastRuleCount = 0;
    const matcher = {
      match: async ({ tool_name, tool_input }: { tool_name: string; tool_input: unknown }) => {
        const rules = store.findActive();
        lastRuleCount = rules.length;
        const legacyResult = await matchRulesAsync(
          { ...(typeof tool_input === "object" && tool_input !== null ? tool_input : {}), tool_name },
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
            const projectDb = openDb(projectDbPath);
            const globalDb = openDb(globalDbPath);
            const projectRetriever = new SqliteSemanticRetriever(projectDb);
            const globalRetriever = new SqliteSemanticRetriever(globalDb);

            let projectPersonalResults: import("@teamagent/core").SemanticMatch[];
            let projectTeamResults: import("@teamagent/core").SemanticMatch[];
            let globalResults: import("@teamagent/core").SemanticMatch[];
            try {
              [projectPersonalResults, projectTeamResults, globalResults] = await Promise.all([
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

            const allSemanticMatches = [...projectPersonalResults, ...projectTeamResults, ...globalResults];

            // 工具操作语义检索（查 knowledge_tool_vec）
            let toolResults: import("@teamagent/core").SemanticMatch[] = [];
            try {
              const toolProjectDb = openDb(projectDbPath);
              const toolGlobalDb = openDb(globalDbPath);
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
            // Silent fallback to legacy on any semantic error
            const stack = (_semErr instanceof Error ? _semErr.stack : String(_semErr)) ?? String(_semErr);
            process.stderr.write(`teamagent pre-hook: semantic match failed, falling back to legacy: ${stack}\n`);
          }
        }

        // --- Legacy keyword path (default fallback or TEAMAGENT_MATCHER=legacy) ---
        return { matched: legacyMatches };
      },
    };

    const rawVis = (process.env.TEAMAGENT_VISIBILITY ?? "verbose").toLowerCase();
    const visibility: "silent" | "smart" | "verbose" =
      rawVis === "silent" || rawVis === "smart" ? rawVis : "verbose";
    const handler = createPreToolUseHandler({
      matcher,
      eventLog,
      visibility,
      get ruleCount() { return lastRuleCount; },
    });
    const result = await handler(input);

    store.close();
    eventLog.close();

    // Wrap in hookSpecificOutput envelope so both the Claude Code CLI and
    // the @anthropic-ai/claude-agent-sdk query() respect the decision.
    // Without the wrapper, the SDK ignores the flat { permissionDecision }
    // shape and tool calls execute even when the handler returned "deny".
    const wrapped: Record<string, unknown> = {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: result.permissionDecision,
        ...(result.permissionDecisionReason
          ? { permissionDecisionReason: result.permissionDecisionReason }
          : {}),
      },
      ...(result.systemMessage ? { systemMessage: result.systemMessage } : {}),
    };

    // CC 2.1.x systemMessage UI 渲染回归 (issue #50542): 终端不再显示 hook 的
    // systemMessage。镜像到 stderr 作为 workaround；CC 在 verbose / debug 模式
    // 下会展示 hook stderr。可用 TEAMAGENT_HOOK_STDERR=0 关闭。
    if (result.systemMessage && process.env.TEAMAGENT_HOOK_STDERR !== "0") {
      process.stderr.write(`${result.systemMessage}\n`);
    }

    process.stdout.write(JSON.stringify(wrapped));
    process.exit(0);
  } catch (err) {
    process.stderr.write(`teamagent pre-hook: handler error: ${String(err)}\n`);
    process.exit(0);
  }
}

main().catch((err) => {
  process.stderr.write(`teamagent pre-hook: unexpected: ${String(err)}\n`);
  process.exit(0);
});
