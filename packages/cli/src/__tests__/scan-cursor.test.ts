import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  readCursor,
  writeCursor,
  clearCursor,
  getCursorFilePath,
  CURSOR_FILE_RELATIVE,
  readSeen,
  writeSeen,
  writeCursorAndSeen,
} from "../scan-cursor.js";

function makeTmpCwd(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ta-cursor-"));
  return dir;
}

describe("scan-cursor", () => {
  describe("getCursorFilePath", () => {
    it("resolves to .teamagent/scan-cursor.json under cwd", () => {
      const cwd = makeTmpCwd();
      expect(getCursorFilePath(cwd)).toBe(path.join(cwd, CURSOR_FILE_RELATIVE));
    });
  });

  describe("readCursor", () => {
    let cwd: string;
    beforeEach(() => { cwd = makeTmpCwd(); });

    it("returns -1 when cursor file does not exist", () => {
      expect(readCursor(cwd, "session-abc")).toBe(-1);
    });

    it("returns -1 when session_id not found in existing cursor file", () => {
      writeCursor(cwd, "other-session", 5);
      expect(readCursor(cwd, "session-abc")).toBe(-1);
    });

    it("returns stored last_scanned_turn for known session", () => {
      writeCursor(cwd, "session-abc", 12);
      expect(readCursor(cwd, "session-abc")).toBe(12);
    });

    it("returns -1 when cursor file is corrupt JSON", () => {
      const file = getCursorFilePath(cwd);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, "{ not json", "utf-8");
      expect(readCursor(cwd, "session-abc")).toBe(-1);
    });
  });

  describe("writeCursor", () => {
    let cwd: string;
    beforeEach(() => { cwd = makeTmpCwd(); });

    it("creates file and sessions map on first write", () => {
      writeCursor(cwd, "s1", 3);
      const raw = fs.readFileSync(getCursorFilePath(cwd), "utf-8");
      const parsed = JSON.parse(raw);
      expect(parsed.sessions.s1.last_scanned_turn).toBe(3);
      expect(typeof parsed.sessions.s1.updated_at).toBe("string");
    });

    it("updates existing entry without clobbering other sessions", () => {
      writeCursor(cwd, "s1", 3);
      writeCursor(cwd, "s2", 7);
      writeCursor(cwd, "s1", 10);
      const raw = fs.readFileSync(getCursorFilePath(cwd), "utf-8");
      const parsed = JSON.parse(raw);
      expect(parsed.sessions.s1.last_scanned_turn).toBe(10);
      expect(parsed.sessions.s2.last_scanned_turn).toBe(7);
    });

    it("accepts 0 and negative values (no implicit floor)", () => {
      writeCursor(cwd, "s1", 0);
      expect(readCursor(cwd, "s1")).toBe(0);
    });
  });

  describe("clearCursor", () => {
    let cwd: string;
    beforeEach(() => { cwd = makeTmpCwd(); });

    it("removes only the named session", () => {
      writeCursor(cwd, "s1", 3);
      writeCursor(cwd, "s2", 7);
      clearCursor(cwd, "s1");
      expect(readCursor(cwd, "s1")).toBe(-1);
      expect(readCursor(cwd, "s2")).toBe(7);
    });

    it("is idempotent on missing entry", () => {
      expect(() => clearCursor(cwd, "nope")).not.toThrow();
    });

    it("is idempotent on missing file", () => {
      const freshCwd = makeTmpCwd();
      expect(() => clearCursor(freshCwd, "nope")).not.toThrow();
    });
  });
});

describe("walk-up (#161): scan-cursor resolves from subfolder", () => {
  it("readCursor resolves cursor file from parent when cwd is a subfolder", () => {
    const root = makeTmpCwd();
    // Write cursor at root level
    writeCursor(root, "sess-161", 42);
    // Call from a subfolder
    const sub = path.join(root, "sub");
    fs.mkdirSync(sub, { recursive: true });
    // Create knowledge.db AND project marker at root so hardened walk-up matches
    fs.writeFileSync(path.join(root, ".teamagent", "knowledge.db"), "");
    fs.writeFileSync(path.join(root, "package.json"), "{}");
    expect(readCursor(sub, "sess-161")).toBe(42);
  });
});

describe("B-051: atomic writeCursorAndSeen", () => {
  it("writeCursorAndSeen writes both cursor and seen atomically", () => {
    const dir = makeTmpCwd();
    writeCursorAndSeen(dir, "sess-b051", 7, new Set(["sig1", "sig2"]));
    expect(readCursor(dir, "sess-b051")).toBe(7);
    const seen = readSeen(dir, "sess-b051");
    expect(seen.has("sig1")).toBe(true);
    expect(seen.has("sig2")).toBe(true);
  });

  it("writeCursorAndSeen overwrites previous cursor+seen atomically", () => {
    const dir = makeTmpCwd();
    writeCursor(dir, "sess-b051b", 3);
    writeSeen(dir, "sess-b051b", new Set(["old"]));
    writeCursorAndSeen(dir, "sess-b051b", 5, new Set(["new1"]));
    expect(readCursor(dir, "sess-b051b")).toBe(5);
    const seen = readSeen(dir, "sess-b051b");
    expect(seen.has("new1")).toBe(true);
    expect(seen.has("old")).toBe(false);
  });
});
