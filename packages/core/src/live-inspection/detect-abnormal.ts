import type { AbnormalSignal, InspectionCounts } from "./types.js";

export interface DetectAbnormalThresholds {
  /** ≥N hook-pre denies in the window → "repeated_deny" */
  repeatedDenyN: number;
  /** ≥N ai.narrative.recurred → "education_loop" */
  educationLoopN: number;
  /** 0 commits AND ≥N injected prompts → "stuck" */
  stuckInjectedN: number;
  /** No events at all AND no GitHub activity → "no_activity" */
  noActivityWhen: "always" | "never";
}

export const DEFAULT_THRESHOLDS: DetectAbnormalThresholds = {
  repeatedDenyN: 3,
  educationLoopN: 3,
  stuckInjectedN: 10,
  noActivityWhen: "always",
};

/**
 * Pure heuristic. Returns the list of abnormal signals; empty means healthy.
 * Caller picks the thresholds; defaults match the grill verdict §7 spec.
 */
export function detectAbnormal(
  counts: InspectionCounts,
  thresholds: DetectAbnormalThresholds = DEFAULT_THRESHOLDS
): AbnormalSignal[] {
  const signals: AbnormalSignal[] = [];

  if (counts.preDenied >= thresholds.repeatedDenyN) {
    signals.push({
      id: "repeated_deny",
      message: `Pre-tool-use deny fired ${counts.preDenied} times in the window — member may be repeatedly attempting blocked actions.`,
      evidence: {
        preDenied: counts.preDenied,
        threshold: thresholds.repeatedDenyN,
      },
    });
  }

  if (counts.narrativeRecurred >= thresholds.educationLoopN) {
    signals.push({
      id: "education_loop",
      message: `Narrative-rule recurrence ${counts.narrativeRecurred} times — previously injected guidance is being ignored.`,
      evidence: {
        narrativeRecurred: counts.narrativeRecurred,
        threshold: thresholds.educationLoopN,
      },
    });
  }

  if (
    counts.commits === 0 &&
    counts.userPromptInjected >= thresholds.stuckInjectedN
  ) {
    signals.push({
      id: "stuck",
      message: `${counts.userPromptInjected} prompt injections with 0 commits — many interactions, no shipped code.`,
      evidence: {
        userPromptInjected: counts.userPromptInjected,
        commits: counts.commits,
        threshold: thresholds.stuckInjectedN,
      },
    });
  }

  if (
    thresholds.noActivityWhen === "always" &&
    counts.events === 0 &&
    counts.commits === 0 &&
    counts.prsOpened === 0 &&
    counts.issuesOpened === 0
  ) {
    signals.push({
      id: "no_activity",
      message: "No AI events and no GitHub activity in the window.",
      evidence: { ...counts },
    });
  }

  return signals;
}
