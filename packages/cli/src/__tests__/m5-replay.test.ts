import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  parseM5ReplayArgs,
  executeM5Replay,
  renderM5ReplayResult,
  M5ReplayArgError,
} from "../commands/m5-replay.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCENARIOS_ROOT = path.resolve(
  __dirname,
  "../../../../tests/fixtures/scenarios",
);

describe("parseM5ReplayArgs", () => {
  it("requires --slug", () => {
    expect(() => parseM5ReplayArgs([])).toThrow(M5ReplayArgError);
  });

  it("accepts --slug X", () => {
    const opts = parseM5ReplayArgs(["--slug", "m5-rule-propagation-l4/avoidance"]);
    expect(opts.slug).toBe("m5-rule-propagation-l4/avoidance");
  });

  it("accepts --slug=X inline form", () => {
    const opts = parseM5ReplayArgs(["--slug=foo"]);
    expect(opts.slug).toBe("foo");
  });

  it("accepts --scenario as alias for --slug", () => {
    expect(parseM5ReplayArgs(["--scenario", "bar"]).slug).toBe("bar");
    expect(parseM5ReplayArgs(["--scenario=baz"]).slug).toBe("baz");
  });

  it("accepts --transit fs-copy / --transit bare-git", () => {
    expect(parseM5ReplayArgs(["--slug", "x", "--transit", "fs-copy"]).transit).toBe("fs-copy");
    expect(parseM5ReplayArgs(["--slug", "x", "--transit", "bare-git"]).transit).toBe("bare-git");
  });

  it("rejects unknown --transit values", () => {
    expect(() => parseM5ReplayArgs(["--slug", "x", "--transit", "http"])).toThrow(M5ReplayArgError);
  });

  it("--json sets json=true", () => {
    expect(parseM5ReplayArgs(["--slug", "x", "--json"]).json).toBe(true);
  });

  it("rejects unknown flags", () => {
    expect(() => parseM5ReplayArgs(["--slug", "x", "--bogus"])).toThrow(M5ReplayArgError);
  });
});

describe("executeM5Replay against real fixtures", () => {
  it("PASS for m5-rule-propagation-l4-avoidance via fs-copy", async () => {
    const result = await executeM5Replay({
      slug: "m5-rule-propagation-l4/avoidance",
      scenariosRoot: SCENARIOS_ROOT,
    });
    expect(result.passed).toBe(true);
    expect(result.rule_landed_at_b).toBe(true);
    expect(result.rule_id_match).toBe(true);
    expect(result.content_match).toBe(true);
    expect(result.confidence_match).toBe(true);
    expect(result.scope_match).toBe(true);
  });

  it("PASS for m5-rule-propagation-l4-practice via fs-copy", async () => {
    const result = await executeM5Replay({
      slug: "m5-rule-propagation-l4/practice",
      scenariosRoot: SCENARIOS_ROOT,
    });
    expect(result.passed).toBe(true);
  });

  it("PASS for m5-rule-propagation-l4-learning via fs-copy", async () => {
    const result = await executeM5Replay({
      slug: "m5-rule-propagation-l4/learning",
      scenariosRoot: SCENARIOS_ROOT,
    });
    expect(result.passed).toBe(true);
  });

  it("throws if scenario doesn't exist", async () => {
    await expect(
      executeM5Replay({
        slug: "does-not-exist",
        scenariosRoot: SCENARIOS_ROOT,
      }),
    ).rejects.toThrow(M5ReplayArgError);
  });

  it("rejects --transit=bare-git (reserved for follow-up)", async () => {
    await expect(
      executeM5Replay({
        slug: "m5-rule-propagation-l4/avoidance",
        scenariosRoot: SCENARIOS_ROOT,
        transit: "bare-git",
      }),
    ).rejects.toThrow(M5ReplayArgError);
  });
});

describe("renderM5ReplayResult", () => {
  it("renders verdict line with PASS", () => {
    const out = renderM5ReplayResult({
      scenario: "x",
      transit: "fs-copy",
      rule_landed_at_b: true,
      rule_id_match: true,
      content_match: true,
      confidence_match: true,
      scope_match: true,
      passed: true,
    });
    expect(out).toContain("verdict:          PASS");
    expect(out).not.toContain("diagnostic:");
  });

  it("renders diagnostic when present on FAIL", () => {
    const out = renderM5ReplayResult({
      scenario: "x",
      transit: "fs-copy",
      rule_landed_at_b: false,
      rule_id_match: false,
      content_match: false,
      confidence_match: false,
      scope_match: false,
      passed: false,
      diagnostic: "rule not at B",
    });
    expect(out).toContain("verdict:          FAIL");
    expect(out).toContain("diagnostic:       rule not at B");
  });
});
