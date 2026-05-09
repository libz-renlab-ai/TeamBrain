import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getRecentEntries } from "../commands/recent-entries.js";
import { openDb, closeDb } from "@teamagent/adapters";

function rmRetry(p: string) {
  // Windows: node:sqlite WAL mode holds shm/wal files briefly after close()
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

let tmpDir: string | undefined;

afterEach(() => {
  if (tmpDir) {
    rmRetry(tmpDir);
    tmpDir = undefined;
  }
});

describe("getRecentEntries", () => {
  it("returns [] when DB does not exist", async () => {
    const nonExistentDir = path.join(os.tmpdir(), "teamagent-re-missing-" + Date.now());
    const result = await getRecentEntries(nonExistentDir);
    expect(result).toEqual([]);
  });

  it("returns active entries created in last 2 hours", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "teamagent-re-"));
    const teamagentDir = path.join(tmpDir, ".teamagent");
    fs.mkdirSync(teamagentDir, { recursive: true });
    const dbPath = path.join(teamagentDir, "knowledge.db");

    // Initialize DB with real schema using openDb (node:sqlite)
    const db = openDb(dbPath);

    // Insert one active entry created now with a tldr value
    db.exec(`
      INSERT INTO knowledge (
        id, scope_level, category, type, nature,
        trigger, correct_pattern, correct_pattern_tldr,
        confidence, current_tier, max_tier_ever, tier_entered_at,
        enforcement, status, hit_count, success_count, override_count,
        resurrect_count, demerit, source, created_at
      ) VALUES (
        'test-entry-1', 'personal', 'best-practice', 'avoidance', 'objective',
        'use moment', 'use dayjs instead', '用 dayjs 代替 moment',
        0.85, 'experimental', 'experimental', datetime('now'),
        'passive', 'active', 0, 0, 0,
        0, 0, 'accumulated', datetime('now')
      )
    `);

    // Insert one old entry (outside 2-hour window) — should NOT be returned
    db.exec(`
      INSERT INTO knowledge (
        id, scope_level, category, type, nature,
        trigger, correct_pattern, correct_pattern_tldr,
        confidence, current_tier, max_tier_ever, tier_entered_at,
        enforcement, status, hit_count, success_count, override_count,
        resurrect_count, demerit, source, created_at
      ) VALUES (
        'test-entry-old', 'personal', 'best-practice', 'avoidance', 'objective',
        'old trigger', 'old pattern', 'old tldr',
        0.50, 'experimental', 'experimental', datetime('now', '-5 hours'),
        'passive', 'active', 0, 0, 0,
        0, 0, 'accumulated', datetime('now', '-5 hours')
      )
    `);

    closeDb(db);

    const result = await getRecentEntries(tmpDir);

    expect(result).toHaveLength(1);
    const [entry] = result;
    expect(entry!.tldr).toBe("用 dayjs 代替 moment");
    expect(entry!.confidence).toBeCloseTo(0.85, 2);
  });

  it("walks up to project root when called from a subfolder (issue #161)", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "teamagent-re-walkup-"));
    const teamagentDir = path.join(tmpDir, ".teamagent");
    fs.mkdirSync(teamagentDir, { recursive: true });
    const dbPath = path.join(teamagentDir, "knowledge.db");

    const db = openDb(dbPath);
    db.exec(`
      INSERT INTO knowledge (
        id, scope_level, category, type, nature,
        trigger, correct_pattern, correct_pattern_tldr,
        confidence, current_tier, max_tier_ever, tier_entered_at,
        enforcement, status, hit_count, success_count, override_count,
        resurrect_count, demerit, source, created_at
      ) VALUES (
        'walkup-entry-1', 'personal', 'best-practice', 'avoidance', 'objective',
        'walk up trigger', 'walk up pattern', '走上去找到 db',
        0.92, 'experimental', 'experimental', datetime('now'),
        'passive', 'active', 0, 0, 0,
        0, 0, 'accumulated', datetime('now')
      )
    `);
    closeDb(db);

    // Project marker so hardened walk-up accepts the parent
    fs.writeFileSync(path.join(tmpDir, "package.json"), "{}");
    const subdir = path.join(tmpDir, "packages", "cli");
    fs.mkdirSync(subdir, { recursive: true });

    const result = await getRecentEntries(subdir);

    expect(result).toHaveLength(1);
    expect(result[0]!.tldr).toBe("走上去找到 db");
  });

  it("falls back to trigger when correct_pattern_tldr is null", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "teamagent-re-notldr-"));
    const teamagentDir = path.join(tmpDir, ".teamagent");
    fs.mkdirSync(teamagentDir, { recursive: true });
    const dbPath = path.join(teamagentDir, "knowledge.db");

    const db = openDb(dbPath);

    // Insert entry without correct_pattern_tldr — COALESCE should fall back to trigger
    db.exec(`
      INSERT INTO knowledge (
        id, scope_level, category, type, nature,
        trigger, correct_pattern,
        confidence, current_tier, max_tier_ever, tier_entered_at,
        enforcement, status, hit_count, success_count, override_count,
        resurrect_count, demerit, source, created_at
      ) VALUES (
        'test-entry-notldr', 'personal', 'best-practice', 'avoidance', 'objective',
        'use fetch instead of axios', 'use native fetch',
        0.70, 'experimental', 'experimental', datetime('now'),
        'passive', 'active', 0, 0, 0,
        0, 0, 'accumulated', datetime('now')
      )
    `);

    closeDb(db);

    const result = await getRecentEntries(tmpDir);

    expect(result).toHaveLength(1);
    const [entry] = result;
    expect(entry!.tldr).toBe("use fetch instead of axios");
    expect(entry!.confidence).toBeCloseTo(0.70, 2);
  });
});
