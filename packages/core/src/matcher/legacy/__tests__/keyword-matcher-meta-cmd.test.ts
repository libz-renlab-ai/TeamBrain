import { describe, it, expect } from "vitest";
import { matchRules } from "../keyword-matcher.js";
import type { KnowledgeEntry } from "@teamagent/types";

function rule(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: "r-test",
    trigger: "use moment",
    correct_pattern: "use dayjs",
    wrong_pattern: "moment",
    enforcement: "warn",
    type: "avoidance",
    status: "active",
    confidence: 0.9,
    hit_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    scope: { file_types: undefined, paths: undefined },
    channel: "tool-action",
    ...overrides,
  } as KnowledgeEntry;
}

describe("keyword-matcher meta-command false-positive whitelist (issue #86)", () => {
  it("gh issue create with --body containing wrong_pattern does NOT match", () => {
    const ctx = {
      toolName: "Bash",
      input: { command: 'gh issue create --title "x" --body "moment is bad, use dayjs"' },
    };
    const matches = matchRules(ctx, [rule()]);
    expect(matches).toHaveLength(0);
  });

  it("git commit -m with wrong_pattern in message does NOT match", () => {
    const ctx = {
      toolName: "Bash",
      input: { command: 'git commit -m "fix: stop using moment"' },
    };
    const matches = matchRules(ctx, [rule()]);
    expect(matches).toHaveLength(0);
  });

  it("gh pr create with --body containing wrong_pattern does NOT match", () => {
    const ctx = {
      toolName: "Bash",
      input: { command: 'gh pr create --title "x" --body "do not use moment"' },
    };
    const matches = matchRules(ctx, [rule()]);
    expect(matches).toHaveLength(0);
  });

  it("genuine npm install moment STILL matches (not a meta command)", () => {
    const ctx = {
      toolName: "Bash",
      input: { command: "npm install moment" },
    };
    const matches = matchRules(ctx, [rule()]);
    expect(matches).toHaveLength(1);
  });

  it("genuine yarn add moment@2.29 STILL matches", () => {
    const ctx = {
      toolName: "Bash",
      input: { command: "yarn add moment@2.29" },
    };
    const matches = matchRules(ctx, [rule()]);
    expect(matches).toHaveLength(1);
  });

  it("gh issue create with single-quoted body also stripped", () => {
    const ctx = {
      toolName: "Bash",
      input: { command: "gh issue create --title \"x\" --body 'moment moment moment'" },
    };
    const matches = matchRules(ctx, [rule()]);
    expect(matches).toHaveLength(0);
  });

  it("gh issue create body with escaped quotes stripped correctly", () => {
    const ctx = {
      toolName: "Bash",
      input: { command: 'gh issue create --body "say \\"moment\\" please"' },
    };
    const matches = matchRules(ctx, [rule()]);
    expect(matches).toHaveLength(0);
  });

  it("matching still works on a meta-command's flag name (not prose)", () => {
    // Synthetic: rule wrong_pattern targets the literal flag '--body' itself.
    // After stripping body content the flag name remains visible, so this still hits.
    const ctx = {
      toolName: "Bash",
      input: { command: 'gh issue create --title "x" --body "harmless"' },
    };
    const matches = matchRules(ctx, [rule({ wrong_pattern: "--body" })]);
    expect(matches).toHaveLength(1);
  });
});
