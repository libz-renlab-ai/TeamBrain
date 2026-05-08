import type {
  TeamRuleFile,
  TeamRuleState,
  TeamRuleAlive,
} from "@teamagent/types";

export type { TeamRuleFile, TeamRuleState, TeamRuleAlive };
export type { TeamRuleTombstone } from "@teamagent/types";

/** 把 TeamRuleFile 序列化成稳定 JSON（key-sorted、2-space indent，diff 友好）。 */
export function serializeTeamRule(r: TeamRuleFile): string {
  return JSON.stringify(sortDeep(r), null, 2);
}

/** 反向：解析 JSON 字符串到 TeamRuleFile。校验最小字段。 */
export function parseTeamRule(json: string): TeamRuleFile {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    throw new Error(`team-rule: invalid JSON: ${(e as Error).message}`);
  }
  validateTeamRule(raw as TeamRuleFile);
  return raw as TeamRuleFile;
}

/**
 * Whitelisted character class for rule_id and author to prevent path-traversal,
 * ANSI-escape-injection, and surprise filesystem behavior.
 *
 * Rationale (B-114/B-115): FsTeamRuleStore.sanitize() replaces unsafe chars with `_`,
 * but the JSON `rule_id`/`author` fields retain the originals — so downstream
 * `m5-sync` printing can leak ANSI escape codes, and any code that joins the
 * raw field into a path or SQL key would be vulnerable. Reject at input.
 */
const SAFE_RULE_ID_RE = /^[A-Za-z0-9._-]{1,200}$/;
const SAFE_AUTHOR_RE = /^[A-Za-z0-9._-]{1,100}$/;
const VALID_SCOPES = new Set(["personal", "team", "global"]);

export function validateTeamRule(r: TeamRuleFile): void {
  if (!r || typeof r !== "object") {
    throw new Error("team-rule: must be an object");
  }
  if (typeof r.rule_id !== "string" || r.rule_id.length === 0) {
    throw new Error("team-rule: rule_id required");
  }
  if (!SAFE_RULE_ID_RE.test(r.rule_id)) {
    throw new Error(
      `team-rule: rule_id "${r.rule_id}" contains illegal characters; allowed: [A-Za-z0-9._-], length 1..200`,
    );
  }
  if (typeof r.author !== "string" || r.author.length === 0) {
    throw new Error("team-rule: author required");
  }
  if (!SAFE_AUTHOR_RE.test(r.author)) {
    throw new Error(
      `team-rule: author "${r.author}" contains illegal characters; allowed: [A-Za-z0-9._-], length 1..100`,
    );
  }
  const c = r.current as TeamRuleState;
  if (!c || typeof c !== "object") {
    throw new Error("team-rule: current required");
  }
  if (c.deleted === true) {
    if (typeof c.deleted_by !== "string") {
      throw new Error("team-rule: deleted requires deleted_by");
    }
    if (typeof c.deleted_ts !== "string") {
      throw new Error("team-rule: deleted requires deleted_ts");
    }
  } else {
    const alive = c as TeamRuleAlive;
    if (typeof alive.content !== "string") {
      throw new Error("team-rule: alive requires content");
    }
    if (typeof alive.modified_by !== "string") {
      throw new Error("team-rule: alive requires modified_by");
    }
    if (typeof alive.modified_ts !== "string") {
      throw new Error("team-rule: alive requires modified_ts");
    }
    // B-141: schema validation — confidence must be number in [0,1] when present
    if ("confidence" in alive && alive.confidence !== undefined) {
      const conf = alive.confidence as unknown;
      if (typeof conf !== "number" || !Number.isFinite(conf) || conf < 0 || conf > 1) {
        throw new Error(
          `team-rule: confidence must be a number in [0, 1], got ${JSON.stringify(conf)}`,
        );
      }
    }
    // B-141: scope must be one of the canonical enum values
    if ("scope" in alive && alive.scope !== undefined) {
      if (!VALID_SCOPES.has(alive.scope as string)) {
        throw new Error(
          `team-rule: scope "${alive.scope}" not in {personal, team, global}`,
        );
      }
    }
  }
}

/** Public char-class predicates for CLI input validation (B-114/B-115). */
export function isSafeRuleId(s: string): boolean {
  return SAFE_RULE_ID_RE.test(s);
}
export function isSafeAuthor(s: string): boolean {
  return SAFE_AUTHOR_RE.test(s);
}

/**
 * W15-012: Windows traditional MAX_PATH is 260 chars; on installs without
 * `LongPathsEnabled = 1` registry tweak, the absolute path written by
 * m5-share (`<projectRoot>/.teamagent/team/<author>/<ruleId>.json`) must
 * stay under that ceiling. We leave a 10-char margin for trailing
 * separators / drive prefixes and surface this as a validator rather than
 * tightening SAFE_RULE_ID_RE (which still accepts 200 chars on Linux/mac
 * where path length is bounded by NAME_MAX, not absolute-path budget).
 */
export const WINDOWS_MAX_PATH_BUDGET = 250;

/**
 * Pure: estimate the absolute path length for a team-rule file under the
 * canonical layout. Caller passes projectRoot as a *string only* — no IO.
 */
export function estimateTeamRulePathLength(
  projectRoot: string,
  author: string,
  ruleId: string,
): number {
  // Layout: <projectRoot><sep>.teamagent<sep>team<sep><author><sep><ruleId>.json
  // Use 4 separator chars regardless of platform — the byte count of "/"
  // and "\\" is identical, so this is correct on both POSIX and Windows.
  const FIXED = ".teamagent" + "team" + ".json";
  return (
    projectRoot.length +
    1 + // sep
    FIXED.length +
    3 + // 3 more separators after .teamagent / team / <author>
    author.length +
    ruleId.length
  );
}

export function isTeamRulePathLengthSafe(
  projectRoot: string,
  author: string,
  ruleId: string,
  budget: number = WINDOWS_MAX_PATH_BUDGET,
): boolean {
  return (
    estimateTeamRulePathLength(projectRoot, author, ruleId) <= budget
  );
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      o[k] = sortDeep((value as Record<string, unknown>)[k]);
    }
    return o;
  }
  return value;
}
