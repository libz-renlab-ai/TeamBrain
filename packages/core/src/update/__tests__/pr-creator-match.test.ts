import { describe, it, expect } from "vitest";
import { isLocalUserPrCreator } from "../pr-creator-match.js";

describe("isLocalUserPrCreator", () => {
  it("matches when ghLogin exactly equals prCreatorLogin", () => {
    expect(isLocalUserPrCreator({ prCreatorLogin: "alice", ghLogin: "alice" })).toBe(true);
  });

  it("matches case-insensitively (GitHub logins are case-insensitive)", () => {
    expect(isLocalUserPrCreator({ prCreatorLogin: "Alice", ghLogin: "alice" })).toBe(true);
    expect(isLocalUserPrCreator({ prCreatorLogin: "alice", ghLogin: "ALICE" })).toBe(true);
  });

  it("rejects ghLogin mismatch", () => {
    expect(isLocalUserPrCreator({ prCreatorLogin: "alice", ghLogin: "bob" })).toBe(false);
  });

  it("matches via GITHUB_USER env var", () => {
    expect(
      isLocalUserPrCreator({ prCreatorLogin: "alice", env: { GITHUB_USER: "alice" } }),
    ).toBe(true);
  });

  it("matches via GH_USER env var", () => {
    expect(
      isLocalUserPrCreator({ prCreatorLogin: "alice", env: { GH_USER: "alice" } }),
    ).toBe(true);
  });

  it("matches noreply email (no numeric id prefix)", () => {
    expect(
      isLocalUserPrCreator({
        prCreatorLogin: "alice",
        gitEmail: "alice@users.noreply.github.com",
      }),
    ).toBe(true);
  });

  it("matches noreply email with numeric id prefix (modern GitHub form)", () => {
    expect(
      isLocalUserPrCreator({
        prCreatorLogin: "alice",
        gitEmail: "12345+alice@users.noreply.github.com",
      }),
    ).toBe(true);
  });

  it("rejects non-noreply email even when local-part matches login", () => {
    // We don't trust user@example.com matching because email local part is
    // not authoritative; only the noreply domain is.
    expect(
      isLocalUserPrCreator({
        prCreatorLogin: "alice",
        gitEmail: "alice@example.com",
      }),
    ).toBe(false);
  });

  it("rejects blank prCreatorLogin even with all signals set", () => {
    expect(
      isLocalUserPrCreator({
        prCreatorLogin: "",
        ghLogin: "alice",
        env: { GITHUB_USER: "alice" },
        gitEmail: "alice@users.noreply.github.com",
      }),
    ).toBe(false);
  });

  it("rejects when no signals are available", () => {
    expect(isLocalUserPrCreator({ prCreatorLogin: "alice" })).toBe(false);
    expect(isLocalUserPrCreator({ prCreatorLogin: "alice", env: {} })).toBe(false);
  });

  it("env match counts even when ghLogin disagrees (any signal wins)", () => {
    // Pragmatic: if any of the three independent signals says we're the
    // creator, we err on the side of force-updating. The cost of a false
    // positive is one extra update; the cost of a false negative is a stale
    // PR creator missing the update.
    expect(
      isLocalUserPrCreator({
        prCreatorLogin: "alice",
        ghLogin: "bob",
        env: { GITHUB_USER: "alice" },
      }),
    ).toBe(true);
  });

  it("trims whitespace in inputs", () => {
    expect(
      isLocalUserPrCreator({ prCreatorLogin: "  alice  ", ghLogin: "alice" }),
    ).toBe(true);
    expect(
      isLocalUserPrCreator({ prCreatorLogin: "alice", ghLogin: "  alice  " }),
    ).toBe(true);
  });

  it("undefined inputs are safe (no throw, returns false)", () => {
    expect(isLocalUserPrCreator({})).toBe(false);
    expect(isLocalUserPrCreator({ ghLogin: "alice" })).toBe(false);
  });
});
