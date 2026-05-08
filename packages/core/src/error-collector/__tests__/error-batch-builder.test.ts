import { describe, it, expect } from "vitest";
import { buildErrorBatches } from "../error-batch-builder.js";
import type { RawErrorSignal } from "../cross-session-cluster.js";

function sig(
  id: string,
  category: "C" | "E" | "S" | "K",
  context = "some error",
): RawErrorSignal {
  return {
    id,
    signalType: "B",
    weight: 0.7,
    sessionIds: ["s1"],
    context,
    suggestedCategory: category,
    timestamp: "2026-04-16T10:00:00Z",
  };
}

describe("buildErrorBatches", () => {
  it("returns empty array for empty input", () => {
    expect(buildErrorBatches([])).toEqual([]);
  });

  it("groups signals by suggestedCategory", () => {
    const signals = [
      sig("c1", "C"),
      sig("e1", "E"),
      sig("c2", "C"),
    ];
    const batches = buildErrorBatches(signals);
    expect(batches.length).toBe(2);
    const cBatch = batches.find((b) => b.category === "C");
    expect(cBatch!.signals).toHaveLength(2);
  });

  it("assigns uncategorized signals to E by default", () => {
    const uncategorized: RawErrorSignal = {
      id: "unc",
      signalType: "B",
      weight: 0.6,
      sessionIds: ["s1"],
      context: "some build error",
      timestamp: "2026-04-16T10:00:00Z",
    };
    const batches = buildErrorBatches([uncategorized]);
    expect(batches[0]!.category).toBe("E");
  });

  it("each batch has a non-empty prompt string", () => {
    const signals = [sig("c1", "C", "typescript error in file.ts")];
    const batches = buildErrorBatches(signals);
    expect(batches[0]!.prompt.length).toBeGreaterThan(50);
  });
});
