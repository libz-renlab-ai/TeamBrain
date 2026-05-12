#!/usr/bin/env tsx
/**
 * 注入诊断脚本：展示给定 prompt 时系统会注入哪些规则
 *
 * 用法：
 *   npx tsx scripts/show-injection.ts "帮我写一个HTTP API测试"
 *   npx tsx scripts/show-injection.ts "开始实现新功能"
 *   npx tsx scripts/show-injection.ts --sync-vectors "任意 prompt"  ← 先同步向量再查
 */
import path from "node:path";
import os from "node:os";
import { openDb, syncRuleVectors, XenovaRuleEmbedder } from "../packages/adapters/src/index.js";
import { retrieveRulesForPrompt, buildTechStackText } from "../packages/cli/src/user-prompt-rule-retriever.js";
import { isFirstPrompt, readSessionInjected } from "../packages/cli/src/session-rule-injected.js";

const CWD = process.cwd();
const PROJECT_DB = path.join(CWD, ".teamagent", "knowledge.db");
const GLOBAL_DB = path.join(os.homedir(), ".teamagent", "global.db");
const SESSIONS_DIR = path.join(os.homedir(), ".teamagent", "sessions");
const SESSION_ID = `debug-${Date.now()}`;

const args = process.argv.slice(2);
const doSync = args.includes("--sync-vectors");
const prompt = args.filter(a => !a.startsWith("--")).join(" ") || "帮我实现一个新功能";

// ─── 步骤 1：向量同步（可选）────────────────────────────────────────────────

async function syncMissingVectors(dbPath: string): Promise<void> {
  console.log("\n[步骤 1] 同步缺失向量...");
  let db: ReturnType<typeof openDb>;
  try { db = openDb(dbPath); } catch { console.log("  跳过：DB 不存在"); return; }

  const rows = db.prepare(`
    SELECT id, trigger_description, pattern_description
    FROM knowledge
    WHERE status='active' AND trigger_description != ''
    ORDER BY created_at DESC
  `).all() as { id: string; trigger_description: string; pattern_description: string }[];

  if (rows.length === 0) { console.log("  无可同步规则"); db.close(); return; }

  console.log(`  找到 ${rows.length} 条有描述的规则，开始嵌入...`);
  const embedder = new XenovaRuleEmbedder();
  let synced = 0;

  for (const row of rows) {
    try {
      const [tv, pv] = await embedder.embed([row.trigger_description, row.pattern_description]);
      if (tv && pv) {
        syncRuleVectors(db, row.id, new Float32Array(tv), new Float32Array(pv));
        synced++;
        process.stdout.write(`\r  已同步 ${synced}/${rows.length}`);
      }
    } catch { /* 跳过单条失败 */ }
  }
  console.log(`\n  向量同步完成：${synced} 条`);
  db.close();
}

// ─── 步骤 2：运行真实检索 ────────────────────────────────────────────────────

async function runRetrieval(prompt: string): Promise<void> {
  console.log(`\n[步骤 2] 语义检索`);
  console.log(`  Prompt  : "${prompt}"`);
  console.log(`  Session : ${SESSION_ID}`);
  console.log(`  DB      : ${PROJECT_DB}`);

  const seenIds = readSessionInjected(SESSIONS_DIR, SESSION_ID);
  const firstPrompt = isFirstPrompt(SESSIONS_DIR, SESSION_ID);
  const techText = buildTechStackText(CWD);
  console.log(`  技术栈  : ${techText}`);
  console.log(`  首次 prompt: ${firstPrompt}`);

  let result: Awaited<ReturnType<typeof retrieveRulesForPrompt>>;
  try {
    // Issue #315: retrieveRulesForPrompt now requires explicit embedder.
    // This is a CLI debug script (not a hook), so in-process Xenova is OK —
    // hooks go through DaemonFirstEmbedder.
    result = await retrieveRulesForPrompt({
      userMessage: prompt,
      cwd: CWD,
      projectDbPath: PROJECT_DB,
      globalDbPath: GLOBAL_DB,
      sessionSeenIds: seenIds,
      isFirstPrompt: firstPrompt,
      embedder: new XenovaRuleEmbedder(),
    });
  } catch (e) {
    console.log(`  ❌ 检索失败：${String(e)}`);
    return;
  }

  // ─── 报告 ─────────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════");
  console.log("检索结果");
  console.log("══════════════════════════════════════");

  if (result.tier1Rules.length > 0) {
    console.log(`\n◆ Tier-1（技术栈匹配，首次 prompt）：${result.tier1Rules.length} 条`);
    for (const r of result.tier1Rules) {
      console.log(`  [${r.id}] conf=${r.confidence} tier=${r.current_tier}`);
      console.log(`    trigger: ${r.trigger.slice(0, 60)}`);
      console.log(`    correct: ${r.correct_pattern.slice(0, 60)}`);
    }
  } else {
    console.log("\n◆ Tier-1：无（isFirstPrompt=false 或无匹配）");
  }

  if (result.tier2Rules.length > 0) {
    console.log(`\n◆ Tier-2（用户消息语义匹配）：${result.tier2Rules.length} 条`);
    for (const r of result.tier2Rules) {
      console.log(`  [${r.id}] conf=${r.confidence} tier=${r.current_tier}`);
      console.log(`    trigger: ${r.trigger.slice(0, 60)}`);
      console.log(`    correct: ${r.correct_pattern.slice(0, 60)}`);
    }
  } else {
    console.log("\n◆ Tier-2：无匹配");
  }

  console.log("\n══════════════════════════════════════");
  console.log("注入文本（Claude 实际看到的）");
  console.log("══════════════════════════════════════");
  if (result.injectionText) {
    console.log(result.injectionText);
  } else {
    console.log("（无注入内容）");
  }

  console.log("\n══════════════════════════════════════");
  console.log("注入记录（allInjectedIds）");
  console.log("══════════════════════════════════════");
  if (result.allInjectedIds.length > 0) {
    console.log(result.allInjectedIds.join(", "));
  } else {
    console.log("（无）");
  }
}

// ─── 步骤 3：BM25 裸查（不依赖向量，验证 FTS 是否有候选）────────────────────

async function checkBM25(prompt: string): Promise<void> {
  console.log("\n[步骤 3] BM25/FTS 候选数（独立验证）");
  let db: ReturnType<typeof openDb>;
  try { db = openDb(PROJECT_DB); } catch { console.log("  DB 不存在"); return; }

  try {
    const rows = db.prepare(`
      SELECT k.id, k.trigger, k.confidence
      FROM knowledge_fts f
      JOIN knowledge k ON k.id = f.id
      WHERE knowledge_fts MATCH ?
        AND k.status = 'active'
      LIMIT 5
    `).all(prompt) as any[];
    console.log(`  FTS 命中 ${rows.length} 条：`);
    for (const r of rows) {
      console.log(`    [${r.id}] conf=${r.confidence} — ${r.trigger.slice(0, 60)}`);
    }
  } catch (e) {
    console.log(`  FTS 查询失败（可能无 FTS 表）：${String(e).slice(0, 80)}`);
  }
  db.close();
}

// ─── main ────────────────────────────────────────────────────────────────────

(async () => {
  console.log("═══════════════════════════════════════════");
  console.log("TeamAgent 注入诊断");
  console.log("═══════════════════════════════════════════");

  if (doSync) await syncMissingVectors(PROJECT_DB);

  await runRetrieval(prompt);
  await checkBM25(prompt);

  console.log("\n提示：如果 Tier-1/2 无匹配，运行 --sync-vectors 先同步向量：");
  console.log(`  npx tsx scripts/show-injection.ts --sync-vectors "${prompt}"\n`);
})().catch(e => { console.error(e); process.exit(1); });
