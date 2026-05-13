import { describe, it, expect } from "vitest";
import { digestProjectGroup } from "../aggregator.js";
import type { ProjectGroup } from "../scanner.js";
import type { ParsedSession } from "@teamagent/types";

function makeSession(opts: {
  sessionId: string;
  userTurns: Array<{ msg: string; assistant?: string; tools?: string[]; t?: string }>;
}): ParsedSession {
  return {
    sessionId: opts.sessionId,
    startTime: "2026-05-13T08:00:00Z",
    endTime: "2026-05-13T09:00:00Z",
    turns: opts.userTurns.map((u, i) => ({
      turnIndex: i,
      userMessage: u.msg,
      assistantText: u.assistant ?? "",
      timestamp: u.t ?? `2026-05-13T08:${String(i).padStart(2, "0")}:00Z`,
      toolCalls: (u.tools ?? []).map((name, j) => ({
        id: `t-${i}-${j}`,
        name,
        input: {},
      })),
    })),
  };
}

function makeGroup(opts: {
  cwd: string;
  worktree?: boolean;
  sessions: ParsedSession[];
  rawCwd?: string;
}): ProjectGroup {
  return {
    project: {
      canonicalCwd: opts.cwd,
      displayName: opts.cwd.split("/").pop()!,
      isWorktree: opts.worktree ?? false,
    },
    sessions: opts.sessions.map((s, i) => ({
      rawCwd: opts.rawCwd ?? opts.cwd,
      jsonlPath: `${opts.cwd}/${s.sessionId}.jsonl`,
      sessionId: s.sessionId,
      mtimeMs: Date.parse("2026-05-13T08:00:00Z") + i * 1000,
      session: s,
    })),
  };
}

describe("digestProjectGroup", () => {
  it("counts user turns and assistant chars across sessions", () => {
    const group = makeGroup({
      cwd: "/repo/A",
      sessions: [
        makeSession({
          sessionId: "s1",
          userTurns: [
            { msg: "first", assistant: "hello world" },
            { msg: "second", assistant: "again" },
          ],
        }),
        makeSession({
          sessionId: "s2",
          userTurns: [{ msg: "third", assistant: "ok" }],
        }),
      ],
    });
    const digest = digestProjectGroup(group);
    expect(digest.sessionCount).toBe(2);
    expect(digest.userTurnCount).toBe(3);
    expect(digest.assistantCharCount).toBe("hello world".length + "again".length + "ok".length);
  });

  it("excerpts first and last user message by timestamp", () => {
    const group = makeGroup({
      cwd: "/repo/A",
      sessions: [
        makeSession({
          sessionId: "s1",
          userTurns: [
            { msg: "this was the morning", t: "2026-05-13T08:00:00Z" },
            { msg: "now around noon", t: "2026-05-13T12:00:00Z" },
          ],
        }),
      ],
    });
    const digest = digestProjectGroup(group);
    expect(digest.firstUserExcerpt).toBe("this was the morning");
    expect(digest.lastUserExcerpt).toBe("now around noon");
  });

  it("collects distinct tools, sorted", () => {
    const group = makeGroup({
      cwd: "/repo/A",
      sessions: [
        makeSession({
          sessionId: "s1",
          userTurns: [
            { msg: "x", tools: ["Bash", "Read"] },
            { msg: "y", tools: ["Read", "Edit"] },
          ],
        }),
      ],
    });
    const digest = digestProjectGroup(group);
    expect(digest.toolsUsed).toEqual(["Bash", "Edit", "Read"]);
  });

  it("flags worktree sessions based on rawCwd", () => {
    const group = makeGroup({
      cwd: "/repo/A",
      rawCwd: "/repo/A/.codex/worktrees/task-99",
      sessions: [
        makeSession({ sessionId: "wt", userTurns: [{ msg: "in worktree" }] }),
      ],
    });
    const digest = digestProjectGroup(group);
    expect(digest.hadWorktreeSession).toBe(true);
  });

  it("truncates long user excerpts to ≤200 chars", () => {
    const longMsg = "a".repeat(500);
    const group = makeGroup({
      cwd: "/repo/A",
      sessions: [
        makeSession({
          sessionId: "s1",
          userTurns: [{ msg: longMsg }],
        }),
      ],
    });
    const digest = digestProjectGroup(group);
    expect(digest.firstUserExcerpt.length).toBeLessThanOrEqual(200);
    expect(digest.firstUserExcerpt.endsWith("…")).toBe(true);
  });
});
