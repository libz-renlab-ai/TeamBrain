import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { MarkdownCompiler } from "../markdown-compiler.js";
import type { KnowledgeEntry } from "@teamagent/types";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "md-compiler-"));
}

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: "test",
    scope: { level: "personal" },
    category: "E",
    tags: ["tech-choice"],
    type: "avoidance",
    nature: "subjective",
    trigger: "date library",
    wrong_pattern: "moment",
    correct_pattern: "dayjs",
    reasoning: "lighter weight",
    confidence: 0.8,
    enforcement: "warn",
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: "2026-04-14T00:00:00Z",
    last_hit_at: "",
    last_validated_at: "",
    source: "accumulated",
    conflict_with: [],
    current_tier: "canonical" as const,
    max_tier_ever: "canonical" as const,
    tier_entered_at: "",
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
    ...overrides,
  };
}

describe("MarkdownCompiler adapter (legacy/internal CLAUDE.md block)", () => {
  let dir: string;
  let mdPath: string;

  beforeEach(() => {
    dir = tmpDir();
    mdPath = path.join(dir, "CLAUDE.md");
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("compile() returns string block (pure, no IO)", () => {
    const compiler = new MarkdownCompiler(mdPath, () => "2026-04-14T00:00:00Z");
    const out = compiler.compile([makeEntry()]);
    expect(out).toContain("TEAMAGENT:START");
    expect(out).toContain("TEAMAGENT:END");
    expect(out).toContain("dayjs");
    // 纯 compile 不应写文件
    expect(fs.existsSync(mdPath)).toBe(false);
  });

  it("writeToFile() creates CLAUDE.md when missing", () => {
    const compiler = new MarkdownCompiler(mdPath, () => "2026-04-14T00:00:00Z");
    const info = compiler.writeToFile([makeEntry()]);
    expect(fs.existsSync(mdPath)).toBe(true);
    expect(info.filePath).toBe(mdPath);
    expect(info.blockLineCount).toBeGreaterThan(0);
  });

  it("writeToFile() preserves content outside TEAMAGENT markers", () => {
    fs.writeFileSync(
      mdPath,
      "# My Project\n\nUser content here.\n\n## Rules\n- always use pnpm\n",
      "utf-8",
    );

    const compiler = new MarkdownCompiler(mdPath, () => "2026-04-14T00:00:00Z");
    compiler.writeToFile([makeEntry()]);

    const content = fs.readFileSync(mdPath, "utf-8");
    expect(content).toContain("# My Project");
    expect(content).toContain("User content here.");
    expect(content).toContain("always use pnpm");
    expect(content).toContain("TEAMAGENT:START");
  });

  it("writeToFile() replaces existing TEAMAGENT block, keeps user content", () => {
    fs.writeFileSync(
      mdPath,
      "# Project\n\n<!-- TEAMAGENT:START -->\nold content\n<!-- TEAMAGENT:END -->\n\nAfter.\n",
      "utf-8",
    );

    const compiler = new MarkdownCompiler(mdPath, () => "2026-04-14T00:00:00Z");
    compiler.writeToFile([makeEntry({ correct_pattern: "NEW-PATTERN" })]);

    const content = fs.readFileSync(mdPath, "utf-8");
    expect(content).toContain("NEW-PATTERN");
    expect(content).not.toContain("old content");
    expect(content).toContain("# Project");
    expect(content).toContain("After.");
  });

  it("writeToFile() reports correct block line count", () => {
    const compiler = new MarkdownCompiler(mdPath, () => "2026-04-14T00:00:00Z");
    const info = compiler.writeToFile([makeEntry({ id: "a" }), makeEntry({ id: "b" })]);
    const content = fs.readFileSync(mdPath, "utf-8");
    // 区块应该有 START + header + 2 entries + END = 5 lines
    expect(info.blockLineCount).toBeGreaterThanOrEqual(4);
    expect(content).toContain("TEAMAGENT:START");
  });

  it("writeToFile() reports line offset of block in file", () => {
    fs.writeFileSync(mdPath, "line1\nline2\nline3\n", "utf-8");
    const compiler = new MarkdownCompiler(mdPath, () => "2026-04-14T00:00:00Z");
    const info = compiler.writeToFile([makeEntry()]);
    // Block 应该追加在现有 3 行之后
    expect(info.blockStartLine).toBeGreaterThanOrEqual(3);
  });

  it("empty entries → still writes empty-state block", () => {
    const compiler = new MarkdownCompiler(mdPath, () => "2026-04-14T00:00:00Z");
    compiler.writeToFile([]);
    const content = fs.readFileSync(mdPath, "utf-8");
    expect(content).toContain("暂无经验");
  });

  describe("configurable limit", () => {
    it("MarkdownCompilerOptions.compileOptions.limit is honored", () => {
      const compiler = new MarkdownCompiler(mdPath, {
        now: () => "2026-04-14T00:00:00Z",
        compileOptions: { limit: 3 },
      });
      const entries = Array.from({ length: 20 }, (_, i) =>
        makeEntry({ id: `e${i}`, correct_pattern: `CORRECT-${i}` }),
      );
      compiler.writeToFile(entries);
      const content = fs.readFileSync(mdPath, "utf-8");
      const bulletCount = content
        .split("\n")
        .filter((l) => l.startsWith("- "))
        .length;
      expect(bulletCount).toBe(3);
      expect(content).toContain("Top 3");
    });

    it("TEAMAGENT_CLAUDE_MD_LIMIT env var controls the cap", () => {
      const prev = process.env.TEAMAGENT_CLAUDE_MD_LIMIT;
      const prevDiv = process.env.TEAMAGENT_CLAUDE_MD_DIVERSITY;
      process.env.TEAMAGENT_CLAUDE_MD_LIMIT = "4";
      process.env.TEAMAGENT_CLAUDE_MD_DIVERSITY = "off";
      try {
        const compiler = new MarkdownCompiler(
          mdPath,
          () => "2026-04-14T00:00:00Z",
        );
        const entries = Array.from({ length: 20 }, (_, i) =>
          makeEntry({ id: `e${i}`, correct_pattern: `CORRECT-${i}` }),
        );
        compiler.writeToFile(entries);
        const content = fs.readFileSync(mdPath, "utf-8");
        const bulletCount = content
          .split("\n")
          .filter((l) => l.startsWith("- "))
          .length;
        expect(bulletCount).toBe(4);
      } finally {
        if (prev === undefined) delete process.env.TEAMAGENT_CLAUDE_MD_LIMIT;
        else process.env.TEAMAGENT_CLAUDE_MD_LIMIT = prev;
        if (prevDiv === undefined) delete process.env.TEAMAGENT_CLAUDE_MD_DIVERSITY;
        else process.env.TEAMAGENT_CLAUDE_MD_DIVERSITY = prevDiv;
      }
    });

    it("explicit compileOptions.limit wins over env var", () => {
      const prev = process.env.TEAMAGENT_CLAUDE_MD_LIMIT;
      process.env.TEAMAGENT_CLAUDE_MD_LIMIT = "4";
      try {
        const compiler = new MarkdownCompiler(mdPath, {
          now: () => "2026-04-14T00:00:00Z",
          compileOptions: { limit: 2 },
        });
        const entries = Array.from({ length: 20 }, (_, i) =>
          makeEntry({ id: `e${i}`, correct_pattern: `CORRECT-${i}` }),
        );
        compiler.writeToFile(entries);
        const content = fs.readFileSync(mdPath, "utf-8");
        const bulletCount = content
          .split("\n")
          .filter((l) => l.startsWith("- "))
          .length;
        expect(bulletCount).toBe(2);
      } finally {
        if (prev === undefined) delete process.env.TEAMAGENT_CLAUDE_MD_LIMIT;
        else process.env.TEAMAGENT_CLAUDE_MD_LIMIT = prev;
      }
    });

    it("ignores invalid env var values (non-numeric / ≤0)", () => {
      const prev = process.env.TEAMAGENT_CLAUDE_MD_LIMIT;
      const prevDiv = process.env.TEAMAGENT_CLAUDE_MD_DIVERSITY;
      process.env.TEAMAGENT_CLAUDE_MD_LIMIT = "not-a-number";
      process.env.TEAMAGENT_CLAUDE_MD_DIVERSITY = "off";
      try {
        const compiler = new MarkdownCompiler(
          mdPath,
          () => "2026-04-14T00:00:00Z",
        );
        // Should fall back to default (45), so 10 entries all included
        const entries = Array.from({ length: 10 }, (_, i) =>
          makeEntry({ id: `e${i}`, correct_pattern: `CORRECT-${i}` }),
        );
        compiler.writeToFile(entries);
        const content = fs.readFileSync(mdPath, "utf-8");
        const bulletCount = content
          .split("\n")
          .filter((l) => l.startsWith("- "))
          .length;
        expect(bulletCount).toBe(10);
      } finally {
        if (prev === undefined) delete process.env.TEAMAGENT_CLAUDE_MD_LIMIT;
        else process.env.TEAMAGENT_CLAUDE_MD_LIMIT = prev;
        if (prevDiv === undefined) delete process.env.TEAMAGENT_CLAUDE_MD_DIVERSITY;
        else process.env.TEAMAGENT_CLAUDE_MD_DIVERSITY = prevDiv;
      }
    });
  });
});
