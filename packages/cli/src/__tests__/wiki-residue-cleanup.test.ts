import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { cleanupWikiResidue } from "../wiki-residue-cleanup.js";

describe("cleanupWikiResidue", () => {
  let homeDir: string;

  beforeEach(() => {
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cleanup-"));
    fs.mkdirSync(path.join(homeDir, ".teamagent"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(homeDir, { recursive: true, force: true });
  });

  it("removes ~/.teamagent/wiki-refresh-errors.log if it exists", () => {
    const target = path.join(homeDir, ".teamagent", "wiki-refresh-errors.log");
    fs.writeFileSync(target, "[old wiki errors]\n", "utf-8");
    expect(fs.existsSync(target)).toBe(true);

    cleanupWikiResidue(homeDir);

    expect(fs.existsSync(target)).toBe(false);
  });

  it("is a no-op when residue does not exist", () => {
    const target = path.join(homeDir, ".teamagent", "wiki-refresh-errors.log");
    expect(fs.existsSync(target)).toBe(false);

    expect(() => cleanupWikiResidue(homeDir)).not.toThrow();

    expect(fs.existsSync(target)).toBe(false);
  });

  it("does not touch other files in ~/.teamagent/", () => {
    const wikiLog = path.join(homeDir, ".teamagent", "wiki-refresh-errors.log");
    const stopLog = path.join(homeDir, ".teamagent", "stop-errors.log");
    const config = path.join(homeDir, ".teamagent", "config.json");
    fs.writeFileSync(wikiLog, "x", "utf-8");
    fs.writeFileSync(stopLog, "y", "utf-8");
    fs.writeFileSync(config, "{}", "utf-8");

    cleanupWikiResidue(homeDir);

    expect(fs.existsSync(wikiLog)).toBe(false);
    expect(fs.existsSync(stopLog)).toBe(true);
    expect(fs.existsSync(config)).toBe(true);
  });

  it("silently ignores fs errors (e.g. permission denied)", () => {
    // Pass a non-existent homeDir → fs.unlinkSync would throw, but cleanup
    // must swallow.
    const ghostHome = path.join(homeDir, "does-not-exist");
    expect(() => cleanupWikiResidue(ghostHome)).not.toThrow();
  });
});
