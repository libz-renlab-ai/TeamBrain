import { describe, it, expect } from "vitest";
import type { ErrorSignalCollector, RawErrorSignal } from "../error-signal-collector.js";

function makeSignal(overrides: Partial<RawErrorSignal> = {}): RawErrorSignal {
  return {
    id: "sig-001",
    signalType: "B",
    weight: 0.7,
    sessionIds: ["sess-abc"],
    context: "build failed: tsc exited with code 1",
    timestamp: "2026-04-16T10:00:00Z",
    ...overrides,
  };
}

/**
 * 契约测试套件——任何 ErrorSignalCollector 实现都应通过。
 */
export function runErrorSignalCollectorContract(
  factory: (signals: RawErrorSignal[]) => ErrorSignalCollector,
): void {
  describe("ErrorSignalCollector contract", () => {
    it("returns empty array when no signals exist", async () => {
      const collector = factory([]);
      const result = await collector.collect(new Date("2026-01-01T00:00:00Z"));
      expect(result).toEqual([]);
    });

    it("returns signals after since date", async () => {
      const old = makeSignal({ id: "old", timestamp: "2026-04-15T00:00:00Z" });
      const fresh = makeSignal({ id: "fresh", timestamp: "2026-04-16T10:00:00Z" });
      const collector = factory([old, fresh]);
      const result = await collector.collect(new Date("2026-04-16T00:00:00Z"));
      expect(result.map((s) => s.id)).toContain("fresh");
      expect(result.map((s) => s.id)).not.toContain("old");
    });

    it("returned signals have required fields", async () => {
      const sig = makeSignal({ id: "check" });
      const collector = factory([sig]);
      const result = await collector.collect(new Date("2026-01-01T00:00:00Z"));
      expect(result.length).toBeGreaterThan(0);
      const s = result[0]!;
      expect(typeof s.id).toBe("string");
      expect(["A","B","C","D","G","H"]).toContain(s.signalType);
      expect(typeof s.weight).toBe("number");
      expect(Array.isArray(s.sessionIds)).toBe(true);
      expect(typeof s.context).toBe("string");
      expect(typeof s.timestamp).toBe("string");
    });

    it("weight is between 0 and 1", async () => {
      const sig = makeSignal({ weight: 0.5 });
      const collector = factory([sig]);
      const result = await collector.collect(new Date("2026-01-01T00:00:00Z"));
      for (const s of result) {
        expect(s.weight).toBeGreaterThanOrEqual(0);
        expect(s.weight).toBeLessThanOrEqual(1);
      }
    });
  });
}
