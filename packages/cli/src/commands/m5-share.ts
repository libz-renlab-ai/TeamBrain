import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  scanForSecrets,
  classifyScope,
  decideShareAction,
  mergeLwwBatch,
  isSafeRuleId,
  isSafeAuthor,
  isTeamRulePathLengthSafe,
  estimateTeamRulePathLength,
  WINDOWS_MAX_PATH_BUDGET,
  type ShareAction,
  type TeamRuleFile,
} from "@teamagent/core";
import { FsTeamRuleStore } from "@teamagent/adapters/m5/fs-team-rule-store";

export class M5ShareValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "M5ShareValidationError";
  }
}

export interface M5ShareOptions {
  projectRoot: string;
  text: string;
  /** 规则 id；未提供时由 content hash 派生。 */
  ruleId?: string;
  /** 用户显式作用域（personal | team）；未指定走自动管线。 */
  scope?: "personal" | "team";
  /** author（lineage）；默认从 git config 取。 */
  author?: string;
  /** confidence，0..1；默认 0.85。 */
  confidence?: number;
  /** ISO ts；默认 now()。 */
  now?: string;
}

export interface M5ShareResult {
  rule_id: string;
  action: ShareAction;
  scan_matches_count: number;
  classification_scope: "personal" | "shareable" | "uncertain";
  classification_reason: string;
  written_path?: string;
}

export async function runM5Share(
  opts: M5ShareOptions
): Promise<M5ShareResult> {
  const text = opts.text;
  const scan = scanForSecrets(text);
  const classification = classifyScope(text);
  const action = decideShareAction({
    scan,
    classification,
    userOverride: opts.scope,
  });

  const ruleId = opts.ruleId ?? deriveRuleId(text);
  const author = opts.author ?? gitUserName() ?? "unknown";
  const now = opts.now ?? new Date().toISOString();
  const confidence = opts.confidence ?? 0.85;
  // W15-010: defense-in-depth — internal callers can also pass an
  // out-of-range value; validate here regardless of the parser path.
  if (
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1
  ) {
    throw new M5ShareValidationError(
      `confidence "${confidence}" is not a finite number in [0,1]`,
    );
  }

  // B-114/B-115: reject path-traversal / ANSI / shell-injection in rule_id and author
  if (!isSafeRuleId(ruleId)) {
    throw new M5ShareValidationError(
      `--rule-id "${ruleId}" contains illegal characters; allowed: [A-Za-z0-9._-], length 1..200`,
    );
  }
  if (!isSafeAuthor(author)) {
    throw new M5ShareValidationError(
      `--author "${author}" contains illegal characters; allowed: [A-Za-z0-9._-], length 1..100`,
    );
  }
  // W15-012: rule_id at the SAFE_RULE_ID_RE boundary (200 chars) plus a
  // long projectRoot prefix can produce an absolute path > Windows
  // MAX_PATH (260) without long-path support. Refuse early so writeFile
  // does not silently leave a half-formed file or an unreadable path.
  if (!isTeamRulePathLengthSafe(opts.projectRoot, author, ruleId)) {
    const len = estimateTeamRulePathLength(opts.projectRoot, author, ruleId);
    throw new M5ShareValidationError(
      `rule path would be ${len} chars long, exceeding the Windows MAX_PATH budget of ${WINDOWS_MAX_PATH_BUDGET}; ` +
        `shorten --rule-id (currently ${ruleId.length} chars) or move the project to a shorter path`,
    );
  }
  // B-140: reject future timestamps (> now + 60s tolerance for clock skew)
  const nowMs = Date.parse(now);
  const realNowMs = Date.now();
  if (Number.isFinite(nowMs) && nowMs > realNowMs + 60_000) {
    throw new M5ShareValidationError(
      `--now "${now}" is more than 60s in the future relative to system clock`,
    );
  }

  let written_path: string | undefined;
  if (action.kind === "promote_to_l2") {
    const store = new FsTeamRuleStore();
    // 查 lineage：如果该 rule_id 已有 claim，保留首创者作为 author；否则当前用户即首创者
    const existing = await store.listAll(opts.projectRoot);
    const merged = mergeLwwBatch(existing);
    const lineageAuthor =
      merged.get(ruleId)?.original_author ?? author;
    const file: TeamRuleFile = {
      rule_id: ruleId,
      author: lineageAuthor,
      current: {
        deleted: false,
        content: text,
        confidence,
        modified_by: author,
        modified_ts: now,
        scope: "team",
      },
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
    written_path,
  };
}

/** rule_id = "R-" + sha1(text)[:8]，确保同样内容稳定可定位。 */
function deriveRuleId(text: string): string {
  const h = createHash("sha1").update(text).digest("hex").slice(0, 8);
  return `R-${h}`;
}

function gitUserName(): string | null {
  try {
    return execSync("git config user.name", { encoding: "utf8" }).trim() || null;
  } catch {
    return null;
  }
}

export function parseM5ShareArgs(args: readonly string[]): M5ShareOptions {
  const opts: M5ShareOptions = { projectRoot: process.cwd(), text: "" };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === undefined) continue;
    const take = (flag: string): string | undefined => {
      if (a === flag) return args[++i];
      if (a.startsWith(flag + "=")) return a.slice(flag.length + 1);
      return undefined;
    };
    const r = take("--project-root");
    if (r !== undefined) {
      opts.projectRoot = r;
      continue;
    }
    const t = take("--text");
    if (t !== undefined) {
      opts.text = t;
      continue;
    }
    const id = take("--rule-id");
    if (id !== undefined) {
      opts.ruleId = id;
      continue;
    }
    const s = take("--scope");
    if (s !== undefined) {
      if (s === "personal" || s === "team") opts.scope = s;
      continue;
    }
    const au = take("--author");
    if (au !== undefined) {
      opts.author = au;
      continue;
    }
    const ts = take("--now");
    if (ts !== undefined) {
      opts.now = ts;
      continue;
    }
    // W15-010: parse --confidence (was previously silently ignored, so
    // calls like `--confidence=0.42` ran with the default 0.85 fallback
    // and `--confidence=NaN|2|-1` succeeded without complaint).
    const c = take("--confidence");
    if (c !== undefined) {
      const n = Number(c);
      if (!Number.isFinite(n) || n < 0 || n > 1) {
        throw new M5ShareValidationError(
          `--confidence "${c}" is not a finite number in [0,1]`,
        );
      }
      opts.confidence = n;
      continue;
    }
  }
  return opts;
}

export function renderM5ShareResult(r: M5ShareResult): string {
  const lines: string[] = [];
  lines.push(`[m5-share] rule_id=${r.rule_id}`);
  lines.push(`  闸门 1 (密钥扫描): ${r.scan_matches_count} 命中`);
  lines.push(
    `  闸门 2 (作用域): ${r.classification_scope} — ${r.classification_reason}`
  );
  lines.push(`  动作: ${r.action.kind}`);
  lines.push(`  原因: ${r.action.reason}`);
  if (r.written_path) {
    lines.push(`  已写入: ${r.written_path}`);
  }
  return lines.join("\n");
}
