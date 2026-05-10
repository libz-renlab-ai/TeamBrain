import { describe, expect, it } from "vitest";
import { resolveProjectId } from "../project-id.js";

describe("resolveProjectId", () => {
  it("produces the expected p_<16hex> shape", () => {
    const id = resolveProjectId("/Users/alice/project");
    expect(id).toMatch(/^p_[0-9a-f]{16}$/);
  });

  it("is deterministic — same input → same output", () => {
    const a = resolveProjectId("/Users/alice/project");
    const b = resolveProjectId("/Users/alice/project");
    expect(a).toBe(b);
  });

  it("different paths produce different ids (with overwhelming probability)", () => {
    const a = resolveProjectId("/Users/alice/project");
    const b = resolveProjectId("/Users/alice/other-project");
    expect(a).not.toBe(b);
  });

  it("normalizes a single trailing slash", () => {
    expect(resolveProjectId("/foo/bar")).toBe(resolveProjectId("/foo/bar/"));
  });

  it("normalizes a single trailing backslash (Windows-ish path)", () => {
    expect(resolveProjectId("C:\\Users\\bob")).toBe(
      resolveProjectId("C:\\Users\\bob\\"),
    );
  });

  it("does NOT collapse the unix root '/'", () => {
    // Just verifies it does not throw and produces something stable.
    const id = resolveProjectId("/");
    expect(id).toMatch(/^p_[0-9a-f]{16}$/);
  });

  it("does NOT collapse a Windows drive root 'C:\\'", () => {
    const id = resolveProjectId("C:\\");
    expect(id).toMatch(/^p_[0-9a-f]{16}$/);
  });

  it("lowercases the Windows drive letter", () => {
    expect(resolveProjectId("C:\\Users\\bob")).toBe(
      resolveProjectId("c:\\Users\\bob"),
    );
  });

  it("rejects empty input", () => {
    expect(() => resolveProjectId("")).toThrow();
  });

  it("rejects non-string input", () => {
    // @ts-expect-error — intentionally invalid input
    expect(() => resolveProjectId(null)).toThrow();
    // @ts-expect-error — intentionally invalid input
    expect(() => resolveProjectId(undefined)).toThrow();
  });

  it("treats different absolute paths as distinct (no fs canonicalization)", () => {
    // /private/var/x and /var/x point to the same directory on macOS but the
    // pure helper deliberately does NOT resolve symlinks — that requires fs.
    const a = resolveProjectId("/private/var/teamagent");
    const b = resolveProjectId("/var/teamagent");
    expect(a).not.toBe(b);
  });
});
