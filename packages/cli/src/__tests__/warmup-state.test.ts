/**
 * Unit tests for the warmup-state file (issue #91).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  writeWarmupState,
  readWarmupState,
  describeWarmupReadiness,
  writeInitialPlaceholder,
  isPidAlive,
  defaultWarmupStatePath,
  type WarmupState,
} from "../warmup-state.js";

function mkTmp(prefix: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return {
    dir,
    cleanup: () => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    },
  };
}

describe("defaultWarmupStatePath", () => {
  it("resolves to <home>/.teamagent/.warmup-state.json", () => {
    const p = defaultWarmupStatePath("/tmp/fakehome");
    expect(p).toBe(path.join("/tmp/fakehome", ".teamagent", ".warmup-state.json"));
  });
});

describe("writeWarmupState / readWarmupState", () => {
  it("round-trips a state document", () => {
    const tmp = mkTmp("warmup-state-rw-");
    try {
      const filePath = path.join(tmp.dir, "state.json");
      const state: WarmupState = {
        status: "downloading",
        started_at: "2026-05-07T07:00:00Z",
        pid: 12345,
        model: "Xenova/multilingual-e5-small",
        progress: {
          loaded_bytes: 50_000_000,
          total_bytes: 120_000_000,
          files_done: 3,
          files_total: 5,
        },
      };
      writeWarmupState(filePath, state);
      const got = readWarmupState(filePath);
      expect(got).toEqual(state);
    } finally {
      tmp.cleanup();
    }
  });

  it("createsthe parent directory if missing", () => {
    const tmp = mkTmp("warmup-state-mkdir-");
    try {
      const filePath = path.join(tmp.dir, "nested", "dir", "state.json");
      const state: WarmupState = {
        status: "ready",
        started_at: "2026-05-07T07:00:00Z",
        completed_at: "2026-05-07T07:09:30Z",
        pid: 0,
        model: "Xenova/multilingual-e5-small",
      };
      writeWarmupState(filePath, state);
      expect(fs.existsSync(filePath)).toBe(true);
    } finally {
      tmp.cleanup();
    }
  });

  it("readWarmupState returns null on missing file", () => {
    expect(readWarmupState("/nonexistent/path/state.json")).toBeNull();
  });

  it("readWarmupState returns null on malformed JSON", () => {
    const tmp = mkTmp("warmup-state-malformed-");
    try {
      const filePath = path.join(tmp.dir, "state.json");
      fs.writeFileSync(filePath, "{ not valid json", "utf-8");
      expect(readWarmupState(filePath)).toBeNull();
    } finally {
      tmp.cleanup();
    }
  });

  it("readWarmupState returns null when required fields are missing", () => {
    const tmp = mkTmp("warmup-state-shape-");
    try {
      const filePath = path.join(tmp.dir, "state.json");
      fs.writeFileSync(filePath, JSON.stringify({ status: "ready" }), "utf-8");
      expect(readWarmupState(filePath)).toBeNull();
    } finally {
      tmp.cleanup();
    }
  });
});

describe("isPidAlive", () => {
  it("returns true for pid 0 (init placeholder)", () => {
    expect(isPidAlive(0)).toBe(true);
  });

  it("returns true for the current process pid", () => {
    expect(isPidAlive(process.pid)).toBe(true);
  });

  it("returns false for a clearly impossible pid", () => {
    expect(isPidAlive(999_999_999)).toBe(false);
  });

  it("returns false for negative or non-integer pids", () => {
    expect(isPidAlive(-1)).toBe(false);
    expect(isPidAlive(1.5 as unknown as number)).toBe(false);
  });
});

describe("writeInitialPlaceholder", () => {
  it("writes a downloading state with pid=0", () => {
    const tmp = mkTmp("warmup-state-placeholder-");
    try {
      const filePath = path.join(tmp.dir, "state.json");
      writeInitialPlaceholder(filePath, "Xenova/multilingual-e5-small");
      const state = readWarmupState(filePath);
      expect(state?.status).toBe("downloading");
      expect(state?.pid).toBe(0);
      expect(state?.model).toBe("Xenova/multilingual-e5-small");
      expect(state?.started_at).toMatch(/^\d{4}-/);
    } finally {
      tmp.cleanup();
    }
  });
});

describe("describeWarmupReadiness", () => {
  it("returns missing when state file does not exist", () => {
    const r = describeWarmupReadiness("/nonexistent/state.json");
    expect(r).toEqual({ ready: false, reason: "missing", state: null });
  });

  it("returns ready when status is ready", () => {
    const tmp = mkTmp("warmup-state-ready-");
    try {
      const filePath = path.join(tmp.dir, "state.json");
      writeWarmupState(filePath, {
        status: "ready",
        started_at: "2026-05-07T07:00:00Z",
        completed_at: "2026-05-07T07:09:00Z",
        pid: 0,
        model: "Xenova/multilingual-e5-small",
      });
      const r = describeWarmupReadiness(filePath);
      expect(r.ready).toBe(true);
      expect(r.reason).toBe("ready");
      expect(r.state?.status).toBe("ready");
    } finally {
      tmp.cleanup();
    }
  });

  it("returns failed when status is failed", () => {
    const tmp = mkTmp("warmup-state-failed-");
    try {
      const filePath = path.join(tmp.dir, "state.json");
      writeWarmupState(filePath, {
        status: "failed",
        started_at: "2026-05-07T07:00:00Z",
        pid: 0,
        model: "Xenova/multilingual-e5-small",
        error: "ENETDOWN",
      });
      const r = describeWarmupReadiness(filePath);
      expect(r.ready).toBe(false);
      expect(r.reason).toBe("failed");
    } finally {
      tmp.cleanup();
    }
  });

  // Issue #160: graceful skip when optional vector deps absent.
  it("returns skipped when status is skipped (issue #160)", () => {
    const tmp = mkTmp("warmup-state-skipped-");
    try {
      const filePath = path.join(tmp.dir, "state.json");
      writeWarmupState(filePath, {
        status: "skipped",
        started_at: "2026-05-09T07:00:00Z",
        completed_at: "2026-05-09T07:00:00Z",
        pid: process.pid,
        model: "Xenova/multilingual-e5-small",
      });
      const r = describeWarmupReadiness(filePath);
      expect(r.ready).toBe(false);
      expect(r.reason).toBe("skipped");
      expect(r.state?.status).toBe("skipped");
    } finally {
      tmp.cleanup();
    }
  });

  it("returns downloading when status=downloading and pid is current process (alive)", () => {
    const tmp = mkTmp("warmup-state-downloading-");
    try {
      const filePath = path.join(tmp.dir, "state.json");
      writeWarmupState(filePath, {
        status: "downloading",
        started_at: "2026-05-07T07:00:00Z",
        pid: process.pid,
        model: "Xenova/multilingual-e5-small",
      });
      const r = describeWarmupReadiness(filePath);
      expect(r.ready).toBe(false);
      expect(r.reason).toBe("downloading");
    } finally {
      tmp.cleanup();
    }
  });

  it("returns stale_downloading when downloading but pid is dead", () => {
    const tmp = mkTmp("warmup-state-stale-");
    try {
      const filePath = path.join(tmp.dir, "state.json");
      writeWarmupState(filePath, {
        status: "downloading",
        started_at: "2026-05-07T07:00:00Z",
        pid: 999_999_999,
        model: "Xenova/multilingual-e5-small",
      });
      const r = describeWarmupReadiness(filePath);
      expect(r.ready).toBe(false);
      expect(r.reason).toBe("stale_downloading");
    } finally {
      tmp.cleanup();
    }
  });

  it("returns malformed when JSON is broken", () => {
    const tmp = mkTmp("warmup-state-malformed-");
    try {
      const filePath = path.join(tmp.dir, "state.json");
      fs.writeFileSync(filePath, "garbage", "utf-8");
      const r = describeWarmupReadiness(filePath);
      expect(r.ready).toBe(false);
      expect(r.reason).toBe("malformed");
    } finally {
      tmp.cleanup();
    }
  });

  it("placeholder (pid=0) counts as live downloading, not stale", () => {
    const tmp = mkTmp("warmup-state-placeholder-pid0-");
    try {
      const filePath = path.join(tmp.dir, "state.json");
      writeInitialPlaceholder(filePath, "Xenova/multilingual-e5-small");
      const r = describeWarmupReadiness(filePath);
      expect(r.ready).toBe(false);
      expect(r.reason).toBe("downloading");
    } finally {
      tmp.cleanup();
    }
  });
});
