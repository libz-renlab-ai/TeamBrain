import { describe, it, expect } from "vitest";
import {
  compileMarkdownBlock,
  injectBlockIntoDoc,
  BLOCK_START,
  BLOCK_END,
} from "../markdown.js";
import type { KnowledgeEntry } from "@teamagent/types";

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: "e",
    scope: { level: "personal" },
    category: "C",
    tags: ["syntax-error"],
    type: "avoidance",
    nature: "objective",
    trigger: "trigger",
    wrong_pattern: "moment",
    correct_pattern: "dayjs",
    reasoning: "lighter",
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
    current_tier: "experimental" as const,
    max_tier_ever: "experimental" as const,
    tier_entered_at: "",
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
    ...overrides,
  };
}

describe("compileMarkdownBlock (legacy/internal CLAUDE.md block)", () => {
  it("wraps output with START/END markers", () => {
    const out = compileMarkdownBlock([makeEntry()], "2026-04-14T00:00:00Z");
    expect(out).toContain(BLOCK_START);
    expect(out).toContain(BLOCK_END);
  });

  it("empty entries → produces empty-state block with markers", () => {
    const out = compileMarkdownBlock([], "2026-04-14T00:00:00Z");
    expect(out).toContain(BLOCK_START);
    expect(out).toContain(BLOCK_END);
    expect(out).toContain("暂无经验");
  });

  it("shows avoidance entries as 'use X instead of Y'", () => {
    const out = compileMarkdownBlock(
      [makeEntry({ wrong_pattern: "moment", correct_pattern: "dayjs" })],
      "2026-04-14T00:00:00Z",
    );
    expect(out).toContain("dayjs");
    expect(out).toContain("moment");
  });

  it("respects 50-line budget", () => {
    const entries = Array.from({ length: 100 }, (_, i) =>
      makeEntry({
        id: `e${i}`,
        confidence: 0.7 + (i % 30) / 100,
        trigger: `trigger-${i}`,
      }),
    );
    const out = compileMarkdownBlock(entries, "2026-04-14T00:00:00Z");
    const lines = out.split("\n");
    expect(lines.length).toBeLessThanOrEqual(50);
  });

  it("custom limit option caps the entry count", () => {
    const entries = Array.from({ length: 100 }, (_, i) =>
      makeEntry({ id: `e${i}`, correct_pattern: `CORRECT-${i}` }),
    );
    const out = compileMarkdownBlock(entries, "2026-04-14T00:00:00Z", {
      limit: 5,
    });
    const bulletCount = out.split("\n").filter((l) => l.startsWith("- ")).length;
    expect(bulletCount).toBe(5);
    expect(out).toContain("Top 5");
  });

  it("at over-cap, keeps highest-scoring entries (block > warn > suggest)", () => {
    const entries = [
      // 2 block-confident entries (should be kept)
      makeEntry({
        id: "block-a",
        enforcement: "block",
        confidence: 0.95,
        correct_pattern: "KEEP-BLOCK-A",
      }),
      makeEntry({
        id: "block-b",
        enforcement: "block",
        confidence: 0.95,
        correct_pattern: "KEEP-BLOCK-B",
      }),
      // 2 suggest entries (should be dropped by cap=2)
      makeEntry({
        id: "suggest-a",
        enforcement: "suggest",
        confidence: 0.55,
        correct_pattern: "DROP-SUGGEST-A",
      }),
      makeEntry({
        id: "suggest-b",
        enforcement: "suggest",
        confidence: 0.55,
        correct_pattern: "DROP-SUGGEST-B",
      }),
    ];
    const out = compileMarkdownBlock(entries, "2026-04-14T00:00:00Z", {
      limit: 2,
    });
    expect(out).toContain("KEEP-BLOCK-A");
    expect(out).toContain("KEEP-BLOCK-B");
    expect(out).not.toContain("DROP-SUGGEST-A");
    expect(out).not.toContain("DROP-SUGGEST-B");
  });

  it("limit=0 or negative falls back to minimum 1", () => {
    const entries = Array.from({ length: 3 }, (_, i) =>
      makeEntry({ id: `e${i}`, correct_pattern: `e${i}` }),
    );
    const out = compileMarkdownBlock(entries, "2026-04-14T00:00:00Z", {
      limit: 0,
    });
    const bulletCount = out.split("\n").filter((l) => l.startsWith("- ")).length;
    expect(bulletCount).toBe(1);
  });

  it("limit larger than entry count: no 'Top N' suffix in header", () => {
    const entries = [
      makeEntry({ id: "a", correct_pattern: "A" }),
      makeEntry({ id: "b", correct_pattern: "B" }),
    ];
    const out = compileMarkdownBlock(entries, "2026-04-14T00:00:00Z", {
      limit: 100,
    });
    expect(out).toContain("2条活跃知识）");
    expect(out).not.toContain("Top ");
  });

  it("skips archived entries", () => {
    const out = compileMarkdownBlock(
      [
        makeEntry({ id: "active", correct_pattern: "KEEP" }),
        makeEntry({ id: "dropped", correct_pattern: "DROPPED", status: "archived" }),
      ],
      "2026-04-14T00:00:00Z",
    );
    expect(out).toContain("KEEP");
    expect(out).not.toContain("DROPPED");
  });

  it("block enforcement entries come before suggest", () => {
    const entries = [
      makeEntry({ id: "low", enforcement: "suggest", correct_pattern: "LOW-PRIO", confidence: 0.6 }),
      makeEntry({ id: "high", enforcement: "block", correct_pattern: "HIGH-PRIO", confidence: 0.95 }),
    ];
    const out = compileMarkdownBlock(entries, "2026-04-14T00:00:00Z");
    const lines = out.split("\n");
    const hi = lines.findIndex((l) => l.includes("HIGH-PRIO"));
    const lo = lines.findIndex((l) => l.includes("LOW-PRIO"));
    expect(hi).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThan(lo);
  });
});

describe("tierFilter", () => {
  it("drops non-canonical+ entries when tierFilter=['canonical','enforced']", () => {
    const entries = [
      makeEntry({ id: "a", current_tier: "canonical" as const, correct_pattern: "CANONICAL-A" }),
      makeEntry({ id: "b", current_tier: "stable" as const, correct_pattern: "STABLE-B" }),
      makeEntry({ id: "c", current_tier: "enforced" as const, correct_pattern: "ENFORCED-C" }),
      makeEntry({ id: "d", current_tier: "experimental" as const, correct_pattern: "EXPERIMENTAL-D" }),
    ];
    const block = compileMarkdownBlock(entries, "2026-04-14T00:00:00Z", {
      tierFilter: ["canonical", "enforced"],
    });
    expect(block).toContain("CANONICAL-A");
    expect(block).toContain("ENFORCED-C");
    expect(block).not.toContain("STABLE-B");
    expect(block).not.toContain("EXPERIMENTAL-D");
  });

  it("empty result with tierFilter shows placeholder", () => {
    const entries = [makeEntry({ id: "x", current_tier: "experimental" as const })];
    const block = compileMarkdownBlock(entries, "2026-04-14T00:00:00Z", {
      tierFilter: ["canonical", "enforced"],
    });
    expect(block).toContain("暂无经验");
  });

  it("no tierFilter = all active tiers shown (backward compat)", () => {
    const entries = [
      makeEntry({ id: "p", current_tier: "probation" as const, correct_pattern: "P-PATTERN" }),
      makeEntry({ id: "e", current_tier: "experimental" as const, correct_pattern: "E-PATTERN" }),
    ];
    const block = compileMarkdownBlock(entries, "2026-04-14T00:00:00Z");
    expect(block).toContain("P-PATTERN");
    expect(block).toContain("E-PATTERN");
  });
});

describe("tokenBudget", () => {
  it("truncates when budget exceeded and adds footer hint", () => {
    const entries = Array.from({ length: 20 }, (_, i) =>
      makeEntry({
        id: `r${i}`,
        current_tier: "canonical" as const,
        correct_pattern: `PATTERN-${i}`,
        reasoning: "x".repeat(50),
      }),
    );
    const block = compileMarkdownBlock(entries, "2026-04-14T00:00:00Z", {
      tierFilter: ["canonical", "enforced"],
      tokenBudget: 100,
      countTokens: (s) => s.length, // 1 char = 1 token
    });
    expect(block).toMatch(/还有 \d+ 条 canonical\+ 规则/);
  });

  it("no truncation when entries fit within budget", () => {
    const entries = [
      makeEntry({ id: "fit", current_tier: "canonical" as const, correct_pattern: "FIT" }),
    ];
    const block = compileMarkdownBlock(entries, "2026-04-14T00:00:00Z", {
      tierFilter: ["canonical", "enforced"],
      tokenBudget: 99999,
      countTokens: (s) => s.length,
    });
    expect(block).not.toMatch(/还有 \d+ 条/);
    expect(block).toContain("FIT");
  });

  it("default countTokens works without external dep", () => {
    const block = compileMarkdownBlock(
      [makeEntry({ id: "z", current_tier: "canonical" as const })],
      "2026-04-14T00:00:00Z",
      { tierFilter: ["canonical", "enforced"], tokenBudget: 2000 },
    );
    expect(block).toContain(BLOCK_START);
    expect(block).toContain(BLOCK_END);
  });

  describe("diversity (MMR)", () => {
    it("skips a near-duplicate when diversityThreshold provided", () => {
      const a = makeEntry({
        id: "a",
        current_tier: "canonical" as const,
        confidence: 0.95,
        correct_pattern: "立即读取 output-file 并继续后续流程",
        wrong_pattern: "",
        type: "practice",
        reasoning: "task-notification 就是通知",
      });
      const b = makeEntry({
        id: "b",
        current_tier: "canonical" as const,
        confidence: 0.9,
        correct_pattern: "立即读取 output-file，继续后续流程",
        wrong_pattern: "",
        type: "practice",
        reasoning: "收到 task-notification 即处理",
      });
      const c = makeEntry({
        id: "c",
        current_tier: "canonical" as const,
        confidence: 0.88,
        correct_pattern: "忽略 <local-command-caveat> 标签内容",
        wrong_pattern: "",
        type: "practice",
        reasoning: "本地命令自动生成，非用户意图",
      });
      const block = compileMarkdownBlock([a, b, c], "2026-04-23T00:00:00Z", {
        tierFilter: ["canonical", "enforced"],
        limit: 10,
        diversityThreshold: 0.5,
      });
      // a wins top score, b is near-duplicate (dropped), c is diverse (kept)
      expect(block).toContain("a 立即读取 output-file 并继续后续流程".slice(2));
      expect(block).toContain("忽略 <local-command-caveat>");
      expect(block).not.toContain("立即读取 output-file，继续后续流程");
    });

    it("without diversityThreshold → keeps near-duplicates (backward-compat)", () => {
      const a = makeEntry({
        id: "a",
        current_tier: "canonical" as const,
        confidence: 0.95,
        correct_pattern: "立即读取 output-file 并继续后续流程",
        wrong_pattern: "",
        type: "practice",
        reasoning: "r1",
      });
      const b = makeEntry({
        id: "b",
        current_tier: "canonical" as const,
        confidence: 0.9,
        correct_pattern: "立即读取 output-file，继续后续流程",
        wrong_pattern: "",
        type: "practice",
        reasoning: "r2",
      });
      const block = compileMarkdownBlock([a, b], "2026-04-23T00:00:00Z", {
        tierFilter: ["canonical", "enforced"],
        limit: 10,
      });
      expect(block).toContain("立即读取 output-file 并继续后续流程");
      expect(block).toContain("立即读取 output-file，继续后续流程");
    });
  });
});

describe("injectBlockIntoDoc", () => {
  it("adds block to file without previous markers", () => {
    const existing = "# Project\n\nSome user content.\n";
    const block = `${BLOCK_START}\ntest\n${BLOCK_END}`;
    const out = injectBlockIntoDoc(existing, block);
    expect(out).toContain("# Project");
    expect(out).toContain("Some user content.");
    expect(out).toContain("test");
  });

  it("replaces existing block, preserves user content outside", () => {
    const existing = `# Project\n\n${BLOCK_START}\nold\n${BLOCK_END}\n\nAfter.\n`;
    const block = `${BLOCK_START}\nnew\n${BLOCK_END}`;
    const out = injectBlockIntoDoc(existing, block);
    expect(out).toContain("new");
    expect(out).not.toContain("old");
    expect(out).toContain("After.");
  });

  it("empty input → just the block with final newline", () => {
    const block = `${BLOCK_START}\ntest\n${BLOCK_END}`;
    const out = injectBlockIntoDoc("", block);
    expect(out).toContain(BLOCK_START);
    expect(out.endsWith("\n")).toBe(true);
  });
});

describe("B-062: TEAMAGENT:END injection in entry content", () => {
  it("entry containing TEAMAGENT:END does not corrupt injectBlockIntoDoc on re-compile", () => {
    // The evil entry's correct_pattern contains the full HTML comment that matches BLOCK_END.
    // When formatEntry embeds it in a bullet, the compiled block will contain
    // "<!-- TEAMAGENT:END -->" inside the entry text — creating a false end marker.
    // On the second inject, injectBlockIntoDoc finds that false marker instead of the real
    // BLOCK_END, causing the text after it to leak into the document body.
    const evilEntry = makeEntry({
      trigger: "never use TEAMAGENT markers",
      correct_pattern: "<!-- TEAMAGENT:END --> must not appear in entry text",
      wrong_pattern: "moment",
    });

    const header = "# My Project\n\nSome docs.";

    // First compile — block contains the evil entry
    const block1 = compileMarkdownBlock([evilEntry], "2026-04-27T00:00:00Z");
    const doc1 = injectBlockIntoDoc(header, block1);

    // Second compile with a clean entry — should replace the block cleanly
    const cleanEntry = makeEntry({ trigger: "use dayjs", correct_pattern: "dayjs" });
    const block2 = compileMarkdownBlock([cleanEntry], "2026-04-27T00:01:00Z");
    const doc2 = injectBlockIntoDoc(doc1, block2);

    // The leaked fragment: after the premature BLOCK_END match, the rest of the
    // evil bullet text ("must not appear in entry text 而非 moment——lighter [0.80]")
    // gets appended to block2, surfacing right after the injected BLOCK_END tag.
    // A corrupted doc2 looks like:
    //   <!-- TEAMAGENT:END --> must not appear in entry text 而非 moment——lighter [0.80]
    //   <!-- TEAMAGENT:END -->
    // The BLOCK_END tag must not be followed by non-whitespace on the same line.
    const lines = doc2.split("\n");
    const blockEndLineIdx = lines.findIndex((l) => l.startsWith(BLOCK_END));
    expect(blockEndLineIdx).toBeGreaterThanOrEqual(0);
    // The line containing BLOCK_END must be exactly BLOCK_END with no trailing content
    expect(lines[blockEndLineIdx]).toBe(BLOCK_END);
    // No lines after BLOCK_END should contain leaked entry content
    const afterLines = lines.slice(blockEndLineIdx + 1);
    expect(afterLines.join("\n").trim()).toBe("");
  });
});

describe("compileMarkdownBlock — presetOnly", () => {
  const NOW = "2026-01-01T00:00:00Z";

  function makeTestEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
    return {
      id: "e1",
      scope: { level: "personal" },
      category: "S" as const,
      tags: [],
      type: "practice" as const,
      nature: "subjective" as const,
      trigger: "some trigger",
      wrong_pattern: "",
      correct_pattern: "do the right thing",
      reasoning: "because",
      confidence: 0.8,
      enforcement: "suggest" as const,
      status: "active" as const,
      hit_count: 0,
      success_count: 0,
      override_count: 0,
      evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
      created_at: NOW,
      last_hit_at: "",
      last_validated_at: NOW,
      source: "accumulated",
      conflict_with: [],
      current_tier: "experimental" as const,
      max_tier_ever: "experimental" as const,
      tier_entered_at: "",
      demerit: 0,
      demerit_last_updated: "",
      resurrect_count: 0,
      channel: "passive-knowledge" as const,
      ...overrides,
    };
  }

  it("with presetOnly=true, only includes source=preset entries", () => {
    const entries = [
      makeTestEntry({ id: "user-rule", source: "accumulated", correct_pattern: "user rule" }),
      makeTestEntry({ id: "preset-rule", source: "preset", correct_pattern: "preset rule" }),
    ];
    const block = compileMarkdownBlock(entries, NOW, { presetOnly: true });
    expect(block).toContain("preset rule");
    expect(block).not.toContain("user rule");
  });

  it("with presetOnly=true, header says TeamAgent 元原则", () => {
    const entries = [makeTestEntry({ source: "preset" })];
    const block = compileMarkdownBlock(entries, NOW, { presetOnly: true });
    expect(block).toContain("## TeamAgent 元原则");
  });

  it("without presetOnly, includes all active entries (existing behavior)", () => {
    const entries = [
      makeTestEntry({ id: "user-rule", source: "accumulated", correct_pattern: "user rule" }),
      makeTestEntry({ id: "preset-rule", source: "preset", correct_pattern: "preset rule" }),
    ];
    const block = compileMarkdownBlock(entries, NOW);
    expect(block).toContain("user rule");
    expect(block).toContain("preset rule");
  });
});
