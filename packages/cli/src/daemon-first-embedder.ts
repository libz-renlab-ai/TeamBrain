/**
 * DaemonFirstEmbedder (issue #164).
 *
 * Wraps two RuleEmbedder strategies:
 *   1. Try the long-running daemon over HTTP (per-call ~5ms).
 *   2. Fall back to an in-process XenovaRuleEmbedder (per-call ~3-4s on
 *      first load — same cost as today, but only when daemon unavailable).
 *
 * The fallback embedder is lazy: nothing is loaded into the hook process
 * unless the daemon path actually fails. So under the happy path (daemon
 * running), hooks stay tiny (no 650MB load).
 *
 * When the daemon is down, this also fires off a best-effort detached
 * spawn so the *next* hook gets the daemon path. Spawn is fire-and-forget;
 * the current hook does not wait for it.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { RuleEmbedder } from "@teamagent/ports";
import { XenovaRuleEmbedder } from "@teamagent/adapters";
import { embedViaDaemon } from "./embedder-client.js";
import {
  defaultEmbedderStatePath,
  describeDaemonReadiness,
  readEmbedderState,
} from "./embedder-state.js";

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
  private fallback: XenovaRuleEmbedder | null = null;
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

    if (!this.fallback) {
      this.fallback = new XenovaRuleEmbedder({ modelId: this.modelId });
    }
    return this.fallback.embed(texts);
  }
}

/**
 * Best-effort detached spawn of bin-embedder.cjs. Locates the bin via the
 * known dist path or via TEAMAGENT_EMBEDDER_BIN env override.
 *
 * Idempotent under concurrent callers via file-state lock check (the daemon
 * itself refuses to start when another live pid owns the state file).
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
    const child = spawn(process.execPath, [binPath, "--state-path", statePath], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
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
