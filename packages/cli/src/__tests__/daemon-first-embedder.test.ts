/**
 * Unit tests for DaemonFirstEmbedder (issue #164).
 *
 * Mirrors patterns from warmup-state.test.ts and embedder-state.test.ts:
 *   - tmpdir per test, cleaned in finally
 *   - readiness state files written by hand to drive code paths
 *   - real loopback HTTP server for happy-path daemon hit
 *
 * Critical: `XenovaRuleEmbedder` is mocked at the @teamagent/adapters
 * boundary so the fallback path never loads the real 115MB ONNX model.
 * Without this mock, fallback tests would balloon to multi-second model
 * downloads on first run and could time out in CI.
 *
 * The daemon respawn machinery is exercised by pointing
 * `TEAMAGENT_EMBEDDER_BIN` at a non-existent file (resolveEmbedderBin
 * returns null → spawn never runs) so no detached child process leaks
 * out of the test suite.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import type { AddressInfo } from "node:net";

// ── mock @teamagent/adapters BEFORE importing the SUT ─────────────────────
// Counter + last-call-args live at module scope so the vi.mock factory can
// reference them. Each test resets via beforeEach.

let xenovaConstructCount = 0;
let xenovaEmbedCalls: string[][] = [];

vi.mock("@teamagent/adapters", () => {
  class MockXenovaRuleEmbedder {
    readonly modelId: string;
    readonly dim: number;
    constructor(opts: { modelId?: string; dim?: number } = {}) {
      xenovaConstructCount++;
      this.modelId = opts.modelId ?? "Xenova/multilingual-e5-small";
      this.dim = opts.dim ?? 384;
    }
    async embed(texts: string[]): Promise<number[][]> {
      xenovaEmbedCalls.push([...texts]);
      // Deterministic fake vectors: each text → [0.1, 0.2, 0.3] (3-dim
      // is enough; tests assert only that the fallback's value flowed
      // through, not the dim).
      return texts.map(() => [0.1, 0.2, 0.3]);
    }
  }
  return {
    XenovaRuleEmbedder: MockXenovaRuleEmbedder,
  } as unknown as Partial<typeof import("@teamagent/adapters")>;
});

import { DaemonFirstEmbedder, tryDetachedSpawn } from "../daemon-first-embedder.js";
import {
  writeEmbedderState,
  type EmbedderState,
} from "../embedder-state.js";

// ── shared test infrastructure ────────────────────────────────────────────

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
    port: 0,
    started_at: new Date().toISOString(),
    model: "Xenova/multilingual-e5-small",
    members: [],
    ...overrides,
  };
}

/**
 * Spin up a tiny loopback HTTP server that emulates the embedder daemon's
 * /embed endpoint. Returns the bound port + a teardown fn.
 *
 * `respond` lets a test customize the response (status/body) for a given
 * request body; defaults to 200 with `{vectors: [[1,2,3], …]}` per text.
 */
function startFakeDaemon(opts: {
  respond?: (body: { texts?: string[] }) => { status: number; body: string };
} = {}): Promise<{ port: number; close: () => Promise<void> }> {
  const respond = opts.respond ?? ((body) => ({
    status: 200,
    body: JSON.stringify({
      vectors: (body.texts ?? []).map((_, i) => [i + 1, i + 2, i + 3]),
    }),
  }));
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        let parsed: { texts?: string[] } = {};
        try {
          parsed = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
        } catch {
          /* leave empty */
        }
        const r = respond(parsed);
        res.writeHead(r.status, { "content-type": "application/json" });
        res.end(r.body);
      });
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      resolve({
        port: addr.port,
        close: () =>
          new Promise<void>((res) => {
            server.close(() => res());
          }),
      });
    });
  });
}

let origEmbedderBin: string | undefined;

beforeEach(() => {
  xenovaConstructCount = 0;
  xenovaEmbedCalls = [];
  // Force resolveEmbedderBin → null so tryDetachedSpawn is a no-op during
  // tests, even when DaemonFirstEmbedder hits the fallback path.
  origEmbedderBin = process.env["TEAMAGENT_EMBEDDER_BIN"];
  process.env["TEAMAGENT_EMBEDDER_BIN"] = path.join(
    os.tmpdir(),
    `teamagent-embedder-bin-does-not-exist-${process.pid}-${Date.now()}.cjs`,
  );
});

afterEach(() => {
  if (origEmbedderBin === undefined) {
    delete process.env["TEAMAGENT_EMBEDDER_BIN"];
  } else {
    process.env["TEAMAGENT_EMBEDDER_BIN"] = origEmbedderBin;
  }
});

// ── tests ─────────────────────────────────────────────────────────────────

describe("DaemonFirstEmbedder.embed", () => {
  it("returns [] for empty input without touching daemon or fallback", async () => {
    const t = mkTmp("dfe-empty-");
    try {
      const statePath = path.join(t.dir, "state.json");
      // Note: state file deliberately missing — proves we short-circuit
      // before calling describeDaemonReadiness or constructing fallback.
      const e = new DaemonFirstEmbedder({
        statePath,
        autoSpawn: false,
        timeoutMs: 50,
      });
      const out = await e.embed([]);
      expect(out).toEqual([]);
      expect(xenovaConstructCount).toBe(0);
      expect(xenovaEmbedCalls).toEqual([]);
    } finally {
      t.cleanup();
    }
  });

  it("returns daemon-served vectors when the daemon is reachable", async () => {
    const t = mkTmp("dfe-daemon-ok-");
    const fake = await startFakeDaemon();
    try {
      const statePath = path.join(t.dir, "state.json");
      writeEmbedderState(
        statePath,
        makeState({ status: "running", pid: process.pid, port: fake.port }),
      );
      const e = new DaemonFirstEmbedder({
        statePath,
        autoSpawn: false,
        timeoutMs: 1000,
      });
      const out = await e.embed(["alpha", "beta"]);
      // Fake daemon returns [i+1, i+2, i+3] per text → first text [1,2,3],
      // second [2,3,4]. Asserts vectors really came from the HTTP server,
      // not from the (mocked) fallback (which returns [0.1, 0.2, 0.3]).
      expect(out).toEqual([
        [1, 2, 3],
        [2, 3, 4],
      ]);
      expect(xenovaConstructCount).toBe(0);
      expect(xenovaEmbedCalls).toEqual([]);
    } finally {
      await fake.close();
      t.cleanup();
    }
  });

  it("returns empty vectors (NOT in-process Xenova load) when state file is missing", async () => {
    // Issue #315: previous fallback was `new XenovaRuleEmbedder()` in-process
    // (~650MB RSS). That made multi-session usage a RAM bomb. The new contract
    // is: daemon unreachable → one empty vector per text → SqliteSemanticRetriever
    // vec0 stages error on 0-byte buffer → try/catch swallows → BM25-only result.
    const t = mkTmp("dfe-empty-fallback-");
    try {
      const statePath = path.join(t.dir, "state.json");
      // No state file written → describeDaemonReadiness → reason=missing.
      const e = new DaemonFirstEmbedder({
        statePath,
        autoSpawn: false,
        timeoutMs: 50,
      });
      const out = await e.embed(["alpha", "beta"]);
      expect(out).toEqual([[], []]);
      // Critical assertion: NO in-process XenovaRuleEmbedder construction.
      expect(xenovaConstructCount).toBe(0);
      expect(xenovaEmbedCalls).toEqual([]);
    } finally {
      t.cleanup();
    }
  });

  it("daemon-unreachable matches input length (one empty vec per text)", async () => {
    const t = mkTmp("dfe-empty-length-");
    try {
      const statePath = path.join(t.dir, "state.json");
      const e = new DaemonFirstEmbedder({
        statePath,
        autoSpawn: false,
        timeoutMs: 50,
      });
      const out = await e.embed(["x", "y", "z"]);
      expect(out).toHaveLength(3);
      expect(out.every((v) => Array.isArray(v) && v.length === 0)).toBe(true);
      expect(xenovaConstructCount).toBe(0);
    } finally {
      t.cleanup();
    }
  });
});

describe("tryDetachedSpawn", () => {
  it("is a no-op when daemon is already running (status=running, pid alive)", async () => {
    const t = mkTmp("spawn-running-");
    const fake = await startFakeDaemon();
    try {
      const statePath = path.join(t.dir, "state.json");
      // Real port + this process's pid → describeDaemonReadiness → ready.
      // Even with a real bin path we'd skip; with the bogus bin override
      // from beforeEach we double-prove no-op.
      writeEmbedderState(
        statePath,
        makeState({ status: "running", pid: process.pid, port: fake.port }),
      );
      // Should not throw, should not spawn anything.
      expect(() => tryDetachedSpawn(statePath)).not.toThrow();
    } finally {
      await fake.close();
      t.cleanup();
    }
  });

  it("is a no-op when daemon is in 'starting' state", () => {
    const t = mkTmp("spawn-starting-");
    try {
      const statePath = path.join(t.dir, "state.json");
      writeEmbedderState(
        statePath,
        // status=starting, port=0 → readiness reports "starting" and
        // tryDetachedSpawn must early-return without spawning a child.
        makeState({ status: "starting", pid: process.pid, port: 0 }),
      );
      expect(() => tryDetachedSpawn(statePath)).not.toThrow();
    } finally {
      t.cleanup();
    }
  });

  it("does not throw when the bin path is absent (resolveEmbedderBin → null)", () => {
    const t = mkTmp("spawn-nobin-");
    try {
      const statePath = path.join(t.dir, "state.json");
      // No state file at all → readiness=missing → tryDetachedSpawn falls
      // through to resolveEmbedderBin, which returns null because the
      // beforeEach override points at a path that doesn't exist.
      // Must be a quiet best-effort no-op (function returns void).
      expect(() => tryDetachedSpawn(statePath)).not.toThrow();
    } finally {
      t.cleanup();
    }
  });
});
