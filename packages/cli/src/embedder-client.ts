/**
 * Embedder daemon HTTP client (issue #164).
 *
 * Short-lived hooks (PreToolUse, Stop) use this to talk to the long-running
 * `bin-embedder.cjs` daemon instead of loading the 115MB ONNX model fresh
 * every invocation. Returns null on any failure so callers can fall back
 * to the in-process embedder + legacy substring matcher.
 *
 * Contract: never throws. Caller treats null as "daemon unreachable —
 * fall back". 200ms default timeout keeps the hook critical path bounded.
 */
import http from "node:http";
import {
  defaultEmbedderStatePath,
  describeDaemonReadiness,
  type DaemonReadiness,
} from "./embedder-state.js";

export interface EmbedderClientOptions {
  /** Override state file path (tests). */
  statePath?: string;
  /** Per-request timeout in ms. Default 200ms (hook critical path budget). */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 200;

/**
 * Try to embed via the daemon. Returns vectors[] on success, null on any
 * failure (daemon missing, network error, timeout, non-200, parse error).
 */
export async function embedViaDaemon(
  texts: string[],
  opts: EmbedderClientOptions = {},
): Promise<number[][] | null> {
  if (texts.length === 0) return [];
  const statePath = opts.statePath ?? defaultEmbedderStatePath();
  const readiness = describeDaemonReadiness(statePath);
  if (!readiness.ready || !readiness.state) return null;

  const port = readiness.state.port;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const body = JSON.stringify({ texts });

  return new Promise<number[][] | null>((resolve) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: "/embed",
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body).toString(),
        },
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          resolve(null);
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
            if (Array.isArray(parsed?.vectors)) {
              resolve(parsed.vectors as number[][]);
            } else {
              resolve(null);
            }
          } catch {
            resolve(null);
          }
        });
        res.on("error", () => resolve(null));
      },
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(null);
    });
    req.on("error", () => resolve(null));
    req.write(body);
    req.end();
  });
}

/**
 * POST /register — used by SessionStart to register a session with the daemon.
 * Increments the refcount; daemon won't idle-exit while at least one session
 * is registered. Best-effort; returns true if acknowledged, false otherwise.
 *
 * Polls for a starting daemon to become ready, up to `pollMs` total. Useful
 * because SessionStart spawns the daemon detached and needs to register
 * immediately after; the daemon takes ~3-4s to load the model.
 */
export async function postRegister(
  sessionId: string,
  opts: EmbedderClientOptions & { pollMs?: number; pollIntervalMs?: number } = {},
): Promise<boolean> {
  const statePath = opts.statePath ?? defaultEmbedderStatePath();
  // 10s default — multilingual-e5-small ONNX cold-load measured 3-4s on a
  // fast SSD, but slow disk / first-time download / Windows AV scanning the
  // tarball can push past 5s. Generous polling avoids silent miss where
  // SessionStart's session never registers.
  const pollDeadline = Date.now() + (opts.pollMs ?? 10_000);
  const interval = opts.pollIntervalMs ?? 200;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  while (Date.now() < pollDeadline) {
    const readiness = describeDaemonReadiness(statePath);
    if (readiness.ready && readiness.state) {
      const ok = await postRegisterOnce(sessionId, readiness.state.port, timeoutMs);
      if (ok) return true;
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  return false;
}

function postRegisterOnce(sessionId: string, port: number, timeoutMs: number): Promise<boolean> {
  const body = JSON.stringify({ session_id: sessionId });
  return new Promise<boolean>((resolve) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: "/register",
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body).toString(),
        },
      },
      (res) => {
        res.resume();
        resolve(res.statusCode === 204 || res.statusCode === 200);
      },
    );
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(false); });
    req.on("error", () => resolve(false));
    req.write(body);
    req.end();
  });
}

/**
 * POST /shutdown — used by SessionEnd hook to drop refcount.
 * Best-effort; returns true if daemon acknowledged, false otherwise.
 */
export async function postShutdown(
  sessionId: string,
  opts: EmbedderClientOptions = {},
): Promise<boolean> {
  const statePath = opts.statePath ?? defaultEmbedderStatePath();
  const readiness: DaemonReadiness = describeDaemonReadiness(statePath);
  if (!readiness.state) return false;
  const port = readiness.state.port;
  if (!Number.isInteger(port) || port <= 0) return false;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const body = JSON.stringify({ session_id: sessionId });
  return new Promise<boolean>((resolve) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: "/shutdown",
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body).toString(),
        },
      },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200 || res.statusCode === 204);
      },
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
    req.write(body);
    req.end();
  });
}
