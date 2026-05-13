/**
 * Issue #308 — presence state machine.
 *
 * Pure FCIS function (no IO, no clock side-effects — `now` is injected) that
 * folds the latest cc-status snapshot for one teammate × one project into a
 * 4-state presence signal: `active | idle | offline | error`.
 *
 * Grill §11 (docs/adr/0014/308.md) defines the contract:
 *
 *   green   active  — recent SessionStart / UserPromptSubmit
 *   yellow  idle    — session open, but N minutes without UserPromptSubmit
 *   gray    offline — Stop received, OR TTL expired
 *   red     error   — hook upload failed / agent down / GitHub binding missing /
 *                     event parse failure
 *
 * Default TTLs (per the same grill section):
 *
 *   active_ttl    = 10 min  — after this without any event the state slides
 *                             toward idle (if there was a UserPromptSubmit
 *                             at all) or offline.
 *   idle_after    = 10 min  — no UserPromptSubmit within this window after a
 *                             SessionStart → state is idle.
 *   offline_after = 60 min  — no event of any kind within this window →
 *                             state is offline regardless of last kind.
 *   stop          = immediate offline — a Stop / SessionEnd event collapses
 *                                       presence to offline at the snapshot
 *                                       timestamp, no TTL.
 *
 * The function is intentionally non-stateful: leader dashboards call it once
 * per teammate per render. Server-side persistence of snapshots is the
 * receiver's job; this module sees only the latest snapshot and the current
 * wall-clock time.
 */

export type PresenceState = "active" | "idle" | "offline" | "error";

/** Which lifecycle hook emitted the latest snapshot. */
export type PresenceEventKind =
  | "session_start"
  | "user_prompt_submit"
  | "stop"
  | "session_end"
  | "status"
  // Receiver-side error signal: hook upload failed, embedder daemon dead, etc.
  // Snapshot.event is opaque to us — anything we don't recognize as a known
  // green/idle/offline trigger and that carries an `error` marker collapses
  // to the `error` state.
  | "error"
  | (string & {});

/**
 * Minimal slice of `CcStatusSnapshot` (issue #350 schema) that the state
 * machine actually reads. Decoupled from the digital-twin types module so
 * packages/core stays free of `@teamagent/digital-twin` import (which itself
 * has node:fs / node:http transitive deps). Callers adapt their real
 * snapshot at the boundary.
 */
export interface PresenceSnapshot {
  /** Hook event kind. Unknown strings are tolerated and fall through. */
  readonly event: PresenceEventKind;
  /** ISO-8601 timestamp at which the snapshot was produced (client clock). */
  readonly ts: string;
  /**
   * Optional explicit error flag — when `true` the state collapses to
   * `error` regardless of TTLs. The receiver/dashboard can set this when it
   * detects a stuck upload pipeline, a dead embedder daemon, or a hook log
   * with parse failures.
   */
  readonly errorFlag?: boolean;
}

/** Optional configuration; defaults come from grill §11. */
export interface PresenceConfig {
  /** ms — within this window after the last event, presence stays `active`. */
  readonly activeTtlMs?: number;
  /** ms — after this without UserPromptSubmit, presence is `idle`. */
  readonly idleAfterMs?: number;
  /** ms — after this without ANY event, presence is `offline`. */
  readonly offlineAfterMs?: number;
}

/** Defaults per grill §11 (10/10/60 minutes). */
export const DEFAULT_PRESENCE_CONFIG: Required<PresenceConfig> = {
  activeTtlMs: 10 * 60 * 1000,
  idleAfterMs: 10 * 60 * 1000,
  offlineAfterMs: 60 * 60 * 1000,
};

/** Sentinel returned when the dashboard has no snapshot at all. */
export const PRESENCE_UNKNOWN: PresenceState = "offline";

/**
 * Compute presence state from the latest snapshot + the current time.
 *
 * Contract:
 *   - Pure: same `(snapshot, now, config)` ⇒ same return value.
 *   - Total: every input combination yields a defined `PresenceState`.
 *   - No throws: invalid timestamps fall back to `offline` (the safest
 *     default — we never report "active" off bad data, which would mask a
 *     stuck pipeline as healthy).
 *
 * Decision order:
 *   1. `errorFlag === true`                               → "error"
 *   2. event ∈ {stop, session_end}                        → "offline"  (grill: Stop = immediate)
 *   3. age > offlineAfterMs                               → "offline"  (TTL fallback)
 *   4. event == "user_prompt_submit" AND age ≤ activeTtl  → "active"
 *   5. event == "session_start"      AND age ≤ activeTtl  → "active"
 *   6. event == "session_start" AND age > idleAfterMs     → "idle"
 *   7. event ∈ {status, *}      AND age ≤ activeTtl       → "active"   (any heartbeat is green within TTL)
 *   8. otherwise                                          → "idle"
 *
 * `now` accepts either a JS `Date` or an `epoch ms` number; pass the same
 * monotonic source you use for the snapshot's `ts`.
 */
export function computePresenceState(
  snapshot: PresenceSnapshot | null | undefined,
  now: number | Date,
  config?: PresenceConfig,
): PresenceState {
  if (!snapshot) return PRESENCE_UNKNOWN;
  if (snapshot.errorFlag === true) return "error";

  const merged: Required<PresenceConfig> = {
    activeTtlMs: config?.activeTtlMs ?? DEFAULT_PRESENCE_CONFIG.activeTtlMs,
    idleAfterMs: config?.idleAfterMs ?? DEFAULT_PRESENCE_CONFIG.idleAfterMs,
    offlineAfterMs:
      config?.offlineAfterMs ?? DEFAULT_PRESENCE_CONFIG.offlineAfterMs,
  };

  const nowMs = now instanceof Date ? now.getTime() : now;
  const tsMs = Date.parse(snapshot.ts);
  if (!Number.isFinite(nowMs) || !Number.isFinite(tsMs)) {
    return "offline";
  }
  const ageMs = nowMs - tsMs;

  // Stop / SessionEnd are immediate-offline regardless of TTL — even an event
  // 1ms old should render gray. This matches grill §11 "Stop = 立即 offline".
  if (snapshot.event === "stop" || snapshot.event === "session_end") {
    return "offline";
  }

  // Negative age (clock skew where snapshot is "in the future") is treated
  // as age=0; we don't punish slight skew. Massive future skew (> activeTtl
  // ahead) still resolves to active by the same TTL path — the alternative
  // (offline) would mask a healthy session in clock-skewed CI.
  const clampedAge = ageMs < 0 ? 0 : ageMs;

  if (clampedAge > merged.offlineAfterMs) return "offline";

  if (snapshot.event === "user_prompt_submit") {
    return clampedAge <= merged.activeTtlMs ? "active" : "idle";
  }

  if (snapshot.event === "session_start") {
    if (clampedAge <= merged.activeTtlMs) return "active";
    // Once past activeTtl, the session is no longer "actively prompting" —
    // the leader sees idle until either a UserPromptSubmit refreshes it or
    // age crosses offlineAfter. Under default 10/10 TTLs this branch is
    // unreachable; under custom configs where `activeTtlMs < idleAfterMs`
    // (a leader who wants a long idle window after a brief active flash)
    // the previous fall-through to "active" contradicted the decision
    // order comment. Always idle past active_ttl.
    return "idle";
  }

  // Unknown / future event kinds: treat any heartbeat within activeTtl as
  // active, otherwise idle. Receivers can opt-in to "error" by setting
  // errorFlag explicitly, which we already handled at the top.
  return clampedAge <= merged.activeTtlMs ? "active" : "idle";
}

/**
 * Helper for the leader dashboard — given a state, return the configured
 * color name. Kept here (not in a UI package) because the mapping is part of
 * the grill §11 contract: green/yellow/gray/red is product semantic, not
 * visual styling.
 */
export function presenceColor(state: PresenceState): "green" | "yellow" | "gray" | "red" {
  switch (state) {
    case "active":
      return "green";
    case "idle":
      return "yellow";
    case "offline":
      return "gray";
    case "error":
      return "red";
  }
}
