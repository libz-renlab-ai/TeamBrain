import { describe, expect, it } from "vitest";
import {
  executeE2EEvaluate,
  parseE2EEvaluateArgs,
  renderE2EEvaluateResult,
} from "../commands/e2e-evaluate.js";
import { deterministicRuleEmbedder } from "./deterministic-rule-embedder.js";

describe("executeE2EEvaluate", () => {
  it("runs the real analyze/SQLite/compile/PreToolUse loop", async () => {
    const result = await executeE2EEvaluate({ embedder: deterministicRuleEmbedder });

    expect(result.ok).toBe(true);
    expect(result.learnedRules).toBe(3);
    expect(result.correctionsFound).toBe(3);
    expect(result.extracted).toBe(3);
    expect(result.skillsExported).toBe(true);
    expect(result.skillsHaveRules).toBe(true);
    expect(result.docsPropagationScheduled).toBe(true);
    expect(result.claudeMdUntouched).toBe(true);
    expect(result.metrics.extractionYield).toBe(1);
    expect(result.metrics.positiveTriggerRate).toBe(1);
    expect(result.metrics.generalizationRate).toBe(1);
    expect(result.metrics.falsePositiveRate).toBe(0);
    expect(result.metrics.helpfulRate).toBe(1);
    expect(result.metrics.onboardingCoverage).toBe(1);
    expect(result.metrics.docsPropagationCoverage).toBe(1);
    expect(result.probes).toHaveLength(10);
    expect(result.probes.find((p) => p.id === "momentum-substring")?.triggered).toBe(false);
    expect(result.probes.find((p) => p.id === "moment-import-write")?.triggered).toBe(true);
    expect(result.tempCleaned).toBe(true);
  }, 120000);

  it("renders a compact terminal report", () => {
    const output = renderE2EEvaluateResult({
      ok: true,
      workspaceDir: "/tmp/project",
      homeDir: "/tmp/home",
      learnedRules: 1,
      correctionsFound: 1,
      extracted: 1,
      skillsExported: true,
      skillsHaveRules: true,
      docsPropagationScheduled: true,
      claudeMdUntouched: true,
      metrics: {
        extractionYield: 1,
        positiveTriggerRate: 1,
        generalizationRate: 1,
        falsePositiveRate: 0,
        helpfulRate: 1,
        onboardingCoverage: 1,
        docsPropagationCoverage: 1,
      },
      probes: [
        {
          id: "probe",
          kind: "positive",
          triggered: true,
          helpful: true,
          expectedTrigger: true,
          decision: "deny",
          message: "Use fetch",
        },
      ],
      failures: [],
      tempCleaned: true,
      passed: 1,
      failed: 0,
      results: [
        {
          id: "probe",
          kind: "positive",
          triggered: true,
          helpful: true,
          expectedTrigger: true,
          decision: "deny",
          message: "Use fetch",
          pass: true,
        },
      ],
    });

    expect(output).toContain("TeamAgent real E2E evaluation: PASS");
    expect(output).toContain("positive trigger rate: 100%");
    expect(output).toContain("Skills exported: yes");
    expect(output).toContain("Docs propagation scheduled: yes");
    expect(output).toContain("ok probe");
  });
});

describe("parseE2EEvaluateArgs", () => {
  it("parses flags", () => {
    expect(parseE2EEvaluateArgs(["--json", "--keep-temp", "--cwd=/tmp/a", "--home-dir", "/tmp/h"]))
      .toEqual({
        json: true,
        keepTemp: true,
        cwd: "/tmp/a",
        homeDir: "/tmp/h",
      });
  });
});
