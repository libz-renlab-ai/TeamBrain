import { describe, it, expect } from "vitest";
import { parseRecordArgs, RecordArgError } from "../commands/record.js";

/**
 * Issue #310 — body: "不需要开电脑，随时开录" (record without opening the laptop).
 *
 * Minimal scope shipped in this PR: discoverability fix for the
 * already-supported `teamagent record import <file>` path. The CLI already
 * accepted arbitrary audio files (m4a / wav / mp3 / ogg / opus / flac);
 * the gap was that users didn't know `import` was the off-device entry
 * point.
 *
 * Deferred (PR body explains): PWA / mobile-web one-tap recorder, Audio
 * Event API backend, and the `record` → `audio` CLI rename from grill §31.
 *
 * Test focus: the new error / usage messages surface the off-device path
 * to anyone running `teamagent record import` without a filename.
 */
describe("issue #310 — teamagent record import help text (off-device path)", () => {
  it("usage error for missing filename mentions phone / external recorder recipe", () => {
    try {
      parseRecordArgs(["import"]);
      expect.fail("expected RecordArgError");
    } catch (err) {
      expect(err).toBeInstanceOf(RecordArgError);
      const msg = (err as RecordArgError).message;
      expect(msg).toMatch(/teamagent record import/);
      // Mentions off-device origin — the literal body ask "不需要开电脑".
      expect(msg.toLowerCase()).toMatch(/phone|external recorder|off-device/);
      // Names at least one common external-recorder container format so
      // the user has a concrete starting point.
      expect(msg.toLowerCase()).toMatch(/m4a|wav|mp3/);
    }
  });

  it("still parses valid `record import <file>` invocations unchanged", () => {
    expect(parseRecordArgs(["import", "voice-memo.m4a"])).toEqual({
      sub: "import",
      filePath: "voice-memo.m4a",
    });
    expect(parseRecordArgs(["import", "call.wav", "--label", "client-call"])).toEqual({
      sub: "import",
      filePath: "call.wav",
      label: "client-call",
    });
  });
});
