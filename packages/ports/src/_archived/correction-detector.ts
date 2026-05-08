import type { ParsedSession } from "@teamagent/types";

/** 纠正时刻的信号类型。对应 spec v5.2 纠正时刻表。 */
export type CorrectionSignal =
  | "explicit_denial"
  | "multi_failure"
  | "code_edit"
  | "suggestion_override"
  | "session_restart"
  | "long_pause_then_switch"
  | "rule_override";

/** 一次识别到的纠正时刻。 */
export interface CorrectionMoment {
  /** 信号类型（见上） */
  signal: CorrectionSignal;
  /** 该信号的权重，来自 spec 的权重表 */
  weight: number;
  /** 该纠正时刻在会话中的 turn 序号 */
  turnIndex: number;
  /** 用户纠正的原文 */
  correctionText: string;
  /** 被纠正的 AI 之前说了什么 */
  previousAssistantText: string;
  /** 被纠正时 AI 的工具调用（简化字符串表示） */
  previousToolCalls: string[];
  /** ISO 8601 */
  timestamp: string;
}

/** 从会话中识别纠正时刻。纯函数，无副作用。 */
export interface CorrectionDetector {
  detect(session: ParsedSession): CorrectionMoment[];
}
