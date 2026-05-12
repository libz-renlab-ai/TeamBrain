import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TeamRuleFile } from "@teamagent/types";
import { createMockLlmResponder } from "../testing/mock-llm-responder.js";

function avoidanceRule(
  rule_id: string,
  content: string,
  author = "A",
): TeamRuleFile {
  return {
    rule_id,
    author,
    current: {
      deleted: false,
      content,
      confidence: 0.9,
      modified_by: author,
      modified_ts: "2026-05-12T07:00:00Z",
      scope: "team",
    },
  };
}

function tombstoneRule(rule_id: string, author = "A"): TeamRuleFile {
  return {
    rule_id,
    author,
    current: {
      deleted: true,
      deleted_by: author,
      deleted_ts: "2026-05-12T07:00:00Z",
    },
  };
}

async function writeRule(
  projectRoot: string,
  author: string,
  rule: TeamRuleFile,
): Promise<string> {
  const dir = path.join(projectRoot, ".teamagent", "team", author);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${rule.rule_id}.json`);
  await fs.writeFile(filePath, JSON.stringify(rule), "utf8");
  return filePath;
}

describe("MockLlmResponder.evaluate", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "mock-llm-responder-"),
    );
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it("returns block:false with empty citations when project has no .teamagent/team/", async () => {
    const responder = createMockLlmResponder();
    const result = await responder.evaluate({
      projectRoot,
      toolName: "Bash",
      toolInput: { command: "rm -rf /tmp" },
    });
    expect(result).toEqual({ block: false, citations: [], skipped: 0 });
  });

  it("blocks when one alive rule's content appears as substring in tool input", async () => {
    await writeRule(projectRoot, "A", avoidanceRule("avoid-rm-rf", "rm -rf"));
    const responder = createMockLlmResponder();
    const result = await responder.evaluate({
      projectRoot,
      toolName: "Bash",
      toolInput: { command: "echo start; rm -rf /tmp/x" },
    });
    expect(result.block).toBe(true);
    expect(result.citations).toEqual(["avoid-rm-rf"]);
    expect(result.skipped).toBe(0);
  });

  it("does NOT block when rule content does not appear in tool input", async () => {
    await writeRule(projectRoot, "A", avoidanceRule("avoid-rm-rf", "rm -rf"));
    const responder = createMockLlmResponder();
    const result = await responder.evaluate({
      projectRoot,
      toolName: "Bash",
      toolInput: { command: "ls -la" },
    });
    expect(result).toEqual({ block: false, citations: [], skipped: 0 });
  });

  it("ignores tombstone rules even when keyword would otherwise match", async () => {
    await writeRule(projectRoot, "A", tombstoneRule("avoid-rm-rf"));
    const responder = createMockLlmResponder();
    const result = await responder.evaluate({
      projectRoot,
      toolName: "Bash",
      toolInput: { command: "rm -rf /tmp" },
    });
    expect(result).toEqual({ block: false, citations: [], skipped: 0 });
  });

  it("emits citations in deterministic (author, file) lex order across two authors", async () => {
    await writeRule(projectRoot, "Zed", avoidanceRule("avoid-rm-rf-z", "rm -rf"));
    await writeRule(
      projectRoot,
      "Alice",
      avoidanceRule("avoid-rm-rf-a", "rm -rf"),
    );
    const responder = createMockLlmResponder();
    const result = await responder.evaluate({
      projectRoot,
      toolName: "Bash",
      toolInput: { command: "rm -rf /var" },
    });
    expect(result.block).toBe(true);
    expect(result.citations).toEqual(["avoid-rm-rf-a", "avoid-rm-rf-z"]);
  });

  it("skips malformed JSON files via skipped counter + onSkip callback, still matches the good one", async () => {
    const dir = path.join(projectRoot, ".teamagent", "team", "A");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, "good.json"),
      JSON.stringify(avoidanceRule("avoid-rm", "rm -rf")),
      "utf8",
    );
    await fs.writeFile(path.join(dir, "bad.json"), "{ not json", "utf8");
    const skips: Array<{ path: string; reason: string }> = [];
    const responder = createMockLlmResponder({
      onSkip: (e) => skips.push(e),
    });
    const result = await responder.evaluate({
      projectRoot,
      toolName: "Bash",
      toolInput: { command: "rm -rf /" },
    });
    expect(result.block).toBe(true);
    expect(result.citations).toEqual(["avoid-rm"]);
    expect(result.skipped).toBe(1);
    expect(skips).toHaveLength(1);
    expect(skips[0]!.path).toContain("bad.json");
    expect(skips[0]!.reason).toMatch(/json parse/);
  });

  it("ignores empty-content rules (whitespace-only) so they don't match all inputs", async () => {
    await writeRule(projectRoot, "A", avoidanceRule("empty-rule", "   "));
    const responder = createMockLlmResponder();
    const result = await responder.evaluate({
      projectRoot,
      toolName: "Bash",
      toolInput: { command: "anything goes" },
    });
    expect(result).toEqual({ block: false, citations: [], skipped: 0 });
  });
});
