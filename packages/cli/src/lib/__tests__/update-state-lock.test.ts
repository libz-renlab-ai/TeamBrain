import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { withUpdateStateLock } from "../update-state-lock.js";
import { defaultUpdateState, parseUpdateState } from "@teamagent/core";

/**
 * Issue #244 — update-state-lock unit tests.
 *
 * These tests cover three failure modes the lock is supposed to prevent:
 *   1) lost-update under concurrent read-modify-write (ordering invariant)
 *   2) stale-pid deadlock (recovery invariant)
 *   3) repeated mutators interleaving safely (durability invariant)
 *
 * Plus the happy path (single mutation), the timeout-fallback path (lock can't
 * be acquired → caller still makes progress), and the structural assertion
 * that the lock file is cleaned up on success and on mutator throw.
 */

describe("withUpdateStateLock", () => {
  let tempHome: string;

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "tb-issue244-"));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempHome, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  it("happy path: single mutator persists the change atomically", () => {
    const result = withUpdateStateLock(tempHome, (s) => ({
      ...s,
      snooze_level: 2,
      snooze_until_ts: 12345,
    }));
    expect(result.snooze_level).toBe(2);
    expect(result.snooze_until_ts).toBe(12345);

    const persisted = parseUpdateState(
      fs.readFileSync(path.join(tempHome, "update-state.json"), "utf-8")
    );
    expect(persisted.snooze_level).toBe(2);
    expect(persisted.snooze_until_ts).toBe(12345);
  });

  it("releases the lock file on successful mutation", () => {
    withUpdateStateLock(tempHome, (s) => ({ ...s, snooze_level: 1 }));
    expect(fs.existsSync(path.join(tempHome, "update-state.lock"))).toBe(false);
  });

  it("releases the lock file even when the mutator throws", () => {
    expect(() =>
      withUpdateStateLock(tempHome, () => {
        throw new Error("boom");
      })
    ).toThrow("boom");
    expect(fs.existsSync(path.join(tempHome, "update-state.lock"))).toBe(false);
  });

  it("serial mutators compose: each sees the prior write", () => {
    withUpdateStateLock(tempHome, (s) => ({ ...s, snooze_level: 1 }));
    withUpdateStateLock(tempHome, (s) => ({
      ...s,
      snooze_until_ts: s.snooze_level * 1000,
    }));

    const persisted = parseUpdateState(
      fs.readFileSync(path.join(tempHome, "update-state.json"), "utf-8")
    );
    expect(persisted.snooze_level).toBe(1);
    expect(persisted.snooze_until_ts).toBe(1000);
  });

  it("read-modify-write under interleaved mutators preserves both updates", () => {
    // Issue #244 root cause: process A reads (level=0) → process B reads
    // (level=0) → A writes (level=1) → B writes (level=0+5=5, but loses A's
    // level=1). With the lock, B's read sees A's persisted level=1, so B
    // computes 6, not 5, and the final state preserves both writes.
    //
    // We simulate this by hand-running two mutators that each read+increment.
    // Without the lock, sequential calls trivially compose; the meaningful
    // assertion is that withUpdateStateLock genuinely re-reads inside each
    // call (no stale capture), which lets a correctness test reason about
    // the lost-update scenario at the call-site level.
    withUpdateStateLock(tempHome, (s) => ({ ...s, snooze_level: s.snooze_level + 1 }));
    withUpdateStateLock(tempHome, (s) => ({ ...s, snooze_level: s.snooze_level + 5 }));

    const persisted = parseUpdateState(
      fs.readFileSync(path.join(tempHome, "update-state.json"), "utf-8")
    );
    // First call: 0 + 1 = 1; second call: 1 + 5 = 6.
    // If the lock didn't really re-read the persisted state inside each call,
    // we'd see 5 (second mutator captured stale 0).
    expect(persisted.snooze_level).toBe(6);
  });

  it("stale-pid recovery: stolen lock from dead pid lets the next caller proceed", () => {
    // Plant a lock file with a guaranteed-dead pid (1 belongs to init/launchd
    // and is not signalable from a userland process, so on macOS / Linux the
    // `process.kill(pid, 0)` test correctly classifies it as alive. Use a pid
    // that is definitely dead: process.pid + 999999 — way outside typical
    // pid range and almost certainly never assigned.
    const lockPath = path.join(tempHome, "update-state.lock");
    fs.mkdirSync(tempHome, { recursive: true });
    fs.writeFileSync(lockPath, String(process.pid + 999999), "utf-8");

    const result = withUpdateStateLock(tempHome, (s) => ({
      ...s,
      snooze_level: 7,
    }));
    expect(result.snooze_level).toBe(7);
    // The lock should be released (we cleaned up after the steal).
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it("garbage in lock file is treated as stale and recovered", () => {
    const lockPath = path.join(tempHome, "update-state.lock");
    fs.mkdirSync(tempHome, { recursive: true });
    fs.writeFileSync(lockPath, "not-a-pid\n", "utf-8");

    const result = withUpdateStateLock(tempHome, (s) => ({
      ...s,
      snooze_level: 9,
    }));
    expect(result.snooze_level).toBe(9);
  });

  it("missing state file: mutator receives default state", () => {
    let observed: ReturnType<typeof defaultUpdateState> | null = null;
    withUpdateStateLock(tempHome, (s) => {
      observed = s;
      return s;
    });
    expect(observed).not.toBeNull();
    expect(observed!).toEqual(defaultUpdateState());
  });

  it("timeout fallback: write still lands when the lock is held by a live pid", () => {
    // Plant a lock file with the current process's pid — process.kill(pid, 0)
    // returns truthy on a live pid, so the helper's stale-pid steal can never
    // succeed. After 5 retries (~750ms) the helper falls back to a non-locked
    // write so the caller still makes progress. Without this fallback a
    // genuinely-held lock would silently prevent the foreground command's
    // update from ever persisting.
    const lockPath = path.join(tempHome, "update-state.lock");
    fs.mkdirSync(tempHome, { recursive: true });
    fs.writeFileSync(lockPath, String(process.pid), "utf-8");

    const result = withUpdateStateLock(tempHome, (s) => ({
      ...s,
      snooze_level: 4,
    }));
    expect(result.snooze_level).toBe(4);

    const persisted = parseUpdateState(
      fs.readFileSync(path.join(tempHome, "update-state.json"), "utf-8")
    );
    expect(persisted.snooze_level).toBe(4);

    // We did NOT acquire the lock, so we also did NOT delete the planted lock
    // file. Verify it's still there — the test's afterEach cleans up tempHome.
    expect(fs.existsSync(lockPath)).toBe(true);
  });

  it("field-ownership merge: bin-updater pattern preserves foreground-owned fields", () => {
    // bin-updater holds a stale `state` (read at the top of runUpdater, before
    // a multi-second HTTP fetch). Meanwhile a foreground `teamagent update
    // --snooze` lands a new snooze_level. When bin-updater later persists, its
    // writeState dep uses withUpdateStateLock with a mutator that overlays only
    // updater-owned fields on top of the fresh `live` state. This test models
    // that pattern and asserts foreground's snooze survives bin-updater's
    // etag/sha update.
    //
    // Step 1: bin-updater reads stale state (snooze_level=0).
    const stale = withUpdateStateLock(tempHome, (s) => s);
    expect(stale.snooze_level).toBe(0);

    // Step 2: foreground snooze lands while bin-updater is fetching.
    withUpdateStateLock(tempHome, (s) => ({
      ...s,
      snooze_level: 3,
      snooze_until_ts: 999_000,
    }));

    // Step 3: bin-updater persists, with a stale-state-scoped overlay that
    // only touches updater-owned fields.
    const updaterIntent = {
      ...stale,
      last_branch_etag: "etag-xyz",
      last_branch_sha: "sha-abcdef",
    };
    withUpdateStateLock(tempHome, (live) => ({
      ...live, // live state on disk includes foreground's snooze
      last_branch_etag: updaterIntent.last_branch_etag,
      last_branch_sha: updaterIntent.last_branch_sha,
    }));

    // Step 4: assert both writes survived — foreground's snooze AND
    // bin-updater's etag/sha.
    const persisted = parseUpdateState(
      fs.readFileSync(path.join(tempHome, "update-state.json"), "utf-8")
    );
    expect(persisted.snooze_level).toBe(3);
    expect(persisted.snooze_until_ts).toBe(999_000);
    expect(persisted.last_branch_etag).toBe("etag-xyz");
    expect(persisted.last_branch_sha).toBe("sha-abcdef");
  });

  it("empty lock file: tryStealStaleLock must NOT steal mid-creation", () => {
    // TOCTOU regression test for /review iter-2 finding.
    //
    // acquireLock creates the lock file via `openSync(path, "wx")` and then
    // writes the pid in a second syscall. Between those two calls the file
    // exists but is empty. A racing caller used to read empty content,
    // parseInt → NaN → "garbage, treat as stale" → unlinkSync the file →
    // tryCreateLock for itself. End result: two callers both believe they
    // hold the lock and mutate concurrently — exactly the race #244 set out
    // to fix.
    //
    // Repro: plant an empty lock file and call withUpdateStateLock. The
    // stale-detection path must NOT steal it. Behavior we want: every retry
    // returns false from tryStealStaleLock, the outer loop exhausts retries
    // (~750 ms), and the helper falls through to its non-locked write
    // fallback. The lock file we planted stays untouched (no one stole it).
    const lockPath = path.join(tempHome, "update-state.lock");
    fs.mkdirSync(tempHome, { recursive: true });
    fs.writeFileSync(lockPath, "", "utf-8"); // simulate mid-create empty file

    const result = withUpdateStateLock(tempHome, (s) => ({
      ...s,
      snooze_level: 7,
    }));

    // Fallback write still landed.
    expect(result.snooze_level).toBe(7);
    const persisted = parseUpdateState(
      fs.readFileSync(path.join(tempHome, "update-state.json"), "utf-8")
    );
    expect(persisted.snooze_level).toBe(7);

    // Critical assertion: the planted empty lock file was NOT stolen.
    // If tryStealStaleLock had stolen it, the file would now contain
    // process.pid (the would-be thief's pid). It must still be empty.
    expect(fs.existsSync(lockPath)).toBe(true);
    expect(fs.readFileSync(lockPath, "utf-8")).toBe("");
  });
});
