import type { Incident, InspectionResult } from "./types.js";

export interface FreezeIncidentInput {
  result: InspectionResult;
  /** ISO 8601 — frozen-at time (caller-injected so the function stays pure). */
  now: string;
  /** Random short suffix, caller-supplied for deterministic tests. */
  randomSuffix: string;
  /** Max timeline entries to retain in the incident (default 200). */
  maxTimeline?: number;
}

/**
 * Serialize an inspection's abnormal signals + timeline snapshot into an
 * Incident record. Pure function: writing the JSON to disk is the caller's
 * responsibility.
 */
export function freezeIncident(input: FreezeIncidentInput): Incident {
  const max = input.maxTimeline ?? 200;
  const trimmed =
    input.result.timeline.length > max
      ? input.result.timeline.slice(-max)
      : input.result.timeline;

  const yyyymmddhhmm = input.now
    .replace(/[-:]/g, "")
    .replace(/T/, "T")
    .slice(0, 13);

  return {
    incidentId: `${input.result.member}-${yyyymmddhhmm}-${input.randomSuffix}`,
    member: input.result.member,
    project: input.result.project,
    frozenAt: input.now,
    window: input.result.window,
    signals: input.result.abnormalSignals,
    timeline: trimmed,
    counts: input.result.counts,
  };
}
