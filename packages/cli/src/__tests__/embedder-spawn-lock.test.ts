/**
 * Issue #315 — embedder-spawn-lock unit tests.
 *
 * Covers the three lock-state transitions used by tryDetachedSpawn (Race α)
 * and bin-embedder.tryAcquireLock startup (Race β):
 *
 *   • happy path — first caller wins, second caller blocked
 *   • release path — after release, next caller acquires fresh
 *   • stale takeover — lock older than staleMs is auto-cleared and reclaimed
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { tryAcquireSpawnLock } from "../embedder-spawn-lock.js";

describe("tryAcquireSpawnLock", () => {
  let tmpDir: string;
  let lockPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spawn-lock-"));
    lockPath = path.join(tmpDir, "test.lock");
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
  });

  it("first caller wins, second caller gets null", () => {
    const h1 = tryAcquireSpawnLock(lockPath);
    expect(h1).not.toBeNull();
    expect(h1?.path).toBe(lockPath);
    expect(fs.existsSync(lockPath)).toBe(true);

    const h2 = tryAcquireSpawnLock(lockPath);
    expect(h2).toBeNull();

    h1?.release();
  });

  it("release unlinks the lock file and lets the next caller in", () => {
    const h1 = tryAcquireSpawnLock(lockPath);
    expect(h1).not.toBeNull();
    h1?.release();
    expect(fs.existsSync(lockPath)).toBe(false);

    const h2 = tryAcquireSpawnLock(lockPath);
    expect(h2).not.toBeNull();
    h2?.release();
  });

  it("stale lock (mtime > staleMs) is auto-takeover", () => {
    // Plant a "crashed holder" lock file with an ancient mtime.
    fs.writeFileSync(lockPath, "fake pid\nfake iso\n");
    const old = Date.now() / 1000 - 60; // 60s ago
    fs.utimesSync(lockPath, old, old);

    // staleMs = 1ms — anything older than 1ms counts as stale and gets cleared.
    const h = tryAcquireSpawnLock(lockPath, 1);
    expect(h).not.toBeNull();
    // The new lock file written by us replaces the stale one.
    const content = fs.readFileSync(lockPath, "utf-8");
    expect(content).toMatch(/^\d+\n/); // pid line
    h?.release();
  });

  it("fresh lock (mtime < staleMs) is NOT taken over", () => {
    const h1 = tryAcquireSpawnLock(lockPath);
    expect(h1).not.toBeNull();
    // Default 30s staleness, lock just created → not stale.
    const h2 = tryAcquireSpawnLock(lockPath);
    expect(h2).toBeNull();
    h1?.release();
  });

  it("returns null when lockPath parent dir does not exist (unrecoverable IO)", () => {
    const bogus = path.join(tmpDir, "does", "not", "exist", "x.lock");
    const h = tryAcquireSpawnLock(bogus);
    expect(h).toBeNull();
  });
});
