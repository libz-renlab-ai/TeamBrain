/**
 * DaemonFirstEmbedder (issue #164 + issue #315).
 *
 * Tries the long-running embedder daemon over HTTP (per-call ~5ms). When
 * the daemon is unreachable, returns one empty vector per input text and
 * fires a best-effort detached daemon spawn so the *next* hook can use
 * the fast path; the current hook does not wait.
 *
 * Issue #315: previously the unreachable branch loaded an in-process
 * `XenovaRuleEmbedder` (650MB RSS) as a fallback. That fallback was the
 * secondary RAM-bomb amplifier for multi-session usage — during the 3-4s
 * daemon cold-load window EVERY hook process loaded its own copy of the
 * model. Removing it means daemon-unreachable now degrades the retriever
 * to BM25-only (vec0 `WHERE vec MATCH ?` errors on a 0-byte buffer →
 * SqliteSemanticRetriever's per-stage try/catch swallows it and the
 * final result contains BM25 RRF only). BM25-only is an existing
 * code path, not a new one.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { RuleEmbedder } from "@teamagent/ports";
import { embedViaDaemon } from "./embedder-client.js";
import {
  defaultEmbedderStatePath,
  describeDaemonReadiness,
  readEmbedderState,
} from "./embedder-state.js";
import { tryAcquireSpawnLock } from "./embedder-spawn-lock.js";

const DEFAULT_MODEL = "Xenova/multilingual-e5-small";
const DEFAULT_DIM = 384;

export interface DaemonFirstEmbedderOpts {
  /** State file path (tests). */
  statePath?: string;
  /** HTTP request timeout in ms (default 200). */
  timeoutMs?: number;
  /** When false, never auto-spawn the daemon on miss (tests). */
  autoSpawn?: boolean;
  /** Override model id (must match daemon's). */
  modelId?: string;
  /** Override dim (must match modelId). */
  dim?: number;
}

export class DaemonFirstEmbedder implements RuleEmbedder {
  readonly modelId: string;
  readonly dim: number;
  private readonly statePath: string;
  private readonly timeoutMs: number;
  private readonly autoSpawn: boolean;
  private spawnAttempted = false;

  constructor(opts: DaemonFirstEmbedderOpts = {}) {
    this.modelId = opts.modelId ?? DEFAULT_MODEL;
    this.dim = opts.dim ?? DEFAULT_DIM;
    this.statePath = opts.statePath ?? defaultEmbedderStatePath();
    this.timeoutMs = opts.timeoutMs ?? 200;
    this.autoSpawn = opts.autoSpawn ?? true;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const fromDaemon = await embedViaDaemon(texts, {
      statePath: this.statePath,
      timeoutMs: this.timeoutMs,
    });
    if (fromDaemon) return fromDaemon;

    // Daemon unreachable. Fire async respawn (best-effort) so the next hook
    // can use the fast path; do not await — current hook must respond fast.
    if (this.autoSpawn && !this.spawnAttempted) {
      this.spawnAttempted = true;
      tryDetachedSpawn(this.statePath);
    }

    // Issue #315: return one empty vector per input text. The semantic
    // retriever's vec0 stages will error on the 0-byte buffer and the
    // per-stage try/catch will swallow it, so the final RRF result
    // contains BM25 scores only. No 650MB in-process load.
    return texts.map(() => []);
  }
}

/**
 * Best-effort detached spawn of bin-embedder.cjs. Locates the bin via the
 * known dist path or via TEAMAGENT_EMBEDDER_BIN env override.
 *
 * Issue #315 (Race α): when N SessionStart hooks fire concurrently with no
 * daemon yet running, all N call `tryDetachedSpawn`, see the missing state
 * file, and each spawn a detached child process. The losers' children
 * exit gracefully once a winner writes `state.status=starting` — but until
 * that write happens, every spawned child is a 650MB-resident node
 * process. On a 5-Claude-window opening, that's a 3.25GB transient spike.
 *
 * Fix: atomically claim `<statePath>.spawn.lock` via `fs.openSync(wx)`.
 * Only the winner proceeds to spawn; concurrent losers skip silently. Lock
 * is released after the spawn() syscall returns — the daemon child writes
 * its own state file independently. Stale locks (mtime > 30s) are
 * auto-cleared by the next acquirer.
 */
export function tryDetachedSpawn(statePath: string): void {
  try {
    // Skip if a live daemon already exists or one is currently starting.
    const r = describeDaemonReadiness(statePath);
    if (r.ready) return;
    const s = readEmbedderState(statePath);
    if (s && s.status === "starting") return;

    const binPath = resolveEmbedderBin();
    if (!binPath) return;

    // Race α defense: only one spawner at a time.
    const lock = tryAcquireSpawnLock(`${statePath}.spawn.lock`);
    if (!lock) return;
    try {
      // Re-check readiness after acquiring the lock — a previous spawner
      // may have completed between our first check and our wx-create.
      const r2 = describeDaemonReadiness(statePath);
      if (r2.ready) return;
      const s2 = readEmbedderState(statePath);
      if (s2 && s2.status === "starting") return;

      const child = spawn(process.execPath, [binPath, "--state-path", statePath], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
      child.unref();
    } finally {
      lock.release();
    }
  } catch {
    // best-effort
  }
}

function resolveEmbedderBin(): string | null {
  const override = process.env["TEAMAGENT_EMBEDDER_BIN"];
  if (override && fs.existsSync(override)) return override;

  const candidates: string[] = [
    // POSIX npm -g installed alongside teamagent CLI
    path.join(os.homedir(), ".local", "lib", "teamagent", "dist", "bin-embedder.cjs"),
    // monorepo dev: cli/dist
    path.resolve(process.cwd(), "packages", "cli", "dist", "bin-embedder.cjs"),
    // hooks staged in ~/.teamagent/hooks/
    path.join(os.homedir(), ".teamagent", "hooks", "bin-embedder.cjs"),
  ];

  // Windows global npm install: %APPDATA%\npm\node_modules\teamagent\dist\
  const appData = process.env["APPDATA"];
  if (appData) {
    candidates.push(
      path.join(appData, "npm", "node_modules", "teamagent", "dist", "bin-embedder.cjs"),
    );
  }
  // Some Windows setups land deps under %LOCALAPPDATA%\npm too.
  const localAppData = process.env["LOCALAPPDATA"];
  if (localAppData) {
    candidates.push(
      path.join(localAppData, "npm", "node_modules", "teamagent", "dist", "bin-embedder.cjs"),
    );
  }

  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch { /* ignore */ }
  }

  // Last resort: ask Node's resolver to find the teamagent package, then
  // walk to dist/bin-embedder.cjs. Works for nvm / pnpm / Yarn layouts the
  // hardcoded candidates above miss.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const req = (typeof require !== "undefined" ? require : null) as NodeRequire | null;
    if (req) {
      const pkgJson = req.resolve("teamagent/package.json");
      const candidate = path.join(path.dirname(pkgJson), "dist", "bin-embedder.cjs");
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch { /* not installed via node resolver */ }

  return null;
}
