/**
 * Issue #283 — hourly scan orchestrator.
 *
 * Top-level entrypoint for the hourly Stop-hook-piggyback flow. Decides
 * whether to fire, probes the quota, persists / restores the cache,
 * walks today's local sessions, asks the collector for what it already
 * has, and enqueues the diff with the quota snapshot attached.
 *
 * Designed for test-time injection: every external dep (fetch, probe,
 * fs read/write, tap, clock) goes through `HourlyScanDeps`. The
 * end-to-end flow stays under a single tagged result so the caller
 * (Stop hook) can log a one-line outcome without case analysis.
 */

import type { DigitalTwinConfig } from '../config.js';
import { quotaProbeSettings } from '../config.js';
import { digitalTwinPaths } from '../paths.js';
import type { CcSessionQuotaBlock } from '../schemas/cc-session.js';
import {
  shouldRunHourlyScan,
  loadLastHourlyScanAt,
  recordHourlyScanFired,
} from './scheduler.js';
import {
  loadOAuthCredentials,
  loadQuotaCache,
  saveQuotaCache,
  markStale,
} from './state.js';
import { probeQuota, type ProbeQuotaResult } from './probe.js';
import {
  listLocalSessions,
  filterToUtcDate,
  planIncrementalUpload,
  type LocalSession,
} from '../incremental/scan.js';
import { tapSession as defaultTapSession, type TapSessionResult } from '../hooks/tap-session.js';

export interface HourlyScanInput {
  home: string;
  config: DigitalTwinConfig;
  now: Date;
}

export interface HourlyScanDeps {
  /** Network fetch — used both for the probe and for GET /api/sessions. */
  fetch?: typeof fetch;
  /** Override probe (defaults to real probeQuota). */
  probeQuota?: (
    input: Parameters<typeof probeQuota>[0],
    deps?: Parameters<typeof probeQuota>[1],
  ) => Promise<ProbeQuotaResult>;
  /** Credentials reader override (tests). */
  loadOAuthCredentials?: typeof loadOAuthCredentials;
  /** Scheduler hooks (tests). */
  loadLastHourlyScanAt?: typeof loadLastHourlyScanAt;
  recordHourlyScanFired?: typeof recordHourlyScanFired;
  /** Cache hooks (tests). */
  loadQuotaCache?: typeof loadQuotaCache;
  saveQuotaCache?: typeof saveQuotaCache;
  /** Local-session walker (tests). */
  listLocalSessions?: typeof listLocalSessions;
  /** Tap-session glue (tests). */
  tapSession?: typeof defaultTapSession;
}

export type QuotaSource =
  | 'fresh-probe'
  | 'cache-stale'
  | 'rate-limited-headers'
  | 'none';

export type HourlyScanOutcome =
  | {
      kind: 'skipped';
      /**
       * `disabled` — quota_probe.enabled=false in config.
       * `paused` — uploader.enabled=false.
       * `too-soon` — fence says we already fired within the last `windowMinutes`.
       * `lost-race` — another driver instance won the O_EXCL lock first.
       * `error` — defensive fallback when something in the orchestrator body
       *   threw unexpectedly. The Stop hook caller wraps the call in try/catch
       *   too, so this is redundant — but it keeps the contract crisp: the
       *   orchestrator itself NEVER throws.
       */
      reason: 'disabled' | 'paused' | 'too-soon' | 'lost-race' | 'error';
      /** Populated only when reason === 'error'. */
      error?: string;
    }
  | {
      kind: 'fired';
      /** sessionIds tapped this tick. */
      uploaded: string[];
      /** Where the attached quota came from. */
      quotaSource: QuotaSource;
      /** Was a 5h/7d snapshot attached to envelopes this tick. */
      hadQuota: boolean;
    };

/**
 * Compute the UTC YYYY-MM-DD string for a given Date.
 */
export function utcDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Derive the cwd-like field tapSession expects from a transcript path.
 * Claude Code stores transcripts at
 * `<home>/.claude/projects/<sanitizedCwd>/<sessionId>.jsonl`; we hand the
 * sanitized form back as the "cwd" because reversing the sanitization
 * (which replaces `:`, `/`, `\` with `-`) is lossy. tapSession's path
 * derivation re-applies the same regex, which is idempotent on the
 * sanitized form, so the original transcript file is found.
 */
export function projectDirFromTranscriptPath(transcriptPath: string): string {
  // Hand-split on both `/` and `\` so a Windows-style path resolves correctly
  // on POSIX too. `path.dirname` is OS-aware: on Linux it ignores `\`, so
  // `dirname("C:\\Users\\u\\.claude\\projects\\X\\sess.jsonl")` returns `.`
  // and the project dir is lost. Structure is fixed:
  // `<...>/projects/<sanitizedCwd>/<sessionId>.jsonl` — pick the second-to-last
  // segment as the sanitized cwd.
  const parts = transcriptPath.split(/[/\\]/).filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2]! : '';
}

/**
 * Query the collector for the session_ids it already has for (user, date).
 * Returns null on any failure (caller treats as "server empty / unknown",
 * so the diff overlaps to "upload everything we have locally").
 */
async function fetchServerKnownIds(
  endpoint: string,
  userId: string,
  utcDate: string,
  fetchFn: typeof fetch,
): Promise<Set<string> | null> {
  const url =
    stripTrailingSlash(endpoint) +
    '/api/sessions?user=' +
    encodeURIComponent(userId) +
    '&date=' +
    encodeURIComponent(utcDate);
  let res: Response;
  try {
    res = await fetchFn(url);
  } catch {
    return null;
  }
  if (!res.ok) return null;
  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const sessions = (parsed as Record<string, unknown>).sessions;
  if (!Array.isArray(sessions)) return null;
  const ids = new Set<string>();
  for (const s of sessions) {
    if (typeof s === 'object' && s !== null) {
      const id = (s as Record<string, unknown>).id;
      if (typeof id === 'string' && id.length > 0) ids.add(id);
    }
  }
  return ids;
}

function stripTrailingSlash(s: string): string {
  return s.endsWith('/') ? s.slice(0, -1) : s;
}

/**
 * Resolve which quota snapshot (if any) to attach to this tick's
 * envelopes. The probe result is the authoritative source on success;
 * cache fallback only kicks in for failure modes the caller can't
 * recover from (auth, network, parse-error). 429 with headers attached
 * still surfaces those headers (stale already set true upstream).
 */
async function resolveQuotaForTick(
  input: HourlyScanInput,
  deps: HourlyScanDeps,
): Promise<{ quota: CcSessionQuotaBlock | null; source: QuotaSource }> {
  const paths = digitalTwinPaths(input.home);
  const fetchFn = deps.fetch ?? fetch;
  const credsFn = deps.loadOAuthCredentials ?? loadOAuthCredentials;
  const probeFn = deps.probeQuota ?? probeQuota;
  const loadCache = deps.loadQuotaCache ?? loadQuotaCache;
  const saveCache = deps.saveQuotaCache ?? saveQuotaCache;
  const creds = credsFn(input.home);
  if (!creds) {
    const cached = loadCache(paths.quotaCacheFile);
    return cached
      ? { quota: markStale(cached), source: 'cache-stale' }
      : { quota: null, source: 'none' };
  }
  const result = await probeFn(
    {
      accessToken: creds.accessToken,
      subscriptionTier: creds.tier,
      now: () => input.now,
    },
    { fetch: fetchFn },
  );
  if (result.kind === 'ok') {
    saveCache(paths.quotaCacheFile, result.quota);
    return { quota: result.quota, source: 'fresh-probe' };
  }
  if (result.kind === 'rate-limited' && result.quota) {
    // 429 still carries fresh utilization numbers; save them so the
    // dashboard stays current during throttling windows.
    saveCache(paths.quotaCacheFile, result.quota);
    return { quota: result.quota, source: 'rate-limited-headers' };
  }
  const cached = loadCache(paths.quotaCacheFile);
  return cached
    ? { quota: markStale(cached), source: 'cache-stale' }
    : { quota: null, source: 'none' };
}

/**
 * Top-level orchestrator. Never throws — failures bubble out as a
 * tagged outcome the caller can log. The outer try/catch is
 * defense-in-depth on top of the Stop-hook caller's own try/catch:
 * we want THIS function to honor the never-throw contract independently
 * so future callers don't have to know about it.
 */
export async function runHourlyScanIfDue(
  input: HourlyScanInput,
  deps: HourlyScanDeps = {},
): Promise<HourlyScanOutcome> {
  try {
    return await runHourlyScanIfDueInner(input, deps);
  } catch (err) {
    return {
      kind: 'skipped',
      reason: 'error',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function runHourlyScanIfDueInner(
  input: HourlyScanInput,
  deps: HourlyScanDeps,
): Promise<HourlyScanOutcome> {
  const settings = quotaProbeSettings(input.config);
  if (!settings.enabled) return { kind: 'skipped', reason: 'disabled' };
  if (!input.config.uploader.enabled) {
    return { kind: 'skipped', reason: 'paused' };
  }

  const paths = digitalTwinPaths(input.home);
  const loadFence = deps.loadLastHourlyScanAt ?? loadLastHourlyScanAt;
  const recordFence = deps.recordHourlyScanFired ?? recordHourlyScanFired;
  const lastScanAt = loadFence(paths.lastHourlyScanFile);
  if (
    !shouldRunHourlyScan({
      lastScanAt,
      now: input.now,
      windowMinutes: settings.windowMinutes,
    })
  ) {
    return { kind: 'skipped', reason: 'too-soon' };
  }

  const outcome = recordFence(paths.lastHourlyScanFile, input.now);
  if (outcome === 'lost-race') {
    return { kind: 'skipped', reason: 'lost-race' };
  }

  // We are the winner of the fence — fire the hourly flow.
  const { quota, source: quotaSource } = await resolveQuotaForTick(input, deps);

  const fetchFn = deps.fetch ?? fetch;
  const today = utcDateString(input.now);
  const serverIds =
    (await fetchServerKnownIds(
      input.config.uploader.endpoint,
      input.config.identity.user_id,
      today,
      fetchFn,
    )) ?? new Set<string>();

  const walker = deps.listLocalSessions ?? listLocalSessions;
  const allLocal: LocalSession[] = walker(input.home);
  const todays = filterToUtcDate(allLocal, today);
  const toUpload = planIncrementalUpload({
    localSessions: todays,
    serverKnownIds: serverIds,
  });
  // Map session_id back to its transcript path so tapSession can find the file.
  const pathBySid = new Map<string, string>();
  for (const s of todays) {
    if (!pathBySid.has(s.sessionId)) pathBySid.set(s.sessionId, s.transcriptPath);
  }

  const tap = deps.tapSession ?? defaultTapSession;
  const uploaded: string[] = [];
  for (const sid of toUpload) {
    const tpath = pathBySid.get(sid);
    if (!tpath) continue;
    const projectDir = projectDirFromTranscriptPath(tpath);
    const result: TapSessionResult = tap(
      { cwd: projectDir, sessionId: sid, ...(quota ? { quota } : {}) },
      { homedir: () => input.home, now: () => input.now },
    );
    if (result.status === 'tapped') uploaded.push(sid);
  }

  return {
    kind: 'fired',
    uploaded,
    quotaSource: quota ? quotaSource : 'none',
    hadQuota: quota !== null,
  };
}

// Re-export for downstream callers that want one entrypoint.
export type { CcSessionQuotaBlock } from '../schemas/cc-session.js';
