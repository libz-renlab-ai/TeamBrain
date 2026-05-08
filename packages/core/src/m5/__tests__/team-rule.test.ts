import { describe, it, expect } from "vitest";
import {
  serializeTeamRule,
  parseTeamRule,
  validateTeamRule,
  estimateTeamRulePathLength,
  isTeamRulePathLengthSafe,
  WINDOWS_MAX_PATH_BUDGET,
  type TeamRuleFile,
} from "../team-rule.js";

const alive: TeamRuleFile = {
  rule_id: "R-001",
  author: "alice",
  current: {
    deleted: false,
    content: "PR 后必须 fetch codex review",
    confidence: 0.9,
    modified_by: "alice",
    modified_ts: "2026-05-06T10:00:00Z",
    scope: "team",
  },
};

const tomb: TeamRuleFile = {
  rule_id: "R-001",
  author: "alice",
  current: {
    deleted: true,
    deleted_by: "alice",
    deleted_ts: "2026-05-06T11:00:00Z",
    reason: "已过时",
  },
};

describe("team-rule serialize/parse/validate", () => {
  it("serialize produces canonical JSON (key-sorted, 2-space indent)", () => {
    const s = serializeTeamRule(alive);
    expect(s).toMatch(/^\{\n  "author"/);
    expect(JSON.parse(s)).toEqual(alive);
  });

  it("parse round-trips alive rule", () => {
    expect(parseTeamRule(serializeTeamRule(alive))).toEqual(alive);
  });

  it("parse round-trips tombstone rule", () => {
    expect(parseTeamRule(serializeTeamRule(tomb))).toEqual(tomb);
  });

  it("parse rejects invalid JSON", () => {
    expect(() => parseTeamRule("{not-json")).toThrow(/JSON/);
  });

  it("validate requires rule_id", () => {
    const bad = { ...alive, rule_id: "" } as TeamRuleFile;
    expect(() => validateTeamRule(bad)).toThrow(/rule_id/);
  });

  it("validate requires deleted_ts on tombstone", () => {
    const bad = { ...tomb, current: { deleted: true, deleted_by: "x" } } as unknown as TeamRuleFile;
    expect(() => validateTeamRule(bad)).toThrow(/deleted_ts/);
  });

  it("validate requires modified_ts on alive rule", () => {
    const bad = {
      ...alive,
      current: { ...alive.current, modified_ts: undefined },
    } as unknown as TeamRuleFile;
    expect(() => validateTeamRule(bad)).toThrow(/modified_ts/);
  });
});

describe("path-length validation (W15-012)", () => {
  it("estimateTeamRulePathLength counts projectRoot + author + ruleId + fixed layout", () => {
    const len = estimateTeamRulePathLength("C:/proj", "alice", "R-001");
    // "C:/proj" (7) + "/" (1) + ".teamagent" (10) + "/" (1) + "team" (4) +
    // "/" (1) + "alice" (5) + "/" (1) + "R-001" (5) + ".json" (5) = 40
    expect(len).toBe(40);
  });

  it("isTeamRulePathLengthSafe accepts short paths", () => {
    expect(isTeamRulePathLengthSafe("/x", "a", "r")).toBe(true);
  });

  it("isTeamRulePathLengthSafe rejects 200-char rule_id under 60-char projectRoot", () => {
    const root = "C:/Users/tester/projects/teamagent-trio-deep-worktree-x";
    const author = "tester";
    const ruleId = "a".repeat(200);
    expect(isTeamRulePathLengthSafe(root, author, ruleId)).toBe(false);
  });

  it("WINDOWS_MAX_PATH_BUDGET leaves margin under 260", () => {
    expect(WINDOWS_MAX_PATH_BUDGET).toBeLessThan(260);
    expect(WINDOWS_MAX_PATH_BUDGET).toBeGreaterThanOrEqual(240);
  });
});
