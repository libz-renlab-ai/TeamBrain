/**
 * Feature #2 v3 — env-gated fire-and-forget emitter wired into the
 * SessionStart and UserPromptSubmit hook bundles.
 *
 * PR #401 shipped the receiver-side primitives (`realtime-client.ts` +
 * `realtime-stream.ts` + `bin-realtime-demo.ts`) but never wired any hook to
 * them, so the only thing the boss kanban ever showed was the demo's three
 * synthetic teammates. This helper closes that gap with the smallest possible
 * surface: when `TEAMAGENT_REALTIME_URL` is set, emit one snapshot per hook
 * fire; when it's unset, no-op.
 *
 * Contract (matches plan v2 §1 and the comment block at the top of
 * `realtime-client.ts`):
 *   - Never throws. Every call is wrapped in try/catch; any failure logs at
 *     most one line to stderr (and only if TEAMAGENT_REALTIME_DEBUG=1).
 *   - Never blocks. The fetch is fire-and-forget — we `void` the promise and
 *     return synchronously. The hook lifecycle drains microtasks before
 *     exiting, so the timeout fires inside the same process tick.
 *   - Never retries. Drops on timeout / 5xx / network. M5 git-sync remains
 *     the final-consistency fallback for anything the receiver dropped.
 *
 * Env:
 *   TEAMAGENT_REALTIME_URL    — base URL (e.g. http://127.0.0.1:9787). Unset → no-op.
 *   TEAMAGENT_REALTIME_TOKEN  — optional bearer for the receiver.
 *   TEAMAGENT_REALTIME_DEBUG  — when "1", logs every emit outcome.
 *
 * Usage:
 *   import { emitCcStatus } from "./realtime-emit.js";
 *   emitCcStatus({ event: "session_start", sessionId, cwd });
 */
import { homedir, hostname } from "node:os";
import {
  CC_STATUS_SCHEMA_VERSION,
  digitalTwinPaths,
  getMachineId,
  getUserId,
  loadConfig,
  postCcStatusSnapshot,
  type CcStatusSnapshot,
  type DigitalTwinConfig,
  type PostCcStatusOutcome,
} from "@teamagent/digital-twin";

// Hosts considered safe to push cc-status to without TEAMAGENT_REALTIME_ALLOW_REMOTE=1.
// Adversarial review on PR #404: an attacker who can set the env var (hostile
// dotfile sync, supply-chain pnpm script, social engineering) gets cwd + git
// email + machine id + bearer token exfiltrated to any URL. Default to
// loopback-only so an "innocent" remote URL fails closed.
const LOOPBACK_HOSTS = new Set([
  "127.0.0.1",
  "localhost",
  "::1",
  "[::1]",
  "0.0.0.0",
]);

function urlIsLoopback(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  // hostname strips brackets from IPv6 already
  return LOOPBACK_HOSTS.has(parsed.hostname);
}

export interface EmitInput {
  /** Which hook fired ("session_start" | "user_prompt_submit" | ...). */
  readonly event: string;
  /** Claude Code session id from the hook input. */
  readonly sessionId?: string;
  /** Working directory at hook fire time. */
  readonly cwd?: string;
  /** Optional git branch (caller does the cheap `git rev-parse` if it wants). */
  readonly gitBranch?: string;
  /** Optional model id from the hook payload. */
  readonly model?: string;
  /** Optional context token count from the hook payload. */
  readonly contextTokens?: number;
  /**
   * Optional raw user prompt text. Issue #308 grill §3 mandates "完整存 raw
   * prompt" for leader-side evidence / replay. The caller (UserPromptSubmit
   * hook) is responsible for gating this behind the
   * `TEAMAGENT_REALTIME_RAW_PROMPT=1` env opt-in — emit threads whatever it
   * receives directly to `CcStatusSnapshot.raw_prompt`. Empty string is
   * treated as "unset" (so an opt-in caller can still skip individual
   * empty prompts).
   */
  readonly rawPrompt?: string;
}

const TIMEOUT_MS = 50;

function readEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

function debugLog(line: string): void {
  if (readEnv("TEAMAGENT_REALTIME_DEBUG") === "1") {
    try {
      process.stderr.write(`[realtime-emit] ${line}\n`);
    } catch {
      // best-effort
    }
  }
}

// Cache identity once per process: getUserId() shells out to `git config
// user.email` (typ. 30-60ms on macOS) and getMachineId() touches disk to
// read/write the machine-id sentinel. Both are stable for the process
// lifetime and called per-hook, so caching keeps emitCcStatus well under
// the 50ms hook-critical-path target.
//
// Empty-string guard: getUserId() returns the unix-account fallback when git
// is installed but `user.email` is unset (common on fresh CI runners). We
// still want to treat empty as "not yet resolved" so a later working git
// config picks up — the `|| !cachedUserId` clause handles that.
let cachedUserId: string | null = null;
let cachedMachineId: string | null = null;

/**
 * Issue #350 (v0.11.1) — cached digital-twin config-derived realtime URL.
 * Read once per process from `~/.teamagent/digital-twin.json` so each hook
 * fire stays under the 50ms critical-path budget. Three terminal states:
 *
 *   '__unread'    — uninitialized; trigger one fs read on next emit
 *   null          — config absent / disabled / unparseable; skip emit
 *   string        — resolved baseUrl from `uploader.endpoint`
 */
const CONFIG_URL_UNREAD = "__unread" as const;
let cachedConfigBaseUrl: string | null | typeof CONFIG_URL_UNREAD = CONFIG_URL_UNREAD;

/** Test-only — clears the in-process identity + config-url caches. */
export function __resetIdentityCacheForTests(): void {
  cachedUserId = null;
  cachedMachineId = null;
  cachedConfigBaseUrl = CONFIG_URL_UNREAD;
}

/**
 * Issue #350 (v0.11.1) — resolve the realtime cc-status base URL.
 *
 * Order of precedence:
 *   1. `TEAMAGENT_REALTIME_URL` env var, gated to loopback unless
 *      `TEAMAGENT_REALTIME_ALLOW_REMOTE=1`. The loopback gate is the security
 *      boundary called out on PR #404: an attacker who can flip an env var
 *      should not be able to exfiltrate cwd / git email / bearer to an
 *      arbitrary URL. Env-set URLs stay default-loopback.
 *   2. `~/.teamagent/digital-twin.json` `uploader.endpoint`, when the file
 *      exists and `uploader.enabled === true`. This path **bypasses** the
 *      loopback gate intentionally: the URL there was written either by the
 *      user running `teamagent digital-twin login` or by `ensureDefaultConfig`
 *      auto-creating the team-shared config (`http://192.168.22.88:8080`
 *      from `config.ts:DEFAULT_ENDPOINT`). Either way the URL is the team's
 *      explicit, persistent choice — not an environmental override an
 *      attacker can flip mid-session. PR #404's threat model is unaffected.
 *
 * Returns null when neither source resolves a usable URL — emitCcStatus then
 * skips, same as before this change.
 */
function resolveBaseUrl(): string | null {
  const envUrl = readEnv("TEAMAGENT_REALTIME_URL");
  if (envUrl) {
    if (
      urlIsLoopback(envUrl) ||
      readEnv("TEAMAGENT_REALTIME_ALLOW_REMOTE") === "1"
    ) {
      return envUrl;
    }
    debugLog(
      `skip env URL (non-loopback, set TEAMAGENT_REALTIME_ALLOW_REMOTE=1 to override) url=${envUrl}`,
    );
    return null;
  }
  // Env unset → check the user's saved digital-twin config.
  if (cachedConfigBaseUrl === CONFIG_URL_UNREAD) {
    cachedConfigBaseUrl = readConfigBaseUrl();
  }
  return cachedConfigBaseUrl;
}

/**
 * Resolve `$HOME` for the config lookup. Test seam: env-override takes
 * precedence so the test sandbox (which mkdtemps a tmp HOME) works on
 * Windows too, where `os.homedir()` reads SHGetKnownFolderPath and
 * ignores `$env:USERPROFILE` / `$env:HOME` overrides.
 */
function homeForConfig(): string {
  return (
    process.env.TEAMAGENT_HOME ??
    process.env.HOME ??
    process.env.USERPROFILE ??
    homedir()
  );
}

function readConfigBaseUrl(): string | null {
  try {
    const paths = digitalTwinPaths(homeForConfig());
    const cfg: DigitalTwinConfig | null = loadConfig(paths.configFile);
    if (!cfg) return null;
    if (!cfg.uploader?.enabled) return null;
    const ep = cfg.uploader?.endpoint;
    if (typeof ep !== "string" || ep.length === 0) return null;
    // Cheap sanity check — must parse as http(s) URL.
    try {
      const u = new URL(ep);
      if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    } catch {
      return null;
    }
    return ep;
  } catch {
    return null;
  }
}

function buildSnapshot(input: EmitInput): CcStatusSnapshot {
  if (!cachedUserId) {
    try {
      // Hard 200ms cap on the git shell-out. A stuck git config (NFS HOME,
      // corporate proxy resolving git LFS, etc.) would otherwise block the
      // SessionStart critical path on the FIRST emit. Cache hits after that.
      const resolved = getUserId({ timeoutMs: 200 });
      cachedUserId = resolved && resolved.length > 0
        ? resolved
        : `unknown@${hostname()}`;
    } catch {
      cachedUserId = `unknown@${hostname()}`;
    }
  }
  if (!cachedMachineId) {
    try {
      const resolved = getMachineId();
      cachedMachineId = resolved && resolved.length > 0 ? resolved : hostname();
    } catch {
      cachedMachineId = hostname();
    }
  }
  const userId = cachedUserId;
  const machineId = cachedMachineId;
  const snap: CcStatusSnapshot = {
    schema_version: CC_STATUS_SCHEMA_VERSION,
    session_id: input.sessionId || `unknown-${Date.now()}`,
    user_id: userId,
    ts: new Date().toISOString(),
    event: input.event,
    display_name: userId.split("@")[0] || userId,
    machine_id: machineId,
  };
  if (input.cwd) snap.cwd = input.cwd;
  if (input.gitBranch) snap.git_branch = input.gitBranch;
  if (input.model) snap.model = input.model;
  // Clamp contextTokens to a finite non-negative integer so a future caller
  // can't pump NaN/Infinity/objects through. Math.floor coerces a bool to a
  // number, but the typed param already excludes that.
  if (
    typeof input.contextTokens === "number" &&
    Number.isFinite(input.contextTokens) &&
    input.contextTokens >= 0
  ) {
    const tokens = Math.floor(input.contextTokens);
    snap.context_tokens = tokens;
    snap.context_pct = Math.round((tokens / 200_000) * 100) / 100;
  }
  // Issue #308 grill §3: opt-in raw prompt evidence. Defense-in-depth — the
  // hook layer (bin-user-prompt-submit.ts) is the policy boundary, but a
  // future direct caller of emitCcStatus would otherwise bypass the env
  // gate. Re-check here so the transport refuses to send prompt content
  // unless TEAMAGENT_REALTIME_RAW_PROMPT=1 is explicitly set, regardless of
  // what the caller passed. /review pre-landing adversarial review #9.
  if (
    typeof input.rawPrompt === "string" &&
    input.rawPrompt.length > 0 &&
    readEnv("TEAMAGENT_REALTIME_RAW_PROMPT") === "1"
  ) {
    snap.raw_prompt = input.rawPrompt;
  }
  return snap;
}

/**
 * Synchronous: builds the snapshot, kicks off the POST, returns immediately.
 * The promise is intentionally discarded — there's no caller that can act on
 * the outcome, and the contract is "never block the hook path".
 */
export function emitCcStatus(input: EmitInput): void {
  // Defense-in-depth: the kill switch is also honored by the two existing
  // hook bundles before they call here, but any future direct caller (a
  // third hook, a CLI subcommand, an integration test) gets the same opt-out
  // for free by reading the env var here.
  if (readEnv("TEAMAGENT_DISABLED") === "1") {
    debugLog(`skip (TEAMAGENT_DISABLED=1) event=${input.event}`);
    return;
  }
  // Issue #350 (v0.11.1) — `resolveBaseUrl()` consolidates the env-var path
  // (loopback-gated, unchanged threat model) with a saved-config fallback
  // (`~/.teamagent/digital-twin.json` `uploader.endpoint` when `enabled`).
  // The saved-config path is intentionally not loopback-gated — see the
  // function comment for the security rationale. Returns null when neither
  // source resolves; we skip in that case (same outcome as pre-v0.11.1).
  const baseUrl = resolveBaseUrl();
  if (!baseUrl) {
    debugLog(`skip (no base URL resolved) event=${input.event}`);
    return;
  }
  let snapshot: CcStatusSnapshot;
  try {
    snapshot = buildSnapshot(input);
  } catch (err) {
    debugLog(`build-failed err=${String(err)}`);
    return;
  }
  const bearerToken = readEnv("TEAMAGENT_REALTIME_TOKEN");
  try {
    void postCcStatusSnapshot(snapshot, {
      baseUrl,
      timeoutMs: TIMEOUT_MS,
      ...(bearerToken ? { bearerToken } : {}),
      onOutcome: (outcome: PostCcStatusOutcome) =>
        debugLog(`event=${input.event} outcome=${outcome}`),
    });
  } catch (err) {
    debugLog(`fire-failed err=${String(err)}`);
  }
}
