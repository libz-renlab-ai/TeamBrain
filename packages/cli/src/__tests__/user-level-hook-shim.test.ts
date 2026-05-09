import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

import { buildUserLevelHookCommand } from "../lib/user-level-hook-shim.js";

/**
 * Issue #209 regression set. The two required behaviours of the shim are:
 *
 *   1) Bundle missing  -> silent exit 0 (no MODULE_NOT_FOUND spam).
 *   2) Bundle present  -> exec node, exit code + stdin forwarded.
 *
 * These tests exercise the *real shell* (`bash -c '...'`) so a regression in
 * the inline shim string would fail here even if higher-level unit assertions
 * still pass.
 */
describe("buildUserLevelHookCommand — shim shape", () => {
  it("produces a bash -c invocation with path passed as argv ($1), guarded by `[ -f \"$1\" ]`", () => {
    const cmd = buildUserLevelHookCommand("/abs/path/bin-stop.cjs");
    // Body is path-free — path goes through positional argv. This is what
    // makes the shim robust to apostrophes in $HOME (regression test below).
    expect(cmd.startsWith("bash -c '")).toBe(true);
    expect(cmd).toContain(`'[ -f "$1" ] || exit 0; exec node "$1"'`);
    expect(cmd).toContain("|| exit 0");
    // The path appears AFTER the body, as the trailing argv (preceded by
    // `_` placeholder for $0).
    expect(cmd).toMatch(/' _ \/abs\/path\/bin-stop\.cjs$/);
    // No path interpolation inside the body — guards against re-introducing
    // the inline form.
    expect(cmd).not.toContain("[ -f /abs/path/bin-stop.cjs ]");
  });

  it("normalises Windows backslash paths to forward slashes", () => {
    const cmd = buildUserLevelHookCommand("C:\\Users\\u\\.teamagent\\hooks\\bin-stop.cjs");
    expect(cmd).toContain("/Users/u/.teamagent/hooks/bin-stop.cjs");
    expect(cmd).not.toContain("\\Users\\");
  });

  it("double-quotes paths with spaces (shellQuote fallback)", () => {
    const cmd = buildUserLevelHookCommand("/with space/bin.cjs");
    // The argv path must be quoted so /bin/sh parses it as one word.
    expect(cmd).toContain('"/with space/bin.cjs"');
  });

  it("does NOT inline the path inside the outer single-quoted body (apostrophe regression)", () => {
    // Paths under home dirs containing apostrophes (`/home/Jane O'Brien/...`)
    // would close the outer `'...'` if the path were inlined. The fix is to
    // pass the path as positional argv ($1).
    const cmd = buildUserLevelHookCommand("/home/Jane O'Brien/.teamagent/hooks/bin-stop.cjs");
    // The body between `bash -c '` and the next bare `'` must NOT contain
    // the apostrophe (otherwise the body got cut short by it).
    const m = cmd.match(/^bash -c '([^]*?)' _ /);
    expect(m).not.toBeNull();
    const body = m![1];
    expect(body).not.toContain("Jane");
    expect(body).not.toContain("O'Brien");
    // And the body should still reference $1.
    expect(body).toContain('"$1"');
  });
});

/**
 * Skip the real-shell integration tests on Windows: install-hook.ts already
 * assumes `bash` is on PATH (see project-level `.claude/hooks/digital-twin-
 * tap.sh` which uses the same shape), but vitest CI runners on Windows may
 * not provide it. The shape unit tests above still execute everywhere.
 */
const describeUnix = process.platform === "win32" ? describe.skip : describe;

describeUnix("buildUserLevelHookCommand — runtime semantics", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "shim-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("missing bundle: exits 0 silently (no stderr, no MODULE_NOT_FOUND)", () => {
    const missing = path.join(tmpDir, "does-not-exist.cjs");
    expect(fs.existsSync(missing)).toBe(false);

    const cmd = buildUserLevelHookCommand(missing);
    const r = spawnSync("bash", ["-c", cmd], { encoding: "utf-8" });

    expect(r.status).toBe(0);
    expect(r.stderr).toBe("");
    expect(r.stdout).toBe("");
  });

  it("present bundle: execs node, propagates exit code and stdin", () => {
    // Tiny bundle: read stdin, echo it to stdout, exit 7.
    const bundle = path.join(tmpDir, "bin-stop.cjs");
    fs.writeFileSync(
      bundle,
      `let buf = "";
process.stdin.on("data", (c) => { buf += c; });
process.stdin.on("end", () => {
  process.stdout.write("got: " + buf);
  process.exit(7);
});
`,
      "utf-8",
    );

    const cmd = buildUserLevelHookCommand(bundle);
    const r = spawnSync("bash", ["-c", cmd], {
      encoding: "utf-8",
      input: "hello",
    });

    expect(r.status).toBe(7);
    expect(r.stdout).toBe("got: hello");
    expect(r.stderr).toBe("");
  });

  it("apostrophe in path: shim runs without bash syntax error (review-found regression)", () => {
    // Plant a real bundle under a directory whose name contains an apostrophe.
    // Pre-fix shim form `bash -c '[ -f <inline-path> ] ...'` would have its
    // outer single-quoted body torn open by the apostrophe and bash would
    // exit non-zero with a syntax error. The argv-passed form is immune.
    const aposDir = path.join(tmpDir, "Jane O'Brien");
    fs.mkdirSync(aposDir, { recursive: true });
    const bundle = path.join(aposDir, "bin-stop.cjs");
    fs.writeFileSync(bundle, `process.exit(0);\n`, "utf-8");

    const cmd = buildUserLevelHookCommand(bundle);
    const r = spawnSync("bash", ["-c", cmd], { encoding: "utf-8" });

    expect(r.status).toBe(0);
    expect(r.stderr).toBe("");
  });

  it("present bundle that throws: stderr surfaces (no shim-level swallowing)", () => {
    // We deliberately do NOT silently swallow real bundle errors — those are
    // genuine bugs that should be visible. Only MODULE_NOT_FOUND / missing
    // file is suppressed.
    const bundle = path.join(tmpDir, "bin-stop.cjs");
    fs.writeFileSync(bundle, `throw new Error("boom");\n`, "utf-8");

    const cmd = buildUserLevelHookCommand(bundle);
    const r = spawnSync("bash", ["-c", cmd], { encoding: "utf-8" });

    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("boom");
  });
});
