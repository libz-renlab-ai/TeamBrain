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
 * as a literal substring keyword and matches against
 * `JSON.stringify(toolInput).toLowerCase()`. Tombstones (`deleted:true`) and
 * malformed JSON files are skipped without throwing.
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
  /** Tool name the (hypothetical) Claude session is about to invoke. */
  toolName: string;
  /** Tool input payload; matched as `JSON.stringify(input).toLowerCase()`. */
  toolInput: Record<string, unknown>;
}

export interface MockLlmResponderOutput {
  /** True iff at least one alive rule's content matched the tool input. */
  block: boolean;
  /** Matched rule ids, sorted by (author, file) lexicographic order. */
  citations: string[];
  /** Number of files skipped due to malformed JSON or shape mismatch. */
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

    const haystack = JSON.stringify(input.toolInput).toLowerCase();

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
        } catch {
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

        const ruleResult = matchRule(parsed, haystack);
        if (ruleResult.kind === "skip") {
          result.skipped += 1;
          this.opts.onSkip?.({ path: filePath, reason: ruleResult.reason });
          continue;
        }
        if (ruleResult.kind === "hit") {
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

function matchRule(parsed: unknown, haystack: string): MatchResult {
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
  if (haystack.includes(keyword)) {
    // Narrow to TeamRuleFile after we've validated the shape ourselves.
    const rule = parsed as TeamRuleFile;
    return { kind: "hit", rule_id: rule.rule_id };
  }
  return { kind: "miss" };
}
