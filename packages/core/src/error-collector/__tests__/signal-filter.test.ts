import { describe, it, expect } from "vitest";
import { filterSignals } from "../signal-filter.js";
import type { RawErrorSignal } from "../cross-session-cluster.js";

function sig(
  id: string,
  sessionId: string,
  weight: number,
): RawErrorSignal {
  return {
    id,
    signalType: "B",
    weight,
    sessionIds: [sessionId],
    context: `error context for ${id}`,
    timestamp: "2026-04-16T10:00:00Z",
  };
}

describe("filterSignals", () => {
  it("returns empty array for empty input", () => {
    expect(filterSignals([], { weightThreshold: 0.3, minSessions: 2 })).toEqual([]);
  });

  it("removes signals below weight threshold", () => {
    const signals = [
      sig("low", "s1", 0.2),
      sig("ok", "s2", 0.5),
    ];
    const result = filterSignals(signals, { weightThreshold: 0.3, minSessions: 1 });
    expect(result.map((s) => s.id)).not.toContain("low");
    expect(result.map((s) => s.id)).toContain("ok");
  });

  it("removes signals appearing in fewer than minSessions unique sessions", () => {
    const oneSession: RawErrorSignal = {
      id: "one-session",
      signalType: "B",
      weight: 0.8,
      sessionIds: ["s1"],
      context: "error",
      timestamp: "2026-04-16T10:00:00Z",
    };
    const twoSessions: RawErrorSignal = {
      id: "two-sessions",
      signalType: "B",
      weight: 0.8,
      sessionIds: ["s1", "s2"],
      context: "error",
      timestamp: "2026-04-16T10:00:00Z",
    };
    const result = filterSignals([oneSession, twoSessions], { weightThreshold: 0.1, minSessions: 2 });
    expect(result.map((s) => s.id)).toContain("two-sessions");
    expect(result.map((s) => s.id)).not.toContain("one-session");
  });

  it("deduplicates: keeps highest-weight signal among same-id duplicates", () => {
    const signals: RawErrorSignal[] = [
      { id: "dup", signalType: "B", weight: 0.5, sessionIds: ["s1", "s2"], context: "x", timestamp: "2026-04-15T00:00:00Z" },
      { id: "dup", signalType: "B", weight: 0.8, sessionIds: ["s1", "s2"], context: "x", timestamp: "2026-04-16T00:00:00Z" },
    ];
    const result = filterSignals(signals, { weightThreshold: 0.1, minSessions: 1 });
    expect(result.filter((s) => s.id === "dup")).toHaveLength(1);
    expect(result.find((s) => s.id === "dup")!.weight).toBe(0.8);
  });

  it("H signals bypass minSessions check (already clustered)", () => {
    const hSig: RawErrorSignal = {
      id: "h-cluster",
      signalType: "H",
      weight: 0.7,
      sessionIds: ["s1", "s2"],
      context: "cluster context",
      timestamp: "2026-04-16T10:00:00Z",
    };
    const result = filterSignals([hSig], { weightThreshold: 0.3, minSessions: 5 });
    expect(result.map((s) => s.id)).toContain("h-cluster");
  });
});
