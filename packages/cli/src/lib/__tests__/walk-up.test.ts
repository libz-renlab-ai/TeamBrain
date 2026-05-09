import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { findTeamagentRoot } from "../walk-up.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "walk-up-test-"));
  // Resolve realpath in case the OS tmpdir is itself a symlink (e.g. macOS
  // /tmp -> /private/tmp). Without this, path.resolve in findTeamagentRoot
  // may differ from the literal tmpDir string and break equality assertions.
  tmpDir = fs.realpathSync(tmpDir);
});

afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

/**
 * Create `<dir>/.teamagent/knowledge.db` as a regular file.
 */
function plantDb(dir: string): void {
  const teamagentDir = path.join(dir, ".teamagent");
  fs.mkdirSync(teamagentDir, { recursive: true });
  fs.writeFileSync(path.join(teamagentDir, "knowledge.db"), "stub");
}

/**
 * Plant a `.git/` directory as a project-marker. PR #181 fix-cycle: walk-up
 * now requires BOTH `.teamagent/knowledge.db` AND a project-marker at the
 * same level for an ancestor to count as a real project root.
 */
function plantMarker(dir: string): void {
  fs.mkdirSync(path.join(dir, ".git"), { recursive: true });
}

describe("findTeamagentRoot", () => {
  // PR #181 fix-cycle: existing positive cases must plant a project-marker
  // alongside the .teamagent/knowledge.db. Without the marker, the new
  // contract treats the directory as a stray DB and keeps walking. The
  // marker is part of the trust-boundary defense (B+A) — see walk-up.ts
  // header for rationale.

  it("cwd has knowledge.db + project-marker -> returns cwd itself", () => {
    plantDb(tmpDir);
    plantMarker(tmpDir);
    expect(findTeamagentRoot(tmpDir)).toBe(tmpDir);
  });

  it("parent has knowledge.db + project-marker, cwd does not -> returns parent", () => {
    plantDb(tmpDir);
    plantMarker(tmpDir);
    const child = path.join(tmpDir, "child");
    fs.mkdirSync(child, { recursive: true });
    expect(findTeamagentRoot(child)).toBe(tmpDir);
  });

  it("grandparent has knowledge.db + project-marker -> returns grandparent", () => {
    plantDb(tmpDir);
    plantMarker(tmpDir);
    const grandchild = path.join(tmpDir, "child", "grandchild");
    fs.mkdirSync(grandchild, { recursive: true });
    expect(findTeamagentRoot(grandchild)).toBe(tmpDir);
  });

  it("no knowledge.db anywhere on the walk -> returns null", () => {
    // Tmp dir tree exists but no .teamagent/knowledge.db planted.
    // Walk-up climbs from tmpDir to fs root and returns null.
    const child = path.join(tmpDir, "child");
    fs.mkdirSync(child, { recursive: true });
    expect(findTeamagentRoot(child)).toBeNull();
  });

  it(".teamagent/knowledge.db is a directory not a file -> keeps walking (returns null when no real DB above)", () => {
    // Documented choice: when knowledge.db exists but is NOT a regular file,
    // findTeamagentRoot treats it as "not a match" and keeps walking up the
    // tree. Since we plant it at tmpDir and there is no real DB above tmpDir
    // within the test's controlled scope, the function will eventually return
    // null when it reaches fs root.
    const teamagentDir = path.join(tmpDir, ".teamagent");
    fs.mkdirSync(path.join(teamagentDir, "knowledge.db"), { recursive: true });
    plantMarker(tmpDir);
    expect(findTeamagentRoot(tmpDir)).toBeNull();
  });

  it("start is a non-existent path -> returns null", () => {
    // path.resolve still produces an absolute path; fs.lstatSync throws on
    // every candidate up the chain; loop tolerates and walks to fs root.
    const ghost = path.join(tmpDir, "does", "not", "exist", "anywhere");
    expect(findTeamagentRoot(ghost)).toBeNull();
  });

  // ─── PR #181 fix-cycle (Worker E) — defense-in-depth for trust boundary ──

  it("PR #181: returns null when knowledge.db exists but no project-marker is at the same dir", () => {
    // The trust-boundary defense: a stray `.teamagent/knowledge.db` planted
    // by an attacker (or by some other tool) at a directory that is NOT a
    // real project root must NOT be trusted. Walk-up keeps going.
    plantDb(tmpDir); // db only — no .git / package.json / etc.
    expect(findTeamagentRoot(tmpDir)).toBeNull();
  });

  it("PR #181: returns ancestor when both knowledge.db AND a project-marker exist at the ancestor", () => {
    // Positive control for the AND-contract: the ancestor must satisfy BOTH
    // (a) lstat-isFile-knowledge.db AND (b) hasProjectMarker.
    plantDb(tmpDir);
    plantMarker(tmpDir);
    const sub = path.join(tmpDir, "sub");
    fs.mkdirSync(sub, { recursive: true });
    expect(findTeamagentRoot(sub)).toBe(tmpDir);
  });

  it("PR #181: caps at homeDir — does not walk above $HOME boundary", () => {
    // Build: <home>/.teamagent/knowledge.db + <home>/.git AND
    //        <home-parent>/.teamagent/knowledge.db + <home-parent>/.git
    //
    // From <home>/sub with opts.homeDir=<home>:
    //   - <home>/sub: no DB → walk up
    //   - <home>: has DB+marker → return <home> (boundary inclusive)
    // From <home>/sub with opts.homeDir=<home>, even if higher ancestors
    // also have a DB+marker, the loop must NOT escape past <home>.
    const home = path.join(tmpDir, "home");
    const sub = path.join(home, "sub");
    fs.mkdirSync(sub, { recursive: true });

    // Plant a DB+marker ABOVE home (at tmpDir) — this must NEVER be reached
    // when homeDir=<home>.
    plantDb(tmpDir);
    plantMarker(tmpDir);

    // Negative case first: WITHOUT a DB+marker at <home>, the cap fires and
    // we return null (we do NOT walk into tmpDir's DB above the cap).
    const found1 = findTeamagentRoot(sub, { homeDir: home });
    expect(found1).toBeNull();

    // Boundary-inclusive case: plant a DB+marker AT <home>. The loop's
    // candidate check at <home> succeeds, so we return <home>.
    plantDb(home);
    plantMarker(home);
    const found2 = findTeamagentRoot(sub, { homeDir: home });
    expect(found2).toBe(home);
  });

  // Skip on Windows: chmod 0 doesn't reliably produce EACCES on Windows-fs.
  const itPosixOnly = process.platform === "win32" ? it.skip : it;

  itPosixOnly(
    "PR #181: returns null and logs once when EACCES is thrown by fs.lstatSync",
    () => {
      // The error-code-aware contract: ENOENT/ENOTDIR/EISDIR are expected
      // (silent-skip-and-keep-walking); any OTHER errno (EACCES/ELOOP/EPERM/
      // EIO) is logged once to stderr and the walk aborts (return null).
      //
      // We use a real-fs unreadable directory rather than mocking `fs.lstatSync`
      // because `import * as fs` (the namespace-import style walk-up.ts uses)
      // produces non-configurable bindings that vitest's vi.spyOn can't redefine.
      // chmod 0 on the candidate's parent dir produces EACCES on lstat for the
      // candidate path — which is exactly the unexpected-errno branch we want
      // to exercise.
      const blocked = path.join(tmpDir, "blocked");
      fs.mkdirSync(blocked, { recursive: true });
      // Make the .teamagent dir itself unreadable so lstat on
      // <blocked>/.teamagent/knowledge.db raises EACCES.
      const teamagentDir = path.join(blocked, ".teamagent");
      fs.mkdirSync(teamagentDir);
      const originalMode = fs.statSync(teamagentDir).mode;
      fs.chmodSync(teamagentDir, 0o000);

      const stderrSpy = vi
        .spyOn(process.stderr, "write")
        .mockImplementation(() => true);

      try {
        // Skip the test entirely if we're root — root can read 0o000 dirs and
        // the EACCES branch will not fire. The CI test runners are non-root
        // by convention; if root, this assertion is meaningless.
        const isRoot =
          typeof process.getuid === "function" && process.getuid() === 0;
        if (isRoot) return;

        const result = findTeamagentRoot(blocked);
        expect(result).toBeNull();
        // At least one stderr write naming EACCES (or some unexpected errno
        // like EPERM on macOS depending on fs flavour) and the walk-up phrase.
        const stderrCalls = stderrSpy.mock.calls.map((c) => String(c[0] ?? ""));
        const hasUnexpected = stderrCalls.some(
          (s) =>
            s.includes("walk-up") &&
            (s.includes("EACCES") || s.includes("EPERM")),
        );
        expect(hasUnexpected).toBe(true);
      } finally {
        // Restore permissions before cleanup so afterEach's rm -rf works.
        try {
          fs.chmodSync(teamagentDir, originalMode);
        } catch {
          /* best-effort */
        }
        stderrSpy.mockRestore();
      }
    },
  );
});
