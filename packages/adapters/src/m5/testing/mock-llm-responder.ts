/**
 * MockLlmResponder: deterministic stand-in for a real Claude session in the
 * m5 propagation hot-path test. Given a prompt, returns a fixed set of tool
 * calls + text. Used by slice 3+ fixtures to drive the PreToolUse /
 * UserPromptSubmit hook chain without spending real Anthropic tokens.
 *
 * Rule matching is case-insensitive substring on the prompt text; first match
 * wins. If no rule matches, the responder returns an empty tool-call list with
 * a default text response.
 */

export interface MockToolCall {
  /** Tool name as Claude Code emits it (e.g. "Bash", "Edit", "Write"). */
  name: string;
  /** Tool input as a JSON-serializable object (tool-specific shape). */
  input: Record<string, unknown>;
}

export interface MockLlmResponse {
  /** Free-form text the simulated Claude would emit alongside tool calls. */
  text: string;
  /** Tool calls in the order the simulated Claude would attempt them. */
  toolCalls: MockToolCall[];
}

export interface MockLlmRule {
  /** Case-insensitive substring matched against the prompt. */
  promptContains: string;
  /** Tool calls to emit when this rule matches; pass empty array for text-only. */
  toolCalls: MockToolCall[];
  /** Text response when this rule matches; defaults to "ok". */
  text?: string;
}

export interface MockLlmResponder {
  /** Resolve a prompt to a deterministic response. Pure function — same prompt always yields same output. */
  respond(prompt: string): MockLlmResponse;
}

const DEFAULT_RESPONSE: MockLlmResponse = Object.freeze({
  text: "ok",
  toolCalls: [],
});

/**
 * Build a responder bound to an immutable rule set. The rule set is captured
 * by reference at construction; do not mutate it afterward.
 */
export function createMockLlmResponder(
  rules: readonly MockLlmRule[],
): MockLlmResponder {
  const normalized = rules.map((r) => ({
    needle: r.promptContains.toLowerCase(),
    response: Object.freeze({
      text: r.text ?? "ok",
      toolCalls: r.toolCalls.map((tc) => Object.freeze({ ...tc })),
    }),
  }));

  return {
    respond(prompt: string): MockLlmResponse {
      const lower = prompt.toLowerCase();
      for (const rule of normalized) {
        if (lower.includes(rule.needle)) {
          return rule.response;
        }
      }
      return DEFAULT_RESPONSE;
    },
  };
}
