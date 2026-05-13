import { describe, it, expect } from "vitest";
import { parseRecordingArgs } from "../commands/recording.js";
import { parseRecordArgs, RecordArgError } from "../commands/record.js";

/**
 * Issue #296 — `recording` namespace collision between Recording Memory and
 * digital-twin audio recorder. Two CLI subcommands (`teamagent recording` and
 * `teamagent record`) both expose `import`, and a user passing the wrong file
 * shape used to get a cryptic JSON.parse / ffmpeg error.
 *
 * Tests the parse-time guards added in this PR:
 *   (1) `teamagent recording import --file audio.ogg` → redirect error
 *       pointing at `teamagent record import`.
 *   (2) `teamagent record import transcript.json` → redirect error pointing
 *       at `teamagent recording import --file ...`.
 *
 * Out of scope (deferred to a follow-up PR per body option 3 / grill §31):
 *   - Rename `teamagent record` → `teamagent audio` with `record` alias.
 *   - REST route `/v1/recordings` → `/v1/audio-recordings`.
 *   - `AudioRecordingStarted` / `AudioUploaded` / etc event-source plugins.
 *
 * The current PR ships body options 1 (docs / help-text disambiguation)
 * and 2 (parse-time guardrail) only; option 3 is a multi-system rename
 * that would balloon scope and risk digital-twin daemon regressions.
 */
describe("issue #296 — recording / record CLI disambiguation", () => {
  describe("teamagent recording import (Recording Memory)", () => {
    it.each([
      ["foo.ogg"],
      ["foo.opus"],
      ["foo.wav"],
      ["foo.mp3"],
      ["foo.m4a"],
      ["foo.flac"],
      ["foo.webm"],
      ["foo.aac"],
      // Case-insensitive — common when ffmpeg or screen-recorder produces .OGG.
      ["FOO.OGG"],
      ["mixed.OpUs"],
    ])("rejects audio file %s with a redirect to teamagent record import", (audioFile) => {
      expect(() =>
        parseRecordingArgs(["import", "--file", audioFile]),
      ).toThrow(/teamagent record import/);
      expect(() =>
        parseRecordingArgs(["import", "--file", audioFile]),
      ).toThrow(/transcript JSON/);
    });

    it("still accepts a transcript JSON file (happy path unchanged)", () => {
      const opts = parseRecordingArgs(["import", "--file", "material.json"]);
      expect(opts.action).toBe("import");
      expect(opts.filePath).toBe("material.json");
    });

    it("help output cross-links to teamagent record for audio", () => {
      const r = parseRecordingArgs(["--help"]);
      expect(r.action).toBe("help");
    });
  });

  describe("teamagent record import (digital-twin audio recorder)", () => {
    it("rejects a .json transcript file with a redirect to teamagent recording", () => {
      expect(() => parseRecordArgs(["import", "transcript.json"])).toThrow(RecordArgError);
      expect(() => parseRecordArgs(["import", "transcript.json"])).toThrow(
        /teamagent recording import/,
      );
    });

    it("rejects .JSON case-insensitively", () => {
      expect(() => parseRecordArgs(["import", "Transcript.JSON"])).toThrow(
        /teamagent recording import/,
      );
    });

    it("still accepts an audio file (happy path unchanged)", () => {
      expect(parseRecordArgs(["import", "meeting.ogg"])).toEqual({
        sub: "import",
        filePath: "meeting.ogg",
      });
      expect(parseRecordArgs(["import", "raw.wav", "--label", "demo"])).toEqual({
        sub: "import",
        filePath: "raw.wav",
        label: "demo",
      });
    });

    it("top-level usage text mentions the sibling 'teamagent recording' subsystem", () => {
      try {
        parseRecordArgs([]);
        expect.fail("expected RecordArgError");
      } catch (err) {
        expect(err).toBeInstanceOf(RecordArgError);
        expect((err as RecordArgError).message).toMatch(/teamagent recording/);
        expect((err as RecordArgError).message).toMatch(/digital-twin audio recorder/);
      }
    });
  });
});
