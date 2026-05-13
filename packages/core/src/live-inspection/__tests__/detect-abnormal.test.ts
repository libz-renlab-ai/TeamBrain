import { describe, it, expect } from "vitest";
import {
  DEFAULT_THRESHOLDS,
  detectAbnormal,
} from "../detect-abnormal.js";
import type { InspectionCounts } from "../types.js";

const empty: InspectionCounts = {
  events: 0,
  commits: 0,
  prsOpened: 0,
  prsMerged: 0,
  issuesOpened: 0,
  preDenied: 0,
  narrativeRecurred: 0,
  userPromptInjected: 0,
};

describe("detectAbnormal", () => {
  it("flags repeated_deny when preDenied ≥ threshold", () => {
    const sigs = detectAbnormal({ ...empty, events: 5, preDenied: 3 });
    expect(sigs.map((s) => s.id)).toContain("repeated_deny");
  });

  it("flags education_loop when narrativeRecurred ≥ threshold", () => {
    const sigs = detectAbnormal({
      ...empty,
      events: 10,
      narrativeRecurred: 3,
    });
    expect(sigs.map((s) => s.id)).toContain("education_loop");
  });

  it("flags stuck when 0 commits AND ≥ threshold prompt injections", () => {
    const sigs = detectAbnormal({
      ...empty,
      events: 12,
      userPromptInjected: 10,
    });
    expect(sigs.map((s) => s.id)).toContain("stuck");
  });

  it("does not flag stuck when there are commits", () => {
    const sigs = detectAbnormal({
      ...empty,
      events: 12,
      commits: 1,
      userPromptInjected: 10,
    });
    expect(sigs.map((s) => s.id)).not.toContain("stuck");
  });

  it("flags no_activity when everything is zero", () => {
    const sigs = detectAbnormal(empty);
    expect(sigs.map((s) => s.id)).toContain("no_activity");
  });

  it("does not flag no_activity when there is at least one event", () => {
    const sigs = detectAbnormal({ ...empty, events: 1 });
    expect(sigs.map((s) => s.id)).not.toContain("no_activity");
  });

  it("returns empty when within all thresholds and there is activity", () => {
    const sigs = detectAbnormal({
      ...empty,
      events: 5,
      commits: 2,
      prsOpened: 1,
      preDenied: 1,
      narrativeRecurred: 1,
      userPromptInjected: 3,
    });
    expect(sigs).toEqual([]);
  });

  it("respects custom thresholds", () => {
    const sigs = detectAbnormal(
      { ...empty, events: 5, preDenied: 2 },
      { ...DEFAULT_THRESHOLDS, repeatedDenyN: 2 }
    );
    expect(sigs.map((s) => s.id)).toContain("repeated_deny");
  });
});
