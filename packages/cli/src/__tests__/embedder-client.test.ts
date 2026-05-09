/**
 * Unit tests for the embedder daemon HTTP client (issue #164).
 *
 * Mirrors the patterns in warmup-state.test.ts and embedder-state.test.ts:
 * mkTmp helper, fs.mkdtempSync, no real network beyond 127.0.0.1. A real
 * node:http server is spawned on a random port for each test that needs
 * an HTTP target; tests are deterministic and Windows-friendly (no Unix
 * sockets, short timeouts).
 */
import { describe, it, expect, afterEach } from "vitest";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { AddressInfo } from "node:net";

import {
  embedViaDaemon,
  postRegister,
  postShutdown,
} from "../embedder-client.js";
import {
  writeEmbedderState,
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

interface StartedServer {
  server: http.Server;
  port: number;
}

/**
 * Start a real http server on 127.0.0.1 with a random port. Caller must
 * close it (via the afterEach cleanup registered below).
 */
async function startServer(
  handler: http.RequestListener,
): Promise<StartedServer> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as AddressInfo;
  return { server, port: addr.port };
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise<void>((resolve) => {
    // Forcibly drop any kept-alive sockets so close() returns promptly even
    // if a hanging-handler test left a socket open.
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
}

describe("embedViaDaemon", () => {
  const servers: http.Server[] = [];
  const tmps: Array<{ cleanup: () => void }> = [];

  afterEach(async () => {
    for (const s of servers.splice(0)) {
      await closeServer(s);
    }
    for (const t of tmps.splice(0)) t.cleanup();
  });

  it("short-circuits empty texts and returns []", async () => {
    // No state file required — function returns before touching disk.
    const out = await embedViaDaemon([], { statePath: "/nonexistent/path.json" });
    expect(out).toEqual([]);
  });

  it("returns null when state file is missing", async () => {
    const tmp = mkTmp("embedder-client-missing-");
    tmps.push(tmp);
    const out = await embedViaDaemon(["hello"], {
      statePath: path.join(tmp.dir, "nope.json"),
    });
    expect(out).toBeNull();
  });

  it("returns null when state says status=starting (not ready)", async () => {
    const tmp = mkTmp("embedder-client-starting-");
    tmps.push(tmp);
    const fp = path.join(tmp.dir, "state.json");
    writeEmbedderState(fp, makeState({ status: "starting", port: 0 }));
    const out = await embedViaDaemon(["hello"], { statePath: fp });
    expect(out).toBeNull();
  });

  it("returns vectors[] when daemon responds 200 with {vectors}", async () => {
    const started = await startServer((req, res) => {
      if (req.method === "POST" && req.url === "/embed") {
        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", () => {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ vectors: [[1, 2], [3, 4]] }));
        });
        return;
      }
      res.writeHead(404);
      res.end();
    });
    servers.push(started.server);

    const tmp = mkTmp("embedder-client-ok-");
    tmps.push(tmp);
    const fp = path.join(tmp.dir, "state.json");
    writeEmbedderState(fp, makeState({ port: started.port }));

    const out = await embedViaDaemon(["a", "b"], { statePath: fp, timeoutMs: 1000 });
    expect(out).toEqual([[1, 2], [3, 4]]);
  });

  it("returns null when daemon returns non-200", async () => {
    const started = await startServer((_req, res) => {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end("boom");
    });
    servers.push(started.server);

    const tmp = mkTmp("embedder-client-500-");
    tmps.push(tmp);
    const fp = path.join(tmp.dir, "state.json");
    writeEmbedderState(fp, makeState({ port: started.port }));

    const out = await embedViaDaemon(["x"], { statePath: fp, timeoutMs: 1000 });
    expect(out).toBeNull();
  });

  it("returns null on timeout when server hangs", async () => {
    // Server accepts the request and intentionally never responds.
    const started = await startServer((_req, _res) => {
      // hang forever; closeAllConnections() in afterEach will tear down
    });
    servers.push(started.server);

    const tmp = mkTmp("embedder-client-timeout-");
    tmps.push(tmp);
    const fp = path.join(tmp.dir, "state.json");
    writeEmbedderState(fp, makeState({ port: started.port }));

    const t0 = Date.now();
    const out = await embedViaDaemon(["x"], { statePath: fp, timeoutMs: 50 });
    const elapsed = Date.now() - t0;
    expect(out).toBeNull();
    // Sanity: client must honor the short timeout (give generous slack for
    // CI scheduling noise but well under the 5s suite budget).
    expect(elapsed).toBeLessThan(2000);
  });
});

describe("postRegister", () => {
  const servers: http.Server[] = [];
  const tmps: Array<{ cleanup: () => void }> = [];

  afterEach(async () => {
    for (const s of servers.splice(0)) {
      await closeServer(s);
    }
    for (const t of tmps.splice(0)) t.cleanup();
  });

  it("returns true when daemon responds 204", async () => {
    const started = await startServer((req, res) => {
      if (req.method === "POST" && req.url === "/register") {
        // Drain the body before responding to avoid socket-state oddities.
        req.on("data", () => {});
        req.on("end", () => {
          res.writeHead(204);
          res.end();
        });
        return;
      }
      res.writeHead(404);
      res.end();
    });
    servers.push(started.server);

    const tmp = mkTmp("embedder-client-register-ok-");
    tmps.push(tmp);
    const fp = path.join(tmp.dir, "state.json");
    writeEmbedderState(fp, makeState({ port: started.port }));

    const ok = await postRegister("session-A", {
      statePath: fp,
      timeoutMs: 500,
      pollMs: 1000,
      pollIntervalMs: 25,
    });
    expect(ok).toBe(true);
  });

  it("returns false when polling deadline elapses without a ready daemon", async () => {
    // No state file at all → describeDaemonReadiness returns missing on every
    // poll, so postRegister keeps polling until pollMs runs out.
    const tmp = mkTmp("embedder-client-register-poll-");
    tmps.push(tmp);
    const fp = path.join(tmp.dir, "nope.json");

    const t0 = Date.now();
    const ok = await postRegister("session-A", {
      statePath: fp,
      timeoutMs: 50,
      pollMs: 100,
      pollIntervalMs: 25,
    });
    const elapsed = Date.now() - t0;
    expect(ok).toBe(false);
    // Sanity: must not block beyond the polling budget.
    expect(elapsed).toBeLessThan(2000);
  });
});

describe("postShutdown", () => {
  const servers: http.Server[] = [];
  const tmps: Array<{ cleanup: () => void }> = [];

  afterEach(async () => {
    for (const s of servers.splice(0)) {
      await closeServer(s);
    }
    for (const t of tmps.splice(0)) t.cleanup();
  });

  it("returns true when daemon responds 204", async () => {
    const started = await startServer((req, res) => {
      if (req.method === "POST" && req.url === "/shutdown") {
        req.on("data", () => {});
        req.on("end", () => {
          res.writeHead(204);
          res.end();
        });
        return;
      }
      res.writeHead(404);
      res.end();
    });
    servers.push(started.server);

    const tmp = mkTmp("embedder-client-shutdown-ok-");
    tmps.push(tmp);
    const fp = path.join(tmp.dir, "state.json");
    writeEmbedderState(fp, makeState({ port: started.port }));

    const ok = await postShutdown("session-A", { statePath: fp, timeoutMs: 500 });
    expect(ok).toBe(true);
  });

  it("returns false when state file says no port (port=0)", async () => {
    const tmp = mkTmp("embedder-client-shutdown-no-port-");
    tmps.push(tmp);
    const fp = path.join(tmp.dir, "state.json");
    writeEmbedderState(fp, makeState({ port: 0 }));

    const ok = await postShutdown("session-A", { statePath: fp, timeoutMs: 50 });
    expect(ok).toBe(false);
  });
});
