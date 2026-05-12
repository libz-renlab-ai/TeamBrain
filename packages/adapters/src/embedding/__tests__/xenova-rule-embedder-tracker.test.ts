/**
 * Issue #315 — TEAMAGENT_XENOVA_TRACKER env-gated ctor instrument.
 *
 * Verifies that:
 *   1. With env unset, the ctor does not touch any file (zero IO cost).
 *   2. With TEAMAGENT_XENOVA_TRACKER=<path>, each `new XenovaRuleEmbedder()`
 *      appends exactly one line with `${ts} pid=${pid} argv=<argv>` shape.
 *   3. With TEAMAGENT_XENOVA_TRACKER_FAIL_FAST=1, the 2nd ctor in the same
 *      process triggers `process.exit(2)` (defensive — harness uses this to
 *      kill the fan-out the moment a regression appears so the test machine
 *      itself does not get OOM-spiked).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

vi.mock("@xenova/transformers", () => ({
  pipeline: vi.fn(),
  env: { remoteHost: "https://huggingface.co/" },
}));

const { XenovaRuleEmbedder } = await import("../xenova-rule-embedder.js");

describe("XenovaRuleEmbedder ctor tracker (issue #315)", () => {
  let tmpFile: string;

  beforeEach(() => {
    tmpFile = path.join(
      os.tmpdir(),
      `xenova-tracker-${Date.now()}-${Math.random().toString(36).slice(2)}.log`,
    );
    delete process.env["TEAMAGENT_XENOVA_TRACKER"];
    delete process.env["TEAMAGENT_XENOVA_TRACKER_FAIL_FAST"];
  });

  afterEach(() => {
    try { fs.unlinkSync(tmpFile); } catch { /* best-effort */ }
    delete process.env["TEAMAGENT_XENOVA_TRACKER"];
    delete process.env["TEAMAGENT_XENOVA_TRACKER_FAIL_FAST"];
  });

  it("env unset: ctor writes nothing", () => {
    new XenovaRuleEmbedder();
    expect(fs.existsSync(tmpFile)).toBe(false);
  });

  it("env set: ctor appends one line per construction", () => {
    process.env["TEAMAGENT_XENOVA_TRACKER"] = tmpFile;
    new XenovaRuleEmbedder();
    new XenovaRuleEmbedder();
    new XenovaRuleEmbedder();
    const lines = fs.readFileSync(tmpFile, "utf-8").split("\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(line).toMatch(/^\d+ pid=\d+ argv=/);
    }
  });

  it("FAIL_FAST=1: 2nd ctor calls process.exit(2)", () => {
    process.env["TEAMAGENT_XENOVA_TRACKER"] = tmpFile;
    process.env["TEAMAGENT_XENOVA_TRACKER_FAIL_FAST"] = "1";
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((_code?: number) => undefined) as never);
    try {
      new XenovaRuleEmbedder(); // 1st: writes line, no exit
      expect(exitSpy).not.toHaveBeenCalled();
      new XenovaRuleEmbedder(); // 2nd: writes line, triggers exit(2)
      expect(exitSpy).toHaveBeenCalledWith(2);
    } finally {
      exitSpy.mockRestore();
    }
  });

  it("FAIL_FAST=1: 1st ctor does NOT exit (only ≥2 lines trigger)", () => {
    process.env["TEAMAGENT_XENOVA_TRACKER"] = tmpFile;
    process.env["TEAMAGENT_XENOVA_TRACKER_FAIL_FAST"] = "1";
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((_code?: number) => undefined) as never);
    try {
      new XenovaRuleEmbedder();
      expect(exitSpy).not.toHaveBeenCalled();
    } finally {
      exitSpy.mockRestore();
    }
  });

  it("tracker write failure does not break ctor", () => {
    // Point to a path inside a non-existent directory so appendFileSync throws.
    process.env["TEAMAGENT_XENOVA_TRACKER"] = path.join(
      os.tmpdir(),
      "nonexistent-dir-issue-315",
      "tracker.log",
    );
    expect(() => new XenovaRuleEmbedder()).not.toThrow();
  });
});
