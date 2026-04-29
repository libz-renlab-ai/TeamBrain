import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { executeDemoHook, parseDemoHookArgs } from "../commands/demo-hook.js";
import { executePitfall } from "../commands/pitfall.js";
import { DualLayerStore } from "@teamagent/adapters";
import type { KnowledgeEntry } from "@teamagent/types";

function rmRetry(p: string) {
  // Windows: node:sqlite WAL mode holds shm/wal files briefly after close()
  for (let i = 0; i < 8; i++) {
    try { fs.rmSync(p, { recursive: true, force: true }); return; } catch (e: any) {
      if ((e.code === "EBUSY" || e.code === "EPERM") && i < 7) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
        continue;
      }
      return; // ignore remaining lock errors
    }
  }
}

function mkTmp() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "demo-cwd-"));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "demo-home-"));
  return {
    cwd,
    home,
    cleanup: () => { rmRetry(cwd); rmRetry(home); },
  };
}

describe("parseDemoHookArgs", () => {
  it("returns null for empty args", () => {
    expect(parseDemoHookArgs([])).toBeNull();
  });

  it("parses tool name + key=value args", () => {
    const out = parseDemoHookArgs(["Bash", "command=npm install moment"]);
    expect(out).toEqual({
      toolName: "Bash",
      toolInput: { command: "npm install moment" },
    });
  });

  it("parses JSON-valued args", () => {
    const out = parseDemoHookArgs([
      "WebFetch",
      'url="https://x.com"',
      "prompt=fetch",
    ]);
    expect(out?.toolInput.url).toBe("https://x.com");
  });
});

describe("executeDemoHook", () => {
  let tmp: ReturnType<typeof mkTmp>;
  const fixedNow = "2026-04-14T00:00:00Z";

  beforeEach(() => {
    tmp = mkTmp();
  });

  afterEach(() => {
    tmp.cleanup();
  });

  it("no rules → '通过 (无规则命中)'", () => {
    const out = executeDemoHook({
      toolName: "Bash",
      toolInput: { command: "ls" },
      cwd: tmp.cwd,
      homeDir: tmp.home,
    });
    expect(out).toContain("通过 (无规则命中)");
    expect(out).toContain("🟢");
  });

  it("warn-level match → 💡 + AI 提示", () => {
    executePitfall(
      {
        trigger: "npm install moment",
        wrong: "moment",
        correct: "dayjs",
        reason: "已停止维护",
        nature: "subjective", // 强制 warn (cap)
      },
      { cwd: tmp.cwd, homeDir: tmp.home, now: () => fixedNow, env: {} },
    );

    const out = executeDemoHook({
      toolName: "Bash",
      toolInput: { command: "npm install moment" },
      cwd: tmp.cwd,
      homeDir: tmp.home,
    });

    expect(out).toContain("💡");
    expect(out).toContain("决策: allow");
    expect(out).toContain("dayjs");
  });

  it("block-level match → 🚫 + 拦截原因", () => {
    // 直接 seed 一个 block 规则（pitfall 默认 confidence=0.7 出 warn；这里手动写高置信 block 规则）
    const projectDbPath = path.join(tmp.cwd, ".teamagent", "knowledge.db");
    const userGlobalDbPath = path.join(tmp.home, ".teamagent", "global.db");
    fs.mkdirSync(path.dirname(projectDbPath), { recursive: true });
    fs.mkdirSync(path.dirname(userGlobalDbPath), { recursive: true });
    const blockEntry: KnowledgeEntry = {
      id: "block-test",
      scope: { level: "personal" },
      category: "C",
      tags: ["danger"],
      type: "avoidance",
      nature: "objective",
      trigger: "rm -rf",
      wrong_pattern: "rm -rf /",
      correct_pattern: "git clean -fd 或具体路径",
      reasoning: "rm -rf 不可逆",
      confidence: 0.95,
      enforcement: "block",
      status: "active",
      hit_count: 0,
      success_count: 0,
      override_count: 0,
      evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
      created_at: fixedNow,
      last_hit_at: "",
      last_validated_at: fixedNow,
      source: "accumulated",
      conflict_with: [],
      current_tier: "experimental" as const,
      max_tier_ever: "experimental" as const,
      tier_entered_at: "",
      demerit: 0,
      demerit_last_updated: "",
      resurrect_count: 0,
    };
    const store = new DualLayerStore({ projectDbPath, userGlobalDbPath });
    store.add(blockEntry);
    store.close();

    const out = executeDemoHook({
      toolName: "Bash",
      toolInput: { command: "rm -rf /important" },
      cwd: tmp.cwd,
      homeDir: tmp.home,
      projectDbPath,
      userGlobalDbPath,
    });

    expect(out).toContain("🚫");
    expect(out).toContain("决策: deny");
    expect(out).toContain("git clean");
  });

  // B-066: demo hook is an offline diagnostic command and MUST NOT write
  // anything that calibrate later treats as real user evidence. Specifically
  // it must not create / mutate ~/.teamagent/events.db (where success/failure
  // observations live). Without this guard, calibrate would inflate
  // confidence (実測 0.70 → 0.83) on rules that have no real production hits.
  it("does not create or mutate events.db (no calibration pollution)", () => {
    const projectDbPath = path.join(tmp.cwd, ".teamagent", "knowledge.db");
    const userGlobalDbPath = path.join(tmp.home, ".teamagent", "global.db");
    const eventsDbPath = path.join(tmp.home, ".teamagent", "events.db");
    fs.mkdirSync(path.dirname(eventsDbPath), { recursive: true });
    expect(fs.existsSync(eventsDbPath)).toBe(false);

    executeDemoHook({
      toolName: "Bash",
      toolInput: { command: "npm install moment" },
      cwd: tmp.cwd,
      homeDir: tmp.home,
      projectDbPath,
      userGlobalDbPath,
    });

    // events.db must not be created by demo hook — that's a real-PreToolUse
    // responsibility, not the offline simulator.
    expect(fs.existsSync(eventsDbPath)).toBe(false);
  });

  // B-066: even when demo hook matches a real rule, it must not mutate
  // hit_count / success_count on the matched entry (that would leak into
  // calibrator scoring on the next run).
  it("does not mutate hit_count or success_count on matched rule", async () => {
    const projectDbPath = path.join(tmp.cwd, ".teamagent", "knowledge.db");
    const userGlobalDbPath = path.join(tmp.home, ".teamagent", "global.db");
    fs.mkdirSync(path.dirname(projectDbPath), { recursive: true });
    fs.mkdirSync(path.dirname(userGlobalDbPath), { recursive: true });
    const entry: KnowledgeEntry = {
      id: "no-mutate-test",
      scope: { level: "personal" },
      category: "C",
      tags: [],
      type: "avoidance",
      nature: "objective",
      trigger: "moment",
      wrong_pattern: "moment",
      correct_pattern: "dayjs",
      reasoning: "moment is heavy",
      confidence: 0.7,
      enforcement: "warn",
      status: "active",
      hit_count: 5,
      success_count: 2,
      override_count: 1,
      evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
      created_at: fixedNow,
      last_hit_at: "",
      last_validated_at: fixedNow,
      source: "accumulated",
      conflict_with: [],
      current_tier: "experimental" as const,
      max_tier_ever: "experimental" as const,
      tier_entered_at: "",
      demerit: 0,
      demerit_last_updated: "",
      resurrect_count: 0,
    };
    let store = new DualLayerStore({ projectDbPath, userGlobalDbPath });
    store.add(entry);
    store.close();

    executeDemoHook({
      toolName: "Bash",
      toolInput: { command: "npm install moment" },
      cwd: tmp.cwd,
      homeDir: tmp.home,
      projectDbPath,
      userGlobalDbPath,
    });

    store = new DualLayerStore({ projectDbPath, userGlobalDbPath });
    const after = store.findActive().find((r) => r.id === "no-mutate-test");
    store.close();
    expect(after).toBeDefined();
    expect(after!.hit_count).toBe(5);
    expect(after!.success_count).toBe(2);
    expect(after!.override_count).toBe(1);
  });
});
