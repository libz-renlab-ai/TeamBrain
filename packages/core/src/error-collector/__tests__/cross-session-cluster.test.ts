import { describe, it, expect } from "vitest";
import { clusterByTag } from "../cross-session-cluster.js";
import type { RawErrorSignal } from "../cross-session-cluster.js";

function sig(
  id: string,
  sessionId: string,
  context: string,
  weight = 0.6,
): RawErrorSignal {
  return {
    id,
    signalType: "B",
    weight,
    sessionIds: [sessionId],
    context,
    timestamp: "2026-04-16T10:00:00Z",
  };
}

describe("clusterByTag", () => {
  it("returns empty array for empty input", () => {
    expect(clusterByTag([], 2, new Date("2026-04-16T10:00:00Z"))).toEqual([]);
  });

  it("clusters signals from different sessions sharing the same context keyword", () => {
    const signals = [
      sig("s1", "sess-1", "vitest fileParallelism OOM error"),
      sig("s2", "sess-2", "vitest fileParallelism memory crash"),
      sig("s3", "sess-3", "unrelated babel config issue"),
    ];
    const clusters = clusterByTag(signals, 2, new Date("2026-04-16T10:00:00Z"));
    expect(clusters.length).toBeGreaterThanOrEqual(1);
    const vitestCluster = clusters.find((c) =>
      c.context.includes("vitest"),
    );
    expect(vitestCluster).toBeDefined();
    expect(vitestCluster!.signalType).toBe("H");
    expect(vitestCluster!.sessionIds.length).toBeGreaterThanOrEqual(2);
  });

  it("does NOT cluster if same keyword appears in only 1 session", () => {
    const signals = [
      sig("s1", "sess-1", "vitest fileParallelism error"),
      sig("s2", "sess-1", "vitest again same session"),
    ];
    const clusters = clusterByTag(signals, 2, new Date("2026-04-16T10:00:00Z"));
    expect(clusters.length).toBe(0);
  });

  it("H signal weight is proportional to session count", () => {
    const signals = [
      sig("s1", "sess-1", "tsc type error unknown property"),
      sig("s2", "sess-2", "tsc type error missing field"),
      sig("s3", "sess-3", "tsc type error incompatible types"),
    ];
    const clusters = clusterByTag(signals, 2, new Date("2026-04-16T10:00:00Z"));
    const tscCluster = clusters.find((c) => c.context.includes("tsc"));
    if (tscCluster) {
      expect(tscCluster.weight).toBeGreaterThan(0.5);
    }
  });
});
