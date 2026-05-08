import type { ParsedSession } from "@teamagent/types";

/** 成功信号类型。对应 spec v5.2 成功信号表。 */
export type SuccessSignalType =
  | "one_shot_success"
  | "explicit_praise"
  | "repeated_pattern"
  | "multi_user_adoption";

/** 一次识别到的成功信号。 */
export interface SuccessSignal {
  signal: SuccessSignalType;
  weight: number;
  turnIndex: number;
  /** AI 当时的文本回复 */
  assistantText: string;
  /** 工具调用（简化字符串） */
  toolCalls: string[];
  timestamp: string;
}

/** 从会话中识别成功信号。纯函数，无副作用。 */
export interface SuccessDetector {
  detect(session: ParsedSession): SuccessSignal[];
}
