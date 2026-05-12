import { promises as fs } from "node:fs";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TeamRuleAlive, TeamRuleFile } from "@teamagent/types";
import {
  createFsCopyBridge,
  createMockLlmResponder,
  setupDualHomes,
  type DualHomeContext,
} from "../testing/index.js";

/**
 * Issue #332 slice 2a L4 (end-to-end behavior change) pipeline:
 *
 *   A authors avoidance rule
 *      → write to A's project/.teamagent/team/A/<rid>.json
 *   FsCopyBridge.copyTeamRules(A → B)
 *      → B project/.teamagent/team/A/<rid>.json
 *   MockLlmResponder.evaluate(B, toolInput)
 *      → {block, citations}
 *
 * Per ADR-0014/332.md decision #1 we observe L4 not L1/L2/L3, i.e. the
 * strict difference between rule-OFF (no transit) and rule-ON (post
 * transit) on the SAME tool input. Anything weaker (e.g. asserting the
 * file landed but not the behaviour change) is rejected by the ADR.
 */
describe("L4 fs-copy pipeline — avoidance rule propagation A → B", () => {
  let ctx: DualHomeContext;

  beforeEach(async () => {
    ctx = await setupDualHomes({ prefix: "l4-fs-copy-pipeline" });
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("rule-OFF allows the tool input; rule-ON (after fs-copy) BLOCKS the same input", async () => {
    const ruleId = "avoid-rm-rf-root";
    const ruleContent = "rm -rf";
    const rule: TeamRuleFile = {
      rule_id: ruleId,
      author: "A",
      current: {
        deleted: false,
        content: ruleContent,
        confidence: 0.95,
        modified_by: "A",
        modified_ts: "2026-05-12T07:00:00Z",
        scope: "team",
      },
    };

    const aDir = path.join(ctx.projectA, ".teamagent", "team", "A");
    await fs.mkdir(aDir, { recursive: true });
    await fs.writeFile(
      path.join(aDir, `${rule.rule_id}.json`),
      JSON.stringify(rule),
      "utf8",
    );

    const responder = createMockLlmResponder();
    const toolInvocation = {
      projectRoot: ctx.projectB,
      toolName: "Bash",
      toolInput: { command: "rm -rf /tmp/x" },
    };

    // rule-OFF: B has no copy of the rule yet.
    const off = await responder.evaluate(toolInvocation);
    expect(off).toEqual({ block: false, citations: [], skipped: 0 });

    // Transit: A → B over the fs-copy fast track.
    const bridge = createFsCopyBridge();
    const copied = await bridge.copyTeamRules(ctx.projectA, ctx.projectB);
    expect(copied).toBe(1);

    // Enumerate the destination so a future bridge change that copies an
    // unexpected extra file (e.g. an aggregate `index.json`) is caught,
    // rather than passing this test for the wrong reason.
    const landedAuthorDir = path.join(
      ctx.projectB,
      ".teamagent",
      "team",
      "A",
    );
    const landedEntries = await fs.readdir(landedAuthorDir);
    expect(landedEntries).toEqual([`${rule.rule_id}.json`]);

    // The file landed at the canonical path B's matcher would scan.
    const landedPath = path.join(landedAuthorDir, `${rule.rule_id}.json`);
    const landed = JSON.parse(
      await fs.readFile(landedPath, "utf8"),
    ) as TeamRuleFile;
    expect(landed.rule_id).toBe(ruleId);
    expect(landed.current.deleted).toBe(false);
    // Cast is safe because the line above already asserted deleted === false.
    const alive = landed.current as TeamRuleAlive;
    expect(alive.content).toBe(ruleContent);

    // rule-ON: same tool input must now BLOCK and cite the propagated rule.
    const on = await responder.evaluate(toolInvocation);
    expect(on.block).toBe(true);
    expect(on.citations).toEqual([ruleId]);
    expect(on.skipped).toBe(0);

    // The L4 observable strictly changed across the transit boundary.
    expect(on.block).not.toBe(off.block);
    expect(on.citations.length).toBeGreaterThan(off.citations.length);
  });

  it("cleanup() is idempotent and actually removes the dirs (slice 1 contract)", async () => {
    // /review F7: the original test had zero expect() calls — vitest treats a
    // body that throws nothing as passing, so a silent state-corruption bug
    // in setupDualHomes would have slipped through. Assert the dirs are gone
    // after the first cleanup AND that a second cleanup is a true no-op.
    const probeA = ctx.projectA;
    const probeB = ctx.projectB;

    expect(await dirExists(probeA)).toBe(true);
    expect(await dirExists(probeB)).toBe(true);

    await ctx.cleanup();
    expect(await dirExists(probeA)).toBe(false);
    expect(await dirExists(probeB)).toBe(false);

    // Second cleanup is a structural no-op — must not throw, must not
    // re-create any dirs, must not error on missing parent.
    await ctx.cleanup();
    expect(await dirExists(probeA)).toBe(false);
  });

  it("tombstone propagation: deleted rule on A does NOT block B after fs-copy (L4 contract)", async () => {
    // /review T5: lock in the tombstone-respecting L4 observable. A future
    // bridge bug that strips the deleted flag (e.g. only-copy-content
    // optimisation) would otherwise only surface in slice 3 nightly.
    const ruleId = "avoid-rm-rf-tombstoned";
    const tombstone: TeamRuleFile = {
      rule_id: ruleId,
      author: "A",
      current: {
        deleted: true,
        deleted_by: "A",
        deleted_ts: "2026-05-12T08:00:00Z",
        reason: "rescinded by author",
      },
    };

    const aDir = path.join(ctx.projectA, ".teamagent", "team", "A");
    await fs.mkdir(aDir, { recursive: true });
    await fs.writeFile(
      path.join(aDir, `${ruleId}.json`),
      JSON.stringify(tombstone),
      "utf8",
    );

    const bridge = createFsCopyBridge();
    const copied = await bridge.copyTeamRules(ctx.projectA, ctx.projectB);
    expect(copied).toBe(1);

    const responder = createMockLlmResponder();
    const result = await responder.evaluate({
      projectRoot: ctx.projectB,
      toolName: "Bash",
      // Would block if the rule were alive with content "rm -rf"; tombstone
      // must skip the match entirely.
      toolInput: { command: "rm -rf /tmp" },
    });
    expect(result).toEqual({ block: false, citations: [], skipped: 0 });
  });
});

async function dirExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}
