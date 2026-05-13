/**
 * Types for #372 live-inspection: leader clicks a member → CLI pulls #308 AI
 * events + GitHub activity → correlate → summarize → detect abnormal →
 * (optionally) freeze incident.
 *
 * Functional Core: these are pure data shapes. No fs / child_process imports
 * allowed in this directory.
 */
import type {
  GitHubCommit,
  GitHubPullRequest,
  GitHubIssue,
} from "@teamagent/ports";
import type { PersistedEvent } from "@teamagent/types";

/** A timeline entry — either a #308 event or a GitHub activity. */
export type TimelineEntry =
  | { kind: "event"; at: string; event: PersistedEvent }
  | { kind: "commit"; at: string; commit: GitHubCommit }
  | { kind: "pull-request"; at: string; pr: GitHubPullRequest }
  | { kind: "issue"; at: string; issue: GitHubIssue };

/** Aggregated counts used by both summary and abnormal detection. */
export interface InspectionCounts {
  events: number;
  commits: number;
  prsOpened: number;
  prsMerged: number;
  issuesOpened: number;
  preDenied: number;
  narrativeRecurred: number;
  userPromptInjected: number;
}

export interface AbnormalSignal {
  /** Short machine-readable id (e.g. "repeated_deny"). */
  id:
    | "repeated_deny"
    | "education_loop"
    | "stuck"
    | "no_activity"
    | "custom";
  /** Human-readable description for the summary. */
  message: string;
  /** Counts / thresholds that triggered the signal. */
  evidence: Record<string, number | string>;
}

export interface InspectionResult {
  member: string;
  project?: string;
  window: { since: string; until: string };
  /** ISO 8601 — when the inspection was generated. */
  generatedAt: string;
  counts: InspectionCounts;
  timeline: TimelineEntry[];
  abnormalSignals: AbnormalSignal[];
}

export interface Incident {
  /** Stable id; "<member>-<yyyymmddTHHmm>-<short>" form. */
  incidentId: string;
  member: string;
  project?: string;
  /** ISO 8601 — frozen-at time. */
  frozenAt: string;
  window: { since: string; until: string };
  signals: AbnormalSignal[];
  /** Snapshot of timeline (may be trimmed by caller for storage). */
  timeline: TimelineEntry[];
  counts: InspectionCounts;
}
