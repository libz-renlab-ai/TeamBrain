import { describe, it, expect } from "vitest";
import { summarize } from "../summarize.js";
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
      events: 0,
      commits: 0,
      prsOpened: 0,
      prsMerged: 0,
      issuesOpened: 0,
      preDenied: 0,
      narrativeRecurred: 0,
      userPromptInjected: 0,
    },
    timeline: [],
    abnormalSignals: [],
    ...over,
  };
}

describe("summarize", () => {
  it("renders headline + counts + healthy status when no signals", () => {
    const md = summarize(makeResult({ counts: {
      events: 5,
      commits: 2,
      prsOpened: 1,
      prsMerged: 1,
      issuesOpened: 0,
      preDenied: 0,
      narrativeRecurred: 0,
      userPromptInjected: 0,
    } }));
    expect(md).toContain("## Inspection summary");
    expect(md).toContain("alice");
    expect(md).toContain("AI events: **5**");
    expect(md).toContain("healthy");
    expect(md).not.toContain("🚨");
  });

  it("includes the abnormal-signals block when signals are present", () => {
    const md = summarize(
      makeResult({
        counts: {
          events: 5,
          commits: 0,
          prsOpened: 0,
          prsMerged: 0,
          issuesOpened: 0,
          preDenied: 3,
          narrativeRecurred: 0,
          userPromptInjected: 0,
        },
        abnormalSignals: [
          {
            id: "repeated_deny",
            message: "pre denies ×3",
            evidence: { preDenied: 3 },
          },
        ],
      })
    );
    expect(md).toContain("🚨 abnormal signals");
    expect(md).toContain("**repeated_deny**");
  });

  it("renders a timeline tail of up to 20 entries", () => {
    const timeline: InspectionResult["timeline"] = [];
    for (let i = 0; i < 30; i++) {
      timeline.push({
        kind: "commit",
        at: `2026-05-13T10:${String(i).padStart(2, "0")}:00Z`,
        commit: {
          sha: `c${i}`,
          message: `m${i}`,
          authoredAt: `2026-05-13T10:${String(i).padStart(2, "0")}:00Z`,
          author: "alice",
          repo: "o/r",
        },
      });
    }
    const md = summarize(makeResult({ timeline }));
    expect(md).toContain("Recent timeline (30 entries)");
    // last commit c29 must appear; first commit c0 must be trimmed out of the tail
    expect(md).toContain("c29");
    expect(md).not.toContain("c0 m0");
  });
});
