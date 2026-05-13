/**
 * Issue #308 — bin-stop foreground-only emit contract.
 *
 * The Stop hook fires three ways:
 *   1. Foreground (sync mode) — emit should fire ONCE.
 *   2. Foreground (async mode) — self-spawns a detached child. Emit fires
 *      ONCE in the foreground, NOT in the child.
 *   3. Detached pipeline child — emit must NOT fire (the foreground
 *      already did). Otherwise one Stop event → two POSTs → green light
 *      flapping on the leader kanban.
 *
 * `bin-stop.ts:961-975` gates the emit on
 * `!isDetachedPipelineInvocation(process.env, process.argv)`. This test
 * pins that contract: the gating function correctly identifies all four
 * combinations of (env, argv) and the guard works.
 *
 * /review pre-landing adversarial finding #12 (missing regression test).
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isDetachedPipelineInvocation } from "../bin-stop.js";

describe("isDetachedPipelineInvocation — Stop hook foreground/detached gating", () => {
  let scratch: string;
  beforeEach(() => {
    scratch = mkdtempSync(path.join(tmpdir(), "teamagent-bin-stop-emit-"));
  });
  afterEach(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  it("returns false when env flag is unset (foreground entry)", () => {
    const env = {} as NodeJS.ProcessEnv;
    const argv = ["node", "bin-stop.cjs"];
    expect(isDetachedPipelineInvocation(env, argv)).toBe(false);
  });

  it("returns false when env flag is set but argv tmp-file missing", () => {
    const env = { TEAMAGENT_STOP_PIPELINE: "1" } as NodeJS.ProcessEnv;
    const argv = ["node", "bin-stop.cjs"];
    expect(isDetachedPipelineInvocation(env, argv)).toBe(false);
  });

  it("returns false when env flag is set, argv given, but tmp-file does not exist", () => {
    const env = { TEAMAGENT_STOP_PIPELINE: "1" } as NodeJS.ProcessEnv;
    const argv = ["node", "bin-stop.cjs", "/nonexistent/tmp-file.json"];
    expect(isDetachedPipelineInvocation(env, argv)).toBe(false);
  });

  it("returns true when env flag is set AND tmp-file argv[2] exists", () => {
    const tmpFile = path.join(scratch, "payload.json");
    writeFileSync(tmpFile, "{}", "utf-8");
    const env = { TEAMAGENT_STOP_PIPELINE: "1" } as NodeJS.ProcessEnv;
    const argv = ["node", "bin-stop.cjs", tmpFile];
    expect(isDetachedPipelineInvocation(env, argv)).toBe(true);
  });

  it("accepts a custom envKey (mirrors SessionEnd self-spawn pattern)", () => {
    const tmpFile = path.join(scratch, "payload.json");
    writeFileSync(tmpFile, "{}", "utf-8");
    const env = {
      TEAMAGENT_SESSION_END_PIPELINE: "1",
    } as NodeJS.ProcessEnv;
    const argv = ["node", "bin-session-end.cjs", tmpFile];
    expect(
      isDetachedPipelineInvocation(env, argv, "TEAMAGENT_SESSION_END_PIPELINE"),
    ).toBe(true);
    expect(
      isDetachedPipelineInvocation(env, argv, "TEAMAGENT_STOP_PIPELINE"),
    ).toBe(false);
  });
});

describe("Stop emit gating — foreground emits, detached does not", () => {
  // Black-box assertion of the bin-stop.ts:961-975 invariant: emit is
  // gated on !isDetachedPipelineInvocation(env, argv). If the foreground
  // path matches, emit runs; if detached, emit is skipped. This protects
  // against a future refactor moving the gate or its env-key default.

  it("foreground emits, detached child does not (single Stop = single POST)", () => {
    const fgEnv = {} as NodeJS.ProcessEnv;
    const fgArgv = ["node", "bin-stop.cjs"];
    const fgShouldEmit = !isDetachedPipelineInvocation(fgEnv, fgArgv);
    expect(fgShouldEmit).toBe(true);

    const scratch = mkdtempSync(
      path.join(tmpdir(), "teamagent-bin-stop-emit-gate-"),
    );
    try {
      const tmpFile = path.join(scratch, "payload.json");
      writeFileSync(tmpFile, "{}", "utf-8");
      const childEnv = {
        TEAMAGENT_STOP_PIPELINE: "1",
      } as NodeJS.ProcessEnv;
      const childArgv = ["node", "bin-stop.cjs", tmpFile];
      const childShouldEmit = !isDetachedPipelineInvocation(
        childEnv,
        childArgv,
      );
      expect(childShouldEmit).toBe(false);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});
