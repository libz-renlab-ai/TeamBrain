import {
  parseTeamRule,
  serializeTeamRule
} from "./chunk-4Y7LCJVR.js";
import {
  init_esm_shims
} from "./chunk-ZWU7KJPP.js";

// ../adapters/src/m5/fs-team-rule-store.ts
init_esm_shims();
import { promises as fs } from "fs";
import * as path from "path";
var FsTeamRuleStore = class {
  async listAll(projectRoot, opts = {}) {
    const teamDir = path.join(projectRoot, ".teamagent", "team");
    const out = [];
    let authors;
    try {
      authors = await fs.readdir(teamDir);
    } catch (e) {
      if (e.code === "ENOENT") return out;
      throw e;
    }
    const realNowMs = Date.now();
    const skewMs = opts.futureSkewToleranceMs ?? 6e4;
    for (const claimAuthor of authors) {
      const authorDir = path.join(teamDir, claimAuthor);
      let stat;
      try {
        stat = await fs.stat(authorDir);
      } catch {
        continue;
      }
      if (!stat.isDirectory()) continue;
      let entries;
      try {
        entries = await fs.readdir(authorDir);
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.endsWith(".json")) continue;
        const filePath = path.join(authorDir, entry);
        try {
          const raw = await fs.readFile(filePath, "utf8");
          const file = parseTeamRule(raw);
          const cur = file.current;
          const effTs = cur.deleted ? cur.deleted_ts : cur.modified_ts;
          if (typeof effTs === "string") {
            const tsMs = Date.parse(effTs);
            if (Number.isFinite(tsMs) && tsMs > realNowMs + skewMs) {
              opts.onSkip?.({
                path: filePath,
                reason: `effective timestamp "${effTs}" is more than ${Math.round(skewMs / 1e3)}s in the future`
              });
              continue;
            }
          }
          out.push({ claim_author: claimAuthor, file });
        } catch (e) {
          opts.onSkip?.({
            path: filePath,
            reason: e.message ?? String(e)
          });
        }
      }
    }
    return out;
  }
  async readRule(projectRoot, claimAuthor, ruleId) {
    const p = path.join(
      projectRoot,
      ".teamagent",
      "team",
      sanitize(claimAuthor),
      `${sanitize(ruleId)}.json`
    );
    try {
      const raw = await fs.readFile(p, "utf8");
      return parseTeamRule(raw);
    } catch (e) {
      if (e.code === "ENOENT") return null;
      throw e;
    }
  }
  async writeRule(projectRoot, claimAuthor, rule) {
    const dir = path.join(
      projectRoot,
      ".teamagent",
      "team",
      sanitize(claimAuthor)
    );
    await fs.mkdir(dir, { recursive: true });
    const finalPath = path.join(dir, `${sanitize(rule.rule_id)}.json`);
    const tmpPath = `${finalPath}.tmp.${process.pid}.${Date.now()}`;
    const content = serializeTeamRule(rule);
    await fs.writeFile(tmpPath, content, "utf8");
    await fs.rename(tmpPath, finalPath);
  }
};
function sanitize(id) {
  return id.replace(/[^A-Za-z0-9._-]/g, "_");
}

export {
  FsTeamRuleStore
};
