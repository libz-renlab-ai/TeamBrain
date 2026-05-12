import { describe, it, expect } from "vitest";
import { gatherLocalIdentity } from "../local-identity.js";

describe("gatherLocalIdentity", () => {
  it("returns a LocalIdentity shape even when nothing resolves", () => {
    const id = gatherLocalIdentity();
    expect(id).toHaveProperty("ghLogin");
    expect(id).toHaveProperty("gitEmail");
    expect(id).toHaveProperty("env");
    expect(typeof id.ghLogin).toBe("string");
    expect(typeof id.gitEmail).toBe("string");
    expect(typeof id.env).toBe("object");
  });

  it("never throws on missing binaries — all errors absorbed", () => {
    // Whether `gh` / `git` are installed on the CI runner is environment-
    // dependent. The contract is that the function does not throw, returning
    // empty strings instead.
    expect(() => gatherLocalIdentity()).not.toThrow();
  });

  it("env is a snapshot of process.env (read-only consumer contract)", () => {
    const id = gatherLocalIdentity();
    // Sanity: PATH is always present in a node process — proves env was copied.
    expect(id.env.PATH ?? id.env.Path).toBeDefined();
  });
});
