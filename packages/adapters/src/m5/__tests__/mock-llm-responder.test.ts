import { describe, expect, it } from "vitest";
import {
  createMockLlmResponder,
  type MockLlmRule,
} from "../testing/mock-llm-responder.js";

describe("createMockLlmResponder", () => {
  it("returns default response when no rule matches", () => {
    const r = createMockLlmResponder([]);
    const out = r.respond("hello world");
    expect(out.text).toBe("ok");
    expect(out.toolCalls).toEqual([]);
  });

  it("matches a rule via case-insensitive substring on prompt", () => {
    const rules: MockLlmRule[] = [
      {
        promptContains: "force push",
        toolCalls: [
          { name: "Bash", input: { command: "git push --force origin main" } },
        ],
        text: "will force push",
      },
    ];
    const r = createMockLlmResponder(rules);
    expect(r.respond("please FORCE PUSH to main").text).toBe("will force push");
    expect(r.respond("PLEASE FORCE PUSH TO MAIN").toolCalls).toHaveLength(1);
    expect(r.respond("regular prompt").text).toBe("ok");
  });

  it("uses first matching rule when multiple match", () => {
    const rules: MockLlmRule[] = [
      { promptContains: "x", toolCalls: [], text: "first" },
      { promptContains: "x", toolCalls: [], text: "second" },
    ];
    const r = createMockLlmResponder(rules);
    expect(r.respond("xyz").text).toBe("first");
  });

  it("defaults text to 'ok' when rule omits it", () => {
    const r = createMockLlmResponder([
      { promptContains: "trigger", toolCalls: [{ name: "Edit", input: {} }] },
    ]);
    expect(r.respond("trigger").text).toBe("ok");
  });

  it("is deterministic — same prompt yields same response object shape", () => {
    const r = createMockLlmResponder([
      {
        promptContains: "abc",
        toolCalls: [{ name: "Bash", input: { command: "ls" } }],
        text: "matched",
      },
    ]);
    const a = r.respond("contains abc here");
    const b = r.respond("contains abc here");
    expect(a).toEqual(b);
    expect(a.toolCalls).toEqual(b.toolCalls);
  });

  it("returned tool calls are immutable (frozen) — mutations throw in strict mode", () => {
    const r = createMockLlmResponder([
      {
        promptContains: "x",
        toolCalls: [{ name: "Bash", input: { command: "ls" } }],
      },
    ]);
    const out = r.respond("x");
    expect(Object.isFrozen(out.toolCalls[0])).toBe(true);
  });

  it("captures rule list by reference at construction — later mutations don't affect responder", () => {
    const rules: MockLlmRule[] = [
      { promptContains: "alpha", toolCalls: [], text: "alpha-match" },
    ];
    const r = createMockLlmResponder(rules);
    // Mutate the original array AFTER construction.
    (rules as MockLlmRule[]).push({
      promptContains: "beta",
      toolCalls: [],
      text: "beta-match",
    });
    // The mutation is observed (this is what "by reference" means in JS) — but
    // the responder must still iterate over the snapshot it took. Document the
    // expected behavior either way; here we assert that beta is NOT matched,
    // confirming the responder took its own copy.
    expect(r.respond("beta").text).toBe("ok");
  });

  it("an empty toolCalls rule still matches and resets to []", () => {
    const r = createMockLlmResponder([
      { promptContains: "talk", toolCalls: [], text: "chatty" },
    ]);
    const out = r.respond("just talk to me");
    expect(out.text).toBe("chatty");
    expect(out.toolCalls).toEqual([]);
  });
});
