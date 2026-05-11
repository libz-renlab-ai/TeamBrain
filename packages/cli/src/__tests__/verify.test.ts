import { describe, it, expect, beforeEach, afterEach } from "vitest";
import nodeFs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  executeVerify,
  renderVerifyTerminal,
  renderVerifyMarkdown,
  parseVerifyArgs,
} from "../commands/verify.js";

function mkTmp() {
  const root = nodeFs.mkdtempSync(path.join(os.tmpdir(), "verify-"));
  return {
    root,
    cleanup: () => nodeFs.rmSync(root, { recursive: true, force: true }),
  };
}

describe("executeVerify", () => {
  let tmp: ReturnType<typeof mkTmp>;
  beforeEach(() => {
    tmp = mkTmp();
  });
  afterEach(() => tmp.cleanup());

  it("runs all 6 scenarios → all pass with mock LLM", async () => {
    const { result } = await executeVerify({
      now: () => new Date("2026-04-15T01:00:00Z"),
    });
    expect(result.total).toBe(6);
    expect(result.passed).toBe(6);
    expect(result.scenarios.map((s) => s.scenarioId)).toContain("moment-dayjs");
    expect(result.averagePRR).toBe(100);
    expect(result.averageKP).toBe(5);
  });

  it("writes Markdown report when reportPath set", async () => {
    const reportPath = path.join(tmp.root, "report.md");
    const { reportPath: returned } = await executeVerify({
      reportPath,
      now: () => new Date("2026-04-15T01:00:00Z"),
    });
    expect(returned).toBe(reportPath);
    expect(nodeFs.existsSync(reportPath)).toBe(true);
    const md = nodeFs.readFileSync(reportPath, "utf-8");
    expect(md).toContain("TeamAgent Verify 报告");
    expect(md).toContain("python-version");
    expect(md).toContain("PRR");
    expect(md).toContain("KP");
  });
});

describe("renderVerifyTerminal", () => {
  it("renders pass / fail counts + averages", () => {
    const out = renderVerifyTerminal({
      total: 2,
      passed: 1,
      averagePRR: 50,
      averageKP: 3.5,
      scenarios: [
        {
          scenarioId: "s1",
          passed: true,
          phaseA: { detectorCalled: true, correctionsFound: 1, expectedMatches: [], passed: true },
          phaseB: { extractorCalled: true, ruleGenerated: true, rulePredicates: [], passed: true },
          phaseC: { matcherCalled: true, actualBehavior: "block", expectedBehavior: "block", passed: true },
          prr: 100,
          kp: 5,
          errors: [],
        },
        {
          scenarioId: "s2",
          passed: false,
          phaseA: { detectorCalled: true, correctionsFound: 0, expectedMatches: [], passed: false },
          phaseB: { extractorCalled: false, ruleGenerated: false, rulePredicates: [], passed: false },
          phaseC: { matcherCalled: false, actualBehavior: "no-match", expectedBehavior: "block", passed: false },
          prr: 0,
          kp: 2,
          errors: [],
        },
      ],
    });
    expect(out).toContain("✓ s1");
    expect(out).toContain("✗ s2");
    expect(out).toContain("通过: 1/2");
    expect(out).toContain("平均 PRR: 50");
    expect(out).toContain("平均 KP:  3.50");
  });
});

describe("renderVerifyMarkdown", () => {
  it("includes per-scenario phase breakdown", () => {
    const md = renderVerifyMarkdown(
      {
        total: 1,
        passed: 1,
        averagePRR: 100,
        averageKP: 5,
        scenarios: [
          {
            scenarioId: "demo",
            passed: true,
            phaseA: {
              detectorCalled: true,
              correctionsFound: 1,
              expectedMatches: [{ signal: "explicit_denial", matched: true }],
              passed: true,
            },
            phaseB: {
              extractorCalled: true,
              ruleGenerated: true,
              rulePredicates: [{ predicate: "category == E", passed: true }],
              passed: true,
            },
            phaseC: {
              matcherCalled: true,
              actualBehavior: "block",
              expectedBehavior: "block",
              passed: true,
            },
            prr: 100,
            kp: 5,
            errors: [],
          },
        ],
      },
      new Date("2026-04-15T01:00:00Z"),
    );
    expect(md).toContain("# TeamAgent Verify 报告");
    expect(md).toContain("## 总览");
    expect(md).toContain("### demo ✓");
    expect(md).toContain("**Phase A");
    expect(md).toContain("**Phase B");
    expect(md).toContain("**Phase C");
    expect(md).toContain("category == E");
  });
});

describe("parseVerifyArgs", () => {
  it("defaults", () => {
    expect(parseVerifyArgs([])).toEqual({});
  });
  it("--report forms", () => {
    expect(parseVerifyArgs(["--report", "/tmp/r.md"])).toEqual({
      reportPath: "/tmp/r.md",
    });
    expect(parseVerifyArgs(["--report=/tmp/r.md"])).toEqual({
      reportPath: "/tmp/r.md",
    });
  });
});
