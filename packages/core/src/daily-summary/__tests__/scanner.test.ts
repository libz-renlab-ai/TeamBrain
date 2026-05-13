import { describe, it, expect } from "vitest";
import { scanTodayActivity } from "../scanner.js";
import type { Stats } from "node:fs";

type FsEntry = { mtimeMs: number; content: string };
type Tree = Record<string, Record<string, Record<string, FsEntry>>>;

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
function makeFs(tree: Tree): NonNullable<
  Parameters<typeof scanTodayActivity>[0]["fs"]
> {
  const roots = Object.keys(tree);
  const expectedRoot = roots[0]!;
  return {
    existsSync(p: string) {
      if (roots.includes(p)) return true;
      const rootTree = tree[expectedRoot];
      if (!rootTree) return false;
      return Object.keys(rootTree).some(
        (d) => p === `${expectedRoot}/${d}`,
      );
    },
    readdirSync(p: string) {
      if (roots.includes(p)) {
        const t = tree[p];
        return t ? Object.keys(t) : [];
      }
      for (const root of roots) {
        const rootTree = tree[root];
        if (!rootTree) continue;
        for (const subdir of Object.keys(rootTree)) {
          if (p === `${root}/${subdir}`) {
            const sub = rootTree[subdir];
            return sub ? Object.keys(sub) : [];
          }
        }
      }
      return [];
    },
    statSync(p: string) {
      for (const root of roots) {
        const rootTree = tree[root];
        if (!rootTree) continue;
        for (const subdir of Object.keys(rootTree)) {
          if (p === `${root}/${subdir}`) {
            return makeDirStat(0);
          }
          const sub = rootTree[subdir];
          if (!sub) continue;
          for (const file of Object.keys(sub)) {
            if (p === `${root}/${subdir}/${file}`) {
              const entry = sub[file]!;
              return makeFileStat(entry.mtimeMs);
            }
          }
        }
      }
      throw new Error(`ENOENT: ${p}`);
    },
    readFileSync(p: string) {
      for (const root of roots) {
        const rootTree = tree[root];
        if (!rootTree) continue;
        for (const subdir of Object.keys(rootTree)) {
          const sub = rootTree[subdir];
          if (!sub) continue;
          for (const file of Object.keys(sub)) {
            if (p === `${root}/${subdir}/${file}`) {
              return sub[file]!.content;
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
      } as never,
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
