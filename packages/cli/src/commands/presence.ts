/**
 * `pnpm teamagent presence` — issue #308 dogfood entry.
 *
 * Probes the configured cc-status receiver for this teammate's latest
 * snapshot, runs `computePresenceState` on it, and prints one line. Acts as
 * (a) the human-facing dogfood UX for green-light state and (b) the
 * verification surface for the judge harness (probe 3 in
 * docs/plans/2026-05-13-issue-308/judge.md).
 *
 * Output shapes:
 *   state=unknown (TEAMAGENT_REALTIME_URL not set)
 *   state=offline (no snapshots returned)
 *   state=active  (event=user_prompt_submit, 2m 14s ago, color=green)
 *   state=error   (errorFlag set)
 *
 * Exit code is 0 in every successful probe; non-zero only on outright
 * fetch-layer failure (network refused, malformed receiver). The state
 * value itself is data, not a verdict, so a perfectly healthy "offline" is
 * still exit 0.
 *
 * The receiver URL + auth env conventions mirror `realtime-emit.ts`:
 *   TEAMAGENT_REALTIME_URL    — base URL (no trailing slash).
 *   TEAMAGENT_REALTIME_TOKEN  — optional bearer.
 *
 * GET path is `${url}/api/cc-status?user=<self>` — the per-user readback
 * route defined in `packages/digital-twin/src/mock-server.ts` (issue #350).
 * Without a `&session=` filter the server returns
 * `{sessions: [<row-per-session>]}`; we pick the freshest by `ts` and run
 * the state machine on it. `getUserId()` resolves the local git
 * `user.email` so we never surface a teammate's state on a shared host.
 */
import { hostname } from "node:os";

import {
  computePresenceState,
  presenceColor,
  type PresenceSnapshot,
  type PresenceState,
} from "@teamagent/core";
import { getUserId } from "@teamagent/digital-twin";

export interface PresenceCommandOptions {
  /**
   * Override `TEAMAGENT_REALTIME_URL` (mostly for tests). When undefined the
   * command reads from process.env.
   */
  readonly receiverUrl?: string;
  /** Override bearer token (tests). */
  readonly bearerToken?: string;
  /** Override `now` for deterministic tests. */
  readonly now?: number;
  /**
   * Override user_id (tests); when undefined the command resolves it via
   * `@teamagent/digital-twin`'s `getUserId()` helper (git config user.email
   * → fallback `unknown@<host>`).
   */
  readonly userId?: string;
  /** Override the fetch implementation (tests). */
  readonly fetchImpl?: typeof fetch;
}

export interface PresenceCommandResult {
  readonly state: PresenceState | "unknown";
  readonly stdout: string;
  readonly exitCode: number;
}

const FETCH_TIMEOUT_MS = 2_000;

// SSRF / exfil parity with realtime-emit.ts (PR #404 adversarial-review
// hardening): the same TEAMAGENT_REALTIME_URL env var that gates the
// fire-and-forget POST gates this readback GET. A hostile dotfile sync /
// pnpm supply-chain script that points the URL at evil.example.com would
// otherwise leak the local git user.email + Bearer token to that endpoint
// on every `teamagent presence` invocation. Match the emit guard exactly:
// loopback hosts pass, anything else needs explicit ALLOW_REMOTE=1.
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
  return LOOPBACK_HOSTS.has(parsed.hostname);
}

/**
 * Render a human-readable "2m 14s ago" or "32s ago" or "1h 3m ago". Used in
 * the single-line stdout shape. `ageMs` is clamped at 0 (we never say "in
 * 5s" for clock skew — that's confusing).
 */
function renderAge(ageMs: number): string {
  if (!Number.isFinite(ageMs) || ageMs <= 0) return "0s ago";
  const totalSec = Math.floor(ageMs / 1_000);
  if (totalSec < 60) return `${totalSec}s ago`;
  const min = Math.floor(totalSec / 60);
  if (min < 60) {
    const sec = totalSec % 60;
    return sec === 0 ? `${min}m ago` : `${min}m ${sec}s ago`;
  }
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin === 0 ? `${hr}h ago` : `${hr}h ${remMin}m ago`;
}

function asPresenceSnapshot(value: unknown): PresenceSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  if (typeof obj.event !== "string" || typeof obj.ts !== "string") return null;
  const snap: PresenceSnapshot = {
    event: obj.event as PresenceSnapshot["event"],
    ts: obj.ts,
    ...(typeof obj.errorFlag === "boolean" ? { errorFlag: obj.errorFlag } : {}),
  };
  return snap;
}

/**
 * The receiver (`packages/digital-twin/src/mock-server.ts`, issue #350)
 * returns `{sessions: [<row-per-session>]}` for `/api/cc-status?user=X`
 * (multi-session shape) and a bare `CcStatusQueryRow` for
 * `/api/cc-status?user=X&session=Y` (single-row shape). Other deployments
 * may wrap snapshots in `{snapshot, stale_seconds}`. Tolerate all three —
 * pick the row with the freshest `ts` so the state machine sees the
 * latest signal regardless of insertion order. Falling back to `null`
 * means "no data", which the state machine renders as offline.
 */
function extractSnapshot(payload: unknown): PresenceSnapshot | null {
  if (!payload || typeof payload !== "object") return null;
  // Bare row first — single-session shape returns CcStatusQueryRow.
  const direct = asPresenceSnapshot(payload);
  if (direct) return direct;
  const wrapper = payload as Record<string, unknown>;
  // `{snapshot, stale_seconds}` legacy wrapper (still in some deployments).
  if (wrapper.snapshot) {
    const s = asPresenceSnapshot(wrapper.snapshot);
    if (s) return s;
  }
  // `{sessions: [...]}` is the canonical multi-session response from
  // `/api/cc-status?user=...`. `{rows: [...]}` is the legacy alias we
  // tolerate for older receivers. Pick freshest by ts.
  const list = Array.isArray(wrapper.sessions)
    ? wrapper.sessions
    : Array.isArray(wrapper.rows)
    ? wrapper.rows
    : null;
  if (list && list.length > 0) {
    let freshest: PresenceSnapshot | null = null;
    let freshestMs = -Infinity;
    for (const raw of list) {
      const snap = asPresenceSnapshot(raw);
      if (!snap) continue;
      const ms = Date.parse(snap.ts);
      if (Number.isFinite(ms) && ms > freshestMs) {
        freshest = snap;
        freshestMs = ms;
      } else if (freshest === null) {
        // Even an unparseable ts is better than nothing — state machine
        // will downgrade it to offline via its own ts guard.
        freshest = snap;
      }
    }
    return freshest;
  }
  return null;
}

export async function executePresence(
  opts: PresenceCommandOptions = {},
): Promise<PresenceCommandResult> {
  const baseUrl = opts.receiverUrl ?? process.env.TEAMAGENT_REALTIME_URL;
  if (!baseUrl) {
    return {
      state: "unknown",
      stdout: "state=unknown (TEAMAGENT_REALTIME_URL not set)\n",
      exitCode: 0,
    };
  }

  // SSRF / exfil guard — same default as realtime-emit.ts PR #404. A
  // non-loopback receiver URL combined with the bearer token + git
  // user.email is enough for a hostile env-var injection to harvest both.
  // Honor explicit opt-in (TEAMAGENT_REALTIME_ALLOW_REMOTE=1) for teammates
  // who actually run a shared LAN receiver.
  const allowRemote = process.env.TEAMAGENT_REALTIME_ALLOW_REMOTE === "1";
  if (!urlIsLoopback(baseUrl) && !allowRemote) {
    return {
      state: "unknown",
      stdout:
        `state=unknown (refusing non-loopback receiver ${baseUrl}; ` +
        "set TEAMAGENT_REALTIME_ALLOW_REMOTE=1 to override)\n",
      exitCode: 0,
    };
  }

  // Resolve self user_id. We never surface a teammate's snapshot on a
  // shared host — `?user_id=` is the receiver-side filter.
  let userId = opts.userId;
  if (!userId) {
    try {
      const resolved = getUserId({ timeoutMs: 300 });
      userId = resolved && resolved.length > 0
        ? resolved
        : `unknown@${hostname()}`;
    } catch {
      userId = `unknown@${hostname()}`;
    }
  }

  // Real receiver route (mock-server.ts:448) is `/api/cc-status?user=<user>`
  // — NOT `/api/cc-status/latest` and NOT `?user_id=`. Earlier draft of this
  // file shipped the wrong path/param and silently returned offline against
  // every real receiver; finding caught in pre-landing /review adversarial
  // pass.
  const url =
    `${baseUrl.replace(/\/$/, "")}/api/cc-status` +
    `?user=${encodeURIComponent(userId)}`;

  const headers: Record<string, string> = { Accept: "application/json" };
  const token = opts.bearerToken ?? process.env.TEAMAGENT_REALTIME_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  const fetchImpl = opts.fetchImpl ?? fetch;
  let snapshot: PresenceSnapshot | null = null;
  let networkError: string | null = null;

  const controller = new AbortController();
  const timeoutHandle = setTimeout(
    () => controller.abort(),
    FETCH_TIMEOUT_MS,
  );
  try {
    const res = await fetchImpl(url, { headers, signal: controller.signal });
    if (res.ok) {
      const body = await res.json().catch(() => null);
      snapshot = extractSnapshot(body);
    } else if (res.status === 404) {
      // 404 = no snapshot yet for this user; treat as offline (no error).
      snapshot = null;
    } else {
      networkError = `receiver returned ${res.status}`;
    }
  } catch (err) {
    networkError = err instanceof Error ? err.message : String(err);
  } finally {
    clearTimeout(timeoutHandle);
  }

  if (networkError) {
    return {
      state: "error",
      stdout: `state=error (fetch failed: ${networkError})\n`,
      exitCode: 1,
    };
  }

  const now = opts.now ?? Date.now();
  const state = computePresenceState(snapshot, now);
  if (!snapshot) {
    return {
      state,
      stdout: `state=${state} (no snapshots returned for ${userId})\n`,
      exitCode: 0,
    };
  }

  const ageMs = now - Date.parse(snapshot.ts);
  const ageStr = renderAge(ageMs);
  const color = presenceColor(state);
  return {
    state,
    stdout: `state=${state} (event=${snapshot.event}, ${ageStr}, color=${color}, user=${userId})\n`,
    exitCode: 0,
  };
}
