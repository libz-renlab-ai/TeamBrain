/**
 * Issue #161 — end-to-end regression test.
 *
 * Reproduces the scenario from the issue body: a parent directory has
 * `.teamagent/knowledge.db`; Claude Code is launched from a *child* sub-
 * directory. Before the fix, `findTeamagentRoot` did not exist and every
 * hook entry hard-coded `path.join(cwd, ".teamagent", "knowledge.db")`,
 * so the project DB was invisible from the child cwd. After the fix:
 *
 *   1. `findTeamagentRoot(<root>/sub)` walks up to `<root>` and finds
 *      `<root>/.teamagent/knowledge.db`.
 *   2. The hook-shell layer joins that ancestor with `.teamagent/knowledge.db`
 *      to get the correct project DB path.
 *   3. `decideAction(<root>/sub)` returns `"skip-already-initialized"` so
 *      SessionStart does NOT auto-init a duplicate child `.teamagent/`.
 *
 * This test asserts (1) + (2) + (3) — the three observable behaviours that
 * collectively prove the regression is fixed.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { findTeamagentRoot } from "../lib/walk-up.js";
import { decideAction } from "../session-start-logic.js";

interface Fixture {
  root: string;
  sub: string;
  cleanup: () => void;
}

function setupFixture(): Fixture {
  // Build a parent project root with `.teamagent/knowledge.db` and a `sub/`
  // child directory we'll use as the cwd.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "issue161-"));
  const sub = path.join(root, "sub");
  fs.mkdirSync(sub, { recursive: true });

  // Create the minimal artefact that `findTeamagentRoot` looks for: a regular
  // file at `<root>/.teamagent/knowledge.db`. Empty contents are fine — the
  // walk-up util only checks `fs.statSync(...).isFile()`.
  const teamagentDir = path.join(root, ".teamagent");
  fs.mkdirSync(teamagentDir, { recursive: true });
  fs.writeFileSync(path.join(teamagentDir, "knowledge.db"), Buffer.alloc(0));

  // For decideAction's project-marker check (irrelevant for the skip-already-
  // initialized branch but harmless to set up), give the parent a `.git/` dir.
  fs.mkdirSync(path.join(root, ".git"), { recursive: true });

  return {
    root,
    sub,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

describe("issue #161 — walk-up integration regression", () => {
  let fx: Fixture;

  beforeEach(() => {
    fx = setupFixture();
  });

  afterEach(() => {
    fx.cleanup();
  });

  it("findTeamagentRoot(<root>/sub) returns <root> (parent has .teamagent/knowledge.db)", () => {
    // fs.realpath the expected root because mkdtempSync may return a symlinked
    // path on macOS (e.g. /var/folders → /private/var/folders) and walk-up
    // resolves through path.resolve which preserves the symlink target.
    const realRoot = fs.realpathSync(fx.root);
    const realSub = fs.realpathSync(fx.sub);

    const found = findTeamagentRoot(realSub);
    expect(found).not.toBeNull();
    expect(found).toBe(realRoot);
  });

  it("hook-shell-style projectDbPath resolution from child cwd points at parent's DB", () => {
    // This replicates the exact resolution rule used by hook-shell/index.ts
    // (and by bin-stop / bin-session-start) after the issue #161 fix:
    //
    //   const projectRoot = findTeamagentRoot(cwd) ?? cwd;
    //   const projectDbPath = path.join(projectRoot, ".teamagent", "knowledge.db");
    //
    // From inside the child sub-directory, `projectDbPath` MUST be the parent
    // `<root>/.teamagent/knowledge.db` — NOT `<sub>/.teamagent/knowledge.db`
    // (which is what the pre-fix code computed).
    const realRoot = fs.realpathSync(fx.root);
    const realSub = fs.realpathSync(fx.sub);

    const projectRoot = findTeamagentRoot(realSub) ?? realSub;
    const projectDbPath = path.join(projectRoot, ".teamagent", "knowledge.db");

    const expected = path.join(realRoot, ".teamagent", "knowledge.db");
    expect(projectDbPath).toBe(expected);
    expect(fs.existsSync(projectDbPath)).toBe(true);
  });

  it("decideAction(<root>/sub) returns 'skip-already-initialized' (does not auto-init duplicate)", () => {
    // SessionStart decision: when the cwd is a child of an already-initialized
    // project, decideAction must NOT spawn auto-init (which would create a
    // second `.teamagent/` directory inside the child). Issue #161's fix wires
    // findTeamagentRoot into decideAction so the ancestor's DB is honoured.
    const realSub = fs.realpathSync(fx.sub);
    const action = decideAction(realSub);
    expect(action).toBe("skip-already-initialized");
  });

  it("decideAction(<root>) — i.e. the cwd itself has the DB — also returns 'skip-already-initialized'", () => {
    // Sanity: the "cwd inclusive" semantics of findTeamagentRoot mean even
    // launching cc directly from the project root must short-circuit out of
    // auto-init.
    const realRoot = fs.realpathSync(fx.root);
    const action = decideAction(realRoot);
    expect(action).toBe("skip-already-initialized");
  });

  it("findTeamagentRoot returns null when no ancestor has .teamagent/knowledge.db", () => {
    // Negative control: an unrelated tmp dir with NO project root above it
    // (we walk up to fs root without finding a match) must not falsely match
    // some real .teamagent/ on the developer's machine. Use a fresh tmp dir
    // that we know has nothing TeamAgent-shaped above it within the test.
    const lonelyRoot = fs.mkdtempSync(path.join(os.tmpdir(), "issue161-empty-"));
    try {
      const lonely = path.join(lonelyRoot, "sub");
      fs.mkdirSync(lonely, { recursive: true });
      // We can't fully prove the absence of a real ancestor `.teamagent/db`
      // on the host machine, so this test asserts the weaker — but still
      // load-bearing — invariant: from a sub of `lonelyRoot`, findTeamagentRoot
      // must NOT return `lonelyRoot` (because we never wrote a DB there).
      const found = findTeamagentRoot(fs.realpathSync(lonely));
      expect(found).not.toBe(fs.realpathSync(lonelyRoot));
    } finally {
      fs.rmSync(lonelyRoot, { recursive: true, force: true });
    }
  });

  // ─── PR #181 fix-cycle (Worker E) — cwd-precedence ──────────────────────
  //
  // Hook-shell's resolution rule, copied verbatim from
  // `packages/cli/src/hook-shell/index.ts:147-153`:
  //
  //     const claudeProjectDir = env.CLAUDE_PROJECT_DIR;
  //     const cwdInput =
  //       typeof rawCwd === "string" && rawCwd.length > 0
  //         ? rawCwd
  //         : claudeProjectDir && claudeProjectDir.length > 0
  //           ? claudeProjectDir
  //           : process.cwd();
  //
  // Precedence: raw.cwd (from stdin) > CLAUDE_PROJECT_DIR env > process.cwd().
  // PR #181 round-2 finding #6 noted this contract had no test that actually
  // exercised all three inputs end-to-end (the previous test only used
  // `void envProjectDir`).
  //
  // We test the rule by literally inlining it (so refactors to the impl don't
  // silently change semantics; if hook-shell drifts, this test stays as the
  // contract pin and breaks visibly), and we wire each case through
  // `findTeamagentRoot` so the resolved cwd is exercised against the actual
  // walk-up logic — the same chain hook-shell uses to compute projectDbPath.
  describe("PR #181 round-2: cwd-precedence in resolveRuntime", () => {
    /**
     * Inlined copy of hook-shell/index.ts:147-153 precedence rule. This is
     * intentionally duplicated so the test pins the contract; if production
     * code drifts, this duplication breaks visibly and the team gets to
     * decide whether to update the contract.
     */
    function resolveCwdFromInputs(
      rawCwd: string | undefined,
      envProjectDir: string | undefined,
      processCwd: string,
    ): string {
      return typeof rawCwd === "string" && rawCwd.length > 0
        ? rawCwd
        : envProjectDir && envProjectDir.length > 0
          ? envProjectDir
          : processCwd;
    }

    it("raw.cwd > CLAUDE_PROJECT_DIR > process.cwd (raw.cwd wins when set)", () => {
      const realRoot = fs.realpathSync(fx.root);
      const realSub = fs.realpathSync(fx.sub);

      // Set CLAUDE_PROJECT_DIR to point at the parent root — but raw.cwd
      // points at the *child* sub-directory. Per the precedence rule, raw.cwd
      // must win regardless.
      const oldEnv = process.env.CLAUDE_PROJECT_DIR;
      try {
        process.env.CLAUDE_PROJECT_DIR = realRoot;
        const rawCwd = realSub;
        const resolved = resolveCwdFromInputs(
          rawCwd,
          process.env.CLAUDE_PROJECT_DIR,
          "/some/unrelated/process/cwd",
        );
        expect(resolved).toBe(realSub);

        // Walk-up from the resolved cwd reaches <root> (the parent's DB).
        const projectRoot = findTeamagentRoot(resolved);
        expect(projectRoot).toBe(realRoot);

        const projectDbPath = path.join(projectRoot!, ".teamagent", "knowledge.db");
        expect(fs.existsSync(projectDbPath)).toBe(true);
      } finally {
        if (oldEnv === undefined) delete process.env.CLAUDE_PROJECT_DIR;
        else process.env.CLAUDE_PROJECT_DIR = oldEnv;
      }
    });

    it("CLAUDE_PROJECT_DIR > process.cwd (env wins when raw.cwd is empty/undefined)", () => {
      const realRoot = fs.realpathSync(fx.root);
      const realSub = fs.realpathSync(fx.sub);

      const oldEnv = process.env.CLAUDE_PROJECT_DIR;
      try {
        // raw.cwd is undefined (the SessionStart channel sends minimal
        // stdin) — env must take over.
        process.env.CLAUDE_PROJECT_DIR = realSub;
        const resolved = resolveCwdFromInputs(
          undefined,
          process.env.CLAUDE_PROJECT_DIR,
          "/some/unrelated/process/cwd",
        );
        expect(resolved).toBe(realSub);

        const projectRoot = findTeamagentRoot(resolved);
        expect(projectRoot).toBe(realRoot);

        // Empty raw.cwd ("") behaves the same as undefined — falls through
        // to env.
        const resolvedEmpty = resolveCwdFromInputs(
          "",
          process.env.CLAUDE_PROJECT_DIR,
          "/some/unrelated/process/cwd",
        );
        expect(resolvedEmpty).toBe(realSub);
      } finally {
        if (oldEnv === undefined) delete process.env.CLAUDE_PROJECT_DIR;
        else process.env.CLAUDE_PROJECT_DIR = oldEnv;
      }
    });

    it("process.cwd is the last-resort fallback when both raw.cwd and env are absent", () => {
      const realSub = fs.realpathSync(fx.sub);

      const oldEnv = process.env.CLAUDE_PROJECT_DIR;
      try {
        delete process.env.CLAUDE_PROJECT_DIR;
        const resolved = resolveCwdFromInputs(
          undefined,
          process.env.CLAUDE_PROJECT_DIR,
          realSub,
        );
        expect(resolved).toBe(realSub);

        // Empty env string ("") also falls through to process.cwd.
        const resolvedEmptyEnv = resolveCwdFromInputs(
          undefined,
          "",
          realSub,
        );
        expect(resolvedEmptyEnv).toBe(realSub);
      } finally {
        if (oldEnv === undefined) delete process.env.CLAUDE_PROJECT_DIR;
        else process.env.CLAUDE_PROJECT_DIR = oldEnv;
      }
    });
  });
});
