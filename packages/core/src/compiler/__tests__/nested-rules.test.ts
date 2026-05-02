import { describe, it, expect } from "vitest";
import {
  compileNestedRuleArtifacts,
  formatRuleAsMarkdown,
  formatTierIndex,
  formatRootIndex,
  type NestedRuleArtifact,
} from "../nested-rules.js";
import type { KnowledgeEntry } from "@teamagent/types";

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: "rule-a",
    scope: { level: "personal" },
    category: "C",
    tags: ["syntax-error"],
    type: "avoidance",
    nature: "objective",
    trigger: "trigger-text",
    wrong_pattern: "moment",
    correct_pattern: "dayjs",
    reasoning: "smaller bundle",
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

describe("formatRuleAsMarkdown", () => {
  it("renders avoidance rule with correct/wrong/reasoning sections", () => {
    const md = formatRuleAsMarkdown(
      makeEntry({
        id: "rule-1",
        type: "avoidance",
        wrong_pattern: "moment",
        correct_pattern: "dayjs",
        reasoning: "smaller bundle",
        trigger: "选择时间库",
        confidence: 0.95,
        current_tier: "canonical",
      }),
    );
    expect(md).toContain("# rule-1");
    expect(md).toContain("Tier: canonical");
    expect(md).toContain("Confidence: 0.95");
    expect(md).toContain("dayjs");
    expect(md).toContain("moment");
    expect(md).toContain("smaller bundle");
    expect(md).toContain("选择时间库");
  });

  it("omits wrong-pattern section when entry is practice (no wrong_pattern)", () => {
    const md = formatRuleAsMarkdown(
      makeEntry({
        id: "rule-2",
        type: "practice",
        wrong_pattern: null as unknown as string,
        correct_pattern: "always run pnpm typecheck before commit",
        reasoning: "catches type drift early",
      }),
    );
    expect(md).toContain("# rule-2");
    expect(md).toContain("always run pnpm typecheck before commit");
    expect(md).not.toMatch(/❌\s*错误/);
  });

  it("escapes TEAMAGENT block markers in user-controlled fields", () => {
    const md = formatRuleAsMarkdown(
      makeEntry({
        id: "rule-3",
        correct_pattern: "say <!-- TEAMAGENT:END --> in pattern",
        reasoning: "<!-- TEAMAGENT:START -->",
      }),
    );
    expect(md).not.toMatch(/<!--\s*TEAMAGENT:END\s*-->/);
    expect(md).not.toMatch(/<!--\s*TEAMAGENT:START\s*-->/);
  });
});

describe("formatTierIndex", () => {
  it("lists rule ids with confidence and tldr, sorted by score", () => {
    const a = makeEntry({ id: "a", confidence: 0.9, current_tier: "canonical", hit_count: 5 });
    const b = makeEntry({ id: "b", confidence: 0.7, current_tier: "canonical", hit_count: 1 });
    const idx = formatTierIndex("canonical", [b, a], "2026-04-14T00:00:00Z");
    expect(idx).toContain("# canonical");
    expect(idx).toContain("(2 rules)");
    expect(idx).toMatch(/\[a\]\(\.\/a\.md\)[\s\S]*\[b\]\(\.\/b\.md\)/);
    expect(idx).toContain("0.90");
    expect(idx).toContain("0.70");
  });

  it("renders empty-state when tier has no rules", () => {
    const idx = formatTierIndex("enforced", [], "2026-04-14T00:00:00Z");
    expect(idx).toContain("# enforced");
    expect(idx).toContain("(0 rules)");
  });
});

describe("formatRootIndex", () => {
  it("lists tiers with counts and pointers", () => {
    const entries = [
      makeEntry({ id: "x", current_tier: "canonical" }),
      makeEntry({ id: "y", current_tier: "canonical" }),
      makeEntry({ id: "z", current_tier: "stable" }),
    ];
    const idx = formatRootIndex(entries, "2026-04-14T00:00:00Z");
    expect(idx).toContain("# TeamAgent Rules");
    expect(idx).toContain("Total active: 3");
    expect(idx).toMatch(/\[canonical\]\(\.\/canonical\/INDEX\.md\)\s+—\s+2 rules/);
    expect(idx).toMatch(/\[stable\]\(\.\/stable\/INDEX\.md\)\s+—\s+1 rule/);
    expect(idx).toContain("2026-04-14T00:00:00Z");
  });

  it("filters archived rules out of count", () => {
    const entries = [
      makeEntry({ id: "x", current_tier: "canonical", status: "active" }),
      makeEntry({ id: "y", current_tier: "canonical", status: "archived" }),
    ];
    const idx = formatRootIndex(entries, "2026-04-14T00:00:00Z");
    expect(idx).toContain("Total active: 1");
  });
});

describe("compileNestedRuleArtifacts", () => {
  it("produces one artifact per active rule plus tier indexes plus root index", () => {
    const entries = [
      makeEntry({ id: "a", current_tier: "canonical" }),
      makeEntry({ id: "b", current_tier: "stable" }),
      makeEntry({ id: "c", current_tier: "experimental" }),
    ];
    const artifacts = compileNestedRuleArtifacts(entries, "2026-04-14T00:00:00Z");
    const paths = artifacts.map((a) => a.relativePath).sort();
    expect(paths).toContain("INDEX.md");
    expect(paths).toContain("canonical/INDEX.md");
    expect(paths).toContain("canonical/a.md");
    expect(paths).toContain("stable/INDEX.md");
    expect(paths).toContain("stable/b.md");
    expect(paths).toContain("experimental/INDEX.md");
    expect(paths).toContain("experimental/c.md");
    // 3 rules + tier indexes for every supported tier (including empty ones) + 1 root
    const tierIdxCount = artifacts.filter((a) => a.kind === "tier-index").length;
    expect(tierIdxCount).toBeGreaterThanOrEqual(3);
    expect(artifacts.filter((a) => a.kind === "rule").length).toBe(3);
    expect(artifacts.filter((a) => a.kind === "root-index").length).toBe(1);
  });

  it("skips archived rules", () => {
    const entries = [
      makeEntry({ id: "a", current_tier: "canonical", status: "active" }),
      makeEntry({ id: "b", current_tier: "canonical", status: "archived" }),
    ];
    const artifacts = compileNestedRuleArtifacts(entries, "2026-04-14T00:00:00Z");
    const ruleArtifacts = artifacts.filter((a) => a.kind === "rule");
    expect(ruleArtifacts.length).toBe(1);
    expect(ruleArtifacts[0]?.ruleId).toBe("a");
  });

  it("with no active rules emits root + per-tier empty indexes", () => {
    const artifacts = compileNestedRuleArtifacts([], "2026-04-14T00:00:00Z");
    const root = artifacts.find((a) => a.relativePath === "INDEX.md");
    expect(root).toBeDefined();
    expect(root?.contents).toContain("Total active: 0");
    // each tier still gets an empty index so old files can be cleaned
    expect(artifacts.find((a) => a.relativePath === "canonical/INDEX.md")).toBeDefined();
    expect(artifacts.find((a) => a.relativePath === "experimental/INDEX.md")).toBeDefined();
  });

  it("encodes rule ids that contain unsafe path characters", () => {
    const entries = [makeEntry({ id: "a/../b", current_tier: "canonical" })];
    const artifacts = compileNestedRuleArtifacts(entries, "2026-04-14T00:00:00Z");
    const rule = artifacts.find((a) => a.kind === "rule");
    expect(rule?.relativePath).not.toContain("..");
    expect(rule?.relativePath).not.toContain("/../");
  });

  it("presetOnly: emits only entries with source==='preset' (issue #42 codex P1)", () => {
    const entries = [
      makeEntry({ id: "preset-1", source: "preset", current_tier: "canonical" }),
      makeEntry({ id: "user-1", source: "accumulated", current_tier: "canonical" }),
      makeEntry({ id: "user-2", source: "ingested", current_tier: "stable" }),
    ];
    const artifacts = compileNestedRuleArtifacts(entries, "2026-04-14T00:00:00Z", {
      presetOnly: true,
    });
    const rules = artifacts.filter((a) => a.kind === "rule");
    expect(rules.length).toBe(1);
    expect(rules[0]?.ruleId).toBe("preset-1");
    // root index reflects only the preset count
    const root = artifacts.find((a) => a.kind === "root-index");
    expect(root?.contents).toContain("Total active: 1");
  });

  it("disambiguates filename collisions between distinct rule ids (issue #42 codex P2)", () => {
    const entries = [
      makeEntry({ id: "a/b", current_tier: "canonical" }),
      makeEntry({ id: "a_b", current_tier: "canonical" }),
      makeEntry({ id: "a:b", current_tier: "canonical" }),
    ];
    const artifacts = compileNestedRuleArtifacts(entries, "2026-04-14T00:00:00Z");
    const rulePaths = artifacts.filter((a) => a.kind === "rule").map((a) => a.relativePath);
    // Three distinct rules → three distinct file paths (no overwrite)
    expect(new Set(rulePaths).size).toBe(3);
    // Each path is collision-free of `..` traversal
    for (const p of rulePaths) {
      expect(p).not.toContain("/../");
    }
    // The "natural" id (a_b) keeps a clean name, collisions get suffixed
    expect(rulePaths).toContain("canonical/a_b.md");
  });

  it("tier index links match collision-disambiguated filenames (issue #42 codex follow-up)", () => {
    const entries = [
      makeEntry({ id: "a/b", current_tier: "canonical" }),
      makeEntry({ id: "a_b", current_tier: "canonical" }),
    ];
    const artifacts = compileNestedRuleArtifacts(entries, "2026-04-14T00:00:00Z");
    const tierIndex = artifacts.find(
      (a) => a.kind === "tier-index" && a.relativePath === "canonical/INDEX.md",
    );
    expect(tierIndex).toBeDefined();
    const rulePaths = artifacts
      .filter((a) => a.kind === "rule")
      .map((a) => a.relativePath.replace(/^canonical\//, "./"));
    // Every rule file must be reachable from the tier INDEX
    for (const expectedRel of rulePaths) {
      expect(tierIndex!.contents).toContain(`(${expectedRel})`);
    }
    // No two link targets duplicate (the bug Codex flagged)
    const linkTargets =
      tierIndex!.contents.match(/\((\.\/[^)]+\.md)\)/g) ?? [];
    expect(new Set(linkTargets).size).toBe(linkTargets.length);
  });

  it("each artifact has kind tag for downstream cleanup", () => {
    const entries = [makeEntry({ id: "a", current_tier: "canonical" })];
    const artifacts: NestedRuleArtifact[] = compileNestedRuleArtifacts(
      entries,
      "2026-04-14T00:00:00Z",
    );
    const kinds = new Set(artifacts.map((a) => a.kind));
    expect(kinds.has("rule")).toBe(true);
    expect(kinds.has("tier-index")).toBe(true);
    expect(kinds.has("root-index")).toBe(true);
  });
});
