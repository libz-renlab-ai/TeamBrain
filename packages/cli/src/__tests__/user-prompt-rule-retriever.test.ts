import { describe, it, expect } from "vitest";
import { formatRuleInjection, buildTechStackText, buildTerminalSummary, passesCoOccurrenceGuard, retrieveRulesForPrompt } from "../user-prompt-rule-retriever.js";
import type { KnowledgeEntry } from "@teamagent/types";

function makeRule(id: string, trigger: string, correct: string, conf = 0.9): KnowledgeEntry {
  return {
    id,
    scope: { level: "global" },
    category: "S" as const,
    tags: [],
    type: "practice" as const,
    nature: "subjective" as const,
    trigger,
    wrong_pattern: "",
    correct_pattern: correct,
    reasoning: "test",
    confidence: conf,
    enforcement: "suggest" as const,
    status: "active" as const,
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: "2026-01-01T00:00:00Z",
    last_hit_at: "",
    last_validated_at: "2026-01-01T00:00:00Z",
    source: "preset",
    conflict_with: [],
    current_tier: "canonical" as const,
    max_tier_ever: "canonical" as const,
    tier_entered_at: "",
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
    channel: "passive-knowledge" as const,
  } as KnowledgeEntry;
}

describe("formatRuleInjection", () => {
  it("returns empty string for empty rules array", () => {
    expect(formatRuleInjection([], "T2")).toBe("");
  });

  it("includes header with tier label", () => {
    const rules = [makeRule("r1", "开始实现功能时", "先写测试")];
    const text = formatRuleInjection(rules, "T1");
    expect(text).toContain("T1");
    expect(text).toContain("TeamAgent");
  });

  it("includes each rule's trigger and correct_pattern", () => {
    const rules = [
      makeRule("r1", "开始实现功能时", "先写测试"),
      makeRule("r2", "提交代码时", "一次一件事"),
    ];
    const text = formatRuleInjection(rules, "T2");
    expect(text).toContain("先写测试");
    expect(text).toContain("一次一件事");
  });
});

describe("buildTerminalSummary", () => {
  it("returns empty string when no rules", () => {
    expect(buildTerminalSummary([], [])).toBe("");
  });

  it("includes ASCII block header with count", () => {
    const rules = [makeRule("r1", "调用外部 HTTP API 时", "fetch + 错误处理")];
    const text = buildTerminalSummary(rules, []);
    expect(text).toContain("========|| TeamAgent ||========");
    expect(text).toContain("1");
  });

  it("lists each rule's trigger and correct_pattern", () => {
    const r1 = makeRule("r1", "调用外部 HTTP API 时", "fetch");
    const r2 = makeRule("r2", "git push 到主分支", "PR 流程");
    const text = buildTerminalSummary([r1], [r2]);
    expect(text).toContain("调用外部 HTTP API 时");
    expect(text).toContain("fetch");
    expect(text).toContain("git push 到主分支");
    expect(text).toContain("PR 流程");
  });

  it("combines tier1 and tier2 rules", () => {
    const t1 = [makeRule("r1", "触发1", "做法1")];
    const t2 = [makeRule("r2", "触发2", "做法2")];
    const text = buildTerminalSummary(t1, t2);
    expect(text).toContain("2");
    expect(text).toContain("触发1");
    expect(text).toContain("触发2");
  });

  it("uses at most three lines", () => {
    const rules = [
      makeRule("r1", "调用外部 HTTP API 时", "fetch"),
      makeRule("r2", "git push 到主分支", "PR 流程"),
      makeRule("r3", "提交代码时", "一次一件事"),
    ];
    const text = buildTerminalSummary(rules, []);
    expect(text.split("\n")).toHaveLength(3);
    expect(text.split("\n")[1]).toMatch(/^\|\| .* \|\|$/);
  });
});

describe("buildTechStackText", () => {
  it("returns a non-empty string given a real cwd", () => {
    const text = buildTechStackText(process.cwd());
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
  });
});

describe("passesCoOccurrenceGuard", () => {
  const threeElementRule = makeRule(
    "r-ceo",
    "需要列出产品功能且与技术实现细节分离时",
    "prompt 中同时包含三要素：(1) 'list product features'，(2) 'not tech features'，(3) 'explain to a chinese cute duck'；这是项目标准沟通模板",
  );

  it("blocks partial match: 'list all product features' missing 2 of 3 required tokens", () => {
    expect(passesCoOccurrenceGuard(threeElementRule, "list all product features")).toBe(false);
  });

  it("allows full match: all 3 tokens present", () => {
    const msg = "list product features not tech features explain to a chinese cute duck";
    expect(passesCoOccurrenceGuard(threeElementRule, msg)).toBe(true);
  });

  it("allows rules with no numbered token pattern in correct_pattern", () => {
    const simpleRule = makeRule("r-simple", "写代码时", "先写测试");
    expect(passesCoOccurrenceGuard(simpleRule, "write some code")).toBe(true);
  });

  it("allows single-element numbered pattern (not a co-occurrence constraint)", () => {
    const singleRule = makeRule("r-single", "触发时", "(1) 'do the thing' 是最佳做法");
    expect(passesCoOccurrenceGuard(singleRule, "do something else entirely")).toBe(true);
  });

  it("allows when only 1 of 2 required tokens present in a two-element rule", () => {
    const twoRule = makeRule("r-two", "触发时", "需要同时满足 (1) 'alpha' 和 (2) 'beta' 两个条件");
    expect(passesCoOccurrenceGuard(twoRule, "only alpha here")).toBe(false);
  });

  it("allows when all 2 required tokens present in a two-element rule", () => {
    const twoRule = makeRule("r-two", "触发时", "需要同时满足 (1) 'alpha' 和 (2) 'beta' 两个条件");
    expect(passesCoOccurrenceGuard(twoRule, "alpha and beta are both here")).toBe(true);
  });

  it("is case-insensitive for token matching", () => {
    const msg = "LIST PRODUCT FEATURES NOT TECH FEATURES EXPLAIN TO A CHINESE CUTE DUCK";
    expect(passesCoOccurrenceGuard(threeElementRule, msg)).toBe(true);
  });
});

describe("retrieveRulesForPrompt embedder requirement (issue #315)", () => {
  // Issue #315 hardens against silent regression: the previous default
  // `?? new XenovaRuleEmbedder()` allowed any future caller that forgot
  // to pass the daemon-first embedder to silently load 650MB of ONNX
  // in-process per UserPromptSubmit. Throwing on missing embedder makes
  // this drift impossible.
  it("throws when args.embedder is missing", async () => {
    await expect(
      retrieveRulesForPrompt({
        userMessage: "hello",
        cwd: process.cwd(),
        projectDbPath: ":memory:",
        globalDbPath: ":memory:",
        sessionSeenIds: new Set(),
        isFirstPrompt: false,
        // intentionally omit embedder
      }),
    ).rejects.toThrow(/explicit `embedder`/);
  });
});
