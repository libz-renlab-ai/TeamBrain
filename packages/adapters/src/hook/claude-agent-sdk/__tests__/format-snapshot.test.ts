import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createPreToolUseHandler } from "../pre-tool-use-sdk.js";

const baseRule = {
  id: "pers-20260507033700-ty7hqm",
  current_tier: "stable",
  enforcement: "warn",
  trigger: "use moment",
  correct_pattern: "use dayjs instead — smaller bundle, same API",
  wrong_pattern: "moment",
  reasoning: "moment is in maintenance mode and ships ~70KB; dayjs is 2KB",
  summary: "switch from moment to dayjs",
  confidence: 0.9,
  hit_count: 3,
  created_at: "2026-04-30T00:00:00Z",
};

function makeHandler(rule: any) {
  const matcher = { match: vi.fn().mockResolvedValue({ matched: [rule] }) };
  const eventLog = { append: vi.fn(), readLast: vi.fn().mockReturnValue([]) };
  return createPreToolUseHandler({ matcher: matcher as any, eventLog: eventLog as any });
}

describe("hook block humane format (issue #86)", () => {
  beforeEach(() => {
    delete process.env.TEAMAGENT_HOOK_ASCII_BOX;
  });
  afterEach(() => {
    delete process.env.TEAMAGENT_HOOK_ASCII_BOX;
  });

  it("default warn shape: 3 lines starting with ⚠️ TeamAgent", async () => {
    const handler = makeHandler({ ...baseRule, enforcement: "warn" });
    const result = await handler({
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "npm install moment" },
      tool_use_id: "tu-warn",
    } as any);

    const msg = result.systemMessage ?? "";
    const lines = msg.split("\n");
    expect(lines.length).toBe(3);
    expect(lines[0]).toMatch(/^⚠️ TeamAgent 提醒 — /);
    expect(lines[1]).toMatch(/^   复制即可: /);
    expect(lines[2]).toMatch(/^   细节: conf=0\.\d+/);
  });

  it("default block shape: 3 lines starting with ⚠️ TeamAgent 拦了一下", async () => {
    const handler = makeHandler({ ...baseRule, enforcement: "block" });
    const result = await handler({
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "npm install moment" },
      tool_use_id: "tu-block",
    } as any);

    const msg = result.systemMessage ?? "";
    const lines = msg.split("\n");
    expect(lines.length).toBe(3);
    expect(lines[0]).toMatch(/^⚠️ TeamAgent 拦了一下 — /);
    expect(lines[2]).toMatch(/已触发 \d+ 次/);
  });

  it("first line is ≤ 80 characters", async () => {
    const handler = makeHandler({ ...baseRule, summary: "a".repeat(200) });
    const result = await handler({
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "x" },
      tool_use_id: "tu-trim",
    } as any);

    const firstLine = (result.systemMessage ?? "").split("\n")[0] ?? "";
    expect(firstLine.length).toBeLessThanOrEqual(80);
  });

  it("details line collapses confidence + age + rule id", async () => {
    const handler = makeHandler(baseRule);
    const result = await handler({
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "x" },
      tool_use_id: "tu-details",
    } as any);

    const detailLine = (result.systemMessage ?? "").split("\n")[2];
    expect(detailLine).toMatch(/conf=0\.\d+/);
    expect(detailLine).toMatch(/学到/);
    expect(detailLine).toMatch(/rule=ty7hqm/);
  });

  it("never contains literal 'Error:' framing", async () => {
    const handler = makeHandler(baseRule);
    const result = await handler({
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "x" },
      tool_use_id: "tu-no-error",
    } as any);

    expect(result.systemMessage ?? "").not.toMatch(/^Error:/);
    expect(result.systemMessage ?? "").not.toContain("Error: ");
  });

  it("TEAMAGENT_HOOK_ASCII_BOX=1 restores legacy box rendering", async () => {
    process.env.TEAMAGENT_HOOK_ASCII_BOX = "1";
    const handler = makeHandler({ ...baseRule, enforcement: "warn" });
    const result = await handler({
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "x" },
      tool_use_id: "tu-legacy",
    } as any);

    const msg = result.systemMessage ?? "";
    expect(msg).toMatch(/^\+-- TeamAgent 经验提醒 -+\+/);
    expect(msg).toContain("|");
    expect(msg).toMatch(/置信度 0\.\d+/);
  });

  it("warn output contains the suggested correct_pattern verbatim on line 2", async () => {
    const handler = makeHandler(baseRule);
    const result = await handler({
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "x" },
      tool_use_id: "tu-suggestion",
    } as any);

    const line2 = (result.systemMessage ?? "").split("\n")[1];
    expect(line2).toContain("use dayjs instead");
  });
});
