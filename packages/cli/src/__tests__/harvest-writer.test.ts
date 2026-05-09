import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appendHarvest, getHarvestPath } from "../harvest-writer.js";

function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ta-harvest-"));
}

describe("harvest-writer", () => {
  let cwd: string;
  beforeEach(() => { cwd = mkTmp(); });

  it("creates .teamagent/last-harvest.md on first call", () => {
    appendHarvest(cwd, {
      sessionId: "s1",
      mode: "incremental",
      lastTurnIndex: 5,
      correctionsFound: 2,
      extracted: 1,
      skipped: 1,
      failed: 0,
      rejected: 0,
      deduped: 0,
      newEntries: [{ trigger: "xx", correct_pattern: "yy", confidence: 0.9 }],
    });
    const p = getHarvestPath(cwd);
    expect(fs.existsSync(p)).toBe(true);
    const body = fs.readFileSync(p, "utf-8");
    expect(body).toContain("session s1");
    expect(body).toContain("incremental");
    expect(body).toContain("lastTurnIndex=5");
    expect(body).toContain("correctionsFound=2");
    expect(body).toContain("xx");
    expect(body).toContain("yy");
  });

  it("appends sections on subsequent calls (does not overwrite)", () => {
    appendHarvest(cwd, {
      sessionId: "s1", mode: "incremental", lastTurnIndex: 3,
      correctionsFound: 1, extracted: 1, skipped: 0, failed: 0,
      rejected: 0, deduped: 0, newEntries: [],
    });
    appendHarvest(cwd, {
      sessionId: "s1", mode: "full", lastTurnIndex: 10,
      correctionsFound: 5, extracted: 2, skipped: 2, failed: 1,
      rejected: 0, deduped: 3, newEntries: [],
    });
    const body = fs.readFileSync(getHarvestPath(cwd), "utf-8");
    expect(body.match(/session s1/g)?.length).toBe(2);
    expect(body).toContain("lastTurnIndex=3");
    expect(body).toContain("lastTurnIndex=10");
  });

  it("writes concise summary when no new entries", () => {
    appendHarvest(cwd, {
      sessionId: "s1", mode: "incremental", lastTurnIndex: 2,
      correctionsFound: 0, extracted: 0, skipped: 0, failed: 0,
      rejected: 0, deduped: 0, newEntries: [],
    });
    const body = fs.readFileSync(getHarvestPath(cwd), "utf-8");
    expect(body).toContain("无新增条目");
  });

  it("does not throw when cwd is unwritable-style edge (creates dir)", () => {
    const nested = path.join(cwd, "sub", "deeper");
    expect(() =>
      appendHarvest(nested, {
        sessionId: "s1", mode: "incremental", lastTurnIndex: 0,
        correctionsFound: 0, extracted: 0, skipped: 0, failed: 0,
        rejected: 0, deduped: 0, newEntries: [],
      }),
    ).not.toThrow();
    expect(fs.existsSync(getHarvestPath(nested))).toBe(true);
  });

  it("walk-up (#161): appendHarvest writes to parent harvest file when cwd is a subfolder", () => {
    // Create knowledge.db AND project marker at root so hardened walk-up matches
    fs.mkdirSync(path.join(cwd, ".teamagent"), { recursive: true });
    fs.writeFileSync(path.join(cwd, ".teamagent", "knowledge.db"), "");
    fs.writeFileSync(path.join(cwd, "package.json"), "{}");
    const sub = path.join(cwd, "sub");
    fs.mkdirSync(sub, { recursive: true });
    appendHarvest(sub, {
      sessionId: "s-161", mode: "incremental", lastTurnIndex: 1,
      correctionsFound: 0, extracted: 0, skipped: 0, failed: 0,
      rejected: 0, deduped: 0, newEntries: [],
    });
    // Harvest should be at root, not sub
    expect(fs.existsSync(path.join(cwd, ".teamagent", "last-harvest.md"))).toBe(true);
    expect(fs.existsSync(path.join(sub, ".teamagent", "last-harvest.md"))).toBe(false);
  });
});
