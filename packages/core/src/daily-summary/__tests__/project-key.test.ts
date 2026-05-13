import { describe, it, expect } from "vitest";
import { toProjectKey } from "../project-key.js";

describe("toProjectKey", () => {
  it("returns plain cwd for a host repo path", () => {
    expect(toProjectKey("/Users/m1/projects/TeamBrain")).toEqual({
      canonicalCwd: "/Users/m1/projects/TeamBrain",
      displayName: "TeamBrain",
      isWorktree: false,
    });
  });

  it("folds .codex/worktrees back to host repo", () => {
    expect(
      toProjectKey("/Users/m1/projects/TeamBrain/.codex/worktrees/issue-371"),
    ).toEqual({
      canonicalCwd: "/Users/m1/projects/TeamBrain",
      displayName: "TeamBrain",
      isWorktree: true,
    });
  });

  it("folds .claude/worktrees back to host repo", () => {
    expect(
      toProjectKey("/Users/m1/projects/TeamBrain/.claude/worktrees/issue-371"),
    ).toEqual({
      canonicalCwd: "/Users/m1/projects/TeamBrain",
      displayName: "TeamBrain",
      isWorktree: true,
    });
  });

  it("differentiates two distinct repos with the same basename", () => {
    const a = toProjectKey("/Users/m1/projects/TeamBrain");
    const b = toProjectKey("/Users/m1/forks/TeamBrain");
    expect(a.displayName).toBe(b.displayName); // both "TeamBrain"
    expect(a.canonicalCwd).not.toBe(b.canonicalCwd); // but canonical paths differ
  });

  it("handles trailing slash gracefully", () => {
    expect(toProjectKey("/Users/m1/projects/TeamBrain/")).toEqual({
      canonicalCwd: "/Users/m1/projects/TeamBrain/",
      displayName: "TeamBrain",
      isWorktree: false,
    });
  });
});
