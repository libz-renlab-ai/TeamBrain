/*
 *   try.test.ts — issue 174 / W2
 *   ┌────────────────────────────────────────┐
 *   │  executeTry({help:true}) ─> usage 块   │
 *   │  executeTry({delayMs:0}) ─> 5 cases     │
 *   │  hook output ─> '拦截' / 'TeamAgent'   │
 *   └────────────────────────────────────────┘
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { executeTry } from "../commands/try.js";
import * as demoHookModule from "../commands/demo-hook.js";

function rmRetry(p: string) {
  for (let i = 0; i < 8; i++) {
    try { fs.rmSync(p, { recursive: true, force: true }); return; } catch (e: any) {
      if ((e.code === "EBUSY" || e.code === "EPERM") && i < 7) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
        continue;
      }
      return;
    }
  }
}

function mkTmp() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "try-cwd-"));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "try-home-"));
  return {
    cwd,
    home,
    cleanup: () => { rmRetry(cwd); rmRetry(home); },
  };
}

describe("executeTry --help", () => {
  it("returns help block with 用法: and 5 case names, exitCode 0", async () => {
    const r = await executeTry({ help: true });
    expect(r.exitCode).toBe(0);
    expect(r.output).toContain("用法:");
    // 5 case names from spec
    expect(r.output).toContain("npm install moment");
    expect(r.output).toContain("rm -rf /");
    expect(r.output).toContain("git push --force");
    expect(r.output).toContain("chmod 777");
    expect(r.output).toContain("Write hardcoded path");
    // Mention of "5" in the help (via the 5 example bullets) — sanity check
    // help has structural form even if the digit "5" doesn't appear literally
    // in the body, the test asserts presence of "用法:" + 5 named cases above.
  });
});

describe("executeTry full run (delayMs: 0)", () => {
  let tmp: ReturnType<typeof mkTmp>;

  beforeEach(() => {
    tmp = mkTmp();
  });

  afterEach(() => {
    tmp.cleanup();
  });

  it("runs to completion, exitCode 0, output contains [1/5] through [5/5] AND 演示完成。", async () => {
    const r = await executeTry({
      delayMs: 0,
      cwd: tmp.cwd,
      homeDir: tmp.home,
    });
    expect(r.exitCode).toBe(0);
    expect(r.output).toContain("[1/5]");
    expect(r.output).toContain("[2/5]");
    expect(r.output).toContain("[3/5]");
    expect(r.output).toContain("[4/5]");
    expect(r.output).toContain("[5/5]");
    expect(r.output).toContain("演示完成。");
    // CTA mentions the demo hook fallback
    expect(r.output).toContain("teamagent demo hook");
  });

  it("each case's section contains a recognizable TeamAgent hook substring", async () => {
    const r = await executeTry({
      delayMs: 0,
      cwd: tmp.cwd,
      homeDir: tmp.home,
    });
    // The real executeDemoHook output always contains "TeamAgent" (and either
    // a 拦截 / warn / 通过 marker depending on rule state). With no DB seeded
    // we get the "通过 (无规则命中)" branch — but it still includes "TeamAgent"
    // and "模拟 PreToolUse 结果". This test asserts the recognizable substring
    // surfaces in every per-case section, proving we did NOT stub the renderer.
    const cases = ["[1/5]", "[2/5]", "[3/5]", "[4/5]", "[5/5]"];
    for (const marker of cases) {
      const idx = r.output.indexOf(marker);
      expect(idx).toBeGreaterThanOrEqual(0);
      // grab up to 600 chars after the marker — enough to cover the whole
      // hook block which is ~10 lines indented.
      const section = r.output.slice(idx, idx + 600);
      expect(section).toContain("TeamAgent");
    }
  });

  // PR #183 fix: per-case error isolation. If executeDemoHook throws on one
  // case, the demo must not abort — it should render `❌ <label>: <err>` and
  // continue. The closing `演示完成。` always runs.
  it("continues past a failed case and still renders 演示完成。 (PR #183 #3)", async () => {
    const realExecute = demoHookModule.executeDemoHook;
    let callCount = 0;
    const spy = vi
      .spyOn(demoHookModule, "executeDemoHook")
      .mockImplementation((opts) => {
        callCount++;
        if (callCount === 3) {
          throw new Error("synthetic-case-3-failure");
        }
        return realExecute(opts);
      });

    try {
      const r = await executeTry({
        delayMs: 0,
        cwd: tmp.cwd,
        homeDir: tmp.home,
      });
      // Demo runs to completion despite the throw on case 3.
      expect(r.exitCode).toBe(0);
      expect(r.output).toContain("[1/5]");
      expect(r.output).toContain("[2/5]");
      expect(r.output).toContain("[3/5]");
      expect(r.output).toContain("[4/5]");
      expect(r.output).toContain("[5/5]");
      expect(r.output).toContain("演示完成。");
      // The failed case shows the ❌ marker with the error message.
      expect(r.output).toContain("❌ git push --force");
      expect(r.output).toContain("synthetic-case-3-failure");
      // All 5 cases were attempted (5 calls into executeDemoHook).
      expect(callCount).toBe(5);
    } finally {
      spy.mockRestore();
    }
  });
});
