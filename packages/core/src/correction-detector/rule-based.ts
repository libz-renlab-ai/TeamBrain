import type {
  CorrectionDetector,
  CorrectionMoment,
  CorrectionSignal,
} from "@teamagent/ports";
import type { ParsedSession, SessionTurn, ToolCall } from "@teamagent/types";

/**
 * 显式否定关键词。
 *
 * 设计说明：
 * - 中文：逐字精确匹配。"不对"/"错了"/"别这样"/"不要"/"换个"/"重来"
 * - 英文：整词匹配（用 \b 防止 "know" 命中 "no"）
 * - 故意不收录 "不是"——太宽泛（"我的意思不是..."）
 */
const DENIAL_PATTERNS: Array<{ re: RegExp; weight: number }> = [
  // 中文：高置信
  { re: /不对/, weight: 0.95 },
  { re: /错了/, weight: 0.95 },
  { re: /不行|有问题/, weight: 0.9 },
  { re: /不要/, weight: 0.95 },
  { re: /不用/, weight: 0.9 },
  { re: /别这样|别那样|别用|别这么/, weight: 0.95 },
  { re: /先别|先不要|不要直接|别直接/, weight: 0.9 },
  { re: /重来|重新/, weight: 0.9 },
  { re: /换[一个种]|换成|改用|改成/, weight: 0.9 },
  { re: /思路不对|方向不对/, weight: 0.95 },
  { re: /不该|不应该/, weight: 0.9 },
  { re: /不是(这个|这样|这么|要|让你)|而不是/, weight: 0.85 },
  { re: /应该先|先.+再/, weight: 0.8 },
  // 英文：整词
  { re: /\b(no|wrong|don't|shouldn't|not|never)\b/i, weight: 0.9 },
  { re: /\binstead\b/i, weight: 0.9 },
  { re: /\bthat'?s wrong\b/i, weight: 0.95 },
  { re: /\bnot what I (asked|wanted|meant)\b/i, weight: 0.9 },
  { re: /\b(use|try|pick|choose)\s+[@A-Za-z0-9][\w@./-]*\s+(instead of|not)\s+[@A-Za-z0-9][\w@./-]*/i, weight: 0.9 },
];

/**
 * 失败信号：同一个 turn 内有 ≥1 次失败的 tool call。
 */
function hasMultipleFailures(turn: SessionTurn): boolean {
  const failed = turn.toolCalls.filter((tc) => tc.succeeded === false);
  return failed.length >= 1;
}

/**
 * B-064: 系统注入的"伪用户消息"应跳过整个 turn 的 signal 检测。
 *
 * Claude Code 把以下内容作为 type=user 的消息塞进会话日志，但语义上不是
 * 用户的纠正：
 * - skill 加载器输出（含 "Base directory for this skill:"）
 * - <system-reminder>...</system-reminder> 包裹的提醒
 * - <local-command-caveat>...</local-command-caveat> 包裹的本地命令输出
 * - <command-name>/<command-message>/<command-args> 标签
 *
 * 这些消息常包含 "not"/"don't"/"never"/"不要"/"不对" 等关键词,会被
 * DENIAL_PATTERNS 命中,导致 analyze --commit 把系统噪声当用户纠正
 * 提取并入库,污染知识库。
 */
function isSystemInjectedMessage(text: string): boolean {
  if (!text) return false;
  if (/Base directory for this skill:/i.test(text)) return true;
  if (/<system-reminder>/i.test(text)) return true;
  if (/<local-command-caveat>/i.test(text)) return true;
  if (/<command-(name|message|args)>/i.test(text)) return true;
  return false;
}

/**
 * B-064: 礼貌请求/建议（"能…吗？" / "可以…吗？"）不算 explicit_denial。
 *
 * 这类句式即使含 "不要"/"不用" 等词，语义是用户在询问/请求而非否定上文。
 * 项目决定：把礼貌 query 与真·纠正区分开，前者交给后续 LLM 二次判断或
 * 完全忽略，避免规则化提取虚假 denial。
 */
function isPoliteQuery(text: string): boolean {
  if (!text) return false;
  // 短消息（≤80 字）以 "?" / "？" 收尾，且以"能"/"可以"开头
  const trimmed = text.trim();
  if (trimmed.length > 80) return false;
  if (!/[?？]\s*$/.test(trimmed)) return false;
  if (!/^(能|可以)/.test(trimmed)) return false;
  return true;
}

/**
 * 规则版纠正时刻识别器（纯函数）。
 * 仅用关键词 + 工具调用统计，不依赖 LLM。
 */
export const ruleBasedCorrectionDetector: CorrectionDetector = {
  detect(session: ParsedSession): CorrectionMoment[] {
    const out: CorrectionMoment[] = [];

    for (let i = 0; i < session.turns.length; i++) {
      const turn = session.turns[i]!;
      const prevTurn = i > 0 ? session.turns[i - 1] : undefined;

      // B-064: skip entire turn detection if user message is actually a
      // system-injected pseudo-message (skill loader, system-reminder, etc.).
      // These commonly contain DENIAL keywords but are not user corrections.
      if (isSystemInjectedMessage(turn.userMessage)) continue;

      // Signal A: 用户 message 里含显式否定词
      // B-064: polite "能…吗？" queries are requests, not corrections — skip.
      const denial = !isPoliteQuery(turn.userMessage)
        ? matchDenial(turn.userMessage)
        : null;
      if (denial && prevTurn) {
        out.push(buildMoment(turn, prevTurn, "explicit_denial", denial.weight));
      }

      // Signal B: 上一 turn 有工具失败 —— 无论用户是否介入都触发。
      // 权重根据用户是否说话分档:
      //   - 用户介入 (0.85) → 更可能是真·纠正时刻
      //   - 用户沉默 (0.70) → 可能是 AI 自己重试中；交给 LLM 二次判断,
      //     prompt 会在信息不足时返回 null
      if (prevTurn && hasMultipleFailures(prevTurn)) {
        const already = out.find((m) => m.turnIndex === i);
        if (!already) {
          const userSpoke = turn.userMessage.trim().length > 0;
          const weight = userSpoke ? 0.85 : 0.70;
          out.push(buildMoment(turn, prevTurn, "multi_failure", weight));
        }
      }

      // Signal C: suggestion_override — AI 建议某方案，用户指定另一个
      // 简化规则：上一 turn assistant 提到"推荐/用/建议"某工具/库，用户说"用 Y 吧"
      if (prevTurn && !out.find((m) => m.turnIndex === i)) {
        const override = detectOverride(prevTurn.assistantText, turn.userMessage);
        if (override) {
          out.push(buildMoment(turn, prevTurn, "suggestion_override", 0.8));
        }
      }

      // Signal D: code_edit — 用户告诉 AI 自己改了代码 / 当前 turn AI 用 Edit 替换
      const codeEdit = detectCodeEdit(turn);
      if (codeEdit && !out.find((m) => m.turnIndex === i)) {
        out.push(buildMoment(turn, prevTurn, "code_edit", 0.8));
      }

      // Signal E: error_in_context — user pastes an error trace/message and the
      // previous turn had AI tool calls (i.e., AI caused the error or was involved).
      // This catches the common pattern: AI does something → error → user pastes error.
      if (prevTurn && !out.find((m) => m.turnIndex === i)) {
        const hasError = detectErrorInMessage(turn.userMessage);
        const prevHadToolUse = prevTurn.toolCalls.length > 0;
        if (hasError && prevHadToolUse) {
          out.push(buildMoment(turn, prevTurn, "multi_failure", 0.8));
        }
      }
    }

    // 按 turnIndex 升序排序
    out.sort((a, b) => a.turnIndex - b.turnIndex);
    return out;
  },
};

function matchDenial(text: string): { weight: number } | null {
  if (!text.trim()) return null;
  let maxWeight = 0;
  for (const p of DENIAL_PATTERNS) {
    if (p.re.test(text)) {
      if (p.weight > maxWeight) maxWeight = p.weight;
    }
  }
  return maxWeight > 0 ? { weight: maxWeight } : null;
}

/**
 * 识别 suggestion_override：
 * AI 的上一段建议了某工具 X（出现在 "推荐" / "用 X" / "我用 X" 句式里），
 * 用户的回复指定了另一个工具 Y（"用 Y" / "改用 Y" / "Y 更好"）。
 * 简化启发：只要检测到用户在用 AI 没提的某个常见库/工具名就算。
 */
function detectOverride(assistantText: string, userText: string): boolean {
  if (!userText.trim()) return false;

  // 用户明确表达"用 Y" / "Y 更好" / "上 Y" / "改用 Y"
  // 注：\b 不匹配中文边界，中文前缀直接匹配
  const toolName = "[@A-Za-z0-9][\\w@./-]{1,}";
  const userSpecifies =
    new RegExp(`(用|改用|上)\\s*${toolName}`).test(userText) ||
    new RegExp(`${toolName}\\s*(更好|轻量|简单)`, "i").test(userText) ||
    new RegExp(`instead of\\s+${toolName}`, "i").test(userText);
  if (!userSpecifies) return false;

  // 从用户 message 里抓所有可能的工具/库名
  const userToolMatch = userText.match(/[@A-Za-z0-9][A-Za-z0-9@./-]{2,}/g);
  if (!userToolMatch) return false;

  // 前提：assistant 上一段确实推荐过某个方案
  const assistantSuggested =
    /推荐|建议|我用|我来用|install|add\s+[A-Za-z]|[A-Za-z][\w-]{2,}\s*是/i.test(
      assistantText,
    );
  if (!assistantSuggested) return false;

  // 用户提到的某个工具不在 assistant 之前说过的内容里 → override
  const assistantLower = assistantText.toLowerCase();
  const STOP = new Set([
    "the", "and", "for", "but", "more", "less", "less",
  ]);
  for (const tool of userToolMatch) {
    if (tool.length < 3) continue;
    if (STOP.has(tool.toLowerCase())) continue;
    if (!assistantLower.includes(tool.toLowerCase())) return true;
  }
  return false;
}

const ERROR_PATTERNS: RegExp[] = [
  /\bError\s*:/i,
  /\bException\s*:/i,
  /\bE[A-Z]{3,}\b/, // ENOENT, EACCES, EPERM, EBUSY, etc.
  /at\s+\S+\s*\(\S+:\d+:\d+\)/, // JS stack trace frame
  /Traceback \(most recent call last\)/,
  /SyntaxError|TypeError|ReferenceError|RangeError/,
  /FAILED|✗|✕/, // test failures
  /exit code [1-9]|exit status [1-9]/i,
  /报错|错误|异常|失败/, // Chinese error keywords
];

/**
 * Returns true when the user message appears to contain an error message / stack trace.
 * Conservative: requires ≥1 strong pattern match (not just any line with "Error").
 */
function detectErrorInMessage(text: string): boolean {
  if (!text.trim()) return false;
  for (const re of ERROR_PATTERNS) {
    if (re.test(text)) return true;
  }
  return false;
}

/**
 * 识别 code_edit：user 在当前 turn 说"我改了" / 或当前 turn 的 AI Edit
 * 是替换用户贴来的完整版本（new_string 远长于 old_string）。
 * 判当前 turn 而非 next turn —— 语义是"user 在这 turn 改了"。
 */
function detectCodeEdit(turn: SessionTurn): boolean {
  if (/我改了|我重写了|你看我改/i.test(turn.userMessage)) return true;
  for (const tc of turn.toolCalls) {
    if (tc.name !== "Edit") continue;
    const inp = tc.input as { old_string?: unknown; new_string?: unknown };
    const oldStr = typeof inp.old_string === "string" ? inp.old_string : "";
    const newStr = typeof inp.new_string === "string" ? inp.new_string : "";
    if (newStr.length > oldStr.length * 2 && newStr.length > 200) return true;
  }
  return false;
}

function buildMoment(
  turn: SessionTurn,
  prevTurn: SessionTurn | undefined,
  signal: CorrectionSignal,
  weight: number,
): CorrectionMoment {
  return {
    signal,
    weight,
    turnIndex: turn.turnIndex,
    correctionText: turn.userMessage,
    previousAssistantText: prevTurn?.assistantText ?? "",
    previousToolCalls: (prevTurn?.toolCalls ?? []).map(summarizeToolCall),
    timestamp: turn.timestamp,
  };
}

function summarizeToolCall(tc: ToolCall): string {
  const keys = Object.keys(tc.input).slice(0, 3);
  const head = `${tc.name}(${keys.join(",")})`;
  const inputPreview = summarizeToolInput(tc.input);
  if (tc.succeeded === false) {
    // 把失败工具的 stderr/result 前 200 字纳入摘要,
    // 让后续 LLM 看到实际错误内容再判断要不要提规则
    const err = typeof tc.result === "string" ? tc.result.trim().slice(0, 200) : "";
    const body = [inputPreview, err].filter(Boolean).join(" | ");
    return body ? `${head} ✗ ${body}` : `${head} ✗ FAILED`;
  }
  return inputPreview ? `${head}: ${inputPreview}` : head;
}

function summarizeToolInput(input: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const key of [
    "command",
    "file_path",
    "url",
    "content",
    "old_string",
    "new_string",
    "pattern",
    "query",
  ]) {
    const v = input[key];
    if (typeof v !== "string" || !v.trim()) continue;
    parts.push(`${key}=${truncateOneLine(v, 180)}`);
    if (parts.join(" | ").length > 360) break;
  }
  return parts.join(" | ");
}

function truncateOneLine(s: string, max: number): string {
  const clean = s.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1) + "…";
}
