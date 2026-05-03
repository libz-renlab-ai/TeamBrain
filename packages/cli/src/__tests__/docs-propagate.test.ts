import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DualLayerStore } from "@teamagent/adapters";
import type { KnowledgeEntry } from "@teamagent/types";
import {
  buildDocsRunnerCommand,
  executeDocsPropagate,
  parseDocsPropagateArgs,
  type DocsPropagationRunner,
} from "../commands/docs-propagate.js";

function mkTmp(): { cwd: string; home: string; cleanup: () => void } {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "docs-prop-cwd-"));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "docs-prop-home-"));
  return {
    cwd,
    home,
    cleanup: () => {
      fs.rmSync(cwd, { recursive: true, force: true });
      fs.rmSync(home, { recursive: true, force: true });
    },
  };
}

function mkEntry(over: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: "rule-docs-1",
    scope: { level: "personal" },
    category: "E",
    tags: ["docs"],
    type: "practice",
    nature: "subjective",
    trigger: "adding a new CLI port",
    wrong_pattern: "",
    correct_pattern: "write contract tests before the implementation",
    reasoning: "new ports must be validated through shared contracts",
    confidence: 0.8,
    current_tier: "stable",
    max_tier_ever: "stable",
    tier_entered_at: "2026-05-03T00:00:00Z",
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
    enforcement: "warn",
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: "2026-05-03T00:00:00Z",
    last_hit_at: "",
    last_validated_at: "2026-05-03T00:00:00Z",
    source: "accumulated",
    conflict_with: [],
    ...over,
  };
}

describe("executeDocsPropagate", () => {
  let tmp: ReturnType<typeof mkTmp>;

  beforeEach(() => {
    tmp = mkTmp();
  });

  afterEach(() => {
    tmp.cleanup();
  });

  it("retries with a fake runner until judge passes and writes a success log", async () => {
    const projectDbPath = path.join(tmp.cwd, ".teamagent", "knowledge.db");
    const userGlobalDbPath = path.join(tmp.home, ".teamagent", "global.db");
    fs.mkdirSync(path.dirname(projectDbPath), { recursive: true });
    fs.mkdirSync(path.dirname(userGlobalDbPath), { recursive: true });
    const store = new DualLayerStore({ projectDbPath, userGlobalDbPath });
    store.add(mkEntry());
    store.close();

    const calls: Array<{ kind: string; attempt: number; prompt: string }> = [];
    const runner: DocsPropagationRunner = async (prompt, context) => {
      calls.push({ kind: context.kind, attempt: context.attempt, prompt });
      if (context.kind === "update-docs") {
        fs.mkdirSync(path.join(tmp.cwd, "docs"), { recursive: true });
        fs.writeFileSync(
          path.join(tmp.cwd, "docs", "knowledge.md"),
          context.attempt === 1
            ? "# Knowledge\n\nPorts need care.\n"
            : "# Knowledge\n\nWhen adding a new CLI port, write contract tests before the implementation.\n",
          "utf-8",
        );
        return "docs updated";
      }
      if (context.kind === "answer") {
        return context.attempt === 1
          ? "The docs do not teach the behavior."
          : "A coding agent should write contract tests before the implementation.";
      }
      return context.attempt === 1
        ? JSON.stringify({ pass: false, reason: "missing contract-test guidance" })
        : JSON.stringify({ pass: true, reason: "answer includes the expected behavior" });
    };

    const result = await executeDocsPropagate({
      ruleIds: ["rule-docs-1"],
      cwd: tmp.cwd,
      homeDir: tmp.home,
      runner,
      now: () => new Date("2026-05-03T12:34:56Z"),
    });

    expect(result.ok).toBe(true);
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0]!.checks[0]).toMatchObject({
      ruleId: "rule-docs-1",
      pass: false,
      reason: "missing contract-test guidance",
    });
    expect(result.attempts[1]!.checks[0]).toMatchObject({
      ruleId: "rule-docs-1",
      pass: true,
    });
    expect(calls.map((c) => `${c.kind}:${c.attempt}`)).toEqual([
      "update-docs:1",
      "answer:1",
      "judge:1",
      "update-docs:2",
      "answer:2",
      "judge:2",
    ]);
    expect(calls.find((c) => c.kind === "answer")!.prompt).toContain("repository's documentation");

    expect(fs.existsSync(result.logPath)).toBe(true);
    expect(result.logPath).toContain(path.join(".teamagent", "doc-propagation"));
    const log = JSON.parse(fs.readFileSync(result.logPath, "utf-8")) as typeof result;
    expect(log.ok).toBe(true);
    expect(log.attempts).toHaveLength(2);

    const storeAfter = new DualLayerStore({ projectDbPath, userGlobalDbPath });
    expect(storeAfter.getById("rule-docs-1")).toBeDefined();
    storeAfter.close();
  });

  it("returns a failed result for missing rules without deleting stored rules", async () => {
    const projectDbPath = path.join(tmp.cwd, ".teamagent", "knowledge.db");
    const userGlobalDbPath = path.join(tmp.home, ".teamagent", "global.db");
    fs.mkdirSync(path.dirname(projectDbPath), { recursive: true });
    fs.mkdirSync(path.dirname(userGlobalDbPath), { recursive: true });
    const store = new DualLayerStore({ projectDbPath, userGlobalDbPath });
    store.add(mkEntry({ id: "kept-rule" }));
    store.close();

    const result = await executeDocsPropagate({
      ruleIds: ["missing-rule"],
      cwd: tmp.cwd,
      homeDir: tmp.home,
      runner: async () => {
        throw new Error("runner should not be called");
      },
    });

    expect(result.ok).toBe(false);
    expect(result.missingRuleIds).toEqual(["missing-rule"]);
    expect(result.attempts[0]!.error).toBe("no matching rules found");

    const storeAfter = new DualLayerStore({ projectDbPath, userGlobalDbPath });
    expect(storeAfter.getById("kept-rule")).toBeDefined();
    storeAfter.close();
  });

  it("fails mixed valid and missing rule ids even when found rules verify", async () => {
    const projectDbPath = path.join(tmp.cwd, ".teamagent", "knowledge.db");
    const userGlobalDbPath = path.join(tmp.home, ".teamagent", "global.db");
    fs.mkdirSync(path.dirname(projectDbPath), { recursive: true });
    fs.mkdirSync(path.dirname(userGlobalDbPath), { recursive: true });
    const store = new DualLayerStore({ projectDbPath, userGlobalDbPath });
    store.add(mkEntry({ id: "valid-rule" }));
    store.close();

    const result = await executeDocsPropagate({
      ruleIds: ["valid-rule", "typo-rule"],
      cwd: tmp.cwd,
      homeDir: tmp.home,
      runner: async (_prompt, context) => {
        if (context.kind === "judge") {
          return JSON.stringify({ pass: true, reason: "valid rule verified" });
        }
        return "ok";
      },
    });

    expect(result.ok).toBe(false);
    expect(result.missingRuleIds).toEqual(["typo-rule"]);
    expect(result.attempts).toHaveLength(3);
    expect(result.attempts.every((a) => a.checks[0]?.pass === true)).toBe(true);
  });

  it("keeps the stored rule when propagation never verifies", async () => {
    const projectDbPath = path.join(tmp.cwd, ".teamagent", "knowledge.db");
    const userGlobalDbPath = path.join(tmp.home, ".teamagent", "global.db");
    fs.mkdirSync(path.dirname(projectDbPath), { recursive: true });
    fs.mkdirSync(path.dirname(userGlobalDbPath), { recursive: true });
    const store = new DualLayerStore({ projectDbPath, userGlobalDbPath });
    store.add(mkEntry({ id: "rule-stays" }));
    store.close();

    const result = await executeDocsPropagate({
      ruleIds: ["rule-stays"],
      cwd: tmp.cwd,
      homeDir: tmp.home,
      maxAttempts: 3,
      runner: async (_prompt, context) => {
        if (context.kind === "judge") {
          return JSON.stringify({ pass: false, reason: "still missing from docs" });
        }
        return "ok";
      },
    });

    expect(result.ok).toBe(false);
    expect(result.attempts).toHaveLength(3);
    expect(result.attempts.every((a) => a.checks[0]?.pass === false)).toBe(true);

    const storeAfter = new DualLayerStore({ projectDbPath, userGlobalDbPath });
    expect(storeAfter.getById("rule-stays")).toBeDefined();
    storeAfter.close();
  });
});

describe("parseDocsPropagateArgs", () => {
  it("parses repeated rule ids and cwd", () => {
    expect(parseDocsPropagateArgs(["--rule-id=a", "--rule-id", "b", "--cwd", "/tmp/x", "c"])).toEqual({
      ruleIds: ["a", "b", "c"],
      cwd: "/tmp/x",
    });
  });
});

describe("buildDocsRunnerCommand", () => {
  it("appends the prompt as one argv entry when the runner has no placeholder", () => {
    expect(buildDocsRunnerCommand("claudefast -p", "what would happen? ONLY explain.")).toEqual({
      command: "claudefast",
      args: ["-p", "what would happen? ONLY explain."],
    });
  });

  it("replaces prompt placeholders without shell quoting", () => {
    expect(
      buildDocsRunnerCommand(
        "codex exec --model gpt-5.4-mini --prompt={prompt}",
        "when paths contain spaces, explain",
      ),
    ).toEqual({
      command: "codex",
      args: ["exec", "--model", "gpt-5.4-mini", "--prompt=when paths contain spaces, explain"],
    });
  });

  it("parses quoted runner paths without splitting them", () => {
    expect(buildDocsRunnerCommand("\"/tmp/my runner\" -p", "hello world")).toEqual({
      command: "/tmp/my runner",
      args: ["-p", "hello world"],
    });
  });
});
