import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { executeIngest, parseIngestArgs } from "../commands/ingest.js";
import { DualLayerStore } from "@teamagent/adapters";
import type { LLMClient } from "@teamagent/ports";

describe("parseIngestArgs", () => {
  it("--from-insights requires path", () => {
    const opts = parseIngestArgs(["--from-insights", "./insights.json"]);
    expect(opts.source).toBe("insights");
    expect(opts.filePath).toBe("./insights.json");
  });

  it("--from-audit dispatches to npm-audit", () => {
    const opts = parseIngestArgs(["--from-audit"]);
    expect(opts.source).toBe("npm-audit");
  });

  it("--from-pr takes numeric PR id", () => {
    const opts = parseIngestArgs(["--from-pr", "42"]);
    expect(opts.source).toBe("pr-review");
    expect(opts.prNumber).toBe(42);
  });

  it("--from-git + --since parses days", () => {
    const opts = parseIngestArgs(["--from-git", "--since=30d"]);
    expect(opts.source).toBe("git-hotspot");
    expect(opts.sinceDays).toBe(30);
  });

  it("--from-ci parses --since=45 (no d suffix)", () => {
    const opts = parseIngestArgs(["--from-ci", "--since=45"]);
    expect(opts.source).toBe("ci-failure");
    expect(opts.sinceDays).toBe(45);
  });

  it("--from-candidates reads a md path", () => {
    const opts = parseIngestArgs(["--from-candidates", "./cands.md"]);
    expect(opts.source).toBe("candidates");
    expect(opts.filePath).toBe("./cands.md");
  });

  it("--dry-run flag", () => {
    const opts = parseIngestArgs(["--from-git", "--dry-run"]);
    expect(opts.dryRun).toBe(true);
  });

  it("throws when no source provided", () => {
    expect(() => parseIngestArgs([])).toThrow(/需要源标记/);
  });
});

describe("executeIngest", () => {
  it("schedules docs propagation once with accepted rule ids without writing CLAUDE.md", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ingest-"));
    try {
      const candidatesPath = path.join(tmp, "candidates.md");
      fs.writeFileSync(
        candidatesPath,
        [
          "# TeamAgent ingest candidates (git-hotspot)",
          "<!-- teamagent-candidate-source: git-hotspot -->",
          "",
          "- [x] src/a.ts changed often; replace axios with fetch",
          "- [x] src/b.ts changed often; replace moment with dayjs",
          "",
        ].join("\n"),
        "utf-8",
      );

      const responses = [
        {
          category: "E",
          tags: ["http-client"],
          type: "practice",
          nature: "subjective",
          trigger: "src/a.ts changed often",
          wrong_pattern: "",
          correct_pattern: "fetch",
          reasoning: "prefer built-in fetch",
        },
        {
          category: "E",
          tags: ["date-lib"],
          type: "practice",
          nature: "subjective",
          trigger: "src/b.ts changed often",
          wrong_pattern: "",
          correct_pattern: "dayjs",
          reasoning: "smaller maintained date library",
        },
      ];
      const llmClient: LLMClient = {
        complete: async () => `\`\`\`json\n${JSON.stringify(responses.shift())}\n\`\`\``,
      };
      const scheduled: string[][] = [];
      let id = 0;
      const projectDbPath = path.join(tmp, "knowledge.db");
      const userGlobalDbPath = path.join(tmp, "global.db");

      const out = await executeIngest({
        source: "candidates",
        filePath: candidatesPath,
        cwd: tmp,
        homeDir: tmp,
        projectDbPath,
        userGlobalDbPath,
        llmClient,
        idGen: () => `ing-test-${++id}`,
        now: () => new Date("2026-04-16T12:00:00Z"),
        docsPropagationScheduler: (ids) => {
          scheduled.push(ids);
        },
      });

      expect(out).toContain("入库: 2");
      expect(scheduled).toEqual([["ing-test-1", "ing-test-2"]]);
      expect(fs.existsSync(path.join(tmp, "CLAUDE.md"))).toBe(false);

      const store = new DualLayerStore({ projectDbPath, userGlobalDbPath });
      expect(store.getAll()).toHaveLength(2);
      store.close();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
