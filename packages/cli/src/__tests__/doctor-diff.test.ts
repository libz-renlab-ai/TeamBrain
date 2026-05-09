// packages/cli/src/__tests__/doctor-diff.test.ts
// Issue #172: unified diff renderer for `doctor --fix --dry-run`.
import { describe, it, expect } from "vitest";
import { unifiedDiff } from "../commands/doctor-diff.js";

describe("unifiedDiff", () => {
  it("returns empty string when before === after", () => {
    expect(unifiedDiff("/foo", "abc\n", "abc\n")).toBe("");
    expect(unifiedDiff("/foo", "", "")).toBe("");
  });

  it("renders pure deletion in the middle of a file", () => {
    const before = ["a", "b", "c", "d", "e", "f", "g"].join("\n");
    const after = ["a", "b", "c", "g"].join("\n");
    const out = unifiedDiff("/x.md", before, after);
    expect(out).toContain("--- /x.md");
    expect(out).toContain("+++ /x.md");
    // Should mark d/e/f as deleted
    expect(out).toContain("-d");
    expect(out).toContain("-e");
    expect(out).toContain("-f");
    // Should keep c and g as context (with leading space)
    expect(out).toContain(" c");
    expect(out).toContain(" g");
    // Hunk header present
    expect(out).toMatch(/^@@ -\d+,\d+ \+\d+,\d+ @@$/m);
  });

  it("renders pure insertion", () => {
    const before = ["a", "b"].join("\n");
    const after = ["a", "x", "y", "b"].join("\n");
    const out = unifiedDiff("/x.md", before, after);
    expect(out).toContain("+x");
    expect(out).toContain("+y");
    expect(out).toContain(" a");
    expect(out).toContain(" b");
  });

  it("uses /dev/null in +++ header when after === null (deletion)", () => {
    const out = unifiedDiff("/x.md", "abc\ndef\n", null);
    expect(out).toContain("--- /x.md");
    expect(out).toContain("+++ /dev/null");
    expect(out).toContain("-abc");
    expect(out).toContain("-def");
  });

  it("splits into multiple hunks when eq run between changes exceeds 2*context", () => {
    // 1 changed line, then 10 unchanged, then 1 changed line. context=3 → split
    const beforeLines = ["DEL1"];
    const afterLines = ["INS1"];
    for (let i = 0; i < 10; i++) {
      beforeLines.push(`mid${i}`);
      afterLines.push(`mid${i}`);
    }
    beforeLines.push("DEL2");
    afterLines.push("INS2");
    const before = beforeLines.join("\n");
    const after = afterLines.join("\n");
    const out = unifiedDiff("/x.md", before, after, 3);
    const hunkHeaders = out.match(/^@@ /gm) ?? [];
    expect(hunkHeaders.length).toBe(2);
    expect(out).toContain("-DEL1");
    expect(out).toContain("+INS1");
    expect(out).toContain("-DEL2");
    expect(out).toContain("+INS2");
  });

  it("merges adjacent change ranges into one hunk", () => {
    // 1 changed line, then 2 unchanged, then 1 changed. 2 < 2*3, should merge.
    const before = ["A", "ctx1", "ctx2", "B"].join("\n");
    const after = ["X", "ctx1", "ctx2", "Y"].join("\n");
    const out = unifiedDiff("/x.md", before, after, 3);
    const hunkHeaders = out.match(/^@@ /gm) ?? [];
    expect(hunkHeaders.length).toBe(1);
  });

  it("hunk old/new counts match number of -/eq and +/eq lines", () => {
    const before = ["a", "b", "c", "d"].join("\n");
    const after = ["a", "X", "c", "d"].join("\n");
    const out = unifiedDiff("/x.md", before, after);
    const header = out.match(/^@@ -(\d+),(\d+) \+(\d+),(\d+) @@$/m);
    expect(header).not.toBeNull();
    const oldCount = parseInt(header![2]!, 10);
    const newCount = parseInt(header![4]!, 10);
    // Extract the hunk body lines (after the header)
    const bodyLines = out.split("\n");
    const headerIdx = bodyLines.findIndex((l) => l.startsWith("@@"));
    const body = bodyLines.slice(headerIdx + 1).filter((l) => l.length > 0);
    const minus = body.filter((l) => l.startsWith("-")).length;
    const plus = body.filter((l) => l.startsWith("+")).length;
    const eq = body.filter((l) => l.startsWith(" ")).length;
    expect(oldCount).toBe(minus + eq);
    expect(newCount).toBe(plus + eq);
  });
});
