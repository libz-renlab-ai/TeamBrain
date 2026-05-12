#!/usr/bin/env node
/**
 * Embedder daemon (issue #164).
 *
 * Long-running process that owns one `XenovaRuleEmbedder` and serves
 * embedding requests over HTTP on `127.0.0.1:<random-port>`. Hooks
 * (PreToolUse, Stop) discover the port via `~/.teamagent/.embedder-state.json`
 * and POST /embed instead of loading the 115MB ONNX model fresh per call.
 *
 * Solves the "卡爆" problem identified in issue #164:
 *   - Without daemon: every PreToolUse hook = 3-4s cold load + 650MB RSS
 *   - 5 concurrent hooks = 3.3GB RAM peak (8GB Mac OOM)
 *   - With daemon: model loads once, hooks stay <50MB and respond in ms
 *
 * Lifecycle:
 *   1. Acquire PID lock (refuse to start if another daemon is alive)
 *   2. Load embedder (3-4s; state file: status=starting, port=0)
 *   3. Listen on 127.0.0.1:0 (kernel-assigned port)
 *   4. Update state file: status=running, port=<assigned>
 *   5. Serve /embed and /shutdown until refcount reaches 0 OR idle timeout
 *
 * State transitions:
 *   starting → running → exiting (refcount=0 || idle) → process.exit(0)
 *   starting → failed (load error) → process.exit(1)
 *
 * Cross-platform: pure HTTP + filesystem, no Unix-socket / named-pipe code.
 */
import http from "node:http";
import process from "node:process";
import {
  XenovaRuleEmbedder,
} from "@teamagent/adapters";
import {
  defaultEmbedderStatePath,
  isDaemonPidAlive,
  readEmbedderState,
  writeEmbedderState,
  type EmbedderState,
} from "./embedder-state.js";
import { tryAcquireSpawnLock } from "./embedder-spawn-lock.js";

const DEFAULT_IDLE_EXIT_MS = 30 * 60 * 1000; // 30 min — well past typical session

interface DaemonOpts {
  statePath: string;
  idleExitMs: number;
  /** When set, daemon binds to this fixed port instead of 0 (tests). */
  fixedPort?: number;
  /** Override for tests. */
  model?: string;
}

export function parseArgv(argv: string[]): Partial<DaemonOpts> {
  const out: Partial<DaemonOpts> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--state-path" && i + 1 < argv.length) out.statePath = argv[++i];
    else if (a === "--idle-exit-ms" && i + 1 < argv.length) {
      const n = parseInt(argv[++i] ?? "", 10);
      if (Number.isFinite(n) && n > 0) out.idleExitMs = n;
    } else if (a === "--port" && i + 1 < argv.length) {
      const n = parseInt(argv[++i] ?? "", 10);
      if (Number.isFinite(n) && n >= 0) out.fixedPort = n;
    } else if (a === "--model" && i + 1 < argv.length) out.model = argv[++i];
  }
  return out;
}

/**
 * Acquire the singleton lock by checking the existing state file's pid.
 * Returns true if this process should run as the daemon, false if another
 * is already alive (caller should exit gracefully).
 *
 * Race: between read and write, two simultaneous spawns can both pass this
 * check. The TCP `listen()` step then becomes the tiebreaker — the loser
 * gets EADDRINUSE if --port is fixed; with port 0 both succeed but one of
 * the two state-file writes wins. The cost is one extra ephemeral daemon
 * for ~3s; idle-exit reaps it. Acceptable tradeoff vs OS-level file locks.
 *
 * Windows pid-recycling defense: process.kill(pid, 0) returns true for ANY
 * existing pid on Windows. If the recorded pid was recycled into an
 * unrelated process (svchost.exe etc.) after a reboot, we'd refuse to
 * spawn forever. Caller can set TEAMAGENT_EMBEDDER_FORCE_SPAWN=1 to
 * bypass; better long-term, the runtime path also performs an HTTP
 * /health probe (added in startup) to catch this case automatically.
 */
export function tryAcquireLock(statePath: string): boolean {
  if (process.env["TEAMAGENT_EMBEDDER_FORCE_SPAWN"] === "1") return true;
  const existing = readEmbedderState(statePath);
  if (!existing) return true;
  if (existing.status === "exiting") return true;
  if (!isDaemonPidAlive(existing.pid)) return true;
  return false;
}

/**
 * Best-effort HTTP /health probe to confirm a process really is the daemon
 * (not just a recycled pid pointing at our state). Synchronous-style return
 * via Promise; caller awaits before deciding to claim/skip.
 *
 * Returns:
 *   - true  → daemon at this port responded healthy (real, leave it alone)
 *   - false → port unreachable / non-200 / timeout (treat state as stale)
 */
async function probeDaemonHealth(port: number, timeoutMs = 200): Promise<boolean> {
  if (!Number.isInteger(port) || port <= 0) return false;
  return new Promise<boolean>((resolve) => {
    const req = http.request(
      { host: "127.0.0.1", port, path: "/health", method: "GET" },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      },
    );
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(false); });
    req.on("error", () => resolve(false));
    req.end();
  });
}

async function runDaemon(opts: DaemonOpts): Promise<number> {
  if (!tryAcquireLock(opts.statePath)) {
    // Defense against Windows pid recycling: even if pid looks alive, probe
    // the recorded port. If /health doesn't respond, the state is stale —
    // claim it. Skipped when state has no port (daemon never reached running).
    const existing = readEmbedderState(opts.statePath);
    const port = existing?.port ?? 0;
    if (port > 0) {
      const alive = await probeDaemonHealth(port);
      if (alive) {
        process.stderr.write("[embedder] another daemon is alive; exiting\n");
        return 0;
      }
      process.stderr.write("[embedder] state file says alive but /health unreachable; treating as stale\n");
    } else {
      process.stderr.write("[embedder] another daemon is alive; exiting\n");
      return 0;
    }
  }

  // Issue #315 (Race β): tryAcquireLock above is TOCTOU. When N daemon
  // children all spawn before any of them writes state.status=starting,
  // every one passes the lock check and enters the cold-load path, each
  // loading 650MB of ONNX. The startup-lock below makes the
  // "tryAcquireLock + writeState(starting) + cold-load" sequence
  // mutually exclusive across processes. A daemon that fails to acquire
  // the lock exits without loading the model — the winner will be
  // discoverable via /health within a few seconds.
  const startupLock = tryAcquireSpawnLock(`${opts.statePath}.startup.lock`);
  if (!startupLock) {
    process.stderr.write("[embedder] another daemon is in startup; exiting\n");
    return 0;
  }

  const model = opts.model ?? "Xenova/multilingual-e5-small";
  const startedAt = new Date().toISOString();

  // Step 1: write `starting` placeholder so hooks see *something* during the
  // 3-4s cold load. describeDaemonReadiness returns reason="starting" → caller
  // falls back to legacy.
  writeEmbedderState(opts.statePath, {
    status: "starting",
    pid: process.pid,
    port: 0,
    started_at: startedAt,
    model,
    members: [],
  });

  // Step 2: load embedder (the expensive part).
  let embedder: XenovaRuleEmbedder;
  try {
    embedder = new XenovaRuleEmbedder({ modelId: model });
    // Force load by doing one warm-up embed; surfaces failures immediately.
    await embedder.embed(["warmup"]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    writeEmbedderState(opts.statePath, {
      status: "failed",
      pid: process.pid,
      port: 0,
      started_at: startedAt,
      model,
      members: [],
      error: msg.slice(0, 500),
    });
    process.stderr.write(`[embedder] load failed: ${msg}\n`);
    startupLock.release();
    return 1;
  }
  // Cold load complete: release the startup lock so subsequent daemons
  // can detect "already running" via the state file (status=starting
  // here, status=running written below in step 3 after server.listen).
  startupLock.release();

  // Step 3: idle / refcount tracking. Keep timestamps in-process; re-read
  // members from state file before deciding to exit so SessionEnd hooks'
  // file-based mutations are visible.
  let lastActivityMs = Date.now();
  let exiting = false;
  // Track in-flight requests so beginExit can drain rather than drop, and
  // idle-exit doesn't fire while a long embed is mid-flight (review finding:
  // bumping lastActivityMs only at request *start* meant a 30-min embed
  // could trigger idle-exit while embedder.embed was still running).
  let inFlight = 0;

  const server = http.createServer((req, res) => {
    if (exiting) {
      res.statusCode = 503;
      res.end("daemon exiting\n");
      return;
    }
    lastActivityMs = Date.now();
    inFlight++;
    const onDone = (): void => {
      inFlight = Math.max(0, inFlight - 1);
      lastActivityMs = Date.now();
    };
    res.once("finish", onDone);
    res.once("close", onDone);

    if (req.method === "POST" && req.url === "/embed") {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", async () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
          const texts = Array.isArray(body?.texts) ? (body.texts as unknown[]) : null;
          if (!texts || !texts.every((t) => typeof t === "string")) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "texts must be string[]" }));
            return;
          }
          const vectors = await embedder.embed(texts as string[]);
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ vectors }));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
        }
      });
      req.on("error", () => {
        res.statusCode = 400;
        res.end();
      });
      return;
    }

    if (req.method === "POST" && req.url === "/register") {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        let body: { session_id?: unknown } = {};
        try { body = JSON.parse(Buffer.concat(chunks).toString("utf-8")); } catch { /* ignore */ }
        if (typeof body.session_id !== "string") {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "session_id required" }));
          return;
        }
        const s = readEmbedderState(opts.statePath);
        if (!s) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: "state file gone" }));
          return;
        }
        if (!s.members.some((m) => m.session_id === body.session_id)) {
          s.members.push({ session_id: body.session_id as string, joined_at: new Date().toISOString() });
          writeEmbedderState(opts.statePath, s);
        }
        res.statusCode = 204;
        res.end();
      });
      req.on("error", () => { res.statusCode = 400; res.end(); });
      return;
    }

    if (req.method === "POST" && req.url === "/shutdown") {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        // Best-effort: read latest state, pop session_id, write back, then
        // check refcount. The SessionEnd hook may also have already done the
        // mutation; we just re-read and act on what we see.
        const s = readEmbedderState(opts.statePath);
        if (s) {
          let body: { session_id?: unknown } = {};
          try { body = JSON.parse(Buffer.concat(chunks).toString("utf-8")); } catch { /* ignore */ }
          if (typeof body.session_id === "string") {
            s.members = s.members.filter((m) => m.session_id !== body.session_id);
            writeEmbedderState(opts.statePath, s);
          }
          if (s.members.length === 0) {
            beginExit(s);
          }
        }
        res.statusCode = 204;
        res.end();
      });
      req.on("error", () => {
        res.statusCode = 400;
        res.end();
      });
      return;
    }

    if (req.method === "GET" && req.url === "/health") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      const s = readEmbedderState(opts.statePath);
      res.end(JSON.stringify({
        status: s?.status ?? "unknown",
        members: s?.members.length ?? 0,
        model,
      }));
      return;
    }

    res.statusCode = 404;
    res.end();
  });

  function beginExit(state: EmbedderState | null): void {
    if (exiting) return;
    exiting = true;
    const s = state ?? readEmbedderState(opts.statePath);
    if (s) {
      s.status = "exiting";
      writeEmbedderState(opts.statePath, s);
    }
    // Stop accepting new connections (server.close), then wait for in-flight
    // requests to finish (poll inFlight==0 with hard cap so we don't hang
    // indefinitely on a stuck embed). Newer Node also has closeIdleConnections
    // for keep-alive sockets that aren't actively serving.
    server.close(() => {
      try {
        const final = readEmbedderState(opts.statePath);
        if (final && final.pid === process.pid) {
          writeEmbedderState(opts.statePath, { ...final, status: "exiting" });
        }
      } catch { /* best-effort */ }
      process.exit(0);
    });
    // Best-effort: free idle keep-alive sockets so server.close fires promptly.
    // closeIdleConnections is Node ≥18.2; guard for older runtimes just in case.
    const closeIdle = (server as unknown as { closeIdleConnections?: () => void }).closeIdleConnections;
    if (typeof closeIdle === "function") {
      try { closeIdle.call(server); } catch { /* ignore */ }
    }
    // Hard timeout: force-exit if drain takes too long (stuck embed, malicious
    // keep-alive client). 5 seconds is plenty for legitimate in-flight requests.
    const hardTimer = setTimeout(() => {
      process.stderr.write(`[embedder] forced exit after 5s drain timeout (inFlight=${inFlight})\n`);
      process.exit(0);
    }, 5_000);
    hardTimer.unref();
  }

  // Step 4: bind. listen(0) → kernel picks free port. listen(fixedPort) for tests.
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.fixedPort ?? 0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const addr = server.address();
  const port = typeof addr === "object" && addr !== null ? addr.port : 0;
  if (port <= 0) {
    process.stderr.write("[embedder] failed to obtain port from listen()\n");
    return 1;
  }

  writeEmbedderState(opts.statePath, {
    status: "running",
    pid: process.pid,
    port,
    started_at: startedAt,
    model,
    members: [],
  });
  process.stderr.write(`[embedder] ready pid=${process.pid} port=${port}\n`);

  // Step 5: idle-exit watcher. Re-checks every 30s. If wall-clock since last
  // activity > idleExitMs AND no in-flight requests AND members list empty,
  // begin exit. The inFlight guard prevents idle-exit from firing mid-embed
  // (review finding: a 30-min embed could trip the timer otherwise).
  const idleTimer = setInterval(() => {
    if (exiting) return;
    if (inFlight > 0) return;
    if (Date.now() - lastActivityMs < opts.idleExitMs) return;
    const s = readEmbedderState(opts.statePath);
    if (s && s.members.length > 0) return;
    process.stderr.write("[embedder] idle exit\n");
    beginExit(s);
  }, Math.min(30_000, Math.max(1_000, Math.floor(opts.idleExitMs / 4))));
  idleTimer.unref();

  // SIGTERM / SIGINT: clean exit.
  for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.on(sig, () => {
      process.stderr.write(`[embedder] ${sig} received\n`);
      beginExit(null);
    });
  }

  // Keep the process alive until beginExit() calls process.exit.
  return new Promise<number>(() => { /* never resolves; exit via beginExit */ });
}

async function main(): Promise<void> {
  const argv = parseArgv(process.argv.slice(2));
  const opts: DaemonOpts = {
    statePath: argv.statePath ?? defaultEmbedderStatePath(),
    idleExitMs: argv.idleExitMs ?? DEFAULT_IDLE_EXIT_MS,
    fixedPort: argv.fixedPort,
    model: argv.model,
  };
  const code = await runDaemon(opts);
  process.exit(code);
}

// Guard: only run main() when this file is invoked directly, not when
// imported by tests. tsup bundles to CJS where require.main === module is
// the canonical entry-point check; under vitest+tsx the source is loaded
// as a module (require.main !== module), so main() doesn't fire on import.
// `TEAMAGENT_EMBEDDER_NO_AUTOSTART=1` provides an explicit override for
// tests that want to import even when require shim treats it as entry.
const _isEntry =
  typeof require !== "undefined" &&
  typeof (require as { main?: unknown }).main !== "undefined" &&
  (require as { main?: unknown }).main === module;
if (_isEntry && process.env["TEAMAGENT_EMBEDDER_NO_AUTOSTART"] !== "1") {
  void main();
}
