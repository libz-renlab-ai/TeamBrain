import { describe, it, expect } from "vitest";
import { freezeIncident } from "../freeze-incident.js";
import type { InspectionResult } from "../types.js";

function makeResult(over: Partial<InspectionResult> = {}): InspectionResult {
  return {
    member: "alice",
    project: "owner/repo",
    window: {
      since: "2026-05-13T00:00:00Z",
      until: "2026-05-13T23:59:59Z",
    },
    generatedAt: "2026-05-13T10:00:00Z",
    counts: {
      events: 1,
      commits: 0,
      prsOpened: 0,
      prsMerged: 0,
      issuesOpened: 0,
      preDenied: 3,
      narrativeRecurred: 0,
      userPromptInjected: 0,
    },
    timeline: [],
    abnormalSignals: [
      {
        id: "repeated_deny",
        message: "pre denies ×3",
        evidence: { preDenied: 3 },
      },
    ],
    ...over,
  };
}

describe("freezeIncident", () => {
  it("produces a stable incidentId of form <member>-<yyyymmddTHHmm>-<suffix>", () => {
    const incident = freezeIncident({
      result: makeResult(),
      now: "2026-05-13T10:00:00Z",
      randomSuffix: "ab12",
    });
    expect(incident.incidentId).toBe("alice-20260513T1000-ab12");
  });

  it("copies window, signals, counts verbatim from the result", () => {
    const result = makeResult();
    const incident = freezeIncident({
      result,
      now: "2026-05-13T10:00:00Z",
      randomSuffix: "x",
    });
    expect(incident.window).toEqual(result.window);
    expect(incident.signals).toEqual(result.abnormalSignals);
    expect(incident.counts).toEqual(result.counts);
    expect(incident.frozenAt).toBe("2026-05-13T10:00:00Z");
  });

  it("trims the timeline to maxTimeline entries (default 200)", () => {
    const timeline: InspectionResult["timeline"] = [];
    for (let i = 0; i < 250; i++) {
      timeline.push({
        kind: "commit",
        at: `2026-05-13T10:${String(i % 60).padStart(2, "0")}:00Z`,
        commit: {
          sha: `c${i}`,
          message: `m${i}`,
          authoredAt: `2026-05-13T10:${String(i % 60).padStart(2, "0")}:00Z`,
          author: "alice",
          repo: "o/r",
        },
      });
    }
    const incident = freezeIncident({
      result: makeResult({ timeline }),
      now: "2026-05-13T10:00:00Z",
      randomSuffix: "x",
    });
    expect(incident.timeline.length).toBe(200);
  });

  it("respects custom maxTimeline", () => {
    const timeline: InspectionResult["timeline"] = [];
    for (let i = 0; i < 10; i++) {
      timeline.push({
        kind: "commit",
        at: `2026-05-13T10:0${i}:00Z`,
        commit: {
          sha: `c${i}`,
          message: `m${i}`,
          authoredAt: `2026-05-13T10:0${i}:00Z`,
          author: "alice",
          repo: "o/r",
        },
      });
    }
    const incident = freezeIncident({
      result: makeResult({ timeline }),
      now: "2026-05-13T10:00:00Z",
      randomSuffix: "x",
      maxTimeline: 3,
    });
    expect(incident.timeline.length).toBe(3);
  });
});
