/**
 * Unit tests for the embedder-state file (issue #164).
 *
 * Mirrors warmup-state.test.ts patterns. Pure logic only — no daemon spawn,
 * no HTTP. Daemon end-to-end is covered by embedder-daemon.test.ts.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  writeEmbedderState,
  readEmbedderState,
  describeDaemonReadiness,
  isDaemonPidAlive,
  defaultEmbedderStatePath,
  addMember,
  removeMember,
  type EmbedderState,
} from "../embedder-state.js";

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

function makeState(overrides: Partial<EmbedderState> = {}): EmbedderState {
  return {
    status: "running",
    pid: process.pid,
    port: 12345,
    started_at: new Date().toISOString(),
    model: "Xenova/multilingual-e5-small",
    members: [],
    ...overrides,
  };
}

describe("defaultEmbedderStatePath", () => {
  it("resolves to <home>/.teamagent/.embedder-state.json", () => {
    const p = defaultEmbedderStatePath("/tmp/fakehome");
    expect(p).toBe(path.join("/tmp/fakehome", ".teamagent", ".embedder-state.json"));
  });
});

describe("writeEmbedderState / readEmbedderState", () => {
  it("round-trips a valid state file", () => {
    const t = mkTmp("embedder-state-rw-");
    try {
      const fp = path.join(t.dir, "state.json");
      const state = makeState({ port: 54321 });
      writeEmbedderState(fp, state);
      const back = readEmbedderState(fp);
      expect(back).not.toBeNull();
      expect(back!.status).toBe("running");
      expect(back!.port).toBe(54321);
      expect(back!.pid).toBe(process.pid);
    } finally {
      t.cleanup();
    }
  });

  it("returns null for missing file", () => {
    const t = mkTmp("embedder-state-missing-");
    try {
      const back = readEmbedderState(path.join(t.dir, "nope.json"));
      expect(back).toBeNull();
    } finally {
      t.cleanup();
    }
  });

  it("returns null for malformed JSON", () => {
    const t = mkTmp("embedder-state-malformed-");
    try {
      const fp = path.join(t.dir, "state.json");
      fs.writeFileSync(fp, "{ not json", "utf-8");
      expect(readEmbedderState(fp)).toBeNull();
    } finally {
      t.cleanup();
    }
  });

  it("returns null when required fields missing", () => {
    const t = mkTmp("embedder-state-incomplete-");
    try {
      const fp = path.join(t.dir, "state.json");
      fs.writeFileSync(fp, JSON.stringify({ status: "running" }), "utf-8");
      expect(readEmbedderState(fp)).toBeNull();
    } finally {
      t.cleanup();
    }
  });
});

describe("isDaemonPidAlive", () => {
  it("returns true for the current process pid", () => {
    expect(isDaemonPidAlive(process.pid)).toBe(true);
  });

  it("returns false for pid=0 (no placeholder semantics)", () => {
    expect(isDaemonPidAlive(0)).toBe(false);
  });

  it("returns false for negative or non-integer pid", () => {
    expect(isDaemonPidAlive(-1)).toBe(false);
    expect(isDaemonPidAlive(1.5)).toBe(false);
  });

  it("returns false for an obviously dead pid", () => {
    // A very high pid is almost certainly free; if not, we accept the false
    // negative as harmless.
    expect(isDaemonPidAlive(999_999_999)).toBe(false);
  });
});

describe("describeDaemonReadiness", () => {
  it("ready=false reason=missing when file absent", () => {
    const t = mkTmp("readiness-missing-");
    try {
      const r = describeDaemonReadiness(path.join(t.dir, "nope.json"));
      expect(r.ready).toBe(false);
      expect(r.reason).toBe("missing");
    } finally {
      t.cleanup();
    }
  });

  it("ready=false reason=stale_pid when pid dead", () => {
    const t = mkTmp("readiness-stale-");
    try {
      const fp = path.join(t.dir, "state.json");
      writeEmbedderState(fp, makeState({ pid: 999_999_999 }));
      const r = describeDaemonReadiness(fp);
      expect(r.ready).toBe(false);
      expect(r.reason).toBe("stale_pid");
    } finally {
      t.cleanup();
    }
  });

  it("ready=false reason=starting during cold load", () => {
    const t = mkTmp("readiness-starting-");
    try {
      const fp = path.join(t.dir, "state.json");
      writeEmbedderState(fp, makeState({ status: "starting", port: 0 }));
      const r = describeDaemonReadiness(fp);
      expect(r.ready).toBe(false);
      expect(r.reason).toBe("starting");
    } finally {
      t.cleanup();
    }
  });

  it("ready=false reason=failed when daemon crashed", () => {
    const t = mkTmp("readiness-failed-");
    try {
      const fp = path.join(t.dir, "state.json");
      writeEmbedderState(fp, makeState({ status: "failed", error: "boom" }));
      const r = describeDaemonReadiness(fp);
      expect(r.ready).toBe(false);
      expect(r.reason).toBe("failed");
    } finally {
      t.cleanup();
    }
  });

  it("ready=false reason=no_port when status=running but port invalid", () => {
    const t = mkTmp("readiness-no-port-");
    try {
      const fp = path.join(t.dir, "state.json");
      writeEmbedderState(fp, makeState({ port: 0 }));
      const r = describeDaemonReadiness(fp);
      expect(r.ready).toBe(false);
      expect(r.reason).toBe("no_port");
    } finally {
      t.cleanup();
    }
  });

  it("ready=true when status=running, pid alive, port valid", () => {
    const t = mkTmp("readiness-ok-");
    try {
      const fp = path.join(t.dir, "state.json");
      writeEmbedderState(fp, makeState({ port: 54321 }));
      const r = describeDaemonReadiness(fp);
      expect(r.ready).toBe(true);
      expect(r.reason).toBe("ready");
      expect(r.state?.port).toBe(54321);
    } finally {
      t.cleanup();
    }
  });
});

describe("addMember / removeMember", () => {
  it("adds new members and is idempotent on duplicates", () => {
    const t = mkTmp("member-add-");
    try {
      const fp = path.join(t.dir, "state.json");
      writeEmbedderState(fp, makeState());
      expect(addMember(fp, "session-A")).toBe(1);
      expect(addMember(fp, "session-B")).toBe(2);
      expect(addMember(fp, "session-A")).toBe(2); // dup
      const back = readEmbedderState(fp);
      expect(back!.members.map((m) => m.session_id)).toEqual(["session-A", "session-B"]);
    } finally {
      t.cleanup();
    }
  });

  it("removes members and is idempotent on absent ids", () => {
    const t = mkTmp("member-rm-");
    try {
      const fp = path.join(t.dir, "state.json");
      writeEmbedderState(fp, makeState({
        members: [
          { session_id: "A", joined_at: "2026-01-01T00:00:00Z" },
          { session_id: "B", joined_at: "2026-01-01T00:00:00Z" },
        ],
      }));
      expect(removeMember(fp, "A")).toBe(1);
      expect(removeMember(fp, "C")).toBe(1); // not present, no change
      const back = readEmbedderState(fp);
      expect(back!.members.map((m) => m.session_id)).toEqual(["B"]);
    } finally {
      t.cleanup();
    }
  });

  it("returns null when state file missing", () => {
    const t = mkTmp("member-missing-");
    try {
      expect(addMember(path.join(t.dir, "nope.json"), "X")).toBeNull();
      expect(removeMember(path.join(t.dir, "nope.json"), "X")).toBeNull();
    } finally {
      t.cleanup();
    }
  });
});
