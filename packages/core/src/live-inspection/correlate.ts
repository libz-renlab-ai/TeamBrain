import type {
  GitHubCommit,
  GitHubIssue,
  GitHubPullRequest,
} from "@teamagent/ports";
import type { PersistedEvent } from "@teamagent/types";
import type { InspectionCounts, TimelineEntry } from "./types.js";

export interface CorrelateInput {
  events: readonly PersistedEvent[];
  commits: readonly GitHubCommit[];
  pullRequests: readonly GitHubPullRequest[];
  issues: readonly GitHubIssue[];
  window: { since: string; until: string };
}

export interface CorrelateOutput {
  timeline: TimelineEntry[];
  counts: InspectionCounts;
}

/**
 * Merge #308 AI events with GitHub activity into a single time-ordered
 * timeline. Pure function: caller is responsible for IO. Items outside the
 * window are filtered out.
 */
export function correlate(input: CorrelateInput): CorrelateOutput {
  const { since, until } = input.window;
  const counts: InspectionCounts = {
    events: 0,
    commits: 0,
    prsOpened: 0,
    prsMerged: 0,
    issuesOpened: 0,
    preDenied: 0,
    narrativeRecurred: 0,
    userPromptInjected: 0,
  };
  const timeline: TimelineEntry[] = [];

  for (const e of input.events) {
    if (e.timestamp < since || e.timestamp > until) continue;
    timeline.push({ kind: "event", at: e.timestamp, event: e });
    counts.events++;
    // pre-tool-use-handler.ts emits `hook-pre.blocked` when TeamAgent's
    // block enforcement fires (returns permissionDecision="allow" to Claude
    // but records the would-deny intent via the event kind itself —
    // permissionDecision is NOT persisted). Count those.
    if (e.kind === "hook-pre.blocked") counts.preDenied++;
    if (e.kind === "ai.narrative.recurred") counts.narrativeRecurred++;
    // user-prompt-injected lives in attribution channel; M4-A also persists
    // it as `ai.narrative.injected` to events.db. Both kinds count.
    if (e.kind === "ai.narrative.injected") counts.userPromptInjected++;
  }

  for (const c of input.commits) {
    if (c.authoredAt < since || c.authoredAt > until) continue;
    timeline.push({ kind: "commit", at: c.authoredAt, commit: c });
    counts.commits++;
  }

  for (const p of input.pullRequests) {
    if (p.createdAt < since || p.createdAt > until) continue;
    timeline.push({ kind: "pull-request", at: p.createdAt, pr: p });
    counts.prsOpened++;
    if (p.state === "merged" && p.mergedAt) counts.prsMerged++;
  }

  for (const i of input.issues) {
    if (i.createdAt < since || i.createdAt > until) continue;
    timeline.push({ kind: "issue", at: i.createdAt, issue: i });
    counts.issuesOpened++;
  }

  timeline.sort((a, b) => a.at.localeCompare(b.at));
  return { timeline, counts };
}
