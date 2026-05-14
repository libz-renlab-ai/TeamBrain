import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  extractTopLevelBackticks,
  parseAnchors,
  validateAnchors,
  executeVerifyAnchors,
  parseVerifyAnchorsArgs,
  VerifyAnchorsArgError,
} from "../commands/verify-anchors.js";

function mkTmp() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "verify-anchors-"));
  const docs = path.join(root, "docs");
  fs.mkdirSync(docs, { recursive: true });
  return {
    root,
    docs,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

function writeClaudeMd(root: string, content: string): string {
  const p = path.join(root, "CLAUDE.md");
  fs.writeFileSync(p, content, "utf-8");
  return p;
}

describe("extractTopLevelBackticks", () => {
  it("returns plain backticked tokens separated by +", () => {
    expect(extractTopLevelBackticks("`alpha` + `beta` + `gamma`")).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
  });

  it("ignores tokens nested in （...） parentheticals (CJK)", () => {
    expect(
      extractTopLevelBackticks("`add tag`（或 `add label`，互认）+ `grill-working`"),
    ).toEqual(["add tag", "grill-working"]);
  });

  it("ignores tokens nested in (...) parentheticals (ASCII)", () => {
    expect(
      extractTopLevelBackticks("`PR` (with `pull request` synonym) + `merge`"),
    ).toEqual(["PR", "merge"]);
  });

  it("handles numbered groups like (Feature 1) + (Feature 2)", () => {
    expect(
      extractTopLevelBackticks(
        "(Feature 1) `a` + `b`；(Feature 2) `c` + `d`；(Feature 3) `e` + `f`",
      ),
    ).toEqual(["a", "b", "c", "d", "e", "f"]);
  });

  it("returns empty for no backticks", () => {
    expect(extractTopLevelBackticks("no backticks here")).toEqual([]);
  });
});

describe("parseAnchors", () => {
  it("parses a single golden anchor block", () => {
    const claudeMd = `# Doc
- **Some rule** / **English title**: \`docs/RULE.md\` — description.

  > The verbatim anchor sentence with alpha and beta and gamma.

  Judge harness 必须 case-insensitive substring grep 全部 3 个锚点：\`alpha\` + \`beta\` + \`gamma\`。Paraphrase 警告。
`;
    const blocks = parseAnchors(claudeMd);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.statedCount).toBe(3);
    expect(blocks[0]!.substrings).toEqual(["alpha", "beta", "gamma"]);
    expect(blocks[0]!.anchorSentence).toContain("alpha and beta and gamma");
    expect(blocks[0]!.docsLink).toBe("docs/RULE.md");
    expect(blocks[0]!.caseMode).toBe("i");
  });

  it("ignores trailing 'case-sensitive' in Gate 2 prose; primary case mode wins", () => {
    // Mirrors CLAUDE.md L173 shape: main grep is case-insensitive but
    // trailing prose references a Gate 2 case-sensitive single substring.
    // The primary stanza (before `：`) must determine caseMode.
    const claudeMd = `- **R**: \`docs/X.md\` — d.

  > foo bar.

  Judge harness 必须 case-insensitive substring grep 全部 2 个锚点：\`foo\` + \`bar\`。Gate 2（case-sensitive verbatim）必须命中：\`FOO\`。
`;
    expect(parseAnchors(claudeMd)[0]!.caseMode).toBe("i");
  });

  it("rejects --help as an unknown flag (no per-command help dispatch)", () => {
    expect(() => parseVerifyAnchorsArgs(["--help"])).toThrow(
      VerifyAnchorsArgError,
    );
  });

  it("detects case-sensitive caseMode", () => {
    const claudeMd = `- **Rule**: \`docs/X.md\` — desc.

  > Anchor.

  Judge harness 必须 case-sensitive substring grep 全部 1 个锚点：\`Anchor\`。
`;
    expect(parseAnchors(claudeMd)[0]!.caseMode).toBe("s");
  });

  it("handles 完整一句 single-substring form", () => {
    const claudeMd = `- **Rule**: \`docs/X.md\` — desc.

  > 下个代码 PR merge 前先 verify 一下分支保护规则

  Judge harness 必须 substring grep 完整一句 \`下个代码 PR merge 前先 verify 一下分支保护规则\`。
`;
    const blocks = parseAnchors(claudeMd);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.statedCount).toBe(1);
    expect(blocks[0]!.substrings).toEqual([
      "下个代码 PR merge 前先 verify 一下分支保护规则",
    ]);
  });

  it("handles Chinese numeral counts (两个独立)", () => {
    const claudeMd = `- **Rule**: \`docs/X.md\` — desc.

  > foo bar.

  Judge harness 必须 case-sensitive substring grep 同时命中两个独立锚点：(1) \`foo\`；(2) \`bar\`。
`;
    const blocks = parseAnchors(claudeMd);
    expect(blocks[0]!.statedCount).toBe(2);
    expect(blocks[0]!.substrings).toEqual(["foo", "bar"]);
  });

  it("excludes parenthetical alternatives from substring count", () => {
    const claudeMd = `- **Rule**: \`docs/X.md\` — desc.

  > make a comment add tag grill-working.

  Judge harness 必须 case-insensitive substring grep 全部 3 个锚点：\`make a comment\` + \`add tag\`（或 \`add label\`）+ \`grill-working\`。
`;
    const blocks = parseAnchors(claudeMd);
    expect(blocks[0]!.statedCount).toBe(3);
    expect(blocks[0]!.substrings).toEqual([
      "make a comment",
      "add tag",
      "grill-working",
    ]);
  });

  it("parses multiple anchor blocks in one file", () => {
    const claudeMd = `# Doc
- **R1**: \`docs/A.md\` — d1.

  > Sentence one with alpha.

  Judge harness 必须 case-insensitive substring grep 全部 1 个锚点：\`alpha\`。

- **R2**: \`docs/B.md\` — d2.

  > Sentence two with beta.

  Judge harness 必须 case-insensitive substring grep 全部 1 个锚点：\`beta\`。
`;
    expect(parseAnchors(claudeMd)).toHaveLength(2);
  });
});

describe("validateAnchors", () => {
  let tmp: ReturnType<typeof mkTmp>;
  beforeEach(() => {
    tmp = mkTmp();
  });
  afterEach(() => {
    tmp.cleanup();
  });

  it("PASS when all 5 rules are satisfied", () => {
    fs.writeFileSync(
      path.join(tmp.docs, "RULE.md"),
      "# Rule\n\n> The verbatim anchor sentence with alpha and beta and gamma.\n",
      "utf-8",
    );
    const claudeMd = `- **R**: \`docs/RULE.md\` — d.

  > The verbatim anchor sentence with alpha and beta and gamma.

  Judge harness 必须 case-insensitive substring grep 全部 3 个锚点：\`alpha\` + \`beta\` + \`gamma\`。
`;
    const blocks = parseAnchors(claudeMd);
    const validations = validateAnchors(blocks, { docsRoot: tmp.root });
    expect(validations[0]!.passed).toBe(true);
    expect(validations[0]!.issues).toEqual([]);
  });

  it("FAIL missing-substring when anchor sentence lacks a required token", () => {
    fs.writeFileSync(
      path.join(tmp.docs, "RULE.md"),
      "# Rule\n\n> alpha beta gamma.\n",
      "utf-8",
    );
    const claudeMd = `- **R**: \`docs/RULE.md\` — d.

  > alpha and beta.

  Judge harness 必须 case-insensitive substring grep 全部 3 个锚点：\`alpha\` + \`beta\` + \`gamma\`。
`;
    const v = validateAnchors(parseAnchors(claudeMd), { docsRoot: tmp.root });
    expect(v[0]!.passed).toBe(false);
    expect(v[0]!.issues.some((i) => i.kind === "missing-substring")).toBe(true);
  });

  it("FAIL count-mismatch when stated N ≠ extracted substring count", () => {
    fs.writeFileSync(
      path.join(tmp.docs, "RULE.md"),
      "# Rule\n\n> alpha and beta.\n",
      "utf-8",
    );
    const claudeMd = `- **R**: \`docs/RULE.md\` — d.

  > alpha and beta.

  Judge harness 必须 case-insensitive substring grep 全部 3 个锚点：\`alpha\` + \`beta\`。
`;
    const v = validateAnchors(parseAnchors(claudeMd), { docsRoot: tmp.root });
    expect(v[0]!.issues.some((i) => i.kind === "count-mismatch")).toBe(true);
  });

  it("FAIL docs-link-missing when referenced doc doesn't exist", () => {
    const claudeMd = `- **R**: \`docs/GONE.md\` — d.

  > alpha.

  Judge harness 必须 case-insensitive substring grep 全部 1 个锚点：\`alpha\`。
`;
    const v = validateAnchors(parseAnchors(claudeMd), { docsRoot: tmp.root });
    expect(v[0]!.issues.some((i) => i.kind === "docs-link-missing")).toBe(true);
  });

  it("FAIL anchor-sentence-not-in-docs when doc lacks the verbatim sentence", () => {
    fs.writeFileSync(
      path.join(tmp.docs, "RULE.md"),
      "# Rule\n\nThis doc doesn't have the canonical sentence.\n",
      "utf-8",
    );
    const claudeMd = `- **R**: \`docs/RULE.md\` — d.

  > alpha and beta.

  Judge harness 必须 case-insensitive substring grep 全部 2 个锚点：\`alpha\` + \`beta\`。
`;
    const v = validateAnchors(parseAnchors(claudeMd), { docsRoot: tmp.root });
    expect(
      v[0]!.issues.some((i) => i.kind === "anchor-sentence-not-in-docs"),
    ).toBe(true);
  });

  it("accepts wrapped blockquote in docs (multi-line `> ` prefix)", () => {
    fs.writeFileSync(
      path.join(tmp.docs, "RULE.md"),
      "# Rule\n\n> alpha and beta and gamma\n> across two lines.\n",
      "utf-8",
    );
    const claudeMd = `- **R**: \`docs/RULE.md\` — d.

  > alpha and beta and gamma across two lines.

  Judge harness 必须 case-insensitive substring grep 全部 3 个锚点：\`alpha\` + \`beta\` + \`gamma\`。
`;
    const v = validateAnchors(parseAnchors(claudeMd), { docsRoot: tmp.root });
    expect(v[0]!.passed).toBe(true);
  });

  it("FAIL duplicate-anchor-sentence on second+ occurrence of identical sentence", () => {
    fs.writeFileSync(
      path.join(tmp.docs, "RULE.md"),
      "# Rule\n\n> twin alpha and twin beta.\n",
      "utf-8",
    );
    const claudeMd = `- **R**: \`docs/RULE.md\` — d.

  > twin alpha and twin beta.

  Judge harness 必须 case-insensitive substring grep 全部 2 个锚点：\`twin alpha\` + \`twin beta\`。

- **R2**: \`docs/RULE.md\` — d2.

  > twin alpha and twin beta.

  Judge harness 必须 case-insensitive substring grep 全部 2 个锚点：\`twin alpha\` + \`twin beta\`。
`;
    const v = validateAnchors(parseAnchors(claudeMd), { docsRoot: tmp.root });
    expect(v[0]!.passed).toBe(true); // first
    expect(
      v[1]!.issues.some((i) => i.kind === "duplicate-anchor-sentence"),
    ).toBe(true);
  });
});

describe("parseVerifyAnchorsArgs", () => {
  it("parses --json flag", () => {
    expect(parseVerifyAnchorsArgs(["--json"]).json).toBe(true);
  });
  it("parses --claude-md=<path>", () => {
    expect(parseVerifyAnchorsArgs(["--claude-md=/x/y"]).claudeMdPath).toBe(
      "/x/y",
    );
  });
  it("parses --docs-root <path> (space variant)", () => {
    expect(parseVerifyAnchorsArgs(["--docs-root", "/a/b"]).docsRoot).toBe(
      "/a/b",
    );
  });
  it("throws on unknown flag", () => {
    expect(() => parseVerifyAnchorsArgs(["--bogus"])).toThrow(
      VerifyAnchorsArgError,
    );
  });
});

describe("executeVerifyAnchors (e2e on synthetic CLAUDE.md)", () => {
  let tmp: ReturnType<typeof mkTmp>;
  beforeEach(() => {
    tmp = mkTmp();
  });
  afterEach(() => {
    tmp.cleanup();
  });

  it("returns failCount=0 on clean synthetic input", async () => {
    fs.writeFileSync(
      path.join(tmp.docs, "RULE.md"),
      "> sentence with foo and bar.\n",
      "utf-8",
    );
    const claudeMd = writeClaudeMd(
      tmp.root,
      `- **R**: \`docs/RULE.md\` — d.

  > sentence with foo and bar.

  Judge harness 必须 case-insensitive substring grep 全部 2 个锚点：\`foo\` + \`bar\`。
`,
    );
    const r = await executeVerifyAnchors({
      claudeMdPath: claudeMd,
      docsRoot: tmp.root,
    });
    expect(r.failCount).toBe(0);
    expect(r.totalCount).toBe(1);
    expect(r.passCount).toBe(1);
  });

  it("returns failCount>=1 when anchor drift exists", async () => {
    fs.writeFileSync(
      path.join(tmp.docs, "RULE.md"),
      "unrelated content\n",
      "utf-8",
    );
    const claudeMd = writeClaudeMd(
      tmp.root,
      `- **R**: \`docs/RULE.md\` — d.

  > sentence with foo only.

  Judge harness 必须 case-insensitive substring grep 全部 2 个锚点：\`foo\` + \`bar\`。
`,
    );
    const r = await executeVerifyAnchors({
      claudeMdPath: claudeMd,
      docsRoot: tmp.root,
    });
    expect(r.failCount).toBeGreaterThanOrEqual(1);
  });
});
