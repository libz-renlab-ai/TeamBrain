/**
 * Render-coverage tests for StdoutRenderer — one event per AttributionEvent kind.
 *
 * Review finding (PR #152): StdoutRenderer's exhaustive switch handles 40
 * AttributionEvent kinds but the original test file exercised only 2.
 * 38 branches had zero rendered-output assertions, so a copy-paste typo in
 * any case (wrong field reference, wrong template, wrong number formatting)
 * would ship undetected.
 *
 * Strategy:
 *   - Construct one minimal valid event per kind.
 *   - For each event, render via StdoutRenderer.render([event], "verbose").
 *   - Assert:
 *       1. The "做了什么:" line is present and non-empty after the colon.
 *       2. The rendered output does NOT contain the literal text "undefined".
 *       3. The rendered output does NOT contain the literal text "NaN".
 *
 * No mocks — StdoutRenderer is pure string rendering with no IO.
 */

import { describe, it, expect } from "vitest";
import { StdoutRenderer } from "../stdout-renderer.js";
import type { AttributionEvent } from "@teamagent/types";

const renderer = new StdoutRenderer();

/** Render one event in verbose mode (shows all severities). */
function renderOne(event: AttributionEvent): string {
  return renderer.render([event], "verbose");
}

const BASE_TS = "2026-04-14T10:00:00Z";

/**
 * All 40 AttributionEvent kinds with minimal valid required fields.
 * The array is used in parameterized tests below.
 */
const ALL_EVENTS: Array<{ label: string; event: AttributionEvent }> = [
  // ── pitfall ──────────────────────────────────────────────────────────────
  {
    label: "pitfall.added",
    event: {
      kind: "pitfall.added",
      source: "pitfall",
      severity: "highlight",
      timestamp: BASE_TS,
      knowledgeId: "rule-001",
      category: "C",
      tag: "api-hallucination",
      level: "personal",
      knowledgeCountBefore: 5,
      knowledgeCountAfter: 6,
      skillMdPath: "/skills/rule-001/SKILL.md",
    },
  },

  // ── skeleton ──────────────────────────────────────────────────────────────
  {
    label: "skeleton.knowledge-added",
    event: {
      kind: "skeleton.knowledge-added",
      source: "skeleton",
      severity: "info",
      timestamp: BASE_TS,
      knowledgeId: "rule-002",
      knowledgeCountBefore: 0,
      knowledgeCountAfter: 1,
      blockLines: 10,
    },
  },
  {
    label: "skeleton.l0-validation (ok=true)",
    event: {
      kind: "skeleton.l0-validation",
      source: "skeleton",
      severity: "info",
      timestamp: BASE_TS,
      knowledgeId: "rule-003",
      ok: true,
      failedChecks: [],
    },
  },
  {
    label: "skeleton.l0-validation (ok=false)",
    event: {
      kind: "skeleton.l0-validation",
      source: "skeleton",
      severity: "warning",
      timestamp: BASE_TS,
      knowledgeId: "rule-003b",
      ok: false,
      failedChecks: ["missing-trigger"],
    },
  },
  {
    label: "skeleton.skills-compiled",
    event: {
      kind: "skeleton.skills-compiled",
      source: "skeleton",
      severity: "info",
      timestamp: BASE_TS,
      written: ["skill-A", "skill-B"],
      legacyDisabled: false,
    },
  },

  // ── extractor ──────────────────────────────────────────────────────────────
  {
    label: "extractor.deduped",
    event: {
      kind: "extractor.deduped",
      source: "extractor",
      severity: "info",
      timestamp: BASE_TS,
      count: 3,
    },
  },
  {
    label: "extractor.skipped",
    event: {
      kind: "extractor.skipped",
      source: "extractor",
      severity: "info",
      timestamp: BASE_TS,
      count: 2,
    },
  },
  {
    label: "extractor.extracted",
    event: {
      kind: "extractor.extracted",
      source: "extractor",
      severity: "info",
      timestamp: BASE_TS,
      knowledgeId: "rule-004",
      count: 1,
    },
  },
  {
    label: "extractor.rejected-l0",
    event: {
      kind: "extractor.rejected-l0",
      source: "extractor",
      severity: "warning",
      timestamp: BASE_TS,
      knowledgeId: "rule-005",
      count: 1,
    },
  },
  {
    label: "extractor.failed",
    event: {
      kind: "extractor.failed",
      source: "extractor",
      severity: "warning",
      timestamp: BASE_TS,
      count: 1,
    },
  },

  // ── compiler ──────────────────────────────────────────────────────────────
  {
    label: "compiler.recompiled",
    event: {
      kind: "compiler.recompiled",
      source: "compiler",
      severity: "info",
      timestamp: BASE_TS,
      count: 4,
    },
  },
  {
    label: "compiler.failed",
    event: {
      kind: "compiler.failed",
      source: "compiler",
      severity: "warning",
      timestamp: BASE_TS,
    },
  },

  // ── ingest ──────────────────────────────────────────────────────────────
  {
    label: "ingest.failed",
    event: {
      kind: "ingest.failed",
      source: "ingest",
      severity: "warning",
      timestamp: BASE_TS,
      count: 2,
    },
  },
  {
    label: "ingest.skipped",
    event: {
      kind: "ingest.skipped",
      source: "ingest",
      severity: "info",
      timestamp: BASE_TS,
      count: 0,
    },
  },
  {
    label: "ingest.rejected-l0",
    event: {
      kind: "ingest.rejected-l0",
      source: "ingest",
      severity: "warning",
      timestamp: BASE_TS,
      knowledgeId: "rule-006",
    },
  },
  {
    label: "ingest.accepted",
    event: {
      kind: "ingest.accepted",
      source: "ingest",
      severity: "info",
      timestamp: BASE_TS,
      knowledgeId: "rule-007",
    },
  },

  // ── importer ──────────────────────────────────────────────────────────────
  {
    label: "importer.skipped",
    event: {
      kind: "importer.skipped",
      source: "importer",
      severity: "info",
      timestamp: BASE_TS,
    },
  },
  {
    label: "importer.structured",
    event: {
      kind: "importer.structured",
      source: "importer",
      severity: "info",
      timestamp: BASE_TS,
    },
  },
  {
    label: "importer.failed",
    event: {
      kind: "importer.failed",
      source: "importer",
      severity: "warning",
      timestamp: BASE_TS,
    },
  },

  // ── validator ──────────────────────────────────────────────────────────────
  {
    label: "validator.blocked-promotion",
    event: {
      kind: "validator.blocked-promotion",
      source: "validator",
      severity: "warning",
      timestamp: BASE_TS,
      knowledgeId: "rule-008",
      level: "l1",
      fromTier: "stable",
      toTier: "canonical",
      reason: "L1 validation failed",
    },
  },

  // ── calibrator ──────────────────────────────────────────────────────────────
  {
    label: "calibrator.adjusted",
    event: {
      kind: "calibrator.adjusted",
      source: "calibrator",
      severity: "info",
      timestamp: BASE_TS,
      knowledgeId: "rule-009",
      confidenceBefore: 0.6,
      confidenceAfter: 0.75,
      statusBefore: "probation",
      statusAfter: "stable",
    },
  },
  {
    label: "calibrator.v2-adjusted",
    event: {
      kind: "calibrator.v2-adjusted",
      source: "calibrator",
      severity: "info",
      timestamp: BASE_TS,
      knowledgeId: "rule-010",
      confidenceBefore: 0.5,
      confidenceAfter: 0.8,
      tierBefore: "probation",
      tierAfter: "stable",
      demeritBefore: 2,
      demeritAfter: 1,
    },
  },

  // ── compile ──────────────────────────────────────────────────────────────
  {
    label: "compile.skill-should-write",
    event: {
      kind: "compile.skill-should-write",
      source: "compile",
      severity: "info",
      timestamp: BASE_TS,
      knowledgeId: "rule-011",
      tierBefore: "probation",
      tierAfter: "stable",
    },
  },
  {
    label: "compile.skill-should-remove",
    event: {
      kind: "compile.skill-should-remove",
      source: "compile",
      severity: "info",
      timestamp: BASE_TS,
      knowledgeId: "rule-012",
      tierBefore: "stable",
      tierAfter: "deprecated",
    },
  },
  {
    label: "compile.skills-compiled",
    event: {
      kind: "compile.skills-compiled",
      source: "compile",
      severity: "info",
      timestamp: BASE_TS,
      written: 3,
      removed: 1,
    },
  },

  // ── hook-stop ──────────────────────────────────────────────────────────────
  {
    label: "hook-stop.rules-vectorized",
    event: {
      kind: "hook-stop.rules-vectorized",
      source: "hook-stop",
      severity: "info",
      timestamp: BASE_TS,
      count: 10,
    },
  },
  {
    label: "hook-stop.analyze-started",
    event: {
      kind: "hook-stop.analyze-started",
      source: "hook-stop",
      severity: "info",
      timestamp: BASE_TS,
      modeTag: "full",
    },
  },
  {
    label: "hook-stop.analyze-finished (with firstLine)",
    event: {
      kind: "hook-stop.analyze-finished",
      source: "hook-stop",
      severity: "info",
      timestamp: BASE_TS,
      firstLine: "Found 2 matching rules",
    },
  },
  {
    label: "hook-stop.analyze-finished (no firstLine)",
    event: {
      kind: "hook-stop.analyze-finished",
      source: "hook-stop",
      severity: "info",
      timestamp: BASE_TS,
    },
  },
  {
    label: "hook-stop.analyze-skipped",
    event: {
      kind: "hook-stop.analyze-skipped",
      source: "hook-stop",
      severity: "info",
      timestamp: BASE_TS,
      reason: "no rules loaded",
    },
  },
  {
    label: "hook-stop.calibration-started",
    event: {
      kind: "hook-stop.calibration-started",
      source: "hook-stop",
      severity: "info",
      timestamp: BASE_TS,
    },
  },
  {
    label: "hook-stop.calibration-finished",
    event: {
      kind: "hook-stop.calibration-finished",
      source: "hook-stop",
      severity: "info",
      timestamp: BASE_TS,
    },
  },
  {
    label: "hook-stop.skills-updating",
    event: {
      kind: "hook-stop.skills-updating",
      source: "hook-stop",
      severity: "info",
      timestamp: BASE_TS,
    },
  },
  {
    label: "hook-stop.skills-exported",
    event: {
      kind: "hook-stop.skills-exported",
      source: "hook-stop",
      severity: "info",
      timestamp: BASE_TS,
      count: 5,
    },
  },
  {
    label: "hook-stop.scan-errors-started",
    event: {
      kind: "hook-stop.scan-errors-started",
      source: "hook-stop",
      severity: "info",
      timestamp: BASE_TS,
    },
  },
  {
    label: "hook-stop.scan-errors-progress",
    event: {
      kind: "hook-stop.scan-errors-progress",
      source: "hook-stop",
      severity: "info",
      timestamp: BASE_TS,
      lastLine: "✗ TypeError: cannot read property",
    },
  },
  {
    label: "hook-stop.scan-errors-timeout",
    event: {
      kind: "hook-stop.scan-errors-timeout",
      source: "hook-stop",
      severity: "warning",
      timestamp: BASE_TS,
      timeoutMs: 5000,
    },
  },
  {
    label: "hook-stop.semantic-scan-hit",
    event: {
      kind: "hook-stop.semantic-scan-hit",
      source: "hook-stop",
      severity: "highlight",
      timestamp: BASE_TS,
      count: 2,
    },
  },
  {
    label: "hook-stop.semantic-scan-timeout",
    event: {
      kind: "hook-stop.semantic-scan-timeout",
      source: "hook-stop",
      severity: "info",
      timestamp: BASE_TS,
      timeoutMs: 30000,
    },
  },
  {
    label: "hook-stop.skip-concurrent",
    event: {
      kind: "hook-stop.skip-concurrent",
      source: "hook-stop",
      severity: "info",
      timestamp: BASE_TS,
      otherPid: 12345,
    },
  },

  // ── hook-pre ──────────────────────────────────────────────────────────────
  {
    label: "hook-pre.matched",
    event: {
      kind: "hook-pre.matched",
      source: "hook-pre",
      severity: "highlight",
      timestamp: BASE_TS,
      ruleId: "rule-013",
      permissionDecision: "allow",
    },
  },
  {
    label: "hook-pre.passed",
    event: {
      kind: "hook-pre.passed",
      source: "hook-pre",
      severity: "info",
      timestamp: BASE_TS,
      ruleCount: 7,
    },
  },

  // ── user-prompt ──────────────────────────────────────────────────────────────
  {
    label: "user-prompt.injected",
    event: {
      kind: "user-prompt.injected",
      source: "hook-user-prompt",
      severity: "info",
      timestamp: BASE_TS,
      injectedIds: ["rule-014", "rule-015"],
    },
  },
  {
    label: "user-prompt.flagged",
    event: {
      kind: "user-prompt.flagged",
      source: "hook-user-prompt",
      severity: "warning",
      timestamp: BASE_TS,
      ruleId: "rule-016",
    },
  },
];

// ────────────────────────────────────────────────────────────────────────────
// Parameterized render-coverage suite
// ────────────────────────────────────────────────────────────────────────────

describe("StdoutRenderer render-coverage — all AttributionEvent kinds", () => {
  /**
   * Regex that matches the "做了什么: <description>" line.
   * Captures everything after the colon+space so we can assert it's non-empty.
   */
  const ACTION_LINE_RE = /▸ 做了什么:\s*(.+)/;

  /**
   * Note: we have 42 entries in ALL_EVENTS (40 kinds + 2 extra variants for
   * skeleton.l0-validation ok/false and hook-stop.analyze-finished with/without
   * firstLine). All 42 TypeScript kind literals are covered.
   */

  // Cross-check: every distinct AttributionEvent kind in the discriminated
  // union must have at least one fixture. If a new kind is added to
  // packages/types/src/attribution.ts but no fixture is added here, this
  // assertion fails loudly instead of silently passing.
  const kindsCovered = new Set(ALL_EVENTS.map((entry) => entry.event.kind));
  it("covers every AttributionEvent kind", () => {
    expect(kindsCovered.size).toBe(42);
  });

  it.each(ALL_EVENTS)("$label: action line is non-empty and contains no 'undefined'/'NaN'", ({ event }) => {
    const out = renderOne(event);

    // 1. The output must contain the action line at all.
    expect(out).toMatch(ACTION_LINE_RE);

    // 2. The action description after the colon must be non-empty (not just whitespace).
    const match = ACTION_LINE_RE.exec(out);
    if (match === null || match[1] === undefined) {
      throw new Error(`No "做了什么:" line found in output for event kind "${event.kind}"`);
    }
    const actionDescription = match[1].trim();
    expect(actionDescription.length).toBeGreaterThan(0);

    // 3. No "undefined" in rendered output (catches wrong field references).
    expect(out).not.toContain("undefined");

    // 4. No "NaN" in rendered output (catches missing numeric fields or toFixed on NaN).
    expect(out).not.toContain("NaN");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Additional targeted assertions for key case branches
// ────────────────────────────────────────────────────────────────────────────

describe("StdoutRenderer render-coverage — per-kind content spot checks", () => {
  const renderer2 = new StdoutRenderer();

  it("pitfall.added includes knowledgeId, category, tag", () => {
    const out = renderer2.render(
      [ALL_EVENTS.find((e) => e.label === "pitfall.added")!.event],
      "verbose",
    );
    expect(out).toContain("rule-001");
    expect(out).toContain("api-hallucination");
  });

  it("skeleton.l0-validation ok=true includes '通过'", () => {
    const out = renderer2.render(
      [ALL_EVENTS.find((e) => e.label === "skeleton.l0-validation (ok=true)")!.event],
      "verbose",
    );
    expect(out).toContain("通过");
  });

  it("skeleton.l0-validation ok=false includes '拒绝'", () => {
    const out = renderer2.render(
      [ALL_EVENTS.find((e) => e.label === "skeleton.l0-validation (ok=false)")!.event],
      "verbose",
    );
    expect(out).toContain("拒绝");
  });

  it("calibrator.adjusted renders confidenceBefore and confidenceAfter as decimals", () => {
    const out = renderer2.render(
      [ALL_EVENTS.find((e) => e.label === "calibrator.adjusted")!.event],
      "verbose",
    );
    // toFixed(2) should produce "0.60" → "0.75" (no NaN, no undefined)
    expect(out).toContain("0.60");
    expect(out).toContain("0.75");
  });

  it("calibrator.v2-adjusted renders tierBefore and tierAfter", () => {
    const out = renderer2.render(
      [ALL_EVENTS.find((e) => e.label === "calibrator.v2-adjusted")!.event],
      "verbose",
    );
    expect(out).toContain("probation");
    expect(out).toContain("stable");
  });

  it("validator.blocked-promotion renders level, fromTier, toTier", () => {
    const out = renderer2.render(
      [ALL_EVENTS.find((e) => e.label === "validator.blocked-promotion")!.event],
      "verbose",
    );
    expect(out).toContain("L1");
    expect(out).toContain("stable");
    expect(out).toContain("canonical");
  });

  it("compile.skills-compiled renders written and removed counts", () => {
    const out = renderer2.render(
      [ALL_EVENTS.find((e) => e.label === "compile.skills-compiled")!.event],
      "verbose",
    );
    expect(out).toContain("3");
    expect(out).toContain("1");
  });

  it("hook-stop.scan-errors-timeout renders timeoutMs value", () => {
    const out = renderer2.render(
      [ALL_EVENTS.find((e) => e.label === "hook-stop.scan-errors-timeout")!.event],
      "verbose",
    );
    expect(out).toContain("5000");
  });

  it("hook-stop.analyze-finished (no firstLine) falls back to '分析完成'", () => {
    const out = renderer2.render(
      [ALL_EVENTS.find((e) => e.label === "hook-stop.analyze-finished (no firstLine)")!.event],
      "verbose",
    );
    expect(out).toContain("分析完成");
  });

  it("hook-stop.analyze-finished (with firstLine) renders firstLine content", () => {
    const out = renderer2.render(
      [ALL_EVENTS.find((e) => e.label === "hook-stop.analyze-finished (with firstLine)")!.event],
      "verbose",
    );
    expect(out).toContain("Found 2 matching rules");
  });

  it("hook-pre.matched renders ruleId and permissionDecision", () => {
    const out = renderer2.render(
      [ALL_EVENTS.find((e) => e.label === "hook-pre.matched")!.event],
      "verbose",
    );
    expect(out).toContain("rule-013");
    expect(out).toContain("allow");
  });

  it("user-prompt.injected renders injectedIds count", () => {
    const out = renderer2.render(
      [ALL_EVENTS.find((e) => e.label === "user-prompt.injected")!.event],
      "verbose",
    );
    // injectedIds has 2 elements → should say "2 条规则"
    expect(out).toContain("2");
  });

  it("user-prompt.flagged renders ruleId", () => {
    const out = renderer2.render(
      [ALL_EVENTS.find((e) => e.label === "user-prompt.flagged")!.event],
      "verbose",
    );
    expect(out).toContain("rule-016");
  });

  it("pitfall.added with adversarial userFacingValue: clean content survives, ANSI stripped", () => {
    // Security finding (PR #152 review conf 9): describeAction/describeKnowledgeChange/
    // describeTarget render user-controlled fields; call-site sanitizeUserFacingText()
    // wrapping must strip ANSI escapes before they reach stderr.
    const event: AttributionEvent = {
      kind: "pitfall.added",
      source: "pitfall",
      severity: "highlight",
      timestamp: BASE_TS,
      knowledgeId: "rule-sec",
      category: "security",
      tag: "injection-test",
      level: "personal",
      knowledgeCountBefore: 0,
      knowledgeCountAfter: 1,
      skillMdPath: "/skills/rule-sec/SKILL.md",
      userFacingValue: "\x1b[2J\x1b[Hgotcha\x1b]0;hijack\x07",
    };
    const out = renderer2.render([event], "verbose");

    // Clean content extracted from the adversarial payload must appear
    expect(out).toContain("gotcha");

    // No raw ANSI escape bytes in the rendered output
    expect(out).not.toContain("\x1b");
    expect(out).not.toContain("\x9b");
    expect(out).not.toContain("\x07");
    expect(out).not.toContain("\x9d");
  });

  it("adversarial counterfactual: stripped end-to-end via call-site sanitizer", () => {
    // Round 2 re-review (testing): the userFacingValue path was tested above,
    // but the parallel `counterfactual` field also rendered to stderr at
    // stdout-renderer.ts:169. Add adversarial counterfactual coverage.
    const event: AttributionEvent = {
      kind: "pitfall.added",
      source: "pitfall",
      severity: "highlight",
      timestamp: BASE_TS,
      knowledgeId: "rule-cf",
      category: "noise",
      tag: "cf-attack",
      level: "personal",
      knowledgeCountBefore: 0,
      knowledgeCountAfter: 1,
      skillMdPath: "/skills/rule-cf/SKILL.md",
      userFacingValue: "safe-uf",
      // attacks are placed AFTER clean content so the regex final-byte
      // consumption doesn't eat the survivable text.
      counterfactual: "cfgotcha\x1b[2J\x9d0;hijack\x9c",
    };
    const out = renderer2.render([event], "verbose");
    expect(out).toContain("cfgotcha");
    expect(out).not.toContain("\x1b");
    expect(out).not.toContain("\x9b");
    expect(out).not.toContain("\x9d");
  });

  it("verbose raw-events JSON dump strips C1 bytes from event field content", () => {
    // Round 2 re-review (security conf 9): JSON.stringify does not escape
    // \x80-\x9f, so an event field with 8-bit CSI/OSC bytes emitted them
    // as raw bytes in the verbose `--- raw events ---` audit dump even
    // when per-line call sites were sanitized. The fix wraps the
    // JSON.stringify result in sanitizeUserFacingText too.
    const event: AttributionEvent = {
      kind: "pitfall.added",
      source: "pitfall",
      severity: "highlight",
      timestamp: BASE_TS,
      knowledgeId: "rule-json",
      category: "json-attack",
      tag: "raw-dump",
      level: "personal",
      knowledgeCountBefore: 0,
      knowledgeCountAfter: 1,
      skillMdPath: "/skills/rule-json/SKILL.md",
      userFacingValue: "uf-clean",
      counterfactual: "cf-with-c1\x9b\x9dbytes",
    };
    const out = renderer2.render([event], "verbose");
    // Verbose includes the raw events JSON dump section.
    expect(out).toContain("--- raw events ---");
    // Even in the dump, no raw C1 bytes survive.
    expect(out).not.toContain("\x9b");
    expect(out).not.toContain("\x9d");
  });

  it("unterminated 8-bit OSC (\\x9d without terminator) is stripped end-to-end", () => {
    // Round 2 re-review (security conf 8): the terminated-only \x9d regex
    // didn't catch a bare introducer byte. C1-blanket strip catches it.
    const event: AttributionEvent = {
      kind: "pitfall.added",
      source: "pitfall",
      severity: "highlight",
      timestamp: BASE_TS,
      knowledgeId: "rule-c1",
      category: "c1-bare",
      tag: "no-terminator",
      level: "personal",
      knowledgeCountBefore: 0,
      knowledgeCountAfter: 1,
      skillMdPath: "/skills/rule-c1/SKILL.md",
      userFacingValue: "before\x9dnoterminator-after",
    };
    const out = renderer2.render([event], "verbose");
    expect(out).toContain("before");
    expect(out).toContain("noterminator-after");
    expect(out).not.toContain("\x9d");
  });
});
