import { describe, expect, it } from "vitest";
import { parseState, serializeState } from "../encode.js";
import { makeEmptyState, markStepDone } from "../lifecycle.js";

describe("encode / parseState", () => {
  describe("serializeState", () => {
    it("round-trips through parseState losslessly", () => {
      const original = markStepDone(
        markStepDone(makeEmptyState("p_round_trip", 1700000000000), "npm-global-install", 1700000001000),
        "hook-write",
        1700000002000,
      );
      const raw = serializeState(original);
      const result = parseState(raw);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.state).toEqual(original);
      }
    });

    it("produces byte-identical output for identical input (deterministic)", () => {
      const state = markStepDone(makeEmptyState("p_x", 1000), "hook-write", 2000);
      expect(serializeState(state)).toBe(serializeState(state));
    });

    it("refuses to serialize a corrupt object (defense in depth)", () => {
      // empty projectId is not allowed by the Zod schema
      const broken = {
        schemaVersion: "v1",
        projectId: "",
        createdAt: 0,
        updatedAt: 0,
        completedSteps: [],
        lastRunAt: 0,
      } as unknown;
      expect(() => serializeState(broken as never)).toThrow();
    });
  });

  describe("parseState — happy path", () => {
    it("returns ok=true for a freshly serialized state", () => {
      const state = makeEmptyState("p_happy", 1700000000000);
      const result = parseState(serializeState(state));
      expect(result.ok).toBe(true);
    });
  });

  describe("parseState — failure modes (never throws)", () => {
    it("missing reason for null input", () => {
      const result = parseState(null);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("missing");
    });

    it("missing reason for undefined input", () => {
      const result = parseState(undefined);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("missing");
    });

    it("missing reason for empty string", () => {
      const result = parseState("");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("missing");
    });

    it("missing reason for whitespace-only", () => {
      const result = parseState("   \n\t  ");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("missing");
    });

    it("invalid-json reason for malformed JSON", () => {
      const result = parseState("{not json");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("invalid-json");
    });

    it("schema-mismatch reason for v2-from-the-future", () => {
      const result = parseState(
        JSON.stringify({
          schemaVersion: "v2",
          projectId: "p_future",
          createdAt: 0,
          updatedAt: 0,
          completedSteps: [],
          lastRunAt: 0,
        }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("schema-mismatch");
    });

    it("schema-mismatch reason for missing schemaVersion field", () => {
      const result = parseState(
        JSON.stringify({
          projectId: "p_x",
          createdAt: 0,
          updatedAt: 0,
          completedSteps: [],
          lastRunAt: 0,
        }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("schema-mismatch");
    });

    it("schema-mismatch reason for unknown step in completedSteps", () => {
      const result = parseState(
        JSON.stringify({
          schemaVersion: "v1",
          projectId: "p_x",
          createdAt: 0,
          updatedAt: 0,
          completedSteps: ["bogus-step-name"],
          lastRunAt: 0,
        }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("schema-mismatch");
    });

    it("schema-mismatch reason for wrong type (array instead of object)", () => {
      const result = parseState("[]");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("schema-mismatch");
    });
  });
});
