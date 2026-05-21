import {
  init_esm_shims
} from "./chunk-ZWU7KJPP.js";

// ../cli/src/commands/migrate-v1-to-v2.ts
init_esm_shims();
import fs from "fs";
import path from "path";
import os from "os";
function readJsonlIfExists(p) {
  if (!fs.existsSync(p)) return [];
  const content = fs.readFileSync(p, "utf-8");
  return content.split("\n").filter((line) => line.trim()).map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter((e) => e !== null);
}
async function executeMigrate(opts = {}) {
  const home = opts.homeDir ?? os.homedir();
  const cwd = opts.cwd ?? process.cwd();
  const dryRun = opts.dryRun ?? false;
  const personalPath = path.join(home, ".teamagent", "personal", "knowledge.jsonl");
  const teamPath = path.join(cwd, ".teamagent", "knowledge.jsonl");
  const globalPath = path.join(home, ".teamagent", "global", "knowledge.jsonl");
  const personal = readJsonlIfExists(personalPath);
  const team = readJsonlIfExists(teamPath);
  const global = readJsonlIfExists(globalPath);
  const all = [...personal, ...team, ...global];
  const result = {
    readEntries: all.length,
    byScope: {
      personal: personal.length,
      team: team.length,
      global: global.length
    },
    written: 0,
    rejected: 0,
    rejectionLog: []
  };
  if (dryRun) {
    return result;
  }
  const projectDbPath = path.join(cwd, ".teamagent", "knowledge.db");
  const globalDbPath = path.join(home, ".teamagent", "global.db");
  fs.mkdirSync(path.dirname(projectDbPath), { recursive: true });
  fs.mkdirSync(path.dirname(globalDbPath), { recursive: true });
  const { DualLayerStore } = await import("./dual-layer-store-AO4EZIS4.js");
  const store = new DualLayerStore({ projectDbPath, userGlobalDbPath: globalDbPath });
  const now = (/* @__PURE__ */ new Date()).toISOString();
  for (const old of all) {
    const phase1HitTag = `phase1_hit_count:${old.hit_count ?? 0}`;
    const phase1LastHitTag = `phase1_last_hit:${old.last_hit_at || "unknown"}`;
    const newEntry = {
      ...old,
      scope: { ...old.scope, level: old.scope.level },
      tags: [...old.tags ?? [], phase1HitTag, phase1LastHitTag],
      confidence: 0,
      enforcement: "passive",
      status: "active",
      hit_count: 0,
      success_count: 0,
      override_count: 0,
      last_hit_at: "",
      demerit: 0,
      demerit_last_updated: now,
      current_tier: "experimental",
      max_tier_ever: "experimental",
      tier_entered_at: now,
      resurrect_count: 0
    };
    try {
      store.add(newEntry);
      result.written++;
    } catch (err) {
      result.rejected++;
      result.rejectionLog.push({ id: old.id, reason: String(err) });
    }
  }
  store.close();
  return result;
}
export {
  executeMigrate
};
