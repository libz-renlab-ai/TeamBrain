import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { TeamRuleFile } from "@teamagent/types";

/**
 * Mock LLM responder for the issue #332 L4 (end-to-end behavior change)
 * harness. Stands in for a real Claude session's PreToolUse decision in
 * hermetic tests of the m5-share / m5-sync propagation pipeline.
 *
 * Signature complexity: **keyword-substring** (ADR-0014/332.md decision #4
 * option (b)). The responder treats each alive `TeamRuleFile.current.content`
 * as a literal lowercase substring keyword, matched against every string
 * value reachable from `toolInput` (walked recursively, NOT JSON-encoded:
 * encoding would turn a real "\n" inside a rule into the two-char sequence
 * "\\n" in the haystack, silently breaking propagation for rules whose
 * content contains escape characters).
 *
 * Tombstones (`deleted:true`) are not citations. Citations are deduped on
 * `rule_id` and emitted in (author, file) lex order. Malformed JSON, shape
 * mismatches, and `EISDIR` (a directory accidentally named `*.json`) go via
 * the `onSkip` callback + the skipped counter; never thrown.
 *
 * Why a mock (not a real LLM call) for this layer:
 * - Hot path PR-gate must be hermetic + deterministic; real claudefast lives
 *   in slice 3 nightly with `scipy.stats.ttest_rel` ablation harness.
 * - Verdict is binary `{block, citations}` — same observable surface the real
 *   TeamBrain matcher exposes via attribution_events.
 */
export interface MockLlmResponderInput {
  /** B's project root (where `.teamagent/team/<author>/<rule_id>.json` lives). */
  projectRoot: string;
  /**
   * Tool name the (hypothetical) Claude session is about to invoke. Reserved
   * for slice 2b tool-name scoping; currently unused — the responder matches
   * across all rules regardless of `toolName`.
   */
  toolName: string;
  /**
   * Tool input payload; the responder walks every string value (recursively
   * through nested objects/arrays) and treats the union of those strings as
   * the haystack. Does NOT use JSON.stringify (escape chars would lie).
   */
  toolInput: Record<string, unknown>;
}

export interface MockLlmResponderOutput {
  /** True iff at least one alive rule's content matched the tool input. */
  block: boolean;
  /**
   * Matched rule ids, sorted by (author, file) lex order then deduped on
   * `rule_id` — the same `rule_id` shipped by two authors (legitimate per
   * the M5 lineage contract: `author` is "first creator", not unique key)
   * cites exactly once, in first-encountered-author order.
   */
  citations: string[];
  /**
   * Number of files skipped due to malformed JSON, shape mismatch, or
   * EISDIR on a directory accidentally named `*.json`. Bare disk errors
   * (ENOENT, permission denied) on intermediate dirs are NOT counted —
   * they're treated as "this corner of the team tree doesn't exist yet".
   */
  skipped: number;
}

export interface MockLlmResponderOptions {
  /** Optional callback invoked once per skipped file. Default: silent. */
  onSkip?: (entry: { path: string; reason: string }) => void;
}

export interface MockLlmResponder {
  evaluate(input: MockLlmResponderInput): Promise<MockLlmResponderOutput>;
}

/** Factory for the default MockLlmResponder implementation. */
export function createMockLlmResponder(
  opts: MockLlmResponderOptions = {},
): MockLlmResponder {
  return new MockLlmResponderImpl(opts);
}

class MockLlmResponderImpl implements MockLlmResponder {
  constructor(private readonly opts: MockLlmResponderOptions) {}

  async evaluate(
    input: MockLlmResponderInput,
  ): Promise<MockLlmResponderOutput> {
    const teamDir = path.join(input.projectRoot, ".teamagent", "team");
    const result: MockLlmResponderOutput = {
      block: false,
      citations: [],
      skipped: 0,
    };

    let authors: string[];
    try {
      authors = await fs.readdir(teamDir);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return result;
      throw e;
    }

    const haystacks = collectStrings(input.toolInput).map((s) =>
      s.toLowerCase(),
    );
    const seen = new Set<string>();

    for (const author of [...authors].sort()) {
      const authorDir = path.join(teamDir, author);
      let stat;
      try {
        stat = await fs.stat(authorDir);
      } catch {
        continue;
      }
      if (!stat.isDirectory()) continue;

      let entries: string[];
      try {
        entries = await fs.readdir(authorDir);
      } catch {
        continue;
      }

      for (const entry of [...entries].sort()) {
        if (!entry.endsWith(".json")) continue;
        const filePath = path.join(authorDir, entry);

        let raw: string;
        try {
          raw = await fs.readFile(filePath, "utf8");
        } catch (e) {
          const code = (e as NodeJS.ErrnoException).code;
          if (code === "EISDIR") {
            // A directory named `<name>.json` matches the suffix filter but
            // is not a rule file. Count as skipped + report; do not throw.
            result.skipped += 1;
            this.opts.onSkip?.({
              path: filePath,
              reason: "EISDIR (directory named *.json)",
            });
          }
          // Other read errors (ENOENT race, EACCES) are treated as "file
          // disappeared mid-scan" — silent skip, matches the existing
          // fs-team-rule-store best-effort scan semantic.
          continue;
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch (e) {
          result.skipped += 1;
          this.opts.onSkip?.({
            path: filePath,
            reason: `json parse: ${(e as Error).message}`,
          });
          continue;
        }

        const ruleResult = matchRule(parsed, haystacks);
        if (ruleResult.kind === "skip") {
          result.skipped += 1;
          this.opts.onSkip?.({ path: filePath, reason: ruleResult.reason });
          continue;
        }
        if (ruleResult.kind === "hit" && !seen.has(ruleResult.rule_id)) {
          seen.add(ruleResult.rule_id);
          result.citations.push(ruleResult.rule_id);
        }
      }
    }

    result.block = result.citations.length > 0;
    return result;
  }
}

type MatchResult =
  | { kind: "miss" }
  | { kind: "hit"; rule_id: string }
  | { kind: "skip"; reason: string };

function matchRule(parsed: unknown, haystacks: string[]): MatchResult {
  if (parsed === null || typeof parsed !== "object") {
    return { kind: "skip", reason: "rule root is not an object" };
  }
  const record = parsed as Record<string, unknown>;
  const ruleId = record.rule_id;
  const current = record.current;
  if (typeof ruleId !== "string" || ruleId.length === 0) {
    return { kind: "skip", reason: "missing rule_id string" };
  }
  if (current === null || typeof current !== "object") {
    return { kind: "skip", reason: "missing current object" };
  }
  const currentRecord = current as Record<string, unknown>;
  if (currentRecord.deleted === true) {
    return { kind: "miss" }; // tombstone — not skipped, just not matched
  }
  const content = currentRecord.content;
  if (typeof content !== "string") {
    return { kind: "skip", reason: "current.content not a string" };
  }
  const keyword = content.trim().toLowerCase();
  if (keyword.length === 0) {
    return { kind: "miss" }; // empty / whitespace-only content never matches
  }
  for (const hay of haystacks) {
    if (hay.includes(keyword)) {
      const rule = parsed as TeamRuleFile;
      return { kind: "hit", rule_id: rule.rule_id };
    }
  }
  return { kind: "miss" };
}

/**
 * Recursively walk a value and collect every string encountered. Used to
 * build the haystack from `toolInput` without going through `JSON.stringify`,
 * which would escape characters and produce wrong substrings for any rule
 * whose `content` contains a newline, tab, backslash, or quote.
 */
function collectStrings(value: unknown): string[] {
  const out: string[] = [];
  visit(value, out);
  return out;
}

function visit(value: unknown, out: string[]): void {
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) visit(item, out);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      visit(v, out);
    }
  }
}
