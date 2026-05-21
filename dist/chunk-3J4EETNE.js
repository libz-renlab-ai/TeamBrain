import {
  FsTeamRuleStore
} from "./chunk-JJSYX6XZ.js";
import {
  WINDOWS_MAX_PATH_BUDGET,
  classifyScope,
  decideShareAction,
  estimateTeamRulePathLength,
  isSafeAuthor,
  isSafeRuleId,
  isTeamRulePathLengthSafe,
  mergeLwwBatch,
  scanForSecrets
} from "./chunk-4Y7LCJVR.js";
import {
  init_esm_shims
} from "./chunk-ZWU7KJPP.js";

// ../cli/src/commands/m5-share.ts
init_esm_shims();
import { execSync } from "child_process";
import { createHash } from "crypto";
var M5ShareValidationError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "M5ShareValidationError";
  }
};
async function runM5Share(opts) {
  const text = opts.text;
  const scan = scanForSecrets(text);
  const classification = classifyScope(text);
  const action = decideShareAction({
    scan,
    classification,
    userOverride: opts.scope
  });
  const ruleId = opts.ruleId ?? deriveRuleId(text);
  const author = opts.author ?? gitUserName() ?? "unknown";
  const now = opts.now ?? (/* @__PURE__ */ new Date()).toISOString();
  const confidence = opts.confidence ?? 0.85;
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new M5ShareValidationError(
      `confidence "${confidence}" is not a finite number in [0,1]`
    );
  }
  if (!isSafeRuleId(ruleId)) {
    throw new M5ShareValidationError(
      `--rule-id "${ruleId}" contains illegal characters; allowed: [A-Za-z0-9._-], length 1..200`
    );
  }
  if (!isSafeAuthor(author)) {
    throw new M5ShareValidationError(
      `--author "${author}" contains illegal characters; allowed: [A-Za-z0-9._-], length 1..100`
    );
  }
  if (!isTeamRulePathLengthSafe(opts.projectRoot, author, ruleId)) {
    const len = estimateTeamRulePathLength(opts.projectRoot, author, ruleId);
    throw new M5ShareValidationError(
      `rule path would be ${len} chars long, exceeding the Windows MAX_PATH budget of ${WINDOWS_MAX_PATH_BUDGET}; shorten --rule-id (currently ${ruleId.length} chars) or move the project to a shorter path`
    );
  }
  const nowMs = Date.parse(now);
  const realNowMs = Date.now();
  if (Number.isFinite(nowMs) && nowMs > realNowMs + 6e4) {
    throw new M5ShareValidationError(
      `--now "${now}" is more than 60s in the future relative to system clock`
    );
  }
  let written_path;
  if (action.kind === "promote_to_l2") {
    const store = new FsTeamRuleStore();
    const existing = await store.listAll(opts.projectRoot);
    const merged = mergeLwwBatch(existing);
    const lineageAuthor = merged.get(ruleId)?.original_author ?? author;
    const file = {
      rule_id: ruleId,
      author: lineageAuthor,
      current: {
        deleted: false,
        content: text,
        confidence,
        modified_by: author,
        modified_ts: now,
        scope: "team"
      }
    };
    await store.writeRule(opts.projectRoot, author, file);
    written_path = `.teamagent/team/${author}/${ruleId}.json`;
  }
  return {
    rule_id: ruleId,
    action,
    scan_matches_count: scan.matches.length,
    classification_scope: classification.scope,
    classification_reason: classification.reason,
    written_path
  };
}
function deriveRuleId(text) {
  const h = createHash("sha1").update(text).digest("hex").slice(0, 8);
  return `R-${h}`;
}
function gitUserName() {
  try {
    return execSync("git config user.name", { encoding: "utf8" }).trim() || null;
  } catch {
    return null;
  }
}
function parseM5ShareArgs(args) {
  const opts = { projectRoot: process.cwd(), text: "" };
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
    const t = take("--text");
    if (t !== void 0) {
      opts.text = t;
      continue;
    }
    const id = take("--rule-id");
    if (id !== void 0) {
      opts.ruleId = id;
      continue;
    }
    const s = take("--scope");
    if (s !== void 0) {
      if (s === "personal" || s === "team") opts.scope = s;
      continue;
    }
    const au = take("--author");
    if (au !== void 0) {
      opts.author = au;
      continue;
    }
    const ts = take("--now");
    if (ts !== void 0) {
      opts.now = ts;
      continue;
    }
    const c = take("--confidence");
    if (c !== void 0) {
      const n = Number(c);
      if (!Number.isFinite(n) || n < 0 || n > 1) {
        throw new M5ShareValidationError(
          `--confidence "${c}" is not a finite number in [0,1]`
        );
      }
      opts.confidence = n;
      continue;
    }
  }
  return opts;
}
function renderM5ShareResult(r) {
  const lines = [];
  lines.push(`[m5-share] rule_id=${r.rule_id}`);
  lines.push(`  \u95F8\u95E8 1 (\u5BC6\u94A5\u626B\u63CF): ${r.scan_matches_count} \u547D\u4E2D`);
  lines.push(
    `  \u95F8\u95E8 2 (\u4F5C\u7528\u57DF): ${r.classification_scope} \u2014 ${r.classification_reason}`
  );
  lines.push(`  \u52A8\u4F5C: ${r.action.kind}`);
  lines.push(`  \u539F\u56E0: ${r.action.reason}`);
  if (r.written_path) {
    lines.push(`  \u5DF2\u5199\u5165: ${r.written_path}`);
  }
  return lines.join("\n");
}

export {
  M5ShareValidationError,
  runM5Share,
  parseM5ShareArgs,
  renderM5ShareResult
};
