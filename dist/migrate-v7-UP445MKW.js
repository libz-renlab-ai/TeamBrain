import "./chunk-NPSW37EI.js";
import {
  syncToolVector
} from "./chunk-MXJDRQEB.js";
import {
  openDb
} from "./chunk-EHS4WAHC.js";
import "./chunk-JJSYX6XZ.js";
import "./chunk-4Y7LCJVR.js";
import "./chunk-4RSUQUKR.js";
import {
  init_esm_shims
} from "./chunk-ZWU7KJPP.js";

// ../cli/src/commands/migrate-v7.ts
init_esm_shims();
import path from "path";
import os from "os";
function buildToolContextPrompt(r) {
  return [
    "\u4F60\u662F\u4EE3\u7801\u8D28\u91CF\u89C4\u5219\u5206\u6790\u52A9\u624B\u3002\u7ED9\u5B9A\u4E00\u6761\u7F16\u7A0B\u89C4\u5219\uFF0C\u63CF\u8FF0\u5F53 AI \u4F7F\u7528\u5DE5\u5177\u65F6\uFF0C\u4EC0\u4E48\u6837\u7684\u5177\u4F53\u5DE5\u5177\u64CD\u4F5C\uFF08Bash\u547D\u4EE4\u3001\u6587\u4EF6\u7F16\u8F91\u7B49\uFF09\u4F1A\u89E6\u53D1\u8FD9\u6761\u89C4\u5219\u3002",
    "",
    "\u89C4\u5219\u4FE1\u606F\uFF1A",
    `- \u89E6\u53D1\u573A\u666F: ${r.trigger}`,
    `- \u9519\u8BEF\u505A\u6CD5: ${r.wrong_pattern || "(\u65E0)"}`,
    `- \u6B63\u786E\u505A\u6CD5: ${r.correct_pattern}`,
    `- \u539F\u56E0: ${r.reasoning}`,
    "",
    "\u75281-2\u53E5\u8BDD\u63CF\u8FF0\uFF1AAI \u4F1A\u6267\u884C\u4EC0\u4E48\u6837\u7684\u5177\u4F53\u5DE5\u5177\u64CD\u4F5C\uFF08\u5982 Bash \u547D\u4EE4\u3001\u5199\u5165\u4EC0\u4E48\u6587\u4EF6\u3001\u7F16\u8F91\u4EC0\u4E48\u4EE3\u7801\uFF09\u624D\u4F1A\u89E6\u53D1\u8FD9\u6761\u89C4\u5219\uFF1F",
    "\u53EA\u63CF\u8FF0\u5DE5\u5177\u64CD\u4F5C\uFF0C\u4E0D\u8981\u8BF4\u573A\u666F\u6216\u539F\u56E0\u3002\u76F4\u63A5\u8F93\u51FA\u63CF\u8FF0\uFF0C\u4E0D\u52A0\u5F15\u53F7\u3002"
  ].join("\n");
}
async function executeMigrateV7(opts) {
  const home = os.homedir();
  const dbPath = opts.dbPath ?? path.join(home, ".teamagent", "global.db");
  const db = openDb(dbPath);
  const rows = db.prepare(
    `SELECT id, trigger, wrong_pattern, correct_pattern, reasoning
       FROM knowledge
       WHERE status != 'archived'
         AND (tool_context_description IS NULL OR tool_context_description = '')
       ${opts.limit ? "LIMIT ?" : ""}`
  ).all(...opts.limit ? [opts.limit] : []);
  process.stdout.write(`Migrating ${rows.length} rules (dryRun=${opts.dryRun})...
`);
  if (rows.length === 0) {
    db.close();
    return;
  }
  const { ClaudeCodeLLMClient, XenovaRuleEmbedder } = await import("./src-F33CQC7S.js");
  const llm = opts.llmClient ?? new ClaudeCodeLLMClient({ model: "haiku" });
  const embedder = opts.embedder ?? new XenovaRuleEmbedder();
  let migrated = 0;
  for (const row of rows) {
    try {
      const desc = await llm.complete(buildToolContextPrompt(row));
      if (!desc || desc.trim().length < 5) continue;
      if (opts.dryRun) {
        process.stdout.write(`[dry] ${row.id}: ${desc.trim().slice(0, 60)}
`);
        migrated++;
        continue;
      }
      const [vec] = await embedder.embed([desc.trim()]);
      if (!vec) continue;
      db.prepare("UPDATE knowledge SET tool_context_description = ? WHERE id = ?").run(
        desc.trim(),
        row.id
      );
      syncToolVector(db, row.id, new Float32Array(vec));
      migrated++;
      process.stdout.write(`\r  \u5DF2\u8FC1\u79FB ${migrated}/${rows.length}`);
    } catch {
    }
  }
  process.stdout.write(`
migrated=${migrated} skipped=${rows.length - migrated}
`);
  db.close();
}
export {
  buildToolContextPrompt,
  executeMigrateV7
};
