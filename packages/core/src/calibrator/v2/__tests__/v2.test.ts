import { describe, it, expect } from "vitest";
import { runCalibratorV2Contract } from "@teamagent/ports/contracts";
import { v2Calibrator } from "../index.js";
import type { CalibratorV2Input, Observation } from "@teamagent/ports";
import type { KnowledgeEntry, PersistedEvent } from "@teamagent/types";

describe("v2Calibrator", () => {
  runCalibratorV2Contract(() => v2Calibrator);
});

describe("v2Calibrator integration", () => {
  const now = new Date("2026-04-16T12:00:00Z");
  const entry: KnowledgeEntry = {
    id: "r-int",
    scope: { level: "team" },
    category: "E",
    tags: [],
    type: "avoidance",
    nature: "subjective",
    trigger: "t",
    wrong_pattern: "w",
    correct_pattern: "c",
    reasoning: "r",
    confidence: 0.6,
    enforcement: "suggest",
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: "2026-04-01T00:00:00Z",
    last_hit_at: "",
    last_validated_at: "2026-04-01T00:00:00Z",
    source: "accumulated",
    conflict_with: [],
    current_tier: "probation",
    max_tier_ever: "probation",
    tier_entered_at: "2026-04-01T00:00:00Z", // 15 days ago
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
  };

  it("accumulates 20 success obs → promotes probation → canonical", () => {
    const observations: Observation[] = Array.from({ length: 20 }, (_, i) => ({
      id: `o${i}`,
      knowledge_id: "r-int",
      timestamp: new Date(now.getTime() - i * 3600 * 1000).toISOString(),
      outcome: "success",
    }));
    const r = v2Calibrator.calibrate(entry, { events: [], observations, now });
    // Wilson LB for 20 all-success recent obs at probation half-life (~45d) is ~0.84,
    // which lands in canonical ([0.75, 0.90)), not stable ([0.55, 0.75))
    expect(r.tier_after).toBe("canonical");
    expect(r.confidence).toBeGreaterThanOrEqual(0.55);
    expect(r.tier_transition?.from).toBe("probation");
  });

  it("1 user_reject event at stable → demerit 10+", () => {
    const events: PersistedEvent[] = [
      {
        id: "e-reject",
        kind: "calibrator.user_reject" as any,
        knowledge_id: "r-int",
        timestamp: now.toISOString(),
        schema_version: 1,
      } as PersistedEvent,
    ];
    const stableEntry = {
      ...entry,
      current_tier: "stable" as const,
      confidence: 0.6,
      tier_entered_at: "2026-04-01T00:00:00Z",
    };
    const r = v2Calibrator.calibrate(stableEntry, { events, observations: [], now });
    expect(r.demerit).toBeGreaterThanOrEqual(10);
  });

  it("breakdown contains steps for each computation", () => {
    const obs: Observation[] = [
      { id: "o1", knowledge_id: "r-int", timestamp: now.toISOString(), outcome: "success" },
    ];
    const r = v2Calibrator.calibrate(entry, { events: [], observations: obs, now });
    expect(r.delta_breakdown.length).toBeGreaterThan(0);
  });

  it("M3: ai.override.blocked_circumvented event → demerit increases", () => {
    const events: PersistedEvent[] = [
      {
        id: "e-circum",
        kind: "ai.override.blocked_circumvented" as any,
        knowledge_id: "r-int",
        timestamp: now.toISOString(),
        schema_version: 1,
      } as PersistedEvent,
    ];
    const r = v2Calibrator.calibrate(entry, { events, observations: [], now });
    expect(r.demerit).toBeGreaterThan(0);
    expect(r.demerit_delta).toBeGreaterThan(0);
  });

  it("scores ignored-event demerit against pre-drop confidence", () => {
    const events: PersistedEvent[] = [
      {
        id: "e-ignored",
        kind: "ai.override.ignored",
        knowledge_id: "r-int",
        timestamp: now.toISOString(),
        schema_version: 1,
      },
    ];
    const observations: Observation[] = [
      {
        id: "synth-e-ignored",
        knowledge_id: "r-int",
        timestamp: now.toISOString(),
        outcome: "failure",
        source_event: "e-ignored",
      },
    ];
    const highConfidenceEntry = {
      ...entry,
      current_tier: "stable" as const,
      max_tier_ever: "stable" as const,
      confidence: 0.95,
    };

    const r = v2Calibrator.calibrate(highConfidenceEntry, { events, observations, now });

    expect(r.confidence).toBeLessThan(0.95);
    expect(r.demerit).toBeGreaterThan(8);
  });
});
