import { describe, expect, it } from "vitest";
import {
  executeFixtureReplay,
  parseFixtureReplayArgs,
  renderFixtureReplayResult,
  FixtureReplayArgError,
} from "../commands/fixture-replay.js";

describe("parseFixtureReplayArgs", () => {
  it("parses tier, scenario and json flags", () => {
    expect(
      parseFixtureReplayArgs([
        "replay",
        "--tier=a",
        "--scenario",
        "moment-dayjs",
        "--json",
      ]),
    ).toEqual({
      subcommand: "replay",
      tier: "a",
      scenarioId: "moment-dayjs",
      json: true,
    });
  });

  it("accepts --slug as the documented scenario alias", () => {
    expect(
      parseFixtureReplayArgs(["replay", "--tier", "a", "--slug=moment-dayjs"]),
    ).toMatchObject({
      subcommand: "replay",
      tier: "a",
      scenarioId: "moment-dayjs",
    });
  });

  it("rejects flags with missing values", () => {
    expect(() => parseFixtureReplayArgs(["replay", "--scenario"])).toThrow(
      /--scenario requires a value/,
    );
    expect(() => parseFixtureReplayArgs(["replay", "--tier"])).toThrow(
      /--tier requires a value/,
    );
  });

  it("rejects unsupported replay tiers", () => {
    expect(() => parseFixtureReplayArgs(["replay", "--tier=c"])).toThrow(
      /supports --tier=a/,
    );
  });
});

describe("executeFixtureReplay", () => {
  it("replays the moment-dayjs fixture through correction -> rule -> intercept", async () => {
    const result = await executeFixtureReplay({
      subcommand: "replay",
      tier: "a",
      scenarioId: "moment-dayjs",
    });

    expect(result.ok).toBe(true);
    expect(result.total).toBe(1);
    expect(result.passed).toBe(1);
    expect(result.scenarios[0]).toMatchObject({
      id: "moment-dayjs",
      passed: true,
      prr: 100,
      kp: 5,
      phases: {
        correctionDetected: true,
        ruleGenerated: true,
        interceptMatched: true,
        expectedBehavior: "block",
        actualBehavior: "block",
      },
    });
  });

  it("rejects unknown scenario ids", async () => {
    await expect(
      executeFixtureReplay({
        subcommand: "replay",
        tier: "a",
        scenarioId: "missing",
      }),
    ).rejects.toBeInstanceOf(FixtureReplayArgError);
  });

  it("renders a concise terminal summary", async () => {
    const result = await executeFixtureReplay({
      subcommand: "replay",
      tier: "a",
      scenarioId: "moment-dayjs",
    });
    const out = renderFixtureReplayResult(result);
    expect(out).toContain("TeamAgent fixture replay");
    expect(out).toContain("PASS moment-dayjs");
    expect(out).toContain("expected=block actual=block");
  });
});
