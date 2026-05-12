import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  shouldSpawnUpdater,
  maybeShowPendingBanner,
  readUpdateState,
  writeUpdateState,
} from "../session-start-logic.js";
import { defaultUpdateState } from "@teamagent/core";

let homeBak: string | undefined;
let tmpHome: string;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "tg-update-"));
  homeBak = process.env["TEAMAGENT_HOME"];
  process.env["TEAMAGENT_HOME"] = tmpHome;
});

afterEach(() => {
  if (homeBak === undefined) delete process.env["TEAMAGENT_HOME"];
  else process.env["TEAMAGENT_HOME"] = homeBak;
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

describe("session-start update helpers", () => {
  it("shouldSpawnUpdater returns true when state never checked", () => {
    expect(shouldSpawnUpdater()).toBe(true);
  });

  it("respects TEAMAGENT_AUTO_UPDATE=0", () => {
    process.env["TEAMAGENT_AUTO_UPDATE"] = "0";
    try {
      expect(shouldSpawnUpdater()).toBe(false);
    } finally {
      delete process.env["TEAMAGENT_AUTO_UPDATE"];
    }
  });

  it("respects auto-update.disabled marker", () => {
    fs.writeFileSync(path.join(tmpHome, "auto-update.disabled"), "");
    expect(shouldSpawnUpdater()).toBe(false);
  });

  it("maybeShowPendingBanner writes once and marks shown", () => {
    const state = {
      ...defaultUpdateState(),
      pending_banner: { from: "abcdefg1234567", to: "1234567abcdefg", at: 1, shown: false },
    };
    writeUpdateState(state);
    let captured = "";
    maybeShowPendingBanner((s) => { captured += s; });
    expect(captured).toContain("→");
    expect(readUpdateState().pending_banner?.shown).toBe(true);

    let captured2 = "";
    maybeShowPendingBanner((s) => { captured2 += s; });
    expect(captured2).toBe("");
  });

  it("maybeShowPendingBanner noop when banner null", () => {
    writeUpdateState(defaultUpdateState());
    let captured = "";
    maybeShowPendingBanner((s) => { captured += s; });
    expect(captured).toBe("");
  });

  // Post-merge PR-creator force-update feature.
  it("maybeShowPendingBanner uses 🎯 PR-creator template when pr_creator=true + pr_number set", () => {
    const state = {
      ...defaultUpdateState(),
      pending_banner: {
        from: "0.11.5",
        to: "0.11.6",
        at: 1,
        shown: false,
        pr_creator: true,
        pr_number: 348,
      },
    };
    writeUpdateState(state);
    let captured = "";
    maybeShowPendingBanner((s) => { captured += s; });
    expect(captured).toContain("🎯");
    expect(captured).toContain("PR #348");
    expect(captured).toContain("merge");
    expect(captured).toContain("强制刷新");
    expect(captured).not.toContain("✨");
    // Mark-shown semantic still works.
    expect(readUpdateState().pending_banner?.shown).toBe(true);
  });

  it("maybeShowPendingBanner falls back to PR-creator template without PR# when pr_number missing", () => {
    const state = {
      ...defaultUpdateState(),
      pending_banner: {
        from: "0.11.5",
        to: "0.11.6",
        at: 1,
        shown: false,
        pr_creator: true,
        // pr_number absent — partial data path
      },
    };
    writeUpdateState(state);
    let captured = "";
    maybeShowPendingBanner((s) => { captured += s; });
    expect(captured).toContain("🎯");
    expect(captured).not.toContain("PR #");
    expect(captured).toContain("merge");
  });

  it("maybeShowPendingBanner uses legacy ✨ template when pr_creator absent (back-compat)", () => {
    const state = {
      ...defaultUpdateState(),
      pending_banner: { from: "0.11.5", to: "0.11.6", at: 1, shown: false },
    };
    writeUpdateState(state);
    let captured = "";
    maybeShowPendingBanner((s) => { captured += s; });
    expect(captured).toContain("✨");
    expect(captured).not.toContain("🎯");
    expect(captured).not.toContain("PR #");
  });
});
