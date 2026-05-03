import { describe, it, expect, beforeEach, afterEach } from "vitest";
import nodeFs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  executeCalibrate,
  parseCalibrateArgs,
  renderCalibrateResult,
} from "../commands/calibrate.js";
import { DualLayerStore, SqliteKnowledgeStore, SqliteEventLog, openDb } from "@teamagent/adapters";
import type { KnowledgeEntry, PersistedEvent } from "@teamagent/types";

function mkTmp() {
  const root = nodeFs.mkdtempSync(path.join(os.tmpdir(), "cal-cli-"));
  const home = path.join(root, "home");
  const cwd = path.join(root, "cwd");
  nodeFs.mkdirSync(home, { recursive: true });
  nodeFs.mkdirSync(cwd, { recursive: true });
  const projectDbPath = path.join(cwd, ".teamagent", "knowledge.db");
  const userGlobalDbPath = path.join(home, ".teamagent", "global.db");
  const eventsDbPath = path.join(home, ".teamagent", "events.db");
  const claudeMdPath = path.join(cwd, "CLAUDE.md");
  return {
    home,
    cwd,
    projectDbPath,
    userGlobalDbPath,
    eventsDbPath,
    claudeMdPath,
    cleanup: () => nodeFs.rmSync(root, { recursive: true, force: true }),
  };
}

function seedEntry(dbPath: string, e: KnowledgeEntry): void {
  nodeFs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const store = new SqliteKnowledgeStore(openDb(dbPath));
  store.add(e);
  store.close();
}

function entry(over: Partial<KnowledgeEntry>): KnowledgeEntry {
  return {
    id: "e",
    scope: { level: "personal" },
    category: "E",
    tags: [],
    type: "avoidance",
    nature: "subjective",
    trigger: "t",
    wrong_pattern: "w",
    correct_pattern: "c",
    reasoning: "r",
    confidence: 0.7,
    enforcement: "warn",
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: "2026-04-15T00:00:00Z",
    last_hit_at: "",
    last_validated_at: "2026-04-15T00:00:00Z",
    source: "accumulated",
    conflict_with: [],
    current_tier: "experimental" as const,
    max_tier_ever: "experimental" as const,
    tier_entered_at: "",
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
    ...over,
  };
}

function evt(over: Partial<PersistedEvent>): PersistedEvent {
  return {
    id: "evt",
    kind: "hook-pre.matched",
    timestamp: "2026-04-15T01:00:00Z",
    schema_version: 1,
    ...over,
  } as PersistedEvent;
}

describe("executeCalibrate", () => {
  let tmp: ReturnType<typeof mkTmp>;
  beforeEach(() => {
    tmp = mkTmp();
  });
  afterEach(() => tmp.cleanup());

  it("no events → 0/0/0", async () => {
    seedEntry(tmp.projectDbPath, entry({ id: "rule-a" }));
    const r = await executeCalibrate({
      cwd: tmp.cwd,
      homeDir: tmp.home,
      legacy: true,
      now: () => new Date("2026-04-15T02:00:00Z"),
    });
    expect(r.totalAdjusted).toBe(0);
    expect(r.totalArchived).toBe(0);
  });

  it("positive events → confidence raised + calibrator.adjusted event written", async () => {
    seedEntry(tmp.projectDbPath, entry({ id: "rule-a", confidence: 0.7 }));
    nodeFs.mkdirSync(path.dirname(tmp.eventsDbPath), { recursive: true });
    const log = new SqliteEventLog(openDb(tmp.eventsDbPath));
    log.append(evt({ id: "p1", kind: "hook-pre.blocked", knowledge_id: "rule-a" }));
    log.close();

    const r = await executeCalibrate({
      cwd: tmp.cwd,
      homeDir: tmp.home,
      legacy: true,
      now: () => new Date("2026-04-15T02:00:00Z"),
    });

    expect(r.totalAdjusted).toBe(1);
    // Store updated
    const store = new DualLayerStore({ projectDbPath: tmp.projectDbPath, userGlobalDbPath: tmp.userGlobalDbPath });
    const updated = store.getById("rule-a")!;
    store.close();
    expect(updated.confidence).toBeCloseTo(0.75, 5);
    // calibrator.adjusted event written
    const log2 = new SqliteEventLog(openDb(tmp.eventsDbPath));
    const events = log2.readAll();
    log2.close();
    const cal = events.find((e) => e.kind === "calibrator.adjusted")!;
    expect(cal).toBeDefined();
    expect(cal.knowledge_id).toBe("rule-a");
    expect(cal.confidence_before).toBe(0.7);
    expect(cal.confidence_after).toBeCloseTo(0.75, 5);
  });

  it("dry-run does not modify store or write events", async () => {
    seedEntry(tmp.projectDbPath, entry({ id: "rule-a", confidence: 0.7 }));
    nodeFs.mkdirSync(path.dirname(tmp.eventsDbPath), { recursive: true });
    const log = new SqliteEventLog(openDb(tmp.eventsDbPath));
    log.append(evt({ id: "p1", kind: "hook-pre.blocked", knowledge_id: "rule-a" }));
    log.close();

    const r = await executeCalibrate({
      cwd: tmp.cwd,
      homeDir: tmp.home,
      dryRun: true,
      legacy: true,
      now: () => new Date("2026-04-15T02:00:00Z"),
    });
    expect(r.dryRun).toBe(true);
    expect(r.totalAdjusted).toBe(1);
    // store unchanged
    const store = new DualLayerStore({ projectDbPath: tmp.projectDbPath, userGlobalDbPath: tmp.userGlobalDbPath });
    const still = store.getById("rule-a")!;
    store.close();
    expect(still.confidence).toBe(0.7);
    // no new calibrator.adjusted event
    const log2 = new SqliteEventLog(openDb(tmp.eventsDbPath));
    const events = log2.readAll();
    log2.close();
    expect(events.some((e) => e.kind === "calibrator.adjusted")).toBe(false);
  });

  it("days filter excludes old events", async () => {
    seedEntry(tmp.projectDbPath, entry({ id: "rule-a", confidence: 0.7 }));
    nodeFs.mkdirSync(path.dirname(tmp.eventsDbPath), { recursive: true });
    const log = new SqliteEventLog(openDb(tmp.eventsDbPath));
    log.append(evt({
      id: "p-old",
      kind: "hook-pre.blocked",
      knowledge_id: "rule-a",
      timestamp: "2026-04-07T00:00:00Z",
    }));
    log.close();
    const r = await executeCalibrate({
      cwd: tmp.cwd,
      homeDir: tmp.home,
      days: 7,
      legacy: true,
      now: () => new Date("2026-04-15T02:00:00Z"),
    });
    expect(r.totalAdjusted).toBe(0);
  });

  it("auto-archive happens and is reflected in result", async () => {
    seedEntry(tmp.projectDbPath, entry({ id: "rule-a", confidence: 0.32 }));
    nodeFs.mkdirSync(path.dirname(tmp.eventsDbPath), { recursive: true });
    const log = new SqliteEventLog(openDb(tmp.eventsDbPath));
    for (let i = 0; i < 3; i++) {
      log.append(evt({ id: `b${i}`, kind: "hook-pre.blocked", knowledge_id: "rule-a", tool_use_id: `t${i}` }));
      log.append(evt({ id: `pf${i}`, kind: "hook-post.result", knowledge_id: "rule-a", tool_use_id: `t${i}`, result: { succeeded: false } }));
    }
    log.close();

    const r = await executeCalibrate({
      cwd: tmp.cwd,
      homeDir: tmp.home,
      legacy: true,
      now: () => new Date("2026-04-15T02:00:00Z"),
    });
    expect(r.totalArchived).toBe(1);
    const store = new DualLayerStore({ projectDbPath: tmp.projectDbPath, userGlobalDbPath: tmp.userGlobalDbPath });
    const updated = store.getById("rule-a")!;
    store.close();
    expect(updated.status).toBe("archived");
    const log2 = new SqliteEventLog(openDb(tmp.eventsDbPath));
    const cal = log2.readAll().find((e) => e.kind === "calibrator.adjusted")!;
    log2.close();
    expect(cal.status_after).toBe("archived");
  });

  it("exports Skills when adjustments occur and leaves CLAUDE.md absent", async () => {
    seedEntry(tmp.projectDbPath, entry({ id: "rule-a", confidence: 0.7, current_tier: "stable", max_tier_ever: "stable" }));
    nodeFs.mkdirSync(path.dirname(tmp.eventsDbPath), { recursive: true });
    const log = new SqliteEventLog(openDb(tmp.eventsDbPath));
    log.append(evt({ id: "p1", kind: "hook-pre.blocked", knowledge_id: "rule-a" }));
    log.close();
    await executeCalibrate({
      cwd: tmp.cwd,
      homeDir: tmp.home,
      legacy: true,
      now: () => new Date("2026-04-15T02:00:00Z"),
    });
    expect(nodeFs.existsSync(tmp.claudeMdPath)).toBe(false);
    const skillMd = path.join(tmp.home, ".claude", "skills", "teamagent", "rule-a", "SKILL.md");
    expect(nodeFs.readFileSync(skillMd, "utf-8")).toContain("rule-a");
  });

  it("missing events DB → no error, no adjustments", async () => {
    seedEntry(tmp.projectDbPath, entry({ id: "rule-a" }));
    const r = await executeCalibrate({
      cwd: tmp.cwd,
      homeDir: tmp.home,
      legacy: true,
      now: () => new Date("2026-04-15T02:00:00Z"),
    });
    expect(r.totalAdjusted).toBe(0);
  });

  it("uses v2 calibrator by default (no --legacy)", async () => {
    seedEntry(tmp.projectDbPath, entry({ id: "rule-v2", confidence: 0.7, demerit: 0 }));
    // No observations, no demerit events → v2 pipeline should skip (no signal)
    const r = await executeCalibrate({
      cwd: tmp.cwd,
      homeDir: tmp.home,
      now: () => new Date("2026-04-15T02:00:00Z"),
    });
    // Completes without error
    expect(r.dryRun).toBe(false);
    // With no observations and demerit=0, v2 skips entries → 0 adjusted
    expect(r.totalAdjusted).toBe(0);
    // v2Adjustments field is present on byScope entries
    const scopeResult = r.byScope[0]!;
    expect(scopeResult.v2Adjustments).toBeDefined();
  });

  it("uses v2 pipeline: dry-run mode works without error", async () => {
    seedEntry(tmp.projectDbPath, entry({ id: "rule-v2", confidence: 0.7, demerit: 0 }));

    const r = await executeCalibrate({
      cwd: tmp.cwd,
      homeDir: tmp.home,
      dryRun: true,
      now: () => new Date("2026-04-15T02:00:00Z"),
    });
    // Completes without error in dry-run mode
    expect(r.dryRun).toBe(true);
    // v2Adjustments field present
    const scopeResult = r.byScope[0]!;
    expect(scopeResult.v2Adjustments).toBeDefined();
    // Store not modified (confidence still 0.7)
    const store = new DualLayerStore({ projectDbPath: tmp.projectDbPath, userGlobalDbPath: tmp.userGlobalDbPath });
    const still = store.getById("rule-v2")!;
    store.close();
    expect(still.confidence).toBe(0.7);
  });

  it("v2 ignored event updates store and writes calibrator.adjusted lifecycle event", async () => {
    seedEntry(tmp.projectDbPath, entry({
      id: "rule-v2-ignored",
      confidence: 0.95,
      current_tier: "stable",
      max_tier_ever: "stable",
      tier_entered_at: "2026-04-01T00:00:00Z",
    }));
    nodeFs.mkdirSync(path.dirname(tmp.eventsDbPath), { recursive: true });
    const log = new SqliteEventLog(openDb(tmp.eventsDbPath));
    log.append(evt({
      id: "ignored-1",
      kind: "ai.override.ignored",
      knowledge_id: "rule-v2-ignored",
      timestamp: "2026-04-15T01:00:00Z",
    }));
    log.close();

    const r = await executeCalibrate({
      cwd: tmp.cwd,
      homeDir: tmp.home,
      now: () => new Date("2026-04-15T02:00:00Z"),
    });

    expect(r.totalAdjusted).toBe(1);
    const store = new DualLayerStore({ projectDbPath: tmp.projectDbPath, userGlobalDbPath: tmp.userGlobalDbPath });
    const updated = store.getById("rule-v2-ignored")!;
    store.close();
    expect(updated.confidence).toBeLessThan(0.95);
    expect(updated.demerit).toBeGreaterThan(8);

    const log2 = new SqliteEventLog(openDb(tmp.eventsDbPath));
    const events = log2.readAll();
    log2.close();
    const cal = events.find((e) => e.kind === "calibrator.adjusted")!;
    expect(cal).toBeDefined();
    expect(cal.knowledge_id).toBe("rule-v2-ignored");
    expect(cal.confidence_before).toBe(0.95);
    expect(cal.confidence_after).toBeCloseTo(updated.confidence, 5);
    expect(cal.demerit_before).toBe(0);
    expect(cal.demerit_after).toBeCloseTo(updated.demerit, 5);
    expect(cal.tier_before).toBe("stable");
    expect(cal.tier_after).toBe(updated.current_tier);
    expect(cal.status_after).toBe(updated.status);
  });
});

describe("parseCalibrateArgs", () => {
  it("defaults", () => {
    expect(parseCalibrateArgs([])).toEqual({});
  });
  it("--dry-run", () => {
    expect(parseCalibrateArgs(["--dry-run"])).toEqual({ dryRun: true });
  });
  it("--days form", () => {
    expect(parseCalibrateArgs(["--days", "14"])).toEqual({ days: 14 });
    expect(parseCalibrateArgs(["--days=14"])).toEqual({ days: 14 });
  });
  it("--legacy", () => {
    expect(parseCalibrateArgs(["--legacy"])).toEqual({ legacy: true });
  });
  it("--legacy combined with --dry-run", () => {
    expect(parseCalibrateArgs(["--legacy", "--dry-run"])).toEqual({ legacy: true, dryRun: true });
  });
});

describe("renderCalibrateResult", () => {
  it("happy path renders summary", () => {
    const out = renderCalibrateResult({
      dryRun: false,
      totalAdjusted: 2,
      totalArchived: 0,
      byScope: [
        {
          scope: "personal",
          storePath: "/p",
          scanned: 5,
          adjustedCount: 2,
          archivedCount: 0,
          adjustments: [
            {
              knowledge_id: "rule-1",
              before: 0.7,
              after: 0.75,
              delta: 0.05,
              status_before: "active",
              status_after: "active",
              signals: [],
            },
            {
              knowledge_id: "rule-2",
              before: 0.7,
              after: 0.72,
              delta: 0.02,
              status_before: "active",
              status_after: "active",
              signals: [],
            },
          ],
        },
        {
          scope: "global",
          storePath: "/g",
          scanned: 0,
          adjustedCount: 0,
          archivedCount: 0,
          adjustments: [],
        },
      ],
    });
    expect(out).toContain("TeamAgent Calibrate");
    expect(out).toContain("rule-1: 0.70 → 0.75");
    expect(out).toContain("总计: 2 条调整");
  });

  it("dry-run header present + footer note", () => {
    const out = renderCalibrateResult({
      dryRun: true,
      totalAdjusted: 0,
      totalArchived: 0,
      byScope: [],
    });
    expect(out).toContain("dry-run");
    expect(out).toContain("(dry-run，未写入)");
  });

  it("v2 adjustments render with conf/demerit/tier info", () => {
    const out = renderCalibrateResult({
      dryRun: false,
      totalAdjusted: 1,
      totalArchived: 0,
      byScope: [
        {
          scope: "personal",
          storePath: "/p",
          scanned: 3,
          adjustedCount: 1,
          archivedCount: 0,
          adjustments: [],
          v2Adjustments: [
            {
              knowledge_id: "rule-v2",
              confidence_before: 0.7,
              confidence_after: 0.7,
              demerit_before: 0,
              demerit_after: 10,
              tier_before: "experimental",
              tier_after: "experimental",
              tier_transition: null,
              delta_breakdown: [],
            },
          ],
        },
      ],
    });
    expect(out).toContain("TeamAgent Calibrate");
    expect(out).toContain("rule-v2");
    expect(out).toContain("demerit 0 → 10");
    expect(out).toContain("总计: 1 条调整");
  });
});
