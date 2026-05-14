import fs from "node:fs";
import path from "node:path";

export interface VerifyAnchorsOptions {
  /** Path to CLAUDE.md (default: <cwd>/CLAUDE.md). */
  claudeMdPath?: string;
  /** Project root used to resolve docs/*.md references (default: dirname of claudeMdPath). */
  docsRoot?: string;
  /** Emit JSON instead of pretty terminal output. */
  json?: boolean;
}

export type AnchorIssueKind =
  | "missing-substring"
  | "count-mismatch"
  | "docs-link-missing"
  | "duplicate-anchor-sentence"
  | "anchor-sentence-not-in-docs";

export interface AnchorIssue {
  kind: AnchorIssueKind;
  detail: string;
}

export interface AnchorBlock {
  /** 1-indexed line number where the Judge harness assertion starts. */
  judgeLine: number;
  /** Stated count from "全部 N 个锚点" / "完整一句"=1. */
  statedCount: number;
  /** Anchor substrings (top-level, outside parentheticals). */
  substrings: string[];
  /** Concatenated verbatim anchor sentence (blockquote content). */
  anchorSentence: string;
  /** 1-indexed line where the anchor sentence (first `> `) begins. */
  anchorLine: number;
  /** Case sensitivity hint declared in the Judge harness line. */
  caseMode: "i" | "s";
  /** docs/*.md path referenced in the surrounding bullet, if found. */
  docsLink: string | null;
}

export interface AnchorValidation {
  block: AnchorBlock;
  passed: boolean;
  issues: AnchorIssue[];
}

export interface VerifyAnchorsResult {
  claudeMdPath: string;
  blocks: AnchorBlock[];
  validations: AnchorValidation[];
  passCount: number;
  failCount: number;
  totalCount: number;
}

export class VerifyAnchorsArgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VerifyAnchorsArgError";
  }
}

const KNOWN_FLAGS = new Set(["--json", "--claude-md", "--docs-root"]);

export function parseVerifyAnchorsArgs(argv: string[]): VerifyAnchorsOptions {
  const opts: VerifyAnchorsOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--json") {
      opts.json = true;
    } else if (a === "--claude-md" && argv[i + 1]) {
      opts.claudeMdPath = argv[i + 1]!;
      i++;
    } else if (a.startsWith("--claude-md=")) {
      opts.claudeMdPath = a.slice("--claude-md=".length);
    } else if (a === "--docs-root" && argv[i + 1]) {
      opts.docsRoot = argv[i + 1]!;
      i++;
    } else if (a.startsWith("--docs-root=")) {
      opts.docsRoot = a.slice("--docs-root=".length);
    } else if (a.startsWith("--")) {
      const base = a.split("=")[0]!;
      if (!KNOWN_FLAGS.has(base)) {
        throw new VerifyAnchorsArgError(
          `verify-anchors: unknown flag "${a}". Run 'teamagent --help' for valid flags.`,
        );
      }
    }
  }
  return opts;
}

const CN_NUM: Record<string, number> = {
  一: 1,
  两: 2,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

function parseCount(s: string): number | null {
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  return CN_NUM[s] ?? null;
}

/**
 * Extract backticked tokens from `text` that are TOP-LEVEL (not nested inside
 * `（...）` / `(...)` parenthetical commentary). Parentheticals usually carry
 * alternatives / paraphrase warnings and are NOT separate anchors.
 */
export function extractTopLevelBackticks(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === "（" || ch === "(") {
      depth++;
      i++;
      continue;
    }
    if (ch === "）" || ch === ")") {
      if (depth > 0) depth--;
      i++;
      continue;
    }
    if (ch === "`" && depth === 0) {
      // capture until next backtick
      let j = i + 1;
      while (j < text.length && text[j] !== "`") j++;
      if (j < text.length) {
        out.push(text.slice(i + 1, j));
        i = j + 1;
        continue;
      }
    }
    i++;
  }
  return out;
}

/** Find anchor blocks (Judge harness assertion + nearest preceding blockquote). */
export function parseAnchors(content: string): AnchorBlock[] {
  const lines = content.split(/\r?\n/);
  const blocks: AnchorBlock[] = [];
  const judgeRegex = /Judge harness[^\n]*grep/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!judgeRegex.test(line)) continue;

    let statedCount: number | null = null;
    let substrings: string[] = [];

    // Variant 1: "完整一句 `...`" — single full-sentence anchor.
    const fullSentence = /必须\s*substring\s*grep\s*完整一句\s*`([^`]+)`/.exec(line);
    if (fullSentence) {
      statedCount = 1;
      substrings = [fullSentence[1]!];
    } else {
      // Variant 2: "全部 N 个 ...锚点" or "同时命中下列 N 个锚点" or "同时命中两个独立锚点".
      const countMatch =
        /(?:全部|同时命中下列|同时命中)\s*(\d+|一|两|二|三|四|五|六|七|八|九|十)\s*个[^：]*[：]/u.exec(
          line,
        );
      if (!countMatch) continue;
      statedCount = parseCount(countMatch[1]!);
      if (statedCount == null) continue;
      // substring list lives between this `：` and the first `。` after it.
      const colonIdx = line.indexOf("：", countMatch.index);
      if (colonIdx < 0) continue;
      const periodIdx = line.indexOf("。", colonIdx);
      const listSection =
        periodIdx > colonIdx
          ? line.slice(colonIdx + 1, periodIdx)
          : line.slice(colonIdx + 1);
      substrings = extractTopLevelBackticks(listSection);
    }

    // Case sensitivity hint. Look ONLY at the assertion stanza (before the
    // first `：` substring-list separator), not at trailing prose like the
    // Gate 2 mention in CLAUDE.md L173 which references a different case
    // mode for a secondary assertion. Defaults to "i" if neither tag appears.
    let caseMode: "i" | "s" = "i";
    const caseStanzaEnd = line.indexOf("：");
    const caseStanza = caseStanzaEnd > 0 ? line.slice(0, caseStanzaEnd) : line;
    if (/case-sensitive/i.test(caseStanza)) caseMode = "s";
    else if (/case-insensitive/i.test(caseStanza)) caseMode = "i";

    // Walk backward to find nearest blockquote (anchor sentence)
    let anchorLine = -1;
    let anchorSentenceParts: string[] = [];
    for (let j = i - 1; j >= 0; j--) {
      const m = /^(\s*)>\s?(.*)$/.exec(lines[j]!);
      if (m) {
        // Collect contiguous blockquote lines upward then we'll re-scan downward.
        // We mark the LAST blockquote line then walk back to find its start.
        let start = j;
        while (start - 1 >= 0 && /^(\s*)>\s?/.test(lines[start - 1]!)) start--;
        for (let k = start; k <= j; k++) {
          const mm = /^(\s*)>\s?(.*)$/.exec(lines[k]!);
          if (mm) anchorSentenceParts.push(mm[2]!);
        }
        anchorLine = start + 1;
        break;
      }
    }
    const anchorSentence = anchorSentenceParts.join(" ").trim();

    // Walk backward (broader window, up to 60 lines) to find the parent bullet's docs/*.md link
    let docsLink: string | null = null;
    for (let j = i - 1; j >= Math.max(0, i - 60); j--) {
      const lineJ = lines[j]!;
      // Pattern A: top-level bullet "- **title**: `docs/X.md` — ..."
      const bulletMatch = /^-\s+\*\*[^*]+\*\*\s*[:：]\s*`(docs\/[A-Za-z0-9_./-]+\.md)`/.exec(
        lineJ,
      );
      if (bulletMatch) {
        docsLink = bulletMatch[1]!;
        break;
      }
      // Pattern B: any embedded `docs/X.md` early in the bullet's intro
      const inlineMatch = /`(docs\/[A-Za-z0-9_./-]+\.md)`/.exec(lineJ);
      if (inlineMatch && /^-\s/.test(lineJ)) {
        docsLink = inlineMatch[1]!;
        break;
      }
    }

    blocks.push({
      judgeLine: i + 1,
      statedCount: statedCount!,
      substrings,
      anchorSentence,
      anchorLine,
      caseMode,
      docsLink,
    });
  }
  return blocks;
}

export function validateAnchors(
  blocks: AnchorBlock[],
  opts: { docsRoot: string },
): AnchorValidation[] {
  const validations: AnchorValidation[] = [];
  const sentenceFirstSeen = new Map<string, number>(); // key=normalized anchor sentence → judgeLine

  for (const block of blocks) {
    const issues: AnchorIssue[] = [];

    // (a) substring presence in anchor sentence
    const haystack =
      block.caseMode === "i"
        ? block.anchorSentence.toLowerCase()
        : block.anchorSentence;
    for (const sub of block.substrings) {
      const needle = block.caseMode === "i" ? sub.toLowerCase() : sub;
      if (!haystack.includes(needle)) {
        issues.push({
          kind: "missing-substring",
          detail: `substring not found in anchor sentence: \`${sub}\``,
        });
      }
    }

    // (b) stated count vs actual
    if (block.substrings.length !== block.statedCount) {
      issues.push({
        kind: "count-mismatch",
        detail: `stated count ${block.statedCount} but extracted ${block.substrings.length} substring(s)`,
      });
    }

    // (c) docs link resolves
    let docsContent: string | null = null;
    if (block.docsLink) {
      const abs = path.resolve(opts.docsRoot, block.docsLink);
      if (!fs.existsSync(abs)) {
        issues.push({
          kind: "docs-link-missing",
          detail: `referenced ${block.docsLink} not found at ${abs}`,
        });
      } else {
        docsContent = fs.readFileSync(abs, "utf-8");
      }
    }

    // (e) anchor-sentence drift between CLAUDE.md and referenced doc.
    // Strip `> ` blockquote prefixes from each doc line first, so wrapped
    // blockquotes in the doc still match the single-line anchor in CLAUDE.md.
    if (docsContent != null && block.anchorSentence) {
      const stripBlockquote = (s: string) =>
        s
          .split(/\r?\n/)
          .map((l) => l.replace(/^\s*>\s?/, ""))
          .join("\n");
      const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
      const haystackNorm = normalize(stripBlockquote(docsContent));
      const needleNorm = normalize(block.anchorSentence);
      const found =
        block.caseMode === "i"
          ? haystackNorm.toLowerCase().includes(needleNorm.toLowerCase())
          : haystackNorm.includes(needleNorm);
      if (!found && needleNorm.length > 0) {
        issues.push({
          kind: "anchor-sentence-not-in-docs",
          detail: `anchor sentence not found verbatim in ${block.docsLink} (whitespace + blockquote-prefix normalized substring match)`,
        });
      }
    }

    // (d) duplicate anchor sentence (only flag SECOND+ occurrences)
    if (block.anchorSentence) {
      const key = block.anchorSentence.toLowerCase().replace(/\s+/g, " ").trim();
      const first = sentenceFirstSeen.get(key);
      if (first != null) {
        issues.push({
          kind: "duplicate-anchor-sentence",
          detail: `anchor sentence duplicates the one starting at line ${first}`,
        });
      } else {
        sentenceFirstSeen.set(key, block.judgeLine);
      }
    }

    validations.push({
      block,
      passed: issues.length === 0,
      issues,
    });
  }

  return validations;
}

export async function executeVerifyAnchors(
  opts: VerifyAnchorsOptions = {},
): Promise<VerifyAnchorsResult> {
  const cwd = process.cwd();
  const claudeMdPath = opts.claudeMdPath ?? path.join(cwd, "CLAUDE.md");
  const docsRoot = opts.docsRoot ?? path.dirname(claudeMdPath);
  const content = fs.readFileSync(claudeMdPath, "utf-8");
  const blocks = parseAnchors(content);
  const validations = validateAnchors(blocks, { docsRoot });
  const passCount = validations.filter((v) => v.passed).length;
  const failCount = validations.length - passCount;
  return {
    claudeMdPath,
    blocks,
    validations,
    passCount,
    failCount,
    totalCount: blocks.length,
  };
}

export function renderVerifyAnchorsTerminal(r: VerifyAnchorsResult): string {
  const lines: string[] = [];
  lines.push("📐 TeamAgent verify-anchors");
  lines.push(`   source: ${r.claudeMdPath}`);
  lines.push("");
  for (const v of r.validations) {
    const sym = v.passed ? "✓" : "✗";
    const head =
      v.block.docsLink ?? `(no docs link found near line ${v.block.judgeLine})`;
    lines.push(
      `  ${sym} L${v.block.judgeLine.toString().padStart(3)}  ${head.padEnd(48)} [${v.block.substrings.length}/${v.block.statedCount}]`,
    );
    for (const issue of v.issues) {
      lines.push(`        ⚠ ${issue.kind}: ${issue.detail}`);
    }
  }
  lines.push("");
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push(`  PASS: ${r.passCount} / ${r.totalCount}`);
  lines.push(`  FAIL: ${r.failCount} / ${r.totalCount}`);
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  return lines.join("\n") + "\n";
}

export function renderVerifyAnchorsJson(r: VerifyAnchorsResult): string {
  return JSON.stringify(r, null, 2) + "\n";
}
