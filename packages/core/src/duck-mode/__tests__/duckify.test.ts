import { describe, it, expect, beforeEach } from "vitest";
import { duckify, duckifyText, isDuckModeEnabled } from "../index.js";

describe("isDuckModeEnabled", () => {
  it("defaults to false when env unset", () => {
    expect(isDuckModeEnabled({ env: {} })).toBe(false);
  });

  it("env=1 enables", () => {
    expect(isDuckModeEnabled({ env: { TEAMAGENT_EXPLAIN_LIKE_CEO_DUCK: "1" } })).toBe(true);
  });

  it("env=0 disables", () => {
    expect(isDuckModeEnabled({ env: { TEAMAGENT_EXPLAIN_LIKE_CEO_DUCK: "0" } })).toBe(false);
  });

  it("cliFlag=true overrides env=0", () => {
    expect(isDuckModeEnabled({ cliFlag: true, env: { TEAMAGENT_EXPLAIN_LIKE_CEO_DUCK: "0" } })).toBe(true);
  });

  it("cliFlag=false overrides env=1", () => {
    expect(isDuckModeEnabled({ cliFlag: false, env: { TEAMAGENT_EXPLAIN_LIKE_CEO_DUCK: "1" } })).toBe(false);
  });
});

describe("duckify", () => {
  beforeEach(() => {
    delete process.env.TEAMAGENT_EXPLAIN_LIKE_CEO_DUCK;
  });

  it("returns line unchanged when duck mode is off", () => {
    expect(duckify("Skills compiled successfully")).toEqual(["Skills compiled successfully"]);
  });

  it("returns line + duck lines when env opts in", () => {
    process.env.TEAMAGENT_EXPLAIN_LIKE_CEO_DUCK = "1";
    const out = duckify("Skills compiled successfully");
    expect(out[0]).toBe("Skills compiled successfully");
    expect(out.length).toBeGreaterThan(1);
    expect(out[1]).toMatch(/呷呷|鸭鸭|>ω<|🦆/);
  });

  it("returns line + duck lines when cliFlag opts in regardless of env", () => {
    const out = duckify("hooks registered", { cliFlag: true, env: {} });
    expect(out.length).toBeGreaterThan(1);
    expect(out[1]).toMatch(/呷呷|鸭鸭|>ω<|🦆/);
  });

  it("cliFlag=false beats env=1", () => {
    process.env.TEAMAGENT_EXPLAIN_LIKE_CEO_DUCK = "1";
    expect(duckify("Skills", { cliFlag: false })).toEqual(["Skills"]);
  });

  it("dedupes when same term appears multiple times in one line", () => {
    const out = duckify("hooks Hook PreToolUse Stop hook", { cliFlag: true, env: {} });
    // 4 distinct terms (hooks/Hook share entry; PreToolUse + Stop hook are separate) → expect 1 + 3 lines
    expect(out.length).toBeGreaterThanOrEqual(2);
    expect(out.length).toBeLessThanOrEqual(4);
  });

  it("emits no duck line when there is no jargon", () => {
    expect(duckify("一切正常", { cliFlag: true, env: {} })).toEqual(["一切正常"]);
  });

  it("respects custom indent", () => {
    const out = duckify("Skills installed", { cliFlag: true, env: {}, indent: ">>> " });
    expect(out[1]?.startsWith(">>> ")).toBe(true);
  });

  it("matches case-insensitively", () => {
    const out = duckify("MATCHER ran", { cliFlag: true, env: {} });
    expect(out.length).toBeGreaterThan(1);
  });
});

describe("duckifyText", () => {
  it("preserves multi-line text and inserts duck lines per matched line", () => {
    const input = "Step 1: Skills compiled\nStep 2: hooks registered\nDone";
    const out = duckifyText(input, { cliFlag: true, env: {} });
    const lines = out.split("\n");
    expect(lines[0]).toBe("Step 1: Skills compiled");
    // first duck line should follow line 1
    expect(lines[1]).toMatch(/呷呷|鸭鸭|>ω<|🦆/);
  });

  it("returns original text when duck mode is off", () => {
    const input = "Skills compiled\nhooks registered";
    expect(duckifyText(input, { cliFlag: false, env: {} })).toBe(input);
  });
});
