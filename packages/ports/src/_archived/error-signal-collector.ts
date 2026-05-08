/**
 * 错误信号采集 Port。
 *
 * 信号类型：
 *   A - 用户纠正 AI（correction_moment）
 *   B - build/test 失败（hook-post.result, succeeded=false）
 *   C - AI override 被人类强行覆盖（ai.override.ignored）
 *   D - 同一任务多次连续失败（multi_failure）
 *   G - hook-pre.blocked 后用户继续（规则被绕过）
 *   H - 同一 tag/pattern 跨 session 重复出现（聚类）
 */
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

/** 采集 since 时间点之后的所有错误信号。 */
export interface ErrorSignalCollector {
  collect(since: Date): Promise<RawErrorSignal[]>;
}
