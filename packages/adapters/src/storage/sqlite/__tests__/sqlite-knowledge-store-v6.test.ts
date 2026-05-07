import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDb } from "../schema.js";
import { SqliteKnowledgeStore } from "../sqlite-knowledge-store.js";
import type { KnowledgeEntry } from "@teamagent/types";

describe("SqliteKnowledgeStore v6 fields", () => {
  let store: SqliteKnowledgeStore;
  beforeEach(() => {
    const dbPath = join(mkdtempSync(join(tmpdir(), "m4b-kstore-")), "t.db");
    store = new SqliteKnowledgeStore(openDb(dbPath));
  });

  it("persists trigger_description + pattern_description", async () => {
    const e = mkEntry({
      id: "r1",
      trigger_description: "需要发起 HTTP 请求",
      pattern_description: "使用 axios 库",
      fire_threshold: 0.6,
      embedder_model_id: "Xenova/multilingual-e5-small",
    });
    await store.add(e);
    const [got] = await store.byIds(["r1"]);
    expect(got?.trigger_description).toBe("需要发起 HTTP 请求");
    expect(got?.pattern_description).toBe("使用 axios 库");
    expect(got?.fire_threshold).toBeCloseTo(0.6);
    expect(got?.embedder_model_id).toBe("Xenova/multilingual-e5-small");
  });

  it("defaults fire_threshold when not provided", async () => {
    await store.add(mkEntry({ id: "r2" }));
    const [got] = await store.byIds(["r2"]);
    expect(got?.fire_threshold).toBeCloseTo(0.65); // DEFAULT_FIRE_THRESHOLD raised from 0.40 → 0.65 (B-125/B-139)
  });

  it("reads old rows without new fields without error", async () => {
    const db = (store as any).db;
    db.prepare(`INSERT INTO knowledge (id, scope_level, category, tags, type, nature,
      trigger, correct_pattern, enforcement, source, created_at, tier_entered_at)
      VALUES ('old1','global','E','[]','avoidance','objective','x','y','warn','test',datetime('now'),datetime('now'))`).run();
    const [got] = await store.byIds(["old1"]);
    expect(got?.id).toBe("old1");
    expect(got?.trigger_description).toBe("");
    expect(got?.fire_threshold).toBeCloseTo(0.65); // DEFAULT_FIRE_THRESHOLD raised from 0.40 → 0.65 (B-125/B-139)
  });
});

function mkEntry(overrides: Partial<KnowledgeEntry>): KnowledgeEntry {
  return {
    id: "r",
    scope: { level: "global" },
    category: "E",
    tags: [],
    type: "avoidance",
    nature: "objective",
    trigger: "x",
    wrong_pattern: "",
    correct_pattern: "y",
    reasoning: "",
    confidence: 0.7,
    enforcement: "warn",
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: new Date().toISOString(),
    last_hit_at: "",
    last_validated_at: new Date().toISOString(),
    source: "accumulated",
    conflict_with: [],
    current_tier: "experimental",
    max_tier_ever: "experimental",
    tier_entered_at: new Date().toISOString(),
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
    channel: "tool-action",
    ...overrides,
  };
}
