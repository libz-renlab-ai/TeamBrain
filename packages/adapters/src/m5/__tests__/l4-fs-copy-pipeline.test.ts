import { promises as fs } from "node:fs";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TeamRuleFile } from "@teamagent/types";
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
    const rule: TeamRuleFile = {
      rule_id: "avoid-rm-rf-root",
      author: "A",
      current: {
        deleted: false,
        content: "rm -rf",
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

    // The file landed at the canonical path B's matcher would scan.
    const landedPath = path.join(
      ctx.projectB,
      ".teamagent",
      "team",
      "A",
      `${rule.rule_id}.json`,
    );
    const landed = JSON.parse(
      await fs.readFile(landedPath, "utf8"),
    ) as TeamRuleFile;
    expect(landed.rule_id).toBe(rule.rule_id);
    if (landed.current.deleted) {
      throw new Error("copy mutated tombstone vs alive shape");
    }
    expect(landed.current.content).toBe(rule.current.content);

    // rule-ON: same tool input must now BLOCK and cite the propagated rule.
    const on = await responder.evaluate(toolInvocation);
    expect(on.block).toBe(true);
    expect(on.citations).toEqual([rule.rule_id]);
    expect(on.skipped).toBe(0);

    // The L4 observable strictly changed across the transit boundary.
    expect(on.block).not.toBe(off.block);
    expect(on.citations.length).toBeGreaterThan(off.citations.length);
  });

  it("cleanup() is idempotent (slice 1 DualHomeContext contract preserved e2e)", async () => {
    // After the responder has touched paths under projectB, a second cleanup
    // call must still not throw — slice 1's setupDualHomes contract.
    await ctx.cleanup();
    await ctx.cleanup();
  });
});
