import {
  FsTeamRuleStore
} from "./chunk-JJSYX6XZ.js";
import {
  isSafeAuthor,
  isSafeRuleId,
  mergeLwwBatch
} from "./chunk-4Y7LCJVR.js";
import {
  init_esm_shims
} from "./chunk-ZWU7KJPP.js";

// ../cli/src/commands/m5-delete.ts
init_esm_shims();
import { execSync } from "child_process";
var M5DeleteValidationError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "M5DeleteValidationError";
  }
};
async function runM5Delete(opts) {
  if (!isSafeRuleId(opts.ruleId)) {
    throw new M5DeleteValidationError(
      `--rule-id "${opts.ruleId}" contains illegal characters; allowed: [A-Za-z0-9._-], length 1..200`
    );
  }
  const deletedByRaw = opts.deletedBy ?? gitUserName() ?? "unknown";
  if (!isSafeAuthor(deletedByRaw)) {
    throw new M5DeleteValidationError(
      `--by "${deletedByRaw}" contains illegal characters; allowed: [A-Za-z0-9._-], length 1..100`
    );
  }
  const store = new FsTeamRuleStore();
  const claims = await store.listAll(opts.projectRoot);
  const merged = mergeLwwBatch(claims);
  const cur = merged.get(opts.ruleId);
  if (!cur) {
    throw new M5DeleteValidationError(
      `rule "${opts.ruleId}" does not exist; refusing to write tombstone for nonexistent rule`
    );
  }
  const deletedBy = deletedByRaw;
  const originalAuthor = cur.original_author ?? deletedBy;
  const now = opts.now ?? (/* @__PURE__ */ new Date()).toISOString();
  const nowMs = Date.parse(now);
  const realNowMs = Date.now();
  if (Number.isFinite(nowMs) && nowMs > realNowMs + 6e4) {
    throw new M5DeleteValidationError(
      `--now "${now}" is more than 60s in the future relative to system clock`
    );
  }
  const tomb = {
    rule_id: opts.ruleId,
    author: originalAuthor,
    current: {
      deleted: true,
      deleted_by: deletedBy,
      deleted_ts: now,
      ...opts.reason ? { reason: opts.reason } : {}
    }
  };
  await store.writeRule(opts.projectRoot, deletedBy, tomb);
  return {
    rule_id: opts.ruleId,
    written_path: `.teamagent/team/${deletedBy}/${opts.ruleId}.json`,
    original_author: originalAuthor,
    was_already_tombstoned: cur?.winner !== void 0 && cur.winner.deleted === true
  };
}
function gitUserName() {
  try {
    return execSync("git config user.name", { encoding: "utf8" }).trim() || null;
  } catch {
    return null;
  }
}
function parseM5DeleteArgs(args) {
  const opts = { projectRoot: process.cwd(), ruleId: "" };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === void 0) continue;
    const take = (flag) => {
      if (a === flag) return args[++i];
      if (a.startsWith(flag + "=")) return a.slice(flag.length + 1);
      return void 0;
    };
    const r = take("--project-root");
    if (r !== void 0) {
      opts.projectRoot = r;
      continue;
    }
    const id = take("--rule-id");
    if (id !== void 0) {
      opts.ruleId = id;
      continue;
    }
    const by = take("--by");
    if (by !== void 0) {
      opts.deletedBy = by;
      continue;
    }
    const reason = take("--reason");
    if (reason !== void 0) {
      opts.reason = reason;
      continue;
    }
    const ts = take("--now");
    if (ts !== void 0) {
      opts.now = ts;
      continue;
    }
  }
  return opts;
}
function renderM5DeleteResult(r) {
  const lines = [
    `[m5-delete] rule_id=${r.rule_id} \u5DF2\u5199 tombstone`,
    `  \u5199\u5165: ${r.written_path}`,
    `  \u539F\u4F5C\u8005 (lineage): ${r.original_author}`
  ];
  if (r.was_already_tombstoned) {
    lines.push(`  (\u6CE8\uFF1A\u8BE5\u89C4\u5219\u4E4B\u524D\u5DF2\u662F tombstone\uFF1B\u672C\u6B21\u5199\u5165\u65B0\u7684 ts \u5F62\u6210\u65B0 claim)`);
  }
  return lines.join("\n");
}

export {
  M5DeleteValidationError,
  runM5Delete,
  parseM5DeleteArgs,
  renderM5DeleteResult
};
