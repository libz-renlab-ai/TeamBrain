import { describe, it, expect } from "vitest";
import {
  encodeCwdToProjectDir,
  decodeProjectDirToCwd,
} from "../cwd-decode.js";

describe("cwd-decode", () => {
  describe("encodeCwdToProjectDir", () => {
    it("encodes a simple absolute path", () => {
      expect(encodeCwdToProjectDir("/Users/m1/projects/TeamBrain")).toBe(
        "-Users-m1-projects-TeamBrain",
      );
    });

    it("encodes a path that already contains dashes", () => {
      expect(encodeCwdToProjectDir("/Users/m1/projects/issue-371")).toBe(
        "-Users-m1-projects-issue-371",
      );
    });

    it("encodes a worktree dotfile path", () => {
      // /Users/m1/projects/TeamBrain/.claude/worktrees/issue-371
      // → -Users-m1-projects-TeamBrain-.claude-worktrees-issue-371
      // (no double-dash here because `/` → `-` is positional, not boundary-aware;
      //  this matches Claude Code's actual encoding observed in `~/.claude/projects/`.)
      expect(
        encodeCwdToProjectDir(
          "/Users/m1/projects/TeamBrain/.claude/worktrees/issue-371",
        ),
      ).toBe(
        "-Users-m1-projects-TeamBrain-.claude-worktrees-issue-371",
      );
    });
  });

  describe("decodeProjectDirToCwd", () => {
    it("decodes a simple project dir", () => {
      expect(decodeProjectDirToCwd("-Users-m1-projects-TeamBrain")).toBe(
        "/Users/m1/projects/TeamBrain",
      );
    });

    it("returns input unchanged when not Claude-encoded", () => {
      expect(decodeProjectDirToCwd("not-a-claude-encoded-name")).toBe(
        "not-a-claude-encoded-name",
      );
    });

    it("documents the lossy `-` ambiguity (path with embedded dash)", () => {
      // Claude Code encodes `/` → `-` with no escape for literal `-`,
      // so `/Users/m1/projects/issue-371` and `/Users/m1/projects/issue/371`
      // produce the same project dir name. Decode picks the
      // "every dash is a slash" interpretation. The worktree-merge logic in
      // toProjectKey() searches for the `/.codex/worktrees/` substring after
      // decode, so a worktree like `/host/.codex/worktrees/issue-371` still
      // canonicalizes to `/host` correctly even with this cosmetic blemish.
      expect(decodeProjectDirToCwd("-Users-m1-projects-issue-371")).toBe(
        "/Users/m1/projects/issue/371",
      );
    });
  });

  describe("round-trip (dash-free paths)", () => {
    it.each([
      "/Users/m1/projects/TeamBrain",
      "/home/alice/repos/foo",
      "/tmp/probe",
    ])("round-trips %s", (absPath) => {
      expect(decodeProjectDirToCwd(encodeCwdToProjectDir(absPath))).toBe(
        absPath,
      );
    });
  });
});
