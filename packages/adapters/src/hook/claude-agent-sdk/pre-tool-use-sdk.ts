import type { PreToolUseHookInput } from "@anthropic-ai/claude-agent-sdk";
import { detectCompliedSignals, type OverrideSignalEvent } from "@teamagent/core";

export interface SemanticHit {
  id: string;
  trigger: string;
  score: number;
}

export interface PreToolUseDeps {
  matcher: {
    match(input: { tool_name: string; tool_input: unknown }): Promise<{
      matched: any[];
      /** 语义检索原始命中（不限 enforcement 级别），verbose pass 时展示 */
      semanticHits?: SemanticHit[];
    }>;
  };
  eventLog: {
    append(e: any): void;
    readLast(n: number): any[];
  };
  /**
   * 归因可见度。"verbose" 时在 clean-pass (无规则命中) 也发一条短 systemMessage,
   * 让用户感知到 hook 在跑。"smart"/"silent" 保持静默 (原行为)。
   * 缺省 → "smart" (向后兼容)。
   */
  visibility?: "silent" | "smart" | "verbose";
  /** 本次匹配用了多少条规则, 仅 verbose pass 消息里展示 */
  ruleCount?: number;
}

export interface PreToolUseResult {
  permissionDecision: "allow" | "deny" | "ask";
  permissionDecisionReason?: string;
  systemMessage?: string;
}

export function createPreToolUseHandler(deps: PreToolUseDeps) {
  return async (input: PreToolUseHookInput): Promise<PreToolUseResult> => {
    const { tool_name, tool_input } = input;
    const tool_use_id = input.tool_use_id ?? crypto.randomUUID();
    const now = new Date().toISOString();

    const { matched, semanticHits } = await deps.matcher.match({ tool_name, tool_input });

    if (matched.length === 0) {
      // Clean pass — 检测 AI 是否遵守了近期对同 tool 的警告
      const recent = deps.eventLog.readLast(50) as OverrideSignalEvent[];
      const complied = detectCompliedSignals(tool_name, recent, new Date(now));
      for (const c of complied) {
        deps.eventLog.append({
          id: `e-complied-${tool_use_id}-${c.knowledge_id}`,
          kind: "ai.override.complied",
          knowledge_id: c.knowledge_id,
          tool_use_id,
          timestamp: now,
          schema_version: 1,
        });
      }
      deps.eventLog.append({
        id: `e-${tool_use_id}-passed`,
        kind: "hook-pre.passed",
        tool_use_id,
        timestamp: now,
        schema_version: 1,
      });
      if (deps.visibility === "verbose") {
        const n = typeof deps.ruleCount === "number" ? deps.ruleCount : 0;
        const hits = semanticHits ?? [];
        const hitSummary = hits.length > 0 ? `, 语义命中 ${hits.length} 条` : "";
        const lines = [`◈ TeamAgent: ✓ ${tool_name} 放行 (检查 ${n} 条规则${hitSummary})`];
        for (const h of hits) {
          lines.push(`  · [${h.id}] ${h.trigger.slice(0, 40)} (score ${h.score.toFixed(2)})`);
        }
        return { permissionDecision: "allow", systemMessage: lines.join("\n") };
      }
      return { permissionDecision: "allow" };
    }

    // 取 enforcement 最严格的那条
    const sorted = [...matched].sort(
      (a, b) => severityOrder(b.enforcement) - severityOrder(a.enforcement),
    );
    const top = sorted[0];
    const nowDate = new Date(now);

    if (top.enforcement === "block") {
      // 软化策略：永远不硬阻塞 Claude Code，只当作"强烈提醒"通过 systemMessage 展示。
      // 事件 kind 仍记 hook-pre.blocked，保留 calibrator / 升档统计逻辑不变。
      const reason = formatBlockReason(top, nowDate);
      deps.eventLog.append({
        id: `e-${tool_use_id}-blocked`,
        kind: "hook-pre.blocked",
        knowledge_id: top.id,
        tool_use_id,
        tool_name,              // M3: 供 detectBlockedCircumventedSignals 用
        timestamp: now,
        schema_version: 1,
      });
      return { permissionDecision: "allow", systemMessage: reason };
    }

    // passive → 静默观察：发 hook-pre.passive_matched (PostToolUse 通过 startsWith("hook-pre.")
    // 自动累计 hit_count；不发 systemMessage，不污染 helped 计数)。这是 calibrator 升档
    // passive→suggest→warn→block 的唯一证据来源。
    if (top.enforcement === "passive") {
      deps.eventLog.append({
        id: `e-${tool_use_id}-passive`,
        kind: "hook-pre.passive_matched",
        knowledge_id: top.id,
        tool_use_id,
        tool_name,
        timestamp: now,
        schema_version: 1,
      });
      return { permissionDecision: "allow" };
    }

    // warn / suggest → allow + systemMessage hint
    const reason = formatWarnMessage(top, nowDate);
    deps.eventLog.append({
      id: `e-${tool_use_id}-warned`,
      kind: "hook-pre.warned",
      knowledge_id: top.id,
      tool_use_id,
      tool_name,              // M2.5: 供 detectCompliedSignals 用
      timestamp: now,
      schema_version: 1,
    });
    return { permissionDecision: "allow", systemMessage: reason };
  };
}

function severityOrder(e: string): number {
  return ({ block: 3, warn: 2, suggest: 1, passive: 0 } as Record<string, number>)[e] ?? 0;
}

function relativeTime(dateStr: string, now: Date): string {
  const diffMs = now.getTime() - new Date(dateStr).getTime();
  if (isNaN(diffMs)) return "未知";
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days < 1) return "今天";
  if (days < 7) return `${days}天前`;
  if (days < 30) return `${Math.floor(days / 7)}周前`;
  return `${Math.floor(days / 30)}个月前`;
}

// Humane hook block (issue #86): first line tells the user what the rule
// is about + suggests an alternative; second line shows the suggested
// pattern verbatim (copy-paste ready); third line collapses confidence /
// trigger count / age / rule id into a details suffix.
//
// Legacy ASCII-box rendering preserved behind the TEAMAGENT_HOOK_ASCII_BOX=1
// env switch so engineer dogfooders who liked the old shape can opt back in.

function formatWarnMessage(rule: any, now: Date): string {
  if (process.env.TEAMAGENT_HOOK_ASCII_BOX === "1") {
    return formatLegacyWarnBox(rule, now);
  }
  return formatHumaneBlock(rule, now, /*severity*/ "warn");
}

function formatBlockReason(rule: any, now: Date): string {
  if (process.env.TEAMAGENT_HOOK_ASCII_BOX === "1") {
    return formatLegacyBlockBox(rule, now);
  }
  return formatHumaneBlock(rule, now, /*severity*/ "block");
}

function formatHumaneBlock(rule: any, now: Date, severity: "warn" | "block"): string {
  const age = rule.created_at ? relativeTime(rule.created_at as string, now) : "未知";
  const conf = typeof rule.confidence === "number" ? rule.confidence.toFixed(2) : "?";
  const hitCount = typeof rule.hit_count === "number" ? rule.hit_count : 0;
  const ruleIdShort = ruleIdShortForm(rule.id ?? rule.rule_id);
  const correct: string = rule.correct_pattern ?? rule.trigger ?? "";
  const summary: string = rule.summary ?? rule.trigger ?? rule.wrong_pattern ?? "需要注意";
  const prefix = severity === "block" ? "⚠️ TeamAgent 拦了一下" : "⚠️ TeamAgent 提醒";

  const firstLine = trimAt(`${prefix} — ${summary}`, 80);
  const suggestionLine = correct
    ? `   复制即可: ${trimAt(correct, 200)}`
    : `   建议: 见下方规则细节`;
  const hitPart = severity === "block" ? ` · 已触发 ${hitCount} 次` : "";
  const detailLine = `   细节: conf=${conf} ${age}学到${hitPart}${ruleIdShort ? ` rule=${ruleIdShort}` : ""}`;

  return [firstLine, suggestionLine, detailLine].join("\n");
}

function formatLegacyWarnBox(rule: any, now: Date): string {
  const age = rule.created_at ? relativeTime(rule.created_at as string, now) : "未知";
  const conf = typeof rule.confidence === "number" ? rule.confidence.toFixed(2) : "?";
  const correct = rule.correct_pattern ?? rule.trigger ?? "";
  const wrong = rule.wrong_pattern ?? "";
  const reasoning = rule.reasoning ?? "";
  const lines = [`置信度 ${conf} · ${age}学到`];
  if (wrong) lines.push(...formatRuleField("避免", wrong));
  if (correct) lines.push(...formatRuleField("使用", correct));
  if (reasoning) lines.push(...formatRuleField("理由", reasoning));
  return formatAsciiRuleBlock("TeamAgent 经验提醒", lines);
}

function formatLegacyBlockBox(rule: any, now: Date): string {
  const age = rule.created_at ? relativeTime(rule.created_at as string, now) : "未知";
  const conf = typeof rule.confidence === "number" ? rule.confidence.toFixed(2) : "?";
  const hitCount = typeof rule.hit_count === "number" ? rule.hit_count : 0;
  const correct = rule.correct_pattern ?? rule.trigger ?? "";
  const wrong = rule.wrong_pattern ?? "";
  const reasoning = rule.reasoning ?? "";
  const lines = [`置信度 ${conf} · 已触发 ${hitCount} 次 · ${age}学到`];
  if (wrong) lines.push(...formatRuleField("避免", wrong));
  if (correct) lines.push(...formatRuleField("使用", correct));
  if (reasoning) lines.push(...formatRuleField("理由", reasoning));
  return formatAsciiRuleBlock("TeamAgent 强烈提醒", lines);
}

function trimAt(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function ruleIdShortForm(id: unknown): string {
  if (typeof id !== "string" || id.length === 0) return "";
  // pers-20260507033700-ty7hqm → ty7hqm (last 6 chars after final hyphen)
  const tail = id.split("-").pop();
  if (!tail) return id.slice(0, 8);
  return tail.length > 8 ? tail.slice(0, 8) : tail;
}

const RULE_BOX_WIDTH = 72;
const RULE_BOX_INNER_WIDTH = RULE_BOX_WIDTH - 4;

function formatRuleField(label: string, value: string): string[] {
  return wrapRuleLine(`${label}: ${value}`, RULE_BOX_INNER_WIDTH);
}

function formatAsciiRuleBlock(title: string, lines: string[]): string {
  const titlePrefix = `+-- ${title} `;
  const titleBorder = "-".repeat(Math.max(2, RULE_BOX_WIDTH - titlePrefix.length - 1));
  const border = `+${"-".repeat(RULE_BOX_WIDTH - 2)}+`;
  const body = lines.flatMap((line) => wrapRuleLine(line, RULE_BOX_INNER_WIDTH));

  return [
    `${titlePrefix}${titleBorder}+`,
    ...body.map((line) => `| ${line.padEnd(RULE_BOX_INNER_WIDTH, " ")} |`),
    border,
  ].join("\n");
}

function wrapRuleLine(line: string, width: number): string[] {
  if (line.length <= width) return [line];

  const wrapped: string[] = [];
  let current = "";

  for (const word of line.split(/(\s+)/)) {
    if (word.length === 0) continue;
    if (/^\s+$/.test(word)) {
      if (current && !current.endsWith(" ")) current += " ";
      continue;
    }

    if (word.length > width) {
      if (current.trim()) {
        wrapped.push(current.trimEnd());
        current = "";
      }
      for (let i = 0; i < word.length; i += width) {
        wrapped.push(word.slice(i, i + width));
      }
      continue;
    }

    if ((current + word).length > width) {
      if (current.trim()) wrapped.push(current.trimEnd());
      current = word;
    } else {
      current += word;
    }
  }

  if (current.trim()) wrapped.push(current.trimEnd());
  return wrapped.length > 0 ? wrapped : [line.slice(0, width)];
}
