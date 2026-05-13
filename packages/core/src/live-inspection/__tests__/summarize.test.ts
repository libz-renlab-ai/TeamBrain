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

  it("escapes backticks and brackets in user-controlled commit messages / titles", () => {
    const md = summarize(
      makeResult({
        timeline: [
          {
            kind: "commit",
            at: "2026-05-13T10:00:00Z",
            commit: {
              sha: "abc1234",
              message: "evil ](javascript:alert(1)) `rm -rf /`",
              authoredAt: "2026-05-13T10:00:00Z",
              author: "alice",
              repo: "o/r",
            },
          },
          {
            kind: "pull-request",
            at: "2026-05-13T11:00:00Z",
            pr: {
              number: 99,
              title: "title with `backtick` and [link](evil)",
              state: "open",
              createdAt: "2026-05-13T11:00:00Z",
              author: "alice",
              repo: "o/r",
            },
          },
        ],
      })
    );
    // raw `javascript:` link syntax must not appear unescaped
    expect(md).not.toMatch(/[^\\]\]\(javascript:/);
    // raw triple-backtick injection must be neutralized
    expect(md).not.toMatch(/[^\\]`rm/);
    // brackets must be escaped
    expect(md).toContain("\\[");
    expect(md).toContain("\\]");
  });

  it("renders timeline entries for event / pull-request / issue kinds", () => {
    const md = summarize(
      makeResult({
        timeline: [
          {
            kind: "event",
            at: "2026-05-13T10:00:00Z",
            event: {
              id: "e1",
              kind: "hook-pre.matched",
              timestamp: "2026-05-13T10:00:00Z",
              schema_version: 1,
            },
          },
          {
            kind: "pull-request",
            at: "2026-05-13T11:00:00Z",
            pr: {
              number: 7,
              title: "p",
              state: "open",
              createdAt: "2026-05-13T11:00:00Z",
              author: "alice",
              repo: "o/r",
            },
          },
          {
            kind: "issue",
            at: "2026-05-13T12:00:00Z",
            issue: {
              number: 9,
              title: "i",
              state: "open",
              createdAt: "2026-05-13T12:00:00Z",
              author: "alice",
              repo: "o/r",
              labels: [],
            },
          },
        ],
      })
    );
    expect(md).toContain("event `hook-pre.matched`");
    expect(md).toContain("PR #7 (open)");
    expect(md).toContain("issue #9 (open)");
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
