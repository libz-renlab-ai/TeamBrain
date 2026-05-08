import type { ParsedSession, ToolCall } from "@teamagent/types";
import { ruleBasedCorrectionDetector } from "../correction-detector/rule-based.js";

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

/**
 * 显式表扬关键词。
 * 权重参考 spec v5.2 "成功信号" 表（0.80）。
 */
const PRAISE_PATTERNS: RegExp[] = [
  /完美|就是这样|就这样|很好|赞|不错|太棒|搞定|👍|挺好/,
  /\b(perfect|great|nice|excellent|exactly|works?|lgtm|awesome)\b/i,
];

/** 纠正关键词——用于快速判定一条 user message 是否为 denial。 */
const DENIAL_PATTERNS: RegExp[] = [
  /不对|错了|不行|有问题|不要|不用|别这样|别那样|别用|别这么|先别|先不要|不要直接|别直接|思路不对|方向不对|换[一个种]|换成|改用|改成|重来|重新|不该|不应该|不是(这个|这样|这么|要|让你)|而不是|应该先|先.+再/,
  /\b(no|wrong|don't|shouldn't|not|never|instead|that'?s wrong|not what I (asked|wanted|meant))\b/i,
  /\b(use|try|pick|choose)\s+[@A-Za-z0-9][\w@./-]*\s+(instead of|not)\s+[@A-Za-z0-9][\w@./-]*/i,
];

/** 只有这些工具代表 AI 实际"生成/修改/执行"，Read/Glob 等只读不算一次"成就" */
const PRODUCTIVE_TOOLS = new Set([
  "Write",
  "Edit",
  "NotebookEdit",
  "Bash",
  "WebFetch",
]);

function isDenial(text: string): boolean {
  return DENIAL_PATTERNS.some((p) => p.test(text));
}

function isPraise(text: string): boolean {
  return PRAISE_PATTERNS.some((p) => p.test(text));
}

/**
 * 工具调用的"意图类别"——用于 repeated_pattern 判定。
 * 粗粒度：同工具 + 同 file_type 扩展名 视为同类。
 */
function categorizeToolCall(tc: ToolCall): string {
  const input = tc.input as Record<string, unknown>;
  const fp = typeof input.file_path === "string" ? input.file_path : "";
  const ext = fp.match(/\.(\w+)$/)?.[1] ?? "-";
  return `${tc.name}:${ext}`;
}

/** 判断一个 turn 内是否有"生产性"工具调用 */
function hasProductiveToolCall(turn: { toolCalls: ToolCall[] }): boolean {
  return turn.toolCalls.some((tc) => PRODUCTIVE_TOOLS.has(tc.name));
}

/** 该 turn 的所有生产性工具是否全部成功（undefined 视为成功—— parser 没抓到 tool_result 的情况）*/
function allToolsSucceeded(turn: { toolCalls: ToolCall[] }): boolean {
  return turn.toolCalls.every(
    (tc) => !PRODUCTIVE_TOOLS.has(tc.name) || tc.succeeded !== false,
  );
}

/**
 * 规则版成功信号识别器（纯函数）。
 */
export const ruleBasedSuccessDetector: SuccessDetector = {
  detect(session: ParsedSession): SuccessSignal[] {
    const out: SuccessSignal[] = [];

    // 复用 correction detector 的结果标记被纠正的 AI turn
    const corrections = ruleBasedCorrectionDetector.detect(session);
    const correctedTurns = new Set<number>();
    for (const c of corrections) {
      // user 在 turn c.turnIndex 纠正，被纠正的 AI 行为在 turn c.turnIndex - 1
      if (c.turnIndex > 0) correctedTurns.add(c.turnIndex - 1);
    }
    // 再加一层：任何 denial user message 都认为前面那 turn 有问题
    for (let i = 1; i < session.turns.length; i++) {
      if (isDenial(session.turns[i]!.userMessage)) {
        correctedTurns.add(i - 1);
      }
    }

    // Signal A: explicit_praise — user 后续 message 里有表扬词
    // turnIndex 指向 user 说表扬的那个 turn（方便 manifest 对照）
    for (let i = 1; i < session.turns.length; i++) {
      const turn = session.turns[i]!;
      if (isPraise(turn.userMessage) && !isDenial(turn.userMessage)) {
        const prev = session.turns[i - 1];
        out.push({
          signal: "explicit_praise",
          weight: 0.8,
          turnIndex: i,
          assistantText: prev?.assistantText ?? "",
          toolCalls: (prev?.toolCalls ?? []).map(summarizeToolCall),
          timestamp: turn.timestamp,
        });
      }
    }

    // Signal C: repeated_pattern —— 先跑以便 Signal B 跳过已覆盖的 turn
    const patternCount = new Map<string, number[]>();
    for (const turn of session.turns) {
      if (correctedTurns.has(turn.turnIndex)) continue;
      if (!allToolsSucceeded(turn)) continue;
      const seenInTurn = new Set<string>();
      for (const tc of turn.toolCalls) {
        if (!PRODUCTIVE_TOOLS.has(tc.name)) continue;
        const cat = categorizeToolCall(tc);
        if (seenInTurn.has(cat)) continue;
        seenInTurn.add(cat);
        if (!patternCount.has(cat)) patternCount.set(cat, []);
        patternCount.get(cat)!.push(turn.turnIndex);
      }
    }
    const repeatedTurns = new Set<number>();
    for (const [cat, turnIndices] of patternCount.entries()) {
      if (turnIndices.length < 3) continue;
      for (const ti of turnIndices) repeatedTurns.add(ti);
      out.push({
        signal: "repeated_pattern",
        weight: 0.6,
        turnIndex: turnIndices[0]!,
        assistantText: session.turns[turnIndices[0]!]?.assistantText ?? "",
        toolCalls: [cat + ` × ${turnIndices.length}`],
        timestamp: session.turns[turnIndices[0]!]?.timestamp ?? "",
      });
    }

    // Signal B: one_shot_success — AI 用"生产性"工具且成功 + 下 turn 无纠正无表扬
    // 被 repeated_pattern 覆盖的 turn 不再单独报（避免重复归因）
    for (let i = 0; i < session.turns.length; i++) {
      const turn = session.turns[i]!;
      const next = session.turns[i + 1];
      if (!next) continue;
      if (!hasProductiveToolCall(turn)) continue;
      if (!allToolsSucceeded(turn)) continue;
      if (correctedTurns.has(i)) continue;
      if (repeatedTurns.has(i)) continue;
      if (isDenial(next.userMessage)) continue;
      if (isPraise(next.userMessage)) continue;
      out.push({
        signal: "one_shot_success",
        weight: 0.3,
        turnIndex: i,
        assistantText: turn.assistantText,
        toolCalls: turn.toolCalls.map(summarizeToolCall),
        timestamp: turn.timestamp,
      });
    }

    out.sort((a, b) => a.turnIndex - b.turnIndex);
    return out;
  },
};

function summarizeToolCall(tc: ToolCall): string {
  const keys = Object.keys(tc.input).slice(0, 3);
  return `${tc.name}(${keys.join(",")})`;
}
