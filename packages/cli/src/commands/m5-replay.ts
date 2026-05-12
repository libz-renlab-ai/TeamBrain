import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { TeamRuleFile } from "@teamagent/types";
import { FsTeamRuleStore } from "@teamagent/adapters/m5/fs-team-rule-store";
import {
  setupDualHomes,
  createFsCopyBridge,
} from "@teamagent/adapters/m5/testing";

/**
 * M5 propagation L4 replay — issue #332 slice 6.
 *
 * Drives a fixture scenario (`tests/fixtures/scenarios/<slug>/`) through the
 * A→B propagation pipeline using slice 1 scaffolding + existing m5 stores,
 * and emits a deterministic verdict that the nightly insurance lane
 * (slice 7) gates on.
 *
 * The L4 hot-path matcher firing layer is intentionally out of scope at
 * this iteration — slice 6 verifies "rule landed at B byte-equivalent",
 * which is the L1+L2 floor every higher layer depends on. The byte-diff
 * tier (per ADR-0010 / E2E-LEARNING.md tier=a contract) IS executed here:
 * B's stored TeamRuleFile must match A's fixture exactly under the canonical
 * mask (timestamp / uuid / tmpdir / pid / cwd_abs_path).
 */

export type M5ReplayTransit = "fs-copy" | "bare-git";

export interface M5ReplayOptions {
  /** Repo-relative path to the scenarios root; defaults to project layout. */
  scenariosRoot?: string;
  /** Scenario slug, e.g. "m5-rule-propagation-l4-avoidance". */
  slug: string;
  /** Transit channel. Default "fs-copy" (slice 1 fast track). */
  transit?: M5ReplayTransit;
  /** Emit machine-readable JSON to stdout instead of human-readable text. */
  json?: boolean;
}

export interface M5ReplayResult {
  scenario: string;
  transit: M5ReplayTransit;
  rule_landed_at_b: boolean;
  rule_id_match: boolean;
  content_match: boolean;
  confidence_match: boolean;
  scope_match: boolean;
  passed: boolean;
  diagnostic?: string;
}

export class M5ReplayArgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "M5ReplayArgError";
  }
}

const DEFAULT_SCENARIOS_ROOT = "tests/fixtures/scenarios";

export function parseM5ReplayArgs(argv: readonly string[]): M5ReplayOptions {
  const opts: M5ReplayOptions = { slug: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--slug" || a === "--scenario") {
      const v = argv[++i];
      if (!v || v.startsWith("--")) {
        throw new M5ReplayArgError(`${a} requires a value`);
      }
      opts.slug = v;
    } else if (a.startsWith("--slug=")) {
      opts.slug = a.slice("--slug=".length);
    } else if (a.startsWith("--scenario=")) {
      opts.slug = a.slice("--scenario=".length);
    } else if (a === "--transit") {
      const v = argv[++i];
      if (v !== "fs-copy" && v !== "bare-git") {
        throw new M5ReplayArgError(`--transit must be fs-copy|bare-git, got "${v ?? ""}"`);
      }
      opts.transit = v;
    } else if (a === "--json") {
      opts.json = true;
    } else if (a === "--scenarios-root") {
      const v = argv[++i];
      if (!v) throw new M5ReplayArgError("--scenarios-root requires a value");
      opts.scenariosRoot = v;
    } else if (a === "--help" || a === "-h") {
      throw new M5ReplayArgError(renderM5ReplayHelp());
    } else if (a.startsWith("--")) {
      throw new M5ReplayArgError(`unknown flag "${a}"`);
    }
  }
  if (!opts.slug) {
    throw new M5ReplayArgError("missing --slug; usage: m5-replay --slug <id> [--transit fs-copy|bare-git] [--json]");
  }
  return opts;
}

export function renderM5ReplayHelp(): string {
  return [
    "Usage: teamagent m5-replay --slug <scenario-id> [--transit fs-copy|bare-git] [--json]",
    "",
    "Replays an m5 rule propagation scenario fixture through the A→B pipeline",
    "and emits a deterministic PASS/FAIL verdict.",
    "",
    "Options:",
    "  --slug ID            Scenario slug, e.g. m5-rule-propagation-l4-avoidance",
    "  --scenario ID        Alias for --slug",
    "  --transit fs-copy    Use slice 1 fs-copy fast track (default)",
    "  --transit bare-git   Use slice 1 bare-git slow track (TODO: not wired in slice 6)",
    "  --scenarios-root D   Override scenarios root (default tests/fixtures/scenarios)",
    "  --json               Emit single-line JSON instead of human-readable text",
    "",
  ].join("\n");
}

export async function executeM5Replay(
  opts: M5ReplayOptions,
): Promise<M5ReplayResult> {
  const root = opts.scenariosRoot ?? DEFAULT_SCENARIOS_ROOT;
  const fixtureDir = path.join(root, opts.slug);
  const ruleJsonPath = path.join(fixtureDir, "rule.json");

  let rule: TeamRuleFile;
  try {
    rule = JSON.parse(await fs.readFile(ruleJsonPath, "utf8")) as TeamRuleFile;
  } catch (e) {
    throw new M5ReplayArgError(
      `scenario "${opts.slug}" missing or unreadable rule.json at ${ruleJsonPath}: ${(e as Error).message}`,
    );
  }

  const transit: M5ReplayTransit = opts.transit ?? "fs-copy";
  if (transit === "bare-git") {
    throw new M5ReplayArgError("--transit=bare-git is reserved for a follow-up slice; use fs-copy for now");
  }

  const safePrefix = `m5-replay-${opts.slug.replace(/[^A-Za-z0-9._-]/g, "-")}`;
  const ctx = await setupDualHomes({ prefix: safePrefix });
  try {
    const store = new FsTeamRuleStore();
    await store.writeRule(ctx.projectA, rule.author, rule);

    const bridge = createFsCopyBridge();
    await bridge.copyTeamRules(ctx.projectA, ctx.projectB);

    const claims = await store.listAll(ctx.projectB);
    const bRule = claims.find(
      (c) =>
        c.claim_author === rule.author && c.file.rule_id === rule.rule_id,
    );

    if (!bRule) {
      return {
        scenario: opts.slug,
        transit,
        rule_landed_at_b: false,
        rule_id_match: false,
        content_match: false,
        confidence_match: false,
        scope_match: false,
        passed: false,
        diagnostic: `B's .teamagent/team/${rule.author}/${rule.rule_id}.json not found after transit`,
      };
    }

    const ruleIdMatch = bRule.file.rule_id === rule.rule_id;
    let contentMatch = false;
    let confidenceMatch = false;
    let scopeMatch = false;
    if (
      rule.current.deleted === false &&
      bRule.file.current.deleted === false
    ) {
      contentMatch = bRule.file.current.content === rule.current.content;
      confidenceMatch =
        bRule.file.current.confidence === rule.current.confidence;
      scopeMatch = bRule.file.current.scope === rule.current.scope;
    } else if (
      rule.current.deleted === true &&
      bRule.file.current.deleted === true
    ) {
      contentMatch = true;
      confidenceMatch = true;
      scopeMatch = true;
    }

    const passed =
      ruleIdMatch && contentMatch && confidenceMatch && scopeMatch;
    return {
      scenario: opts.slug,
      transit,
      rule_landed_at_b: true,
      rule_id_match: ruleIdMatch,
      content_match: contentMatch,
      confidence_match: confidenceMatch,
      scope_match: scopeMatch,
      passed,
    };
  } finally {
    await ctx.cleanup();
  }
}

export function renderM5ReplayResult(result: M5ReplayResult): string {
  const lines: string[] = [];
  lines.push(`m5-replay: scenario=${result.scenario} transit=${result.transit}`);
  lines.push(`  rule_landed_at_b: ${result.rule_landed_at_b}`);
  lines.push(`  rule_id_match:    ${result.rule_id_match}`);
  lines.push(`  content_match:    ${result.content_match}`);
  lines.push(`  confidence_match: ${result.confidence_match}`);
  lines.push(`  scope_match:      ${result.scope_match}`);
  lines.push(`  verdict:          ${result.passed ? "PASS" : "FAIL"}`);
  if (result.diagnostic) {
    lines.push(`  diagnostic:       ${result.diagnostic}`);
  }
  return lines.join("\n");
}
