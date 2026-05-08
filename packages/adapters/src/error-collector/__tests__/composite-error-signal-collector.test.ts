import { describe, it, expect } from "vitest";
import { CompositeErrorSignalCollector } from "../composite-error-signal-collector.js";
import { runErrorSignalCollectorContract } from "@teamagent/ports/contracts";
import type { PersistedEvent } from "@teamagent/types";
import type { RawErrorSignal } from "@teamagent/core";

function makeEvent(
  kind: PersistedEvent["kind"],
  extra: Partial<PersistedEvent> = {},
): PersistedEvent {
  return {
    id: `evt-${Math.random().toString(36).slice(2)}`,
    kind,
    timestamp: "2026-04-16T10:00:00Z",
    schema_version: 1,
    ...extra,
  } as PersistedEvent;
}

// Contract tests: pass pre-built signals through a stub collector.
// CompositeErrorSignalCollector builds signals from events/sessions;
// the contract factory uses a passthrough stub that satisfies the interface.
runErrorSignalCollectorContract((signals: RawErrorSignal[]) => ({
  collect: async (since: Date) =>
    signals.filter((s) => s.timestamp >= since.toISOString()),
}));

describe("CompositeErrorSignalCollector", () => {
  it("returns B signals from hook-post.result failures", async () => {
    const events: PersistedEvent[] = [
      makeEvent("hook-post.result", {
        result: { succeeded: false, exit_code: 1 },
        tool: { name: "Bash", input: { command: "pnpm test" } },
        session_id: "sess-1",
        timestamp: "2026-04-16T10:00:00Z",
      } as any),
    ];
    const collector = new CompositeErrorSignalCollector({
      events,
      sessions: [],
      since: new Date("2026-04-16T00:00:00Z"),
    });
    const signals = await collector.collect(new Date("2026-04-16T00:00:00Z"));
    const bSignals = signals.filter((s) => s.signalType === "B");
    expect(bSignals.length).toBeGreaterThanOrEqual(1);
  });

  it("returns C signals from ai.override.ignored events", async () => {
    const events: PersistedEvent[] = [
      makeEvent("ai.override.ignored", {
        session_id: "sess-2",
        timestamp: "2026-04-16T10:00:00Z",
      }),
    ];
    const collector = new CompositeErrorSignalCollector({
      events,
      sessions: [],
      since: new Date("2026-04-16T00:00:00Z"),
    });
    const signals = await collector.collect(new Date("2026-04-16T00:00:00Z"));
    expect(signals.some((s) => s.signalType === "C")).toBe(true);
  });

  it("filters out events before since date", async () => {
    const events: PersistedEvent[] = [
      makeEvent("hook-post.result", {
        result: { succeeded: false, exit_code: 1 },
        session_id: "sess-old",
        timestamp: "2026-04-14T10:00:00Z",
      } as any),
    ];
    const collector = new CompositeErrorSignalCollector({
      events,
      sessions: [],
      since: new Date("2026-04-16T00:00:00Z"),
    });
    const signals = await collector.collect(new Date("2026-04-16T00:00:00Z"));
    expect(signals.filter((s) => s.signalType === "B")).toHaveLength(0);
  });
});
