import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, afterEach } from "vitest";
import type { TeamRuleFile } from "@teamagent/types";
import { FsTeamRuleStore } from "../fs-team-rule-store.js";
import {
  setupDualHomes,
  createFsCopyBridge,
  type DualHomeContext,
} from "../testing/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_ROOT = path.resolve(
  __dirname,
  "../../../../../tests/fixtures/scenarios/m5-rule-propagation-l4/avoidance",
);

async function loadRuleFixture(): Promise<TeamRuleFile> {
  const raw = await fs.readFile(path.join(FIXTURE_ROOT, "rule.json"), "utf8");
  return JSON.parse(raw) as TeamRuleFile;
}

async function loadPromptsFixture(): Promise<{
  fixture_id: string;
  rule_id: string;
  trigger_prompts: string[];
  negative_prompts: string[];
}> {
  const raw = await fs.readFile(
    path.join(FIXTURE_ROOT, "prompts", "prompts.json"),
    "utf8",
  );
  return JSON.parse(raw);
}

describe("m5 propagation — avoidance fixture (slice 3, file-level)", () => {
  let ctx: DualHomeContext | null = null;

  afterEach(async () => {
    if (ctx) {
      await ctx.cleanup();
      ctx = null;
    }
  });

  it("fixture files exist and parse", async () => {
    const rule = await loadRuleFixture();
    expect(rule.rule_id).toBe("avoidance-no-force-push-to-main");
    expect(rule.author).toBe("alice");
    expect(rule.current.deleted).toBe(false);
    if (rule.current.deleted === false) {
      expect(rule.current.scope).toBe("team");
      expect(rule.current.content.length).toBeGreaterThan(20);
    }

    const prompts = await loadPromptsFixture();
    expect(prompts.fixture_id).toBe("m5-rule-propagation-l4-avoidance");
    expect(prompts.rule_id).toBe(rule.rule_id);
    expect(prompts.trigger_prompts).toHaveLength(10);
    expect(prompts.negative_prompts.length).toBeGreaterThanOrEqual(5);
  });

  it("end-to-end A→B file-level propagation via fs-copy fast track", async () => {
    ctx = await setupDualHomes({ prefix: "m5-l4-avoidance" });
    const rule = await loadRuleFixture();
    const store = new FsTeamRuleStore();

    // A writes the rule to its project's .teamagent/team/<author>/<rule_id>.json
    await store.writeRule(ctx.projectA, rule.author, rule);

    // fs-copy transit (fast track)
    const bridge = createFsCopyBridge();
    const copied = await bridge.copyTeamRules(ctx.projectA, ctx.projectB);
    expect(copied).toBe(1);

    // B reads back and gets the same rule
    const claims = await store.listAll(ctx.projectB);
    expect(claims).toHaveLength(1);
    const claim = claims[0]!;
    expect(claim.claim_author).toBe(rule.author);
    expect(claim.file.rule_id).toBe(rule.rule_id);
    if (claim.file.current.deleted === false && rule.current.deleted === false) {
      expect(claim.file.current.content).toBe(rule.current.content);
      expect(claim.file.current.confidence).toBe(rule.current.confidence);
    }
  });

  it("multiple rounds of share are idempotent (LWW: same content stays same)", async () => {
    ctx = await setupDualHomes({ prefix: "m5-l4-avoidance-idem" });
    const rule = await loadRuleFixture();
    const store = new FsTeamRuleStore();
    const bridge = createFsCopyBridge();

    // First round
    await store.writeRule(ctx.projectA, rule.author, rule);
    await bridge.copyTeamRules(ctx.projectA, ctx.projectB);
    const firstClaims = await store.listAll(ctx.projectB);

    // Second round (no change)
    const secondCount = await bridge.copyTeamRules(ctx.projectA, ctx.projectB);
    expect(secondCount).toBe(1); // same file copied again, LWW overwrite
    const secondClaims = await store.listAll(ctx.projectB);
    expect(secondClaims).toEqual(firstClaims);
  });

  it("only the team rule's owning author appears at B (no cross-author leak)", async () => {
    ctx = await setupDualHomes({ prefix: "m5-l4-avoidance-author" });
    const rule = await loadRuleFixture();
    const store = new FsTeamRuleStore();

    await store.writeRule(ctx.projectA, rule.author, rule);

    // Add a UNRELATED rule under a different author at A; both should propagate.
    const otherRule: TeamRuleFile = {
      author: "bob",
      rule_id: "unrelated-bob-rule",
      current: {
        deleted: false,
        content: "bob's unrelated rule",
        confidence: 0.5,
        modified_by: "bob",
        modified_ts: "2026-05-12T01:00:00.000Z",
        scope: "team",
      },
    };
    await store.writeRule(ctx.projectA, otherRule.author, otherRule);

    const bridge = createFsCopyBridge();
    const copied = await bridge.copyTeamRules(ctx.projectA, ctx.projectB);
    expect(copied).toBe(2);

    const claims = await store.listAll(ctx.projectB);
    const authors = new Set(claims.map((c) => c.claim_author));
    expect(authors).toEqual(new Set(["alice", "bob"]));
  });
});
