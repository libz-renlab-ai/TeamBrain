import { describe, it, expect } from "vitest";
import type {
  GitHubCommit,
  GitHubPullRequest,
  GitHubIssue,
} from "@teamagent/ports";
import type { PersistedEvent } from "@teamagent/types";
import { correlate } from "../correlate.js";

const WINDOW = {
  since: "2026-05-13T00:00:00Z",
  until: "2026-05-13T23:59:59Z",
};

function evt(
  kind: PersistedEvent["kind"],
  timestamp: string,
  extra: Partial<PersistedEvent> = {}
): PersistedEvent {
  return {
    id: `${kind}-${timestamp}`,
    kind,
    timestamp,
    schema_version: 1,
    ...extra,
  };
}

describe("correlate", () => {
  it("returns empty timeline + zero counts when nothing is in window", () => {
    const out = correlate({
      events: [],
      commits: [],
      pullRequests: [],
      issues: [],
      window: WINDOW,
    });
    expect(out.timeline).toEqual([]);
    expect(out.counts).toEqual({
      events: 0,
      commits: 0,
      prsOpened: 0,
      prsMerged: 0,
      issuesOpened: 0,
      preDenied: 0,
      narrativeRecurred: 0,
      userPromptInjected: 0,
    });
  });

  it("filters events outside the window", () => {
    const events = [
      evt("hook-pre.matched", "2025-01-01T00:00:00Z"),
      evt("hook-pre.matched", "2026-05-13T05:00:00Z"),
    ];
    const out = correlate({
      events,
      commits: [],
      pullRequests: [],
      issues: [],
      window: WINDOW,
    });
    expect(out.counts.events).toBe(1);
    expect(out.timeline).toHaveLength(1);
  });

  it("counts hook-pre.blocked as preDenied (matched/warned do not count)", () => {
    const events = [
      evt("hook-pre.blocked", "2026-05-13T10:00:00Z"),
      evt("hook-pre.matched", "2026-05-13T10:05:00Z"),
      evt("hook-pre.blocked", "2026-05-13T10:10:00Z"),
      evt("hook-pre.warned", "2026-05-13T10:15:00Z"),
    ];
    const out = correlate({
      events,
      commits: [],
      pullRequests: [],
      issues: [],
      window: WINDOW,
    });
    expect(out.counts.preDenied).toBe(2);
    expect(out.counts.events).toBe(4);
  });

  it("counts narrative recurrence and prompt injections", () => {
    const events = [
      evt("ai.narrative.recurred", "2026-05-13T10:00:00Z"),
      evt("ai.narrative.recurred", "2026-05-13T11:00:00Z"),
      evt("ai.narrative.injected", "2026-05-13T12:00:00Z"),
    ];
    const out = correlate({
      events,
      commits: [],
      pullRequests: [],
      issues: [],
      window: WINDOW,
    });
    expect(out.counts.narrativeRecurred).toBe(2);
    expect(out.counts.userPromptInjected).toBe(1);
  });

  it("counts commits / PRs / issues and sorts the timeline chronologically", () => {
    const commits: GitHubCommit[] = [
      {
        sha: "aaa",
        message: "x",
        authoredAt: "2026-05-13T08:00:00Z",
        author: "a",
        repo: "o/r",
      },
    ];
    const prs: GitHubPullRequest[] = [
      {
        number: 1,
        title: "p",
        state: "merged",
        createdAt: "2026-05-13T07:00:00Z",
        mergedAt: "2026-05-13T09:00:00Z",
        author: "a",
        repo: "o/r",
      },
    ];
    const issues: GitHubIssue[] = [
      {
        number: 9,
        title: "i",
        state: "open",
        createdAt: "2026-05-13T06:00:00Z",
        author: "a",
        repo: "o/r",
        labels: [],
      },
    ];
    const out = correlate({
      events: [],
      commits,
      pullRequests: prs,
      issues,
      window: WINDOW,
    });
    expect(out.counts.commits).toBe(1);
    expect(out.counts.prsOpened).toBe(1);
    expect(out.counts.prsMerged).toBe(1);
    expect(out.counts.issuesOpened).toBe(1);
    expect(out.timeline.map((t) => t.kind)).toEqual([
      "issue",
      "pull-request",
      "commit",
    ]);
  });
});
