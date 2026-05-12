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
  "../../../../../tests/fixtures/scenarios/m5-rule-propagation-l4/learning",
);

async function loadRule(): Promise<TeamRuleFile> {
  return JSON.parse(
    await fs.readFile(path.join(FIXTURE_ROOT, "rule.json"), "utf8"),
  ) as TeamRuleFile;
}

async function loadPrompts(): Promise<{
  fixture_id: string;
  rule_id: string;
  trigger_prompts: string[];
}> {
  return JSON.parse(
    await fs.readFile(path.join(FIXTURE_ROOT, "prompts", "prompts.json"), "utf8"),
  );
}

describe("m5 propagation — learning fixture (slice 4, file-level)", () => {
  let ctx: DualHomeContext | null = null;
  afterEach(async () => {
    if (ctx) await ctx.cleanup();
    ctx = null;
  });

  it("fixture parses with N=10 trigger prompts (grill plan: learning power)", async () => {
    const rule = await loadRule();
    expect(rule.rule_id).toBe("learning-prefer-pnpm");
    const prompts = await loadPrompts();
    expect(prompts.trigger_prompts).toHaveLength(10);
    expect(prompts.rule_id).toBe(rule.rule_id);
  });

  it("end-to-end A→B propagation via fs-copy", async () => {
    ctx = await setupDualHomes({ prefix: "m5-l4-learning" });
    const rule = await loadRule();
    const store = new FsTeamRuleStore();
    await store.writeRule(ctx.projectA, rule.author, rule);
    const copied = await createFsCopyBridge().copyTeamRules(
      ctx.projectA,
      ctx.projectB,
    );
    expect(copied).toBe(1);
    const claims = await store.listAll(ctx.projectB);
    expect(claims).toHaveLength(1);
    expect(claims[0]!.file.rule_id).toBe(rule.rule_id);
  });
});
