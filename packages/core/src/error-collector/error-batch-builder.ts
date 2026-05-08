import type { RawErrorSignal } from "./cross-session-cluster.js";
import { buildBatchErrorExtractionPrompt } from "./error-extraction-prompt.js";

export interface ErrorBatch {
  category: "C" | "E" | "S" | "K";
  signals: RawErrorSignal[];
  prompt: string;
}

/**
 * 将信号按 suggestedCategory 分组，每组生成一个 BatchPrompt。
 * 无 suggestedCategory 的信号归入 "E"（工程层）。
 * 纯函数。
 */
export function buildErrorBatches(signals: RawErrorSignal[]): ErrorBatch[] {
  if (signals.length === 0) return [];

  const groups = new Map<"C" | "E" | "S" | "K", RawErrorSignal[]>();

  for (const sig of signals) {
    const cat = sig.suggestedCategory ?? "E";
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(sig);
  }

  return Array.from(groups.entries()).map(([category, sigs]) => ({
    category,
    signals: sigs,
    prompt: buildBatchErrorExtractionPrompt(sigs, category),
  }));
}
