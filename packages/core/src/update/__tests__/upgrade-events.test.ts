import { describe, it, expect } from "vitest";
import {
  makeUpdatePromptShownEvent,
  makeUpdateSnoozedEvent,
  makeUpdateNeverSetEvent,
  makeUpdateInstalledEvent,
  isUpgradeAttributionEvent,
  attributionToPersistedRow,
} from "../upgrade-events.js";

const T0 = 1_700_000_000_000; // arbitrary fixed epoch ms
const ISO_T0 = new Date(T0).toISOString();

describe("upgrade-events factories", () => {
  it("makeUpdatePromptShownEvent emits well-formed AttributionEvent", () => {
    const ev = makeUpdatePromptShownEvent({
      fromVer: "0.9.4",
      toVer: "0.9.5",
      snoozeLevel: 0,
      nowMs: T0,
    });
    expect(ev).toEqual({
      kind: "update-prompt-shown",
      source: "update",
      severity: "info",
      timestamp: ISO_T0,
      fromVer: "0.9.4",
      toVer: "0.9.5",
      snoozeLevel: 0,
    });
  });

  it("makeUpdateSnoozedEvent carries level + untilTs", () => {
    const until = T0 + 24 * 3600 * 1000;
    const ev = makeUpdateSnoozedEvent({ level: 1, untilTs: until, nowMs: T0 });
    expect(ev.kind).toBe("update-snoozed");
    expect(ev.level).toBe(1);
    expect(ev.untilTs).toBe(until);
    expect(ev.timestamp).toBe(ISO_T0);
  });

  it("makeUpdateNeverSetEvent has no payload beyond base fields", () => {
    const ev = makeUpdateNeverSetEvent({ nowMs: T0 });
    expect(ev.kind).toBe("update-never-set");
    expect(ev.source).toBe("update");
    expect(ev.severity).toBe("info");
    expect(ev.timestamp).toBe(ISO_T0);
    // ensure no leak of extra fields beyond the union shape
    expect(Object.keys(ev).sort()).toEqual(
      ["kind", "severity", "source", "timestamp"].sort(),
    );
  });

  it("makeUpdateInstalledEvent carries fromVer/toVer/durationMs", () => {
    const ev = makeUpdateInstalledEvent({
      fromVer: "abc1234",
      toVer: "def5678",
      durationMs: 4321,
      nowMs: T0,
    });
    expect(ev).toEqual({
      kind: "update-installed",
      source: "update",
      severity: "info",
      timestamp: ISO_T0,
      fromVer: "abc1234",
      toVer: "def5678",
      durationMs: 4321,
    });
  });
});

describe("isUpgradeAttributionEvent type-guard", () => {
  it("returns true for all 4 update-* kinds", () => {
    expect(
      isUpgradeAttributionEvent(
        makeUpdatePromptShownEvent({ fromVer: "", toVer: "x", snoozeLevel: 0, nowMs: T0 }),
      ),
    ).toBe(true);
    expect(
      isUpgradeAttributionEvent(
        makeUpdateSnoozedEvent({ level: 1, untilTs: T0, nowMs: T0 }),
      ),
    ).toBe(true);
    expect(
      isUpgradeAttributionEvent(makeUpdateNeverSetEvent({ nowMs: T0 })),
    ).toBe(true);
    expect(
      isUpgradeAttributionEvent(
        makeUpdateInstalledEvent({ fromVer: "", toVer: "x", durationMs: 1, nowMs: T0 }),
      ),
    ).toBe(true);
  });

  it("returns false for unrelated kind", () => {
    const fake = {
      kind: "pitfall.added",
      source: "pitfall",
      severity: "info",
      timestamp: ISO_T0,
      knowledgeId: "k",
      category: "C",
      tag: "t",
      level: "personal",
      knowledgeCountBefore: 0,
      knowledgeCountAfter: 1,
      skillMdPath: "/tmp",
    } as const;
    // cast to AttributionEvent shape for the guard
    expect(isUpgradeAttributionEvent(fake)).toBe(false);
  });
});

describe("attributionToPersistedRow", () => {
  it("packs prompt-shown payload into JSON-friendly object", () => {
    const row = attributionToPersistedRow(
      makeUpdatePromptShownEvent({
        fromVer: "0.9.4",
        toVer: "0.9.5",
        snoozeLevel: 1,
        nowMs: T0,
      }),
      "abc",
    );
    expect(row.kind).toBe("update-prompt-shown");
    expect(row.id).toContain("update-update-prompt-shown");
    expect(row.id).toContain(String(T0));
    expect(row.id).toContain("abc");
    expect(row.timestamp).toBe(ISO_T0);
    expect(row.schema_version).toBe(1);
    expect(row.payload).toEqual({
      fromVer: "0.9.4",
      toVer: "0.9.5",
      snoozeLevel: 1,
    });
  });

  it("snoozed payload carries level + untilTs", () => {
    const row = attributionToPersistedRow(
      makeUpdateSnoozedEvent({ level: 2, untilTs: T0 + 999, nowMs: T0 }),
      "x",
    );
    expect(row.payload).toEqual({ level: 2, untilTs: T0 + 999 });
  });

  it("never-set payload is empty object", () => {
    const row = attributionToPersistedRow(
      makeUpdateNeverSetEvent({ nowMs: T0 }),
      "x",
    );
    expect(row.payload).toEqual({});
  });

  it("installed payload carries fromVer/toVer/durationMs", () => {
    const row = attributionToPersistedRow(
      makeUpdateInstalledEvent({
        fromVer: "a",
        toVer: "b",
        durationMs: 7,
        nowMs: T0,
      }),
      "x",
    );
    expect(row.payload).toEqual({ fromVer: "a", toVer: "b", durationMs: 7 });
  });

  it("two events with same nowMs but different randSuffix get distinct ids", () => {
    const a = attributionToPersistedRow(
      makeUpdateNeverSetEvent({ nowMs: T0 }),
      "aaa",
    );
    const b = attributionToPersistedRow(
      makeUpdateNeverSetEvent({ nowMs: T0 }),
      "bbb",
    );
    expect(a.id).not.toBe(b.id);
  });
});
