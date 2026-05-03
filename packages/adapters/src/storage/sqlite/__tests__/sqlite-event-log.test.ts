import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { openDb } from "../schema.js";
import { SqliteEventLog } from "../sqlite-event-log.js";
import type { PersistedEvent } from "@teamagent/types";

let tmpDir: string;
let log: SqliteEventLog;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "teamagent-eventlog-"));
  const db = openDb(path.join(tmpDir, "test.db"));
  log = new SqliteEventLog(db);
});

afterEach(() => {
  log.close();
  if (tmpDir && fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("SqliteEventLog", () => {
  it("append + readAll roundtrips", () => {
    const e: PersistedEvent = {
      id: "e-1",
      kind: "hook-pre.matched",
      knowledge_id: "r-1",
      timestamp: "2026-04-15T00:00:00Z",
      schema_version: 1,
    };
    log.append(e);
    const all = log.readAll();
    expect(all).toHaveLength(1);
    expect(all[0]!.kind).toBe("hook-pre.matched");
    expect(all[0]!.knowledge_id).toBe("r-1");
  });

  it("readByKind filters", () => {
    log.append({ id: "e1", kind: "hook-pre.matched", timestamp: "t1", schema_version: 1 });
    log.append({ id: "e2", kind: "hook-pre.warned", timestamp: "t2", schema_version: 1 });
    log.append({ id: "e3", kind: "hook-pre.matched", timestamp: "t3", schema_version: 1 });
    expect(log.readByKind("hook-pre.matched")).toHaveLength(2);
    expect(log.readByKind("hook-pre.warned")).toHaveLength(1);
  });

  it("readLast returns N most recent", () => {
    for (let i = 0; i < 5; i++) {
      log.append({ id: `e${i}`, kind: "hook-pre.matched", timestamp: `2026-04-15T00:00:0${i}Z`, schema_version: 1 });
    }
    const last3 = log.readLast(3);
    expect(last3.map(e => e.id)).toEqual(["e4", "e3", "e2"]);
  });

  it("preserves payload fields (tool_use_id, confidence_before/after)", () => {
    const e = {
      id: "e-p",
      kind: "calibrator.adjusted",
      knowledge_id: "r-x",
      timestamp: "2026-04-15T00:00:00Z",
      schema_version: 1,
      tool_use_id: "tu-1",
      confidence_before: 0.5,
      confidence_after: 0.6,
      demerit_before: 1,
      demerit_after: 2,
      tier_before: "experimental",
      tier_after: "probation",
    } as any;
    log.append(e);
    const got = log.readAll()[0] as any;
    expect(got.tool_use_id).toBe("tu-1");
    expect(got.confidence_before).toBe(0.5);
    expect(got.confidence_after).toBe(0.6);
    expect(got.demerit_before).toBe(1);
    expect(got.demerit_after).toBe(2);
    expect(got.tier_before).toBe("experimental");
    expect(got.tier_after).toBe("probation");
  });

  it("B-056: readAll does not throw when one row has malformed JSON payload", () => {
    const db = openDb(":memory:");
    const log = new SqliteEventLog(db);

    log.append({
      id: "e-good",
      kind: "hook-pre.blocked",
      knowledge_id: "k1",
      timestamp: "2026-04-27T00:00:00Z",
      schema_version: 1,
    });

    // Inject a row with malformed payload directly via SQL
    db.prepare(
      "INSERT INTO events (id, kind, knowledge_id, tool_use_id, timestamp, payload) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("e-bad", "hook-pre.blocked", "k2", null, "2026-04-27T00:01:00Z", "{malformed");

    expect(() => log.readAll()).not.toThrow();
    const events = log.readAll();
    expect(events.length).toBe(2);
    const badEvent = events.find(e => e.id === "e-bad");
    expect(badEvent).toBeDefined();
    expect(badEvent?.kind).toBe("hook-pre.blocked");

    db.close();
  });
});
