import {
  syncRuleVectors
} from "./chunk-MXJDRQEB.js";
import {
  openDb
} from "./chunk-EHS4WAHC.js";
import {
  buildSemanticDescriptions
} from "./chunk-4Y7LCJVR.js";
import {
  DEFAULT_FIRE_THRESHOLD
} from "./chunk-4RSUQUKR.js";
import {
  init_esm_shims
} from "./chunk-ZWU7KJPP.js";

// ../cli/src/commands/migrate-v6.ts
init_esm_shims();
import os from "os";
import path from "path";
function buildMigrationPrompt(r) {
  return [
    "\u628A\u4E0B\u9762\u8FD9\u6761\u65E7\u77E5\u8BC6\u89C4\u5219\u8F6C\u6210\u65B0\u7248\u53CC\u63CF\u8FF0\u683C\u5F0F\u3002",
    "",
    "\u3010\u65E7\u5B57\u6BB5\u3011",
    `trigger:         ${r.trigger}`,
    `wrong_pattern:   ${r.wrong_pattern}`,
    `correct_pattern: ${r.correct_pattern}`,
    `reasoning:       ${r.reasoning}`,
    "",
    "\u3010\u65B0\u5B57\u6BB5\u3011\u751F\u6210 2 \u4E2A\u5B57\u6BB5\uFF0C**\u53EA**\u8F93\u51FA JSON\uFF1A",
    `{`,
    `  "trigger_description": "\u7528\u4E00\u4E24\u53E5\u8BDD\u63CF\u8FF0\u4EC0\u4E48\u60C5\u5883\u4E0B\u8FD9\u6761\u89C4\u5219\u8BE5\u89E6\u53D1\uFF08\u5B8C\u6574\u7684\u573A\u666F\uFF0C\u7528\u81EA\u7136\u8BED\u8A00\uFF09",`,
    `  "pattern_description": "\u63CF\u8FF0\u4EC0\u4E48\u5177\u4F53\u884C\u4E3A/\u4EE3\u7801/\u64CD\u4F5C\u662F\u9519\u7684\uFF08\u5177\u4F53\u5230\u884C\u4E3A\uFF0C\u7528\u81EA\u7136\u8BED\u8A00\uFF09"`,
    `}`,
    "",
    "\u793A\u4F8B\uFF1A",
    '  \u65E7 trigger="\u9700\u8981\u53D1\u8D77HTTP\u8BF7\u6C42" wrong_pattern="axios" correct_pattern="fetch"',
    '  \u65B0 trigger_description="\u5728\u9879\u76EE\u4EE3\u7801\u91CC\u65B0\u53D1\u8D77\u4E00\u6B21HTTP\u8BF7\u6C42\u7684\u573A\u666F"',
    '  \u65B0 pattern_description="\u5F15\u5165\u6216\u8C03\u7528axios\u5E93\u53D1\u8BF7\u6C42"',
    "",
    "\u53EA\u8F93\u51FA JSON\uFF0C\u4E0D\u8981\u89E3\u91CA\u3002"
  ].join("\n");
}
function shouldResurrectDormant(r) {
  return r.status === "dormant" && r.hit_count >= 3;
}
function buildFallbackDescriptions(r) {
  return buildSemanticDescriptions(r);
}
async function executeMigrateV6(opts) {
  const home = os.homedir();
  const dbPath = opts.dbPath ?? path.join(home, ".teamagent", "global.db");
  const db = openDb(dbPath);
  const { ClaudeCodeLLMClient, XenovaRuleEmbedder } = await import("./src-F33CQC7S.js");
  const llm = opts.fast ? void 0 : opts.llmClient ?? new ClaudeCodeLLMClient({ model: "haiku" });
  let embedder = opts.embedder;
  const rows = db.prepare(
    `SELECT id, trigger, wrong_pattern, correct_pattern, reasoning, status, hit_count
       FROM knowledge
       WHERE ${opts.repairAll ? "status != 'archived'" : "COALESCE(trigger_description,'') = '' AND status != 'archived'"}
       ${opts.limit ? "LIMIT ?" : ""}`
  ).all(...opts.limit ? [opts.limit] : []);
  process.stderr.write(`Migrating ${rows.length} rules (dryRun=${opts.dryRun})...
`);
  let migrated = 0, resurrected = 0, skipped = 0;
  for (const r of rows) {
    try {
      let parsed;
      if (llm) {
        try {
          const promptText = buildMigrationPrompt(r);
          const rawText = await llm.complete(promptText);
          const jsonStr = rawText.trim().replace(/^```json\s*/m, "").replace(/```\s*$/m, "").trim();
          parsed = JSON.parse(jsonStr);
        } catch (e) {
          process.stderr.write(`fallback ${r.id}: ${e.message}
`);
          parsed = buildFallbackDescriptions(r);
        }
      } else {
        parsed = buildFallbackDescriptions(r);
      }
      if (opts.dryRun) {
        process.stdout.write(`[dry] ${r.id}: ${parsed.trigger_description.slice(0, 60)}
`);
        migrated++;
        continue;
      }
      embedder ??= new XenovaRuleEmbedder();
      const [tvec, pvec] = await embedder.embed([
        parsed.trigger_description,
        parsed.pattern_description
      ]);
      const resurrect = shouldResurrectDormant(r);
      db.prepare(
        `UPDATE knowledge SET
           trigger_description = ?,
           pattern_description = ?,
           threshold_alpha = 1.0,
           threshold_beta = 1.0,
           fire_threshold = ?,
           embedder_model_id = ?,
           status = CASE WHEN ? THEN 'active' ELSE status END,
           current_tier = CASE WHEN ? THEN 'probation' ELSE current_tier END
         WHERE id = ?`
      ).run(
        parsed.trigger_description,
        parsed.pattern_description,
        DEFAULT_FIRE_THRESHOLD,
        embedder.modelId,
        resurrect ? 1 : 0,
        resurrect ? 1 : 0,
        r.id
      );
      if (!tvec || !pvec) {
        throw new Error("Embedder returned no vector for rule migration");
      }
      syncRuleVectors(db, r.id, new Float32Array(tvec), new Float32Array(pvec));
      try {
        db.prepare(
          `INSERT OR REPLACE INTO knowledge_fts(id, trigger_description, pattern_description) VALUES (?, ?, ?)`
        ).run(r.id, parsed.trigger_description, parsed.pattern_description);
      } catch {
      }
      migrated++;
      if (resurrect) resurrected++;
    } catch (e) {
      process.stderr.write(`skip ${r.id}: ${e.message}
`);
      skipped++;
    }
  }
  return { migrated, resurrected, skipped };
}

export {
  buildMigrationPrompt,
  shouldResurrectDormant,
  buildFallbackDescriptions,
  executeMigrateV6
};
