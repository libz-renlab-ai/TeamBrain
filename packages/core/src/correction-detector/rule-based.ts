import type { ParsedSession, SessionTurn, ToolCall } from "@teamagent/types";

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

/**
 * 显式否定关键词。
 *
 * 设计说明：
 * - 中文：逐字精确匹配。"不对"/"错了"/"别这样"/"不要"/"换个"/"重来"
 * - 英文：整词匹配（用 \b 防止 "know" 命中 "no"）
 * - 故意不收录 "不是"——太宽泛（"我的意思不是..."）
 *
 * Real-session gap patches (Wave 3 prod e2e):
 * - Added "fix" / "修复" as standalone correction verbs
 * - Added "restart" / "reboot" as strong intent-reset signals
 * - Added ONLY-constraint patterns: "ONLY do X" / "ONLY assign" style directives
 * - Added "i mean" / "right should be" redirect clarification patterns
 * - Added language-correction patterns: "answer in chinese/english"
 * - Added NEVER directive as a standalone pattern (already covered by /never/ but was in
 *   sentence position that regex missed due to case-only-word boundary issues)
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
  // 中文：修复/纠正动词（Wave 3 patch）
  { re: /修复[！!]|^修复\b/, weight: 0.9 },
  // 英文：整词
  // "not" alone is too broad — fires on "not tech lead", "not sure", parenthetical phrases.
  // Only match bare "not" at sentence start (after . ! ?) or in explicit negation constructs.
  { re: /\b(no|wrong|don't|shouldn't|never)\b/i, weight: 0.9 },
  { re: /(^|[.!?]\s+)not\b/i, weight: 0.9 },
  { re: /\binstead\b/i, weight: 0.9 },
  { re: /\bthat'?s wrong\b/i, weight: 0.95 },
  { re: /\bnot what I (asked|wanted|meant)\b/i, weight: 0.9 },
  { re: /\b(use|try|pick|choose)\s+[@A-Za-z0-9][\w@./-]*\s+(instead of|not)\s+[@A-Za-z0-9][\w@./-]*/i, weight: 0.9 },
  // 英文：fix/restart/reboot 作为明确纠正动词（Wave 3 patch）
  { re: /\bfix\b/i, weight: 0.85 },
  { re: /\brestart\b/i, weight: 0.85 },
  // 英文：ONLY 约束型纠正 — "ONLY do X" / "ONLY assign" 等（Wave 3 patch）
  // 只有当 ONLY 出现在句首或前置强调词后，才认为是行为纠正指令
  { re: /\bONLY\s+(do|assign|spawn|use|work|run|create|write|call)\b/i, weight: 0.85 },
  { re: /\bNEVER\s+(do|work|assign|create|modify|edit|write|run|push|commit|use)\b/i, weight: 0.9 },
  // 英文：语言纠正 — 必须有明确否定前缀才算纠正（Wave 3 patch, tightened）
  // "no, answer in chinese" / "don't answer in english" — but NOT bare "please answer in chinese"
  { re: /\b(no|don't|not)\b.{0,30}\banswer\s+(in|using)\s+(chinese|english|中文|英文)\b/i, weight: 0.85 },
  { re: /\bdon'?t\s+use\s+(chinese|english|中文|英文)\b/i, weight: 0.8 },
  // 英文：澄清性重定向 "i mean" / "right should be" （Wave 3 patch）
  // Only fire when "i mean" is followed by actual content (not just "i mean..." trailing)
  { re: /\bi mean[,，]?\s+\S/i, weight: 0.8 },
  { re: /\bright should be\b/i, weight: 0.85 },
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
 * - <bash-stdout>...</bash-stdout> 工具输出注入（如 CSV 数据含否定词）
 * - <bash-input>...</bash-input> shell 命令输出注入
 * - <teammate-message>...</teammate-message> agent 间通信消息
 * - "Stop hook feedback:" 前缀的钩子系统反馈消息
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
  if (/<bash-stdout>/i.test(text)) return true;
  if (/<bash-input>/i.test(text)) return true;
  if (/<teammate-message\b/i.test(text)) return true;
  if (/^Stop hook feedback:/i.test(text.trim())) return true;
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
 * Signal G: user_interrupt — Claude Code sessions record "[Request interrupted by user]"
 * (and "[Request interrupted by user for tool use]") when the user presses Escape or
 * otherwise cancels the AI's ongoing action. These are unambiguous correction moments:
 * the user actively stopped the AI, which semantically means "what you were doing was wrong."
 *
 * Wave 3 real-session analysis: interrupt signals are the single most common correction
 * pattern in production (11 out of 24 FNs in initial harness run). The labeled-fixture
 * harness never saw them because hand-crafted fixtures don't include interrupt messages.
 */
const INTERRUPT_PATTERN = /^\[Request interrupted by user(\s+for\s+tool\s+use)?\]$/i;

function isInterruptMessage(text: string): boolean {
  if (!text) return false;
  return INTERRUPT_PATTERN.test(text.trim());
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

      // Signal G: user_interrupt — "[Request interrupted by user]" messages
      // are unambiguous correction signals from Claude Code's session format.
      // The user cancelled the AI action, indicating the current approach was wrong.
      if (isInterruptMessage(turn.userMessage)) {
        out.push(buildMoment(turn, prevTurn, "explicit_denial", 0.9));
        continue; // interrupt occupies this turn; skip other signals
      }

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

      // Signal F: implicit_redirect — user steers to a different approach without
      // an explicit denial keyword. Patterns: "actually use/we use X", "try X instead",
      // "X is the team standard", "we use X for this".
      if (prevTurn && !out.find((m) => m.turnIndex === i)) {
        const redirect = detectImplicitRedirect(prevTurn.assistantText, turn.userMessage);
        if (redirect) {
          out.push(buildMoment(turn, prevTurn, "suggestion_override", 0.75));
        }
      }

      // Signal E: error_in_context — user pastes an error trace/message and the
      // previous turn had AI tool calls (i.e., AI caused the error or was involved).
      // This catches the common pattern: AI does something → error → user pastes error.
      //
      // Wave 3 patch: also fire when the user explicitly asks "how to fix" after an error,
      // even if prevHadToolUse=false (covers "echo $HOME still got error .how to fix ?").
      if (prevTurn && !out.find((m) => m.turnIndex === i)) {
        const hasError = detectErrorInMessage(turn.userMessage);
        const prevHadToolUse = prevTurn.toolCalls.length > 0;
        const hasHowToFix = /\bhow\s+to\s+fix\b|\bstill\s+(got\s+)?error\b/i.test(turn.userMessage);
        if (hasError && (prevHadToolUse || hasHowToFix)) {
          out.push(buildMoment(turn, prevTurn, "multi_failure", 0.8));
        }
      }
    }

    // Signal B tail: if the last turn itself has failures and no subsequent turn
    // captured a multi_failure signal for it, emit one on the last turn.
    // This covers the case where the user is silent (empty message) after an
    // AI failure — the session parser drops empty user turns, so no turn i+1
    // exists to trigger Signal B in the loop above.
    const lastTurn = session.turns[session.turns.length - 1];
    if (lastTurn && hasMultipleFailures(lastTurn)) {
      const alreadyCovered = out.find((m) => m.turnIndex === lastTurn.turnIndex);
      if (!alreadyCovered) {
        const prevTurn = session.turns.length >= 2
          ? session.turns[session.turns.length - 2]
          : undefined;
        out.push(buildMoment(lastTurn, prevTurn, "multi_failure", 0.70));
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

/**
 * Signal F: implicit redirect — user steers toward a different approach without
 * an explicit denial keyword. Catches patterns like:
 * - "actually just use async/await" (team standard redirect)
 * - "we actually use pino for this project" (project convention assertion)
 * - "try using Redis instead" (approach redirect with "instead")
 *
 * Requires prevTurn assistantText to have offered something concrete (proposed
 * an approach, lib, or tool) to avoid firing on pure info exchanges.
 */
function detectImplicitRedirect(assistantText: string, userText: string): boolean {
  if (!userText.trim()) return false;

  // Must reference an alternative approach/tool (not just generic statements)
  const toolName = "[@A-Za-z0-9][\\w@./-]{1,}";

  // Pattern: "actually [just] use X" / "we actually use X" / "we use X for this"
  const actuallyRedirect =
    /\bactually\s+(just\s+)?(use|we use|try)\s+/i.test(userText) ||
    /\bwe\s+(actually\s+)?use\s+[A-Za-z][\w@./-]{1,}/i.test(userText) ||
    new RegExp(`\\btry\\s+using?\\s+${toolName}\\s+instead\\b`, "i").test(userText);

  if (!actuallyRedirect) return false;

  // Confirm assistant had proposed something (not just answered a question)
  const assistantProposed =
    /\b(use|using|I'?ll use|install|I recommend|set up|implement|configure)\s+[A-Za-z]/i.test(
      assistantText,
    ) ||
    /推荐|建议|我用|我来用|使用/.test(assistantText);

  return assistantProposed;
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
