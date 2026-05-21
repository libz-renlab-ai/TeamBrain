import {
  init_esm_shims
} from "./chunk-ZWU7KJPP.js";

// ../cli/src/commands/verify-anchors.ts
init_esm_shims();
import fs from "fs";
import path from "path";
var VerifyAnchorsArgError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "VerifyAnchorsArgError";
  }
};
var KNOWN_FLAGS = /* @__PURE__ */ new Set(["--json", "--claude-md", "--docs-root"]);
function parseVerifyAnchorsArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") {
      opts.json = true;
    } else if (a === "--claude-md" && argv[i + 1]) {
      opts.claudeMdPath = argv[i + 1];
      i++;
    } else if (a.startsWith("--claude-md=")) {
      opts.claudeMdPath = a.slice("--claude-md=".length);
    } else if (a === "--docs-root" && argv[i + 1]) {
      opts.docsRoot = argv[i + 1];
      i++;
    } else if (a.startsWith("--docs-root=")) {
      opts.docsRoot = a.slice("--docs-root=".length);
    } else if (a.startsWith("--")) {
      const base = a.split("=")[0];
      if (!KNOWN_FLAGS.has(base)) {
        throw new VerifyAnchorsArgError(
          `verify-anchors: unknown flag "${a}". Run 'teamagent --help' for valid flags.`
        );
      }
    }
  }
  return opts;
}
var CN_NUM = {
  \u4E00: 1,
  \u4E24: 2,
  \u4E8C: 2,
  \u4E09: 3,
  \u56DB: 4,
  \u4E94: 5,
  \u516D: 6,
  \u4E03: 7,
  \u516B: 8,
  \u4E5D: 9,
  \u5341: 10
};
function parseCount(s) {
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  return CN_NUM[s] ?? null;
}
function extractTopLevelBackticks(text) {
  const out = [];
  let depth = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\uFF08" || ch === "(") {
      depth++;
      i++;
      continue;
    }
    if (ch === "\uFF09" || ch === ")") {
      if (depth > 0) depth--;
      i++;
      continue;
    }
    if (ch === "`" && depth === 0) {
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
function parseAnchors(content) {
  const lines = content.split(/\r?\n/);
  const blocks = [];
  const judgeRegex = /Judge harness[^\n]*grep/;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!judgeRegex.test(line)) continue;
    let statedCount = null;
    let substrings = [];
    const fullSentence = /必须\s*substring\s*grep\s*完整一句\s*`([^`]+)`/.exec(line);
    if (fullSentence) {
      statedCount = 1;
      substrings = [fullSentence[1]];
    } else {
      const countMatch = /(?:全部|同时命中下列|同时命中)\s*(\d+|一|两|二|三|四|五|六|七|八|九|十)\s*个[^：]*[：]/u.exec(
        line
      );
      if (!countMatch) continue;
      statedCount = parseCount(countMatch[1]);
      if (statedCount == null) continue;
      const colonIdx = line.indexOf("\uFF1A", countMatch.index);
      if (colonIdx < 0) continue;
      const periodIdx = line.indexOf("\u3002", colonIdx);
      const listSection = periodIdx > colonIdx ? line.slice(colonIdx + 1, periodIdx) : line.slice(colonIdx + 1);
      substrings = extractTopLevelBackticks(listSection);
    }
    let caseMode = "i";
    const caseStanzaEnd = line.indexOf("\uFF1A");
    const caseStanza = caseStanzaEnd > 0 ? line.slice(0, caseStanzaEnd) : line;
    if (/case-sensitive/i.test(caseStanza)) caseMode = "s";
    else if (/case-insensitive/i.test(caseStanza)) caseMode = "i";
    let anchorLine = -1;
    let anchorSentenceParts = [];
    for (let j = i - 1; j >= 0; j--) {
      const m = /^(\s*)>\s?(.*)$/.exec(lines[j]);
      if (m) {
        let start = j;
        while (start - 1 >= 0 && /^(\s*)>\s?/.test(lines[start - 1])) start--;
        for (let k = start; k <= j; k++) {
          const mm = /^(\s*)>\s?(.*)$/.exec(lines[k]);
          if (mm) anchorSentenceParts.push(mm[2]);
        }
        anchorLine = start + 1;
        break;
      }
    }
    const anchorSentence = anchorSentenceParts.join(" ").trim();
    let docsLink = null;
    for (let j = i - 1; j >= Math.max(0, i - 60); j--) {
      const lineJ = lines[j];
      const bulletMatch = /^-\s+\*\*[^*]+\*\*\s*[:：]\s*`(docs\/[A-Za-z0-9_./-]+\.md)`/.exec(
        lineJ
      );
      if (bulletMatch) {
        docsLink = bulletMatch[1];
        break;
      }
      const inlineMatch = /`(docs\/[A-Za-z0-9_./-]+\.md)`/.exec(lineJ);
      if (inlineMatch && /^-\s/.test(lineJ)) {
        docsLink = inlineMatch[1];
        break;
      }
    }
    blocks.push({
      judgeLine: i + 1,
      statedCount,
      substrings,
      anchorSentence,
      anchorLine,
      caseMode,
      docsLink
    });
  }
  return blocks;
}
function validateAnchors(blocks, opts) {
  const validations = [];
  const sentenceFirstSeen = /* @__PURE__ */ new Map();
  for (const block of blocks) {
    const issues = [];
    const haystack = block.caseMode === "i" ? block.anchorSentence.toLowerCase() : block.anchorSentence;
    for (const sub of block.substrings) {
      const needle = block.caseMode === "i" ? sub.toLowerCase() : sub;
      if (!haystack.includes(needle)) {
        issues.push({
          kind: "missing-substring",
          detail: `substring not found in anchor sentence: \`${sub}\``
        });
      }
    }
    if (block.substrings.length !== block.statedCount) {
      issues.push({
        kind: "count-mismatch",
        detail: `stated count ${block.statedCount} but extracted ${block.substrings.length} substring(s)`
      });
    }
    let docsContent = null;
    if (block.docsLink) {
      const abs = path.resolve(opts.docsRoot, block.docsLink);
      if (!fs.existsSync(abs)) {
        issues.push({
          kind: "docs-link-missing",
          detail: `referenced ${block.docsLink} not found at ${abs}`
        });
      } else {
        docsContent = fs.readFileSync(abs, "utf-8");
      }
    }
    if (docsContent != null && block.anchorSentence) {
      const stripBlockquote = (s) => s.split(/\r?\n/).map((l) => l.replace(/^\s*>\s?/, "")).join("\n");
      const normalize = (s) => s.replace(/\s+/g, " ").trim();
      const haystackNorm = normalize(stripBlockquote(docsContent));
      const needleNorm = normalize(block.anchorSentence);
      const found = block.caseMode === "i" ? haystackNorm.toLowerCase().includes(needleNorm.toLowerCase()) : haystackNorm.includes(needleNorm);
      if (!found && needleNorm.length > 0) {
        issues.push({
          kind: "anchor-sentence-not-in-docs",
          detail: `anchor sentence not found verbatim in ${block.docsLink} (whitespace + blockquote-prefix normalized substring match)`
        });
      }
    }
    if (block.anchorSentence) {
      const key = block.anchorSentence.toLowerCase().replace(/\s+/g, " ").trim();
      const first = sentenceFirstSeen.get(key);
      if (first != null) {
        issues.push({
          kind: "duplicate-anchor-sentence",
          detail: `anchor sentence duplicates the one starting at line ${first}`
        });
      } else {
        sentenceFirstSeen.set(key, block.judgeLine);
      }
    }
    validations.push({
      block,
      passed: issues.length === 0,
      issues
    });
  }
  return validations;
}
async function executeVerifyAnchors(opts = {}) {
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
    totalCount: blocks.length
  };
}
function renderVerifyAnchorsTerminal(r) {
  const lines = [];
  lines.push("\u{1F4D0} TeamAgent verify-anchors");
  lines.push(`   source: ${r.claudeMdPath}`);
  lines.push("");
  for (const v of r.validations) {
    const sym = v.passed ? "\u2713" : "\u2717";
    const head = v.block.docsLink ?? `(no docs link found near line ${v.block.judgeLine})`;
    lines.push(
      `  ${sym} L${v.block.judgeLine.toString().padStart(3)}  ${head.padEnd(48)} [${v.block.substrings.length}/${v.block.statedCount}]`
    );
    for (const issue of v.issues) {
      lines.push(`        \u26A0 ${issue.kind}: ${issue.detail}`);
    }
  }
  lines.push("");
  lines.push("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
  lines.push(`  PASS: ${r.passCount} / ${r.totalCount}`);
  lines.push(`  FAIL: ${r.failCount} / ${r.totalCount}`);
  lines.push("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
  return lines.join("\n") + "\n";
}
function renderVerifyAnchorsJson(r) {
  return JSON.stringify(r, null, 2) + "\n";
}

export {
  VerifyAnchorsArgError,
  parseVerifyAnchorsArgs,
  extractTopLevelBackticks,
  parseAnchors,
  validateAnchors,
  executeVerifyAnchors,
  renderVerifyAnchorsTerminal,
  renderVerifyAnchorsJson
};
