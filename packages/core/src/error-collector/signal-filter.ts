import type { RawErrorSignal } from "./cross-session-cluster.js";

export interface FilterOptions {
  /** 最低权重阈值，低于此值的信号被丢弃。默认 0.3。 */
  weightThreshold: number;
  /** 最少来源 session 数（H 信号豁免）。默认 2。 */
  minSessions: number;
}

/**
 * efficient mode 粗筛：去重 + 权重阈值 + 频率门控。
 * 纯函数，不依赖任何 IO。
 */
export function filterSignals(
  signals: RawErrorSignal[],
  opts: FilterOptions,
): RawErrorSignal[] {
  if (signals.length === 0) return [];

  // 1. 去重：相同 id 保留权重最高的
  const dedupMap = new Map<string, RawErrorSignal>();
  for (const sig of signals) {
    const existing = dedupMap.get(sig.id);
    if (!existing || sig.weight > existing.weight) {
      dedupMap.set(sig.id, sig);
    }
  }

  return Array.from(dedupMap.values()).filter((sig) => {
    // 2. 权重阈值
    if (sig.weight < opts.weightThreshold) return false;

    // 3. 频率门控（H 信号已聚类，不再检查 session 数）
    if (sig.signalType !== "H") {
      const uniqueSessions = new Set(sig.sessionIds).size;
      if (uniqueSessions < opts.minSessions) return false;
    }

    return true;
  });
}
