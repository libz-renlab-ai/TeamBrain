/** 采集到的原始错误信号。对应 spec v5.2 信号类型表。 */
export interface RawErrorSignal {
  /** 信号唯一 ID */
  id: string;
  /** 信号类型 */
  signalType: "A" | "B" | "C" | "D" | "G" | "H";
  /** 信号权重 0-1，用于 efficient mode 阈值过滤 */
  weight: number;
  /** 来源 session ID 列表（H 信号可能来自多个 session） */
  sessionIds: string[];
  /** 供 LLM 提取的原文上下文（纠正对话片段 / 错误日志 / 聚类摘要等）*/
  context: string;
  /** LLM 提取时推荐使用的 category（仅提示，可被 LLM 覆盖）*/
  suggestedCategory?: "C" | "E" | "S" | "K";
  /** ISO 8601 */
  timestamp: string;
}

/**
 * H 信号聚类：从一批原始信号中找出在 ≥minSessions 个不同 session 里出现的关键词，
 * 聚合成 H 类型信号返回。
 *
 * 纯函数——不依赖任何 IO。
 */
export function clusterByTag(
  signals: RawErrorSignal[],
  minSessions: number,
  now: Date,
): RawErrorSignal[] {
  if (signals.length === 0) return [];

  const keywordSessions = new Map<string, Set<string>>();

  for (const sig of signals) {
    const tokens = tokenize(sig.context);
    const sessionId = sig.sessionIds[0] ?? "unknown";
    for (const token of tokens) {
      if (!keywordSessions.has(token)) {
        keywordSessions.set(token, new Set());
      }
      keywordSessions.get(token)!.add(sessionId);
    }
  }

  const result: RawErrorSignal[] = [];

  for (const [keyword, sessionSet] of keywordSessions.entries()) {
    if (sessionSet.size < minSessions) continue;

    const sessionIds = Array.from(sessionSet);
    const matchingSignals = signals.filter(
      (s) => s.context.toLowerCase().includes(keyword),
    );

    const weight = Math.min(sessionSet.size / 5, 1);

    const contextSummary = [
      `[H 聚类] 关键词 "${keyword}" 在 ${sessionSet.size} 个不同 session 中重复出现`,
      `相关上下文片段：`,
      ...matchingSignals
        .slice(0, 3)
        .map((s) => `  - ${s.context.slice(0, 120)}`),
    ].join("\n");

    result.push({
      id: `h-${keyword}-${sessionIds.slice(0, 3).join("-")}`,
      signalType: "H",
      weight,
      sessionIds,
      context: contextSummary,
      suggestedCategory: undefined,
      timestamp: now.toISOString(),
    });
  }

  return result;
}

const STOP_WORDS = new Set([
  // 通用英文虚词
  "the", "and", "for", "with", "from", "that", "this", "have",
  "been", "were", "they", "their", "there", "when", "what", "which",
  "will", "also", "into", "more", "some", "then", "than", "these",
  "those", "such", "your", "about", "after", "before",
  // session compaction 摘要高频词（防止 H 聚类把元信息当错误模式）
  "session", "conversation", "context", "summary", "previous",
  "continued", "earlier", "portion", "covers", "below",
  "request", "intent", "primary", "being", "user",
  // 错误类通用词（太宽泛，无区分度）
  "error", "fail", "failed", "failure", "could", "would", "should",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    // 包含 ASCII 标点 + 全角冒号/逗号/顿号（防止中文标签被误识别为关键词）
    .split(/[\s\-_./\\:,;()[\]{}'"!?\uff01\uff0c\uff1a\uff1b\u3001\u3002]+/)
    .filter((t) => t.length >= 4 && !STOP_WORDS.has(t) && !isLabelToken(t));
}

/** 过滤纯中文标签词（如"用户纠正"、"上一句"），只保留技术词汇 */
function isLabelToken(t: string): boolean {
  // 完全由汉字/假名/韩文组成且无 ASCII 字符 → 是标签，不是技术术语
  return /^[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]+$/.test(t);
}
