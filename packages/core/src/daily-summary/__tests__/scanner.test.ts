import { describe, it, expect } from "vitest";
import { scanTodayActivity } from "../scanner.js";
import type { Stats } from "node:fs";

/**
 * Build a fake `fs` port from an in-memory tree.
 *
 * Tree shape:
 *   {
 *     "/projects-root": {
 *       "-Users-x-projA": { "s1.jsonl": { mtimeMs: ..., content: "..." } },
 *       "-Users-x-projA--codex-worktrees-w1": { "s2.jsonl": { ... } }
 *     }
 *   }
 */
function makeFs(tree: Record<string, Record<string, { mtimeMs: number; content: string }>>): NonNullable<
  Parameters<typeof scanTodayActivity>[0]["fs"]
> & { _expectedRoot: string } {
  const roots = Object.keys(tree);
  const expectedRoot = roots[0]!;
  return {
    _expectedRoot: expectedRoot,
    existsSync(p: string) {
      return roots.includes(p) || Object.keys(tree[expectedRoot] ?? {}).some(
        (d) => p === `${expectedRoot}/${d}`,
      );
    },
    readdirSync(p: string): string[] {
      if (roots.includes(p)) return Object.keys(tree[p]!);
      for (const root of roots) {
        for (const subdir of Object.keys(tree[root]!)) {
          if (p === `${root}/${subdir}`) {
            return Object.keys(tree[root]![subdir]!);
          }
        }
      }
      return [];
    },
    statSync(p: string) {
      for (const root of roots) {
        for (const subdir of Object.keys(tree[root]!)) {
          if (p === `${root}/${subdir}`) {
            return makeDirStat(0);
          }
          for (const file of Object.keys(tree[root]![subdir]!)) {
            if (p === `${root}/${subdir}/${file}`) {
              const entry = tree[root]![subdir]![file]!;
              return makeFileStat(entry.mtimeMs);
            }
          }
        }
      }
      throw new Error(`ENOENT: ${p}`);
    },
    readFileSync(p: string) {
      for (const root of roots) {
        for (const subdir of Object.keys(tree[root]!)) {
          for (const file of Object.keys(tree[root]![subdir]!)) {
            if (p === `${root}/${subdir}/${file}`) {
              return tree[root]![subdir]![file]!.content;
            }
          }
        }
      }
      throw new Error(`ENOENT: ${p}`);
    },
  } as never;
}

function makeFileStat(mtimeMs: number): Stats {
  return { mtimeMs, isDirectory: () => false } as unknown as Stats;
}

function makeDirStat(mtimeMs: number): Stats {
  return { mtimeMs, isDirectory: () => true } as unknown as Stats;
}

const fakePath = { join: (...parts: string[]) => parts.join("/") };

describe("scanTodayActivity", () => {
  const now = new Date("2026-05-13T10:00:00");
  const todayMidnight = new Date("2026-05-13T00:00:00").getTime();
  const todayMorning = new Date("2026-05-13T08:30:00").getTime();
  const yesterdayEvening = new Date("2026-05-12T22:00:00").getTime();

  const sampleJsonl = JSON.stringify({
    type: "user",
    message: { role: "user", content: "hi" },
  });

  it("returns empty when projects root does not exist", () => {
    const result = scanTodayActivity({
      projectsRoot: "/missing",
      now: () => now,
      fs: {
        existsSync: () => false,
        readdirSync: () => [],
        statSync: () => makeDirStat(0),
        readFileSync: () => "",
      },
      path: fakePath,
    });
    expect(result.groups).toEqual([]);
    expect(result.date).toBe("2026-05-13");
    expect(result.windowStartMs).toBe(todayMidnight);
  });

  it("filters out yesterday's sessions by mtime", () => {
    const fs = makeFs({
      "/root": {
        "-Users-x-projA": {
          "today.jsonl": { mtimeMs: todayMorning, content: sampleJsonl },
          "yesterday.jsonl": { mtimeMs: yesterdayEvening, content: sampleJsonl },
        },
      },
    });
    const result = scanTodayActivity({
      projectsRoot: "/root",
      now: () => now,
      fs,
      path: fakePath,
    });
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.sessions).toHaveLength(1);
    expect(result.groups[0]?.sessions[0]?.sessionId).toBe("today");
  });

  it("merges a worktree session back to the host project", () => {
    const fs = makeFs({
      "/root": {
        "-Users-x-projA": {
          "main.jsonl": { mtimeMs: todayMorning, content: sampleJsonl },
        },
        "-Users-x-projA-.codex-worktrees-task1": {
          "wt.jsonl": { mtimeMs: todayMorning, content: sampleJsonl },
        },
      },
    });
    const result = scanTodayActivity({
      projectsRoot: "/root",
      now: () => now,
      fs,
      path: fakePath,
    });
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.project.displayName).toBe("projA");
    expect(result.groups[0]?.sessions).toHaveLength(2);
  });

  it("treats distinct repos as distinct groups", () => {
    const fs = makeFs({
      "/root": {
        "-Users-x-projA": {
          "s1.jsonl": { mtimeMs: todayMorning, content: sampleJsonl },
        },
        "-Users-x-projB": {
          "s2.jsonl": { mtimeMs: todayMorning, content: sampleJsonl },
        },
      },
    });
    const result = scanTodayActivity({
      projectsRoot: "/root",
      now: () => now,
      fs,
      path: fakePath,
    });
    expect(result.groups).toHaveLength(2);
    expect(result.groups.map((g) => g.project.displayName).sort()).toEqual([
      "projA",
      "projB",
    ]);
  });
});
