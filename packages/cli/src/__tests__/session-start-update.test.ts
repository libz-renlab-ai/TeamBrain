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
});
