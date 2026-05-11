import { describe, it, expect } from "vitest";
import { runScenario, runVerify } from "../runner.js";
import { ruleBasedCorrectionDetector } from "../../correction-detector/rule-based.js";
import { llmBasedKnowledgeExtractor } from "../../extractor/llm-based.js";
import type { KnowledgeStore } from "@teamagent/ports";
import type { KnowledgeEntry } from "@teamagent/types";
import { pythonVersionScenario } from "../../../../../fixtures/scenarios/python-version.js";
import { allScenarios } from "../../../../../fixtures/scenarios/index.js";

class InMemoryStore implements KnowledgeStore {
  entries: KnowledgeEntry[] = [];
  getAll() {
    return [...this.entries];
  }
  getActive() {
    return this.entries.filter((e) => e.status === "active");
  }
  getById(id: string) {
    return this.entries.find((e) => e.id === id);
  }
  query() {
    return this.getActive();
  }
  add(e: KnowledgeEntry) {
    this.entries.push(e);
  }
  update(id: string, patch: Partial<KnowledgeEntry>) {
    const i = this.entries.findIndex((e) => e.id === id);
    if (i >= 0) this.entries[i] = { ...this.entries[i]!, ...patch } as KnowledgeEntry;
  }
  delete(id: string) {
    const i = this.entries.findIndex((e) => e.id === id);
    if (i < 0) return false;
    this.entries.splice(i, 1);
    return true;
  }
  count() {
    return this.entries.length;
  }
}

describe("runScenario — python-version", () => {
  it("phase A: detector identifies explicit_denial at turn 1", async () => {
    const r = await runScenario(pythonVersionScenario, {
      detector: ruleBasedCorrectionDetector,
      extractor: llmBasedKnowledgeExtractor,
      makeStore: () => new InMemoryStore(),
      now: () => new Date("2026-04-15T01:00:00Z"),
    });
    expect(r.phaseA.detectorCalled).toBe(true);
    expect(r.phaseA.correctionsFound).toBeGreaterThan(0);
    expect(r.phaseA.passed).toBe(true);
  });

  it("phase B: extractor produces a rule satisfying predicates", async () => {
    const r = await runScenario(pythonVersionScenario, {
      detector: ruleBasedCorrectionDetector,
      extractor: llmBasedKnowledgeExtractor,
      makeStore: () => new InMemoryStore(),
      now: () => new Date("2026-04-15T01:00:00Z"),
    });
    expect(r.phaseB.ruleGenerated).toBe(true);
    expect(r.phaseB.passed).toBe(true);
  });

  it("phase C: matcher intercepts the new tool call as block", async () => {
    const r = await runScenario(pythonVersionScenario, {
      detector: ruleBasedCorrectionDetector,
      extractor: llmBasedKnowledgeExtractor,
      makeStore: () => new InMemoryStore(),
      now: () => new Date("2026-04-15T01:00:00Z"),
    });
    expect(r.phaseC.matcherCalled).toBe(true);
    expect(r.phaseC.actualBehavior).toBe("block");
    expect(r.phaseC.passed).toBe(true);
  });

  it("scenario passes overall + reports PRR=100 / KP=5", async () => {
    const r = await runScenario(pythonVersionScenario, {
      detector: ruleBasedCorrectionDetector,
      extractor: llmBasedKnowledgeExtractor,
      makeStore: () => new InMemoryStore(),
      now: () => new Date("2026-04-15T01:00:00Z"),
    });
    expect(r.passed).toBe(true);
    expect(r.prr).toBe(100);
    expect(r.kp).toBe(5);
  });

  it("uses injected idGen for deterministic ids", async () => {
    const r = await runScenario(pythonVersionScenario, {
      detector: ruleBasedCorrectionDetector,
      extractor: llmBasedKnowledgeExtractor,
      makeStore: () => new InMemoryStore(),
      now: () => new Date("2026-04-15T01:00:00Z"),
      idGen: () => "fixed-id",
    });
    expect(r.passed).toBe(true);
  });

  it("unrelated tool call does not match (no false positive)", async () => {
    // Scenario expects "block" for python command. A different command should NOT trigger.
    // This is implicitly tested by Phase C only firing for the python case.
    // Here verify the rule is selective: change toolCall to non-python.
    const modScenario = {
      ...pythonVersionScenario,
      phaseC: {
        toolCall: {
          toolName: "Bash",
          input: { command: "ls -la" },
        },
        expectedBehavior: "no-match" as const,
      },
    };
    const r = await runScenario(modScenario, {
      detector: ruleBasedCorrectionDetector,
      extractor: llmBasedKnowledgeExtractor,
      makeStore: () => new InMemoryStore(),
      now: () => new Date("2026-04-15T01:00:00Z"),
    });
    expect(r.phaseC.actualBehavior).toBe("no-match");
    expect(r.phaseC.passed).toBe(true);
  });
});

describe("runVerify — multi-scenario aggregation", () => {
  it("aggregates pass count + averages PRR and KP", async () => {
    const r = await runVerify([pythonVersionScenario, pythonVersionScenario], {
      detector: ruleBasedCorrectionDetector,
      extractor: llmBasedKnowledgeExtractor,
      makeStore: () => new InMemoryStore(),
      now: () => new Date("2026-04-15T01:00:00Z"),
    });
    expect(r.total).toBe(2);
    expect(r.passed).toBe(2);
    expect(r.averagePRR).toBe(100);
    expect(r.averageKP).toBe(5);
  });

  it("empty scenarios → all-zero result", async () => {
    const r = await runVerify([], {
      detector: ruleBasedCorrectionDetector,
      extractor: llmBasedKnowledgeExtractor,
      makeStore: () => new InMemoryStore(),
      now: () => new Date(),
    });
    expect(r).toEqual({
      total: 0,
      passed: 0,
      scenarios: [],
      averagePRR: 0,
      averageKP: 0,
    });
  });

  describe("all 6 fixture scenarios", () => {
    it("all pass with mock LLM", async () => {
      const r = await runVerify(allScenarios, {
        detector: ruleBasedCorrectionDetector,
        extractor: llmBasedKnowledgeExtractor,
        makeStore: () => new InMemoryStore(),
        now: () => new Date("2026-04-15T01:00:00Z"),
      });
      // Expectation: ALL 6 scenarios pass
      const failed = r.scenarios.filter((s) => !s.passed);
      const failureSummary = failed
        .map((s) => `${s.scenarioId}: A=${s.phaseA.passed} B=${s.phaseB.passed} C=${s.phaseC.passed}`)
        .join("\n");
      expect(r.passed, `Failed scenarios:\n${failureSummary}`).toBe(6);
      expect(r.total).toBe(6);
      expect(r.averagePRR).toBe(100);
      expect(r.averageKP).toBe(5);
    });
  });
});
