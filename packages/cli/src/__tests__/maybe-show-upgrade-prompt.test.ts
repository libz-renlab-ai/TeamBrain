import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  maybeShowUpgradePrompt,
  readUpdateState,
  writeUpdateState,
} from "../session-start-logic.js";
import { defaultUpdateState } from "@teamagent/core";

let homeBak: string | undefined;
let neverPromptBak: string | undefined;
let tmpHome: string;

const FIXTURE_CHANGELOG = `# CHANGELOG

## Unreleased

### Fixed

- pending only

## [0.10.5] — 2026-05-09

### Fixed

- **Issue #1**: Windows install fixed
- warmup now exits 0 with skip message

## [0.10.1] — 2026-04-25

### Fixed

- old version, must not surface
`;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "tg-upgrade-prompt-"));
  homeBak = process.env["TEAMAGENT_HOME"];
  neverPromptBak = process.env["TEAMAGENT_NEVER_PROMPT"];
  process.env["TEAMAGENT_HOME"] = tmpHome;
  delete process.env["TEAMAGENT_NEVER_PROMPT"];
});

afterEach(() => {
  if (homeBak === undefined) delete process.env["TEAMAGENT_HOME"];
  else process.env["TEAMAGENT_HOME"] = homeBak;
  if (neverPromptBak === undefined) delete process.env["TEAMAGENT_NEVER_PROMPT"];
  else process.env["TEAMAGENT_NEVER_PROMPT"] = neverPromptBak;
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

function loadFixtureChangelog(): string {
  return FIXTURE_CHANGELOG;
}

describe("maybeShowUpgradePrompt", () => {
  it("emits banner with bullets when pending banner + no snooze + not never", () => {
    writeUpdateState({
      ...defaultUpdateState(),
      last_installed_version: "0.10.1",
      pending_banner: { from: "old", to: "new12345", at: 0, shown: false },
    });
    let captured = "";
    maybeShowUpgradePrompt(
      (s) => {
        captured += s;
      },
      () => 0,
      loadFixtureChangelog,
    );
    expect(captured).toContain("TeamAgent 0.10.5 可用");
    expect(captured).toContain("0.10.1");
    expect(captured).toContain("Windows install fixed");
    expect(captured).toContain("teamagent update --now");
    expect(captured).toContain("teamagent update --snooze");
    expect(captured).toContain("teamagent update --never");
  });

  it("does NOT mark pending_banner.shown=true (re-fires every SessionStart)", () => {
    writeUpdateState({
      ...defaultUpdateState(),
      last_installed_version: "0.10.1",
      pending_banner: { from: "old", to: "new12345", at: 0, shown: false },
    });
    let captured = "";
    maybeShowUpgradePrompt(
      (s) => {
        captured += s;
      },
      () => 0,
      loadFixtureChangelog,
    );
    expect(captured.length).toBeGreaterThan(0);
    const after = readUpdateState();
    expect(after.pending_banner?.shown).toBe(false);
  });

  it("emits nothing when never_prompt=true", () => {
    writeUpdateState({
      ...defaultUpdateState(),
      last_installed_version: "0.10.1",
      pending_banner: { from: "old", to: "new12345", at: 0, shown: false },
      never_prompt: true,
    });
    let captured = "";
    maybeShowUpgradePrompt(
      (s) => {
        captured += s;
      },
      () => 0,
      loadFixtureChangelog,
    );
    expect(captured).toBe("");
  });

  it("emits nothing when TEAMAGENT_NEVER_PROMPT=1 (env override)", () => {
    process.env["TEAMAGENT_NEVER_PROMPT"] = "1";
    writeUpdateState({
      ...defaultUpdateState(),
      last_installed_version: "0.10.1",
      pending_banner: { from: "old", to: "new12345", at: 0, shown: false },
    });
    let captured = "";
    maybeShowUpgradePrompt(
      (s) => {
        captured += s;
      },
      () => 0,
      loadFixtureChangelog,
    );
    expect(captured).toBe("");
  });

  it("emits nothing when snooze window is still active", () => {
    writeUpdateState({
      ...defaultUpdateState(),
      last_installed_version: "0.10.1",
      pending_banner: { from: "old", to: "new12345", at: 0, shown: false },
      snooze_until_ts: 24 * 60 * 60 * 1000,
    });
    let captured = "";
    maybeShowUpgradePrompt(
      (s) => {
        captured += s;
      },
      () => 12 * 60 * 60 * 1000, // halfway through snooze
      loadFixtureChangelog,
    );
    expect(captured).toBe("");
  });

  it("emits banner once snooze window has elapsed", () => {
    writeUpdateState({
      ...defaultUpdateState(),
      last_installed_version: "0.10.1",
      pending_banner: { from: "old", to: "new12345", at: 0, shown: false },
      snooze_until_ts: 24 * 60 * 60 * 1000,
      snooze_level: 1,
    });
    let captured = "";
    maybeShowUpgradePrompt(
      (s) => {
        captured += s;
      },
      () => 25 * 60 * 60 * 1000, // 1h past snooze
      loadFixtureChangelog,
    );
    expect(captured).toContain("TeamAgent");
    expect(captured).toContain("已 snooze 1 次");
  });

  it("emits nothing when no pending banner exists", () => {
    writeUpdateState(defaultUpdateState());
    let captured = "";
    maybeShowUpgradePrompt(
      (s) => {
        captured += s;
      },
      () => 0,
      loadFixtureChangelog,
    );
    expect(captured).toBe("");
  });

  it("falls back to SHA prefix when CHANGELOG cannot be loaded", () => {
    writeUpdateState({
      ...defaultUpdateState(),
      last_installed_version: "0.10.1",
      pending_banner: { from: "old", to: "abcdef1234567890", at: 0, shown: false },
    });
    let captured = "";
    maybeShowUpgradePrompt(
      (s) => {
        captured += s;
      },
      () => 0,
      () => "", // no changelog
    );
    expect(captured).toContain("abcdef1");
    expect(captured).toContain("teamagent update --now");
  });

  // Issue #225 iter-1 — soft-force re-fire semantic
  it("re-fires across multiple SessionStarts when no dismissal happens between (issue #225 iter-1)", () => {
    writeUpdateState({
      ...defaultUpdateState(),
      last_installed_version: "0.10.1",
      pending_banner: { from: "old", to: "newSHA", at: 0, shown: false },
    });
    let firstCall = "";
    let secondCall = "";
    maybeShowUpgradePrompt((s) => { firstCall += s; }, () => 1000, loadFixtureChangelog);
    maybeShowUpgradePrompt((s) => { secondCall += s; }, () => 2000, loadFixtureChangelog);
    expect(firstCall).toContain("teamagent update --now");
    expect(secondCall).toContain("teamagent update --now");
  });

  it("re-fires even when pending_banner.shown=true (decoupled from legacy banner)", () => {
    writeUpdateState({
      ...defaultUpdateState(),
      last_installed_version: "0.10.1",
      // shown=true would suppress the legacy maybeShowPendingBanner; the new
      // soft-force prompt is decoupled and still fires.
      pending_banner: { from: "old", to: "newSHA", at: 0, shown: true },
    });
    let captured = "";
    maybeShowUpgradePrompt((s) => { captured += s; }, () => 1000, loadFixtureChangelog);
    expect(captured).toContain("teamagent update --now");
  });

  it("stops re-firing once user dismisses via prompt_dismissed_for_to", () => {
    writeUpdateState({
      ...defaultUpdateState(),
      last_installed_version: "0.10.1",
      pending_banner: { from: "old", to: "newSHA", at: 0, shown: false },
      prompt_dismissed_for_to: "newSHA",
    });
    let captured = "";
    maybeShowUpgradePrompt((s) => { captured += s; }, () => 1000, loadFixtureChangelog);
    expect(captured).toBe("");
  });

  it("re-fires when a NEW pending_banner.to lands after a prior dismissal", () => {
    writeUpdateState({
      ...defaultUpdateState(),
      last_installed_version: "0.10.1",
      pending_banner: { from: "old", to: "evenNewerSHA", at: 0, shown: false },
      prompt_dismissed_for_to: "newSHA",
    });
    let captured = "";
    maybeShowUpgradePrompt((s) => { captured += s; }, () => 1000, loadFixtureChangelog);
    expect(captured).toContain("teamagent update --now");
  });

  // Issue #245 — AttributionBus emit + events.db persistence
  it("emits update-prompt-shown to bus AND event log when banner shows", () => {
    writeUpdateState({
      ...defaultUpdateState(),
      last_installed_version: "0.10.1",
      pending_banner: { from: "old", to: "newSHA", at: 0, shown: false },
      snooze_level: 2,
    });
    const emitted: { kind: string; fromVer: string; toVer: string; snoozeLevel: number }[] = [];
    const persisted: { id: string; kind: string; payload: Record<string, unknown> }[] = [];
    const bus = {
      emit(e: { kind: string; fromVer?: string; toVer?: string; snoozeLevel?: number }) {
        emitted.push({
          kind: e.kind,
          fromVer: e.fromVer ?? "",
          toVer: e.toVer ?? "",
          snoozeLevel: e.snoozeLevel ?? -1,
        });
      },
      subscribe: () => () => undefined,
      drain: () => [],
    };
    const eventLog = {
      append(row: { id: string; kind: string; payload: Record<string, unknown> }) {
        persisted.push(row);
      },
    };
    let captured = "";
    maybeShowUpgradePrompt(
      (s) => { captured += s; },
      () => 12345,
      loadFixtureChangelog,
      { bus, eventLog, randSuffix: () => "fix" },
    );
    expect(captured).toContain("teamagent update --now");
    // bus emit
    expect(emitted).toEqual([
      { kind: "update-prompt-shown", fromVer: "0.10.1", toVer: "0.10.5", snoozeLevel: 2 },
    ]);
    // events.db persist
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.kind).toBe("update-prompt-shown");
    expect(persisted[0]?.payload).toEqual({
      fromVer: "0.10.1",
      toVer: "0.10.5",
      snoozeLevel: 2,
    });
  });
});
