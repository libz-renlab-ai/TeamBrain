import type { PersistedEvent, ParsedSession } from "@teamagent/types";
import {
  ruleBasedCorrectionDetector,
  clusterByTag,
  type RawErrorSignal,
} from "@teamagent/core";

/**
 * 错误信号采集 Port。
 *
 * `RawErrorSignal` 类型定义住在 `@teamagent/core` (cross-session-cluster.ts) — 唯一定义，避免 nominal divergence。
 *
 * 信号类型：
 *   A - 用户纠正 AI（correction_moment）
 *   B - build/test 失败（hook-post.result, succeeded=false）
 *   C - AI override 被人类强行覆盖（ai.override.ignored）
 *   D - 同一任务多次连续失败（multi_failure）
 *   G - hook-pre.blocked 后用户继续（规则被绕过）
 *   H - 同一 tag/pattern 跨 session 重复出现（聚类）
 */
export interface ErrorSignalCollector {
  collect(since: Date): Promise<RawErrorSignal[]>;
}

export interface CompositeCollectorOptions {
  events: PersistedEvent[];
  sessions: ParsedSession[];
  since: Date;
  /** H 信号聚类的最小 session 数，默认 2 */
  minClusterSessions?: number;
  /** 时间戳注入（Functional Core 要求），默认 new Date() */
  now?: Date;
}

/**
 * 聚合 A/B/C/D/G/H 六路信号的 Imperative Shell。
 * 纯数据聚合——IO（读文件、读 DB）在调用方完成并注入。
 */
export class CompositeErrorSignalCollector implements ErrorSignalCollector {
  private readonly opts: CompositeCollectorOptions;

  constructor(opts: CompositeCollectorOptions) {
    this.opts = opts;
  }

  async collect(since: Date): Promise<RawErrorSignal[]> {
    const signals: RawErrorSignal[] = [];
    const sinceIso = since.toISOString();

    // --- A: 纠正时刻 ---
    for (const session of this.opts.sessions) {
      const sessionEnd = (session as any).endedAt ?? session.endTime ?? "";
      if (sessionEnd && sessionEnd < sinceIso) continue;
      const corrections = ruleBasedCorrectionDetector.detect(session);
      for (const c of corrections) {
        // 过滤空内容、系统注入文本、context-resumption 摘要
        if (!c.correctionText.trim()) continue;
        if (isSystemInjectedText(c.correctionText)) continue;
        if (isContextResumptionText(c.correctionText)) continue;
        signals.push({
          id: `a-${session.sessionId}-${c.turnIndex}`,
          signalType: "A",
          weight: c.weight,
          sessionIds: [session.sessionId],
          context: [
            `用户纠正：${c.correctionText}`,
            `AI 上一句：${c.previousAssistantText}`,
          ].join("\n"),
          suggestedCategory: "K",
          timestamp: c.timestamp,
        });
      }
    }

    // --- B: build/test 失败 ---
    for (const evt of this.opts.events) {
      if (evt.timestamp < sinceIso) continue;
      if (evt.kind !== "hook-post.result") continue;
      const result = (evt as any).result as
        | { succeeded: boolean; exit_code?: number; stderr?: string }
        | undefined;
      if (!result || result.succeeded) continue;
      const tool = (evt as any).tool as
        | { name: string; input: Record<string, unknown> }
        | undefined;
      signals.push({
        id: `b-${evt.id}`,
        signalType: "B",
        weight: 0.7,
        sessionIds: [(evt as any).session_id ?? "unknown"],
        context: [
          `工具：${tool?.name ?? "unknown"} 执行失败`,
          `exit_code: ${result.exit_code ?? "?"}`,
          result.stderr ? `stderr: ${result.stderr.slice(0, 300)}` : "",
          tool?.input ? `input: ${JSON.stringify(tool.input).slice(0, 200)}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        suggestedCategory: "E",
        timestamp: evt.timestamp,
      });
    }

    // --- C: ai.override.ignored ---
    for (const evt of this.opts.events) {
      if (evt.timestamp < sinceIso) continue;
      if (evt.kind !== "ai.override.ignored") continue;
      signals.push({
        id: `c-${evt.id}`,
        signalType: "C",
        weight: 0.8,
        sessionIds: [(evt as any).session_id ?? "unknown"],
        context: `AI 拒绝建议被人类强行覆盖（ai.override.ignored）\nevent_id: ${evt.id}`,
        suggestedCategory: "S",
        timestamp: evt.timestamp,
      });
    }

    // --- D: multi_failure（同 session 连续工具失败 ≥2） ---
    const sessionFailCounts = new Map<string, number>();
    for (const evt of this.opts.events) {
      if (evt.timestamp < sinceIso) continue;
      if (evt.kind !== "hook-post.result") continue;
      const result = (evt as any).result as { succeeded: boolean } | undefined;
      if (!result || result.succeeded) continue;
      const sid = (evt as any).session_id ?? "unknown";
      sessionFailCounts.set(sid, (sessionFailCounts.get(sid) ?? 0) + 1);
    }
    for (const [sid, count] of sessionFailCounts.entries()) {
      if (count >= 2) {
        signals.push({
          id: `d-${sid}`,
          signalType: "D",
          weight: Math.min(0.5 + count * 0.1, 0.9),
          sessionIds: [sid],
          context: `Session ${sid} 内工具连续失败 ${count} 次，可能存在系统性错误模式`,
          suggestedCategory: "E",
          timestamp: sinceIso,
        });
      }
    }

    // --- G: hook-pre.blocked ---
    for (const evt of this.opts.events) {
      if (evt.timestamp < sinceIso) continue;
      if (evt.kind !== "hook-pre.blocked") continue;
      signals.push({
        id: `g-${evt.id}`,
        signalType: "G",
        weight: 0.6,
        sessionIds: [(evt as any).session_id ?? "unknown"],
        context: [
          `规则拦截被绕过（hook-pre.blocked）`,
          `knowledge_id: ${(evt as any).knowledge_id ?? "unknown"}`,
          `tool: ${JSON.stringify((evt as any).tool ?? {}).slice(0, 200)}`,
        ].join("\n"),
        suggestedCategory: "S",
        timestamp: evt.timestamp,
      });
    }

    // --- H: 跨 session 聚类（仅对非 H 信号聚类，避免二次放大） ---
    const minCluster = this.opts.minClusterSessions ?? 2;
    const nowTs = this.opts.now ?? new Date();
    const hSignals = clusterByTag(signals, minCluster, nowTs);
    signals.push(...hSignals);

    return signals;
  }
}

/**
 * 过滤 hook 或工具注入的系统文本（以 XML 标签开头，如 <local-command-caveat>、<system-reminder>）。
 * 这类文本是 Claude Code 工具链注入的，不是真实用户纠正。
 */
function isSystemInjectedText(text: string): boolean {
  return text.trimStart().startsWith("<");
}

/**
 * Claude Code 在 session compaction 时会把上一轮摘要注入为 user message，
 * 格式固定为 "This session is being continued from a previous conversation..."。
 * 这类文本不是真实的用户纠正，必须过滤。
 */
function isContextResumptionText(text: string): boolean {
  const t = text.trimStart();
  return (
    t.startsWith("This session is being continued") ||
    t.startsWith("The summary below covers") ||
    t.startsWith("Continue the conversation from where it left off") ||
    // 中文压缩模式
    t.startsWith("本次对话是") ||
    t.startsWith("以下是之前对话的摘要")
  );
}
