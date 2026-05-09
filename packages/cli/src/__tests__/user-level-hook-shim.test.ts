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
  it("produces a bash -c invocation guarded by `[ -f <path> ]`", () => {
    const cmd = buildUserLevelHookCommand("/abs/path/bin-stop.cjs");
    expect(cmd.startsWith("bash -c '")).toBe(true);
    expect(cmd).toContain("[ -f /abs/path/bin-stop.cjs ]");
    expect(cmd).toContain("|| exit 0");
    expect(cmd).toContain("exec node /abs/path/bin-stop.cjs");
  });

  it("normalises Windows backslash paths to forward slashes", () => {
    const cmd = buildUserLevelHookCommand("C:\\Users\\u\\.teamagent\\hooks\\bin-stop.cjs");
    expect(cmd).toContain("/Users/u/.teamagent/hooks/bin-stop.cjs");
    expect(cmd).not.toContain("\\Users\\");
  });

  it("double-quotes paths with non-ASCII / spaces (shellQuote fallback)", () => {
    const cmd = buildUserLevelHookCommand("/with space/bin.cjs");
    // The path must be quoted so the test inside `[ -f ... ]` parses as one
    // word; bare `[ -f /with space/bin.cjs ]` would syntax-error.
    expect(cmd).toContain('"/with space/bin.cjs"');
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
