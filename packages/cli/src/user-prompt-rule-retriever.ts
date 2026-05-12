import fs from "node:fs";
import path from "node:path";
import type { KnowledgeEntry } from "@teamagent/types";
import { detectStack, semanticMatch, rerankByConfidence } from "@teamagent/core";
import {
  SqliteSemanticRetriever,
  openDb,
} from "@teamagent/adapters";
import type { RuleEmbedder } from "@teamagent/ports";
import type { SemanticMatch } from "@teamagent/core";

const TOP_K = 3;
const MIN_SCORE = 0.35;

/**
 * Co-occurrence guard for semantic injection.
 *
 * Some practice rules describe triggers that require multiple tokens to ALL be
 * present simultaneously (e.g. "prompt must contain (1) X AND (2) Y AND (3) Z").
 * The BM25/dense retriever can surface such a rule when the user message only
 * partially overlaps (e.g. contains X but not Y or Z), causing the wrong
 * canned-answer hint to be injected.
 *
 * Detection: if correct_pattern contains the pattern `(N) 'token'` (numbered
 * single-quoted elements), extract those tokens and require ALL of them to
 * appear in the user message (case-insensitive substring).
 *
 * Returns true  → safe to inject (all required tokens present, or no multi-element pattern detected).
 * Returns false → skip injection (partial match only).
 */
export function passesCoOccurrenceGuard(rule: KnowledgeEntry, userMessage: string): boolean {
  const pattern = rule.correct_pattern ?? "";
  // Match patterns like (1) 'token', (2) 'token', ... or with Chinese fullwidth parentheses
  const tokenRe = /\(\d+\)\s*[''‘’]([^''‘’]+)[''‘’]/g;
  const required: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(pattern)) !== null) {
    const tok = m[1]!.trim();
    if (tok.length >= 3) required.push(tok);
  }
  if (required.length < 2) return true; // single-element or no pattern — always allow
  const msgLower = userMessage.toLowerCase();
  return required.every((tok) => msgLower.includes(tok.toLowerCase()));
}

export interface RetrieveRulesArgs {
  userMessage: string;
  cwd: string;
  projectDbPath: string;
  globalDbPath: string;
  sessionSeenIds: Set<string>;
  isFirstPrompt: boolean;
  embedder?: RuleEmbedder;
}

export interface RuleRetrievalResult {
  tier1Rules: KnowledgeEntry[];
  tier2Rules: KnowledgeEntry[];
  injectionText: string;
  allInjectedIds: string[];
}

export function buildTechStackText(cwd: string): string {
  const presence = {
    exists: (rel: string) => {
      try { return fs.existsSync(path.join(cwd, rel)); } catch { return false; }
    },
    read: (rel: string): string | undefined => {
      try { return fs.readFileSync(path.join(cwd, rel), "utf-8"); } catch { return undefined; }
    },
  };
  try {
    const stack = detectStack(presence);
    const parts = [
      ...stack.languages,
      ...stack.frameworks,
      ...stack.packageManagers,
      ...stack.testRunners,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : "software project";
  } catch {
    return "software project";
  }
}

export function buildTerminalSummary(tier1: KnowledgeEntry[], tier2: KnowledgeEntry[]): string {
  const all = [...tier1, ...tier2];
  if (all.length === 0) return "";
  const summary = all
    .map((r) => `${r.trigger.slice(0, 28)} -> ${r.correct_pattern.slice(0, 34)}`)
    .join("; ");
  const content = `找到 ${all.length} 条相关经验: ${summary}`;
  const maxContentLength = 150;
  const clipped =
    content.length > maxContentLength
      ? `${content.slice(0, maxContentLength - 3)}...`
      : content;
  return [
    "========|| TeamAgent ||========",
    `|| ${clipped} ||`,
    "========||===========||========",
  ].join("\n");
}

export function formatRuleInjection(rules: KnowledgeEntry[], tier: "T1" | "T2"): string {
  if (rules.length === 0) return "";
  const lines = [`◈ TeamAgent 相关经验（语义检索 ${tier}）`];
  for (const r of rules) {
    const conf = r.confidence.toFixed(2);
    lines.push(`- [${r.trigger.slice(0, 50)}] → ${r.correct_pattern.slice(0, 80)} (conf ${conf})`);
  }
  // 让 AI 在回复开头主动复述，绕过 CC 2.1.x systemMessage 不显示的 UI bug。
  // 通过对话渠道让用户感知到本次激活了哪些规则。可用 TEAMAGENT_AI_ANNOUNCE=0 关闭。
  if (process.env.TEAMAGENT_AI_ANNOUNCE !== "0") {
    const triggers = rules.map((r) => r.trigger.slice(0, 30)).join(" / ");
    lines.push("");
    lines.push(`【显示要求】请在你回复的最开头单独用一行写："📋 本次参考: ${triggers}"，让用户知道这些经验影响了你的回答。然后再正常回复。`);
  }
  return lines.join("\n");
}

async function queryRules(
  text: string,
  embedder: RuleEmbedder,
  projectDbPath: string,
  globalDbPath: string,
  excludeIds: Set<string>,
  userMessage = text,
): Promise<KnowledgeEntry[]> {
  // project DB 存放本项目 personal/team 规则；global DB 存放跨项目 global 规则。
  // 必须按 DB 来源传正确的 scope，否则 scope_level 过滤会把规则过滤掉（零命中）。
  const dbsWithScope: Array<{ path: string; scope: "personal" | "team" | "global" }> = [
    { path: projectDbPath, scope: "personal" },
    { path: projectDbPath, scope: "team" },
    { path: globalDbPath,  scope: "global"   },
  ];

  const dbs: ReturnType<typeof openDb>[] = [];
  const hits: SemanticMatch[] = [];

  try {
    for (const { path: dbPath, scope } of dbsWithScope) {
      if (!fs.existsSync(dbPath)) continue;
      const db = openDb(dbPath);
      dbs.push(db);
      const retriever = new SqliteSemanticRetriever(db);
      const matches = await semanticMatch({
        contextText: text,
        actionText: text,
        embedder,
        retriever,
        scope: { level: scope },
        topK: TOP_K * 3,
      });
      hits.push(...matches);
    }
  } finally {
    for (const db of dbs) { try { db.close(); } catch { /* ok */ } }
  }

  const reranked = rerankByConfidence(hits);
  const seen = new Set<string>();
  const result: KnowledgeEntry[] = [];
  for (const m of reranked) {
    if (m.score < MIN_SCORE) continue;
    if (excludeIds.has(m.rule.id)) continue;
    if (seen.has(m.rule.id)) continue;
    if (!passesCoOccurrenceGuard(m.rule, userMessage)) continue;
    seen.add(m.rule.id);
    result.push(m.rule);
    if (result.length >= TOP_K) break;
  }
  return result;
}

export async function retrieveRulesForPrompt(
  args: RetrieveRulesArgs,
): Promise<RuleRetrievalResult> {
  // Issue #315: previous default `?? new XenovaRuleEmbedder()` was the
  // bug source. Every UserPromptSubmit fired this and loaded the 650MB
  // ONNX in-process. Throw now so any future caller that forgets to
  // pass the daemon-first embedder cannot silently regress.
  if (!args.embedder) {
    throw new Error(
      "retrieveRulesForPrompt requires an explicit `embedder` (use DaemonFirstEmbedder for hook paths; XenovaRuleEmbedder remains for CLI/scripts)",
    );
  }
  const embedder = args.embedder;
  const allSeen = new Set(args.sessionSeenIds);

  let tier1Rules: KnowledgeEntry[] = [];
  if (args.isFirstPrompt) {
    const techText = buildTechStackText(args.cwd);
    tier1Rules = await queryRules(techText, embedder, args.projectDbPath, args.globalDbPath, allSeen, args.userMessage);
    for (const r of tier1Rules) allSeen.add(r.id);
  }

  const tier2Rules = await queryRules(
    args.userMessage,
    embedder,
    args.projectDbPath,
    args.globalDbPath,
    allSeen,
    args.userMessage,
  );

  const blocks: string[] = [];
  const t1text = formatRuleInjection(tier1Rules, "T1");
  if (t1text) blocks.push(t1text);
  const t2text = formatRuleInjection(tier2Rules, "T2");
  if (t2text) blocks.push(t2text);

  return {
    tier1Rules,
    tier2Rules,
    injectionText: blocks.join("\n\n"),
    allInjectedIds: [
      ...tier1Rules.map((r) => r.id),
      ...tier2Rules.map((r) => r.id),
    ],
  };
}
