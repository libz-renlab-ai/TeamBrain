import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  executeStats,
  renderStats,
  aggregateConfidenceMovements,
  aggregateUpgradeEvents7d,
  renderUpgradeEvents7d,
  findStuckInPromotion,
  renderStuckInPromotion,
} from "../commands/stats.js";
import { DualLayerStore, SqliteEventLog, openDb } from "@teamagent/adapters";
import { executePitfall } from "../commands/pitfall.js";
import type { KnowledgeEntry, PersistedEvent } from "@teamagent/types";

function rmRetry(p: string) {
  // Windows: node:sqlite WAL mode holds shm/wal files briefly after close()
  for (let i = 0; i < 8; i++) {
    try { fs.rmSync(p, { recursive: true, force: true }); return; } catch (e: any) {
      if ((e.code === "EBUSY" || e.code === "EPERM") && i < 7) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
        continue;
      }
      // Last resort: ignore remaining lock errors so test suite can proceed
      return;
    }
  }
}

function mkTmp() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "stats-cwd-"));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "stats-home-"));
  return {
    cwd,
    home,
    cleanup: () => { rmRetry(cwd); rmRetry(home); },
  };
}

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: "e",
    scope: { level: "personal" },
    category: "C",
    tags: ["tag1"],
    type: "avoidance",
    nature: "objective",
    trigger: "t",
    wrong_pattern: "w",
    correct_pattern: "c",
    reasoning: "r",
    confidence: 0.8,
    enforcement: "warn",
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: "2026-04-14T00:00:00Z",
    last_hit_at: "",
    last_validated_at: "",
    source: "accumulated",
    conflict_with: [],
    current_tier: "experimental" as const,
    max_tier_ever: "experimental" as const,
    tier_entered_at: "",
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
    ...overrides,
  };
}

describe("renderStats (pure)", () => {
  it("empty state shows helper text", () => {
    const out = renderStats({ personal: [], team: [], global: [] });
    expect(out).toContain("尚无知识条目");
    expect(out).toContain("teamagent pitfall");
  });

  it("counts by category", () => {
    const out = renderStats({
      personal: [
        makeEntry({ id: "a", category: "C" }),
        makeEntry({ id: "b", category: "C" }),
        makeEntry({ id: "c", category: "E" }),
      ],
      team: [],
      global: [],
    });
    expect(out).toContain("C 代码层  2");
    expect(out).toContain("E 工程层  1");
    expect(out).toContain("S 策略层  0");
  });

  it("counts by scope", () => {
    const out = renderStats({
      personal: [makeEntry({ id: "p1" })],
      team: [makeEntry({ id: "t1", scope: { level: "team" } }), makeEntry({ id: "t2", scope: { level: "team" } })],
      global: [makeEntry({ id: "g1", scope: { level: "global" } })],
    });
    expect(out).toContain("personal  1");
    expect(out).toContain("team      2");
    expect(out).toContain("global    1");
  });

  it("reports archived count separately", () => {
    const out = renderStats({
      personal: [
        makeEntry({ id: "a1", status: "active" }),
        makeEntry({ id: "a2", status: "archived" }),
      ],
      team: [],
      global: [],
    });
    expect(out).toContain("活跃 1");
    expect(out).toContain("归档 1");
  });

  it("Top 5 hits section only shows entries with hit_count > 0", () => {
    const out = renderStats({
      personal: [
        makeEntry({ id: "h1", hit_count: 50, trigger: "POP" }),
        makeEntry({ id: "h2", hit_count: 3, trigger: "LESS" }),
        makeEntry({ id: "z", hit_count: 0 }),
      ],
      team: [],
      global: [],
    });
    expect(out).toContain("Top 2");
    expect(out).toContain("POP");
    expect(out).toContain("LESS");
  });

  it("no Top hits section when no entry has hits", () => {
    const out = renderStats({
      personal: [makeEntry({ hit_count: 0 })],
      team: [],
      global: [],
    });
    expect(out).not.toContain("Top");
  });

  it("recent N shows most recent by created_at", () => {
    const out = renderStats({
      personal: [
        makeEntry({ id: "old", created_at: "2026-03-01T00:00:00Z", trigger: "OLD" }),
        makeEntry({ id: "new", created_at: "2026-04-14T00:00:00Z", trigger: "NEW" }),
      ],
      team: [],
      global: [],
    });
    const newIdx = out.indexOf("NEW");
    const oldIdx = out.indexOf("OLD");
    expect(newIdx).toBeGreaterThan(-1);
    expect(oldIdx).toBeGreaterThan(-1);
    expect(newIdx).toBeLessThan(oldIdx);
  });
});

describe("findStuckInPromotion (pure)", () => {
  const now = new Date("2026-04-14T00:00:00Z");

  it("returns entries in probation older than stuckDays", () => {
    const entries = [
      makeEntry({ id: "stuck", current_tier: "probation", tier_entered_at: "2026-03-25T00:00:00Z" }),
      makeEntry({ id: "fresh", current_tier: "probation", tier_entered_at: "2026-04-13T00:00:00Z" }),
      makeEntry({ id: "experimental", current_tier: "experimental", tier_entered_at: "2026-03-01T00:00:00Z" }),
    ];
    const result = findStuckInPromotion(entries, 14, now);
    expect(result.map((e) => e.id)).toEqual(["stuck"]);
  });

  it("ignores archived entries", () => {
    const e = makeEntry({ id: "archived", current_tier: "probation", tier_entered_at: "2026-03-01T00:00:00Z", status: "archived" });
    expect(findStuckInPromotion([e], 7, now)).toHaveLength(0);
  });

  it("empty store → empty result", () => {
    expect(findStuckInPromotion([], 14, now)).toHaveLength(0);
  });
});

describe("renderStuckInPromotion (pure)", () => {
  const now = new Date("2026-04-14T00:00:00Z");

  it("empty list shows no-stuck message", () => {
    const out = renderStuckInPromotion([], 14, now);
    expect(out).toContain("无规则卡在 probation");
  });

  it("non-empty list shows rule ids and triggers", () => {
    const entries = [
      makeEntry({ id: "rule-stuck", current_tier: "probation", tier_entered_at: "2026-03-25T00:00:00Z", trigger: "use-fetch" }),
    ];
    const out = renderStuckInPromotion(entries, 14, now);
    expect(out).toContain("rule-stuck");
    expect(out).toContain("use-fetch");
    expect(out).toContain("20"); // 20 days ago
  });
});

describe("executeStats (IO)", () => {
  let tmp: ReturnType<typeof mkTmp>;

  beforeEach(() => {
    tmp = mkTmp();
  });

  afterEach(() => {
    tmp.cleanup();
  });

  it("missing stores → empty-state message", () => {
    const out = executeStats({ cwd: tmp.cwd, homeDir: tmp.home });
    expect(out).toContain("尚无知识条目");
  });

  it("reads from SQLite and aggregates", () => {
    // Seed via pitfall (writes to SQLite)
    executePitfall(
      { trigger: "t1", wrong: "w1", correct: "c1", reason: "r1", category: "C" },
      { cwd: tmp.cwd, homeDir: tmp.home, now: () => "2026-04-14T00:00:00Z", env: {} },
    );
    executePitfall(
      { trigger: "t2", wrong: "w2", correct: "c2", reason: "r2", category: "E" },
      { cwd: tmp.cwd, homeDir: tmp.home, now: () => "2026-04-14T01:00:00Z", env: {} },
    );

    const out = executeStats({ cwd: tmp.cwd, homeDir: tmp.home });
    expect(out).toContain("总数: 2");
    expect(out).toContain("C 代码层  1");
    expect(out).toContain("E 工程层  1");
    expect(out).toContain("t2"); // recent first
  });

  it("reads local team-scope entries from SQLite and counts them separately", () => {
    executePitfall(
      { trigger: "team-scope", wrong: "w", correct: "c", reason: "r", level: "team" },
      { cwd: tmp.cwd, homeDir: tmp.home, now: () => "2026-05-04T00:00:00Z", env: {} },
    );

    const out = executeStats({ cwd: tmp.cwd, homeDir: tmp.home });
    expect(out).toContain("总数: 1");
    expect(out).toContain("personal  0");
    expect(out).toContain("team      1");
    expect(out).toContain("global    0");
  });

  describe("M6 confidence movements", () => {
    it("aggregateConfidenceMovements sums per-rule deltas in window", () => {
      const events: PersistedEvent[] = [
        {
          id: "1",
          kind: "calibrator.adjusted",
          knowledge_id: "rule-a",
          confidence_before: 0.7,
          confidence_after: 0.75,
          timestamp: "2026-04-15T01:00:00Z",
          schema_version: 1,
        },
        {
          id: "2",
          kind: "calibrator.adjusted",
          knowledge_id: "rule-a",
          confidence_before: 0.75,
          confidence_after: 0.8,
          timestamp: "2026-04-15T02:00:00Z",
          schema_version: 1,
        },
        {
          id: "3",
          kind: "calibrator.adjusted",
          knowledge_id: "rule-b",
          confidence_before: 0.5,
          confidence_after: 0.4,
          timestamp: "2026-04-15T03:00:00Z",
          schema_version: 1,
        },
      ];
      const movements = aggregateConfidenceMovements(
        events,
        7,
        new Date("2026-04-15T04:00:00Z"),
      );
      const a = movements.find((m) => m.knowledge_id === "rule-a")!;
      const b = movements.find((m) => m.knowledge_id === "rule-b")!;
      expect(a.totalDelta).toBeCloseTo(0.1, 5);
      expect(b.totalDelta).toBeCloseTo(-0.1, 5);
    });

    it("aggregateConfidenceMovements ignores events outside window", () => {
      const events: PersistedEvent[] = [
        {
          id: "old",
          kind: "calibrator.adjusted",
          knowledge_id: "rule-old",
          confidence_before: 0.7,
          confidence_after: 0.9,
          timestamp: "2026-04-01T00:00:00Z",
          schema_version: 1,
        },
      ];
      const movements = aggregateConfidenceMovements(
        events,
        7,
        new Date("2026-04-15T00:00:00Z"),
      );
      expect(movements).toHaveLength(0);
    });

    it("aggregateConfidenceMovements skips non-calibrator events", () => {
      const events: PersistedEvent[] = [
        {
          id: "p",
          kind: "hook-pre.matched",
          knowledge_id: "rule-x",
          timestamp: "2026-04-15T01:00:00Z",
          schema_version: 1,
        },
      ];
      expect(
        aggregateConfidenceMovements(events, 7, new Date("2026-04-15T02:00:00Z")),
      ).toHaveLength(0);
    });

    it("flags archivedThisWindow when status_after=archived", () => {
      const events: PersistedEvent[] = [
        {
          id: "1",
          kind: "calibrator.adjusted",
          knowledge_id: "rule-x",
          confidence_before: 0.4,
          confidence_after: 0.25,
          status_after: "archived",
          timestamp: "2026-04-15T01:00:00Z",
          schema_version: 1,
        },
      ];
      const movements = aggregateConfidenceMovements(
        events,
        7,
        new Date("2026-04-15T02:00:00Z"),
      );
      expect(movements[0]!.archivedThisWindow).toBe(true);
    });

    it("renderStats includes top 5 confidence changes section when movements present", () => {
      const entry: KnowledgeEntry = makeEntry({
        id: "rule-a",
        trigger: "use HTTP client",
      });
      const movements = [
        {
          knowledge_id: "rule-a",
          totalDelta: 0.15,
          archivedThisWindow: false,
        },
      ];
      const out = renderStats(
        { personal: [entry], team: [], global: [] },
        movements,
        7,
      );
      expect(out).toContain("本周（7 天）confidence 变化");
      expect(out).toContain("+0.15");
      expect(out).toContain("rule-a");
      expect(out).toContain("use HTTP client");
    });

    it("renderStats omits movements section when empty", () => {
      const entry = makeEntry({ id: "rule-a" });
      const out = renderStats({ personal: [entry], team: [], global: [] }, []);
      expect(out).not.toContain("confidence 变化");
    });

    it("executeStats --stuck-in-promotion returns stuck rules", () => {
      const projectDbPath = path.join(tmp.cwd, ".teamagent", "knowledge.db");
      const userGlobalDbPath = path.join(tmp.home, ".teamagent", "global.db");
      fs.mkdirSync(path.dirname(projectDbPath), { recursive: true });
      fs.mkdirSync(path.dirname(userGlobalDbPath), { recursive: true });
      const store = new DualLayerStore({ projectDbPath, userGlobalDbPath });
      // stuck: probation entered 20 days ago
      store.add(makeEntry({
        id: "stuck-rule",
        current_tier: "probation",
        tier_entered_at: "2026-03-25T00:00:00Z",
        trigger: "use-fetch-not-axios",
      }));
      // not stuck: experimental
      store.add(makeEntry({
        id: "ok-rule",
        current_tier: "experimental",
        tier_entered_at: "2026-03-25T00:00:00Z",
      }));
      store.close();

      const out = executeStats({
        cwd: tmp.cwd,
        homeDir: tmp.home,
        stuckInPromotion: true,
        stuckDays: 14,
        now: () => new Date("2026-04-14T00:00:00Z"),
      });
      expect(out).toContain("stuck-rule");
      expect(out).not.toContain("ok-rule");
    });

    it("executeStats reads events.db and shows movement section", () => {
      const eventsDir = path.join(tmp.home, ".teamagent");
      fs.mkdirSync(eventsDir, { recursive: true });
      const eventsDbPath = path.join(eventsDir, "events.db");
      const eventLog = new SqliteEventLog(openDb(eventsDbPath));
      eventLog.append({
        id: "c1",
        kind: "calibrator.adjusted",
        knowledge_id: "rule-x",
        confidence_before: 0.7,
        confidence_after: 0.75,
        timestamp: "2026-04-15T01:00:00Z",
        schema_version: 1,
      });
      eventLog.close();

      // Seed a knowledge entry so stats has at least 1 entry
      const projectDbPath = path.join(tmp.cwd, ".teamagent", "knowledge.db");
      fs.mkdirSync(path.dirname(projectDbPath), { recursive: true });
      const userGlobalDbPath = path.join(tmp.home, ".teamagent", "global.db");
      const store = new DualLayerStore({ projectDbPath, userGlobalDbPath });
      store.add(makeEntry({ id: "rule-x" }));
      store.close();

      const out = executeStats({
        cwd: tmp.cwd,
        homeDir: tmp.home,
        windowDays: 7,
        now: () => new Date("2026-04-15T02:00:00Z"),
      });
      expect(out).toContain("confidence 变化");
      expect(out).toContain("rule-x");
    });
  });
});

describe("executeStats --override-signals", () => {
  it("renders override signal counts per rule", () => {
    const tmp = {
      cwd: fs.mkdtempSync(path.join(os.tmpdir(), "stats-override-")),
    };
    const eventsDbPath = path.join(tmp.cwd, "events.db");
    const db = openDb(eventsDbPath);
    const log = new SqliteEventLog(db);

    const now = new Date().toISOString();
    log.append({ id: "e1", kind: "ai.override.ignored",  knowledge_id: "rule-A", tool_use_id: "t1", timestamp: now, schema_version: 1 });
    log.append({ id: "e2", kind: "ai.override.ignored",  knowledge_id: "rule-A", tool_use_id: "t2", timestamp: now, schema_version: 1 });
    log.append({ id: "e3", kind: "ai.override.complied", knowledge_id: "rule-A", tool_use_id: "t3", timestamp: now, schema_version: 1 });
    log.append({ id: "e4", kind: "ai.override.complied", knowledge_id: "rule-B", tool_use_id: "t4", timestamp: now, schema_version: 1 });
    db.close();

    const result = executeStats({
      eventsDbPath,
      projectDbPath: path.join(tmp.cwd, "knowledge.db"),
      userGlobalDbPath: path.join(tmp.cwd, "global.db"),
      overrideSignals: true,
    });

    expect(result).toContain("rule-A");
    expect(result).toContain("ignored: 2");
    expect(result).toContain("complied: 1");
    expect(result).toContain("rule-B");
    expect(result).toContain("complied: 1");

    // cleanup
    fs.rmSync(tmp.cwd, { recursive: true, force: true });
  });
});

// Issue #245 — pure aggregation/render of upgrade events 7d 摘要
describe("aggregateUpgradeEvents7d (pure)", () => {
  function ev(kind: string, hoursAgo: number, now: Date): PersistedEvent {
    return {
      id: `${kind}-${hoursAgo}`,
      kind: kind as PersistedEvent["kind"],
      timestamp: new Date(now.getTime() - hoursAgo * 3600 * 1000).toISOString(),
      schema_version: 1,
      // unused for upgrade aggregation but required by PersistedEvent shape
    } as unknown as PersistedEvent;
  }

  it("counts all 4 update-* kinds inside the window", () => {
    const now = new Date("2026-05-10T00:00:00Z");
    const events = [
      ev("update-prompt-shown", 1, now),
      ev("update-prompt-shown", 24, now),
      ev("update-snoozed", 5, now),
      ev("update-never-set", 12, now),
      ev("update-installed", 48, now),
    ];
    const counts = aggregateUpgradeEvents7d(events, 7, now);
    expect(counts).toEqual({
      promptShown: 2,
      snoozed: 1,
      neverSet: 1,
      installed: 1,
      total: 5,
    });
  });

  it("excludes events outside the window", () => {
    const now = new Date("2026-05-10T00:00:00Z");
    const events = [
      ev("update-prompt-shown", 1, now),
      // 200 hours ago > 7 days (168h)
      ev("update-snoozed", 200, now),
    ];
    const counts = aggregateUpgradeEvents7d(events, 7, now);
    expect(counts).toEqual({
      promptShown: 1,
      snoozed: 0,
      neverSet: 0,
      installed: 0,
      total: 1,
    });
  });

  it("ignores non-upgrade kinds", () => {
    const now = new Date("2026-05-10T00:00:00Z");
    const events = [
      ev("calibrator.adjusted", 1, now),
      ev("ai.override.complied", 1, now),
      ev("update-prompt-shown", 1, now),
    ];
    expect(aggregateUpgradeEvents7d(events, 7, now).total).toBe(1);
  });

  it("handles unparseable timestamps without crashing", () => {
    const now = new Date("2026-05-10T00:00:00Z");
    const bad: PersistedEvent = {
      id: "bad", kind: "update-prompt-shown" as PersistedEvent["kind"],
      timestamp: "not-a-date", schema_version: 1,
    } as unknown as PersistedEvent;
    expect(() => aggregateUpgradeEvents7d([bad], 7, now)).not.toThrow();
    expect(aggregateUpgradeEvents7d([bad], 7, now).total).toBe(0);
  });

  it("returns all-zero counts on empty input", () => {
    const now = new Date("2026-05-10T00:00:00Z");
    expect(aggregateUpgradeEvents7d([], 7, now)).toEqual({
      promptShown: 0, snoozed: 0, neverSet: 0, installed: 0, total: 0,
    });
  });
});

describe("renderUpgradeEvents7d (pure)", () => {
  it("returns empty string when total is 0", () => {
    expect(renderUpgradeEvents7d({ promptShown: 0, snoozed: 0, neverSet: 0, installed: 0, total: 0 }, 7)).toBe("");
  });

  it("renders all 4 buckets with the 升级 header", () => {
    const out = renderUpgradeEvents7d(
      { promptShown: 3, snoozed: 1, neverSet: 0, installed: 1, total: 5 },
      7,
    );
    expect(out).toContain("升级事件");
    expect(out).toContain("最近 7 天");
    expect(out).toContain("共 5 条");
    expect(out).toContain("update-prompt-shown");
    expect(out).toContain("3");
    expect(out).toContain("update-snoozed");
    expect(out).toContain("update-never-set");
    expect(out).toContain("update-installed");
  });
});

describe("renderStats integrates upgrade counts (issue #245)", () => {
  it("appends 升级事件 段落 when total > 0", () => {
    const upgradeCounts = { promptShown: 2, snoozed: 1, neverSet: 0, installed: 1, total: 4 };
    const out = renderStats(
      { personal: [], team: [], global: [] },
      [],
      7,
      upgradeCounts,
    );
    expect(out).toContain("升级事件");
    expect(out).toContain("共 4 条");
  });

  it("hides 升级事件 段落 when total is 0", () => {
    const out = renderStats(
      { personal: [], team: [], global: [] },
      [],
      7,
      { promptShown: 0, snoozed: 0, neverSet: 0, installed: 0, total: 0 },
    );
    expect(out).not.toContain("升级事件");
  });
});
