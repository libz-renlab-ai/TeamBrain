/**
 * Issue #350 — server-side persistence + query helpers for CC status snapshots.
 *
 * On-disk layout (sits next to the existing transcript / quota.json files):
 *
 *   <outputDir>/<user>/<YYYY-MM-DD>/<session>.cc-status.jsonl
 *
 * one JSON snapshot per line, appended. "Latest" = last valid line; "history"
 * = the whole file (filtered by `since`). Same `safeUserId` + path-traversal
 * defenses as `mock-server.ts`. Zero new deps. A session that runs across a
 * UTC midnight has its lines split across two date dirs — the readers below
 * scan every date dir under the user and group by the `<session>` filename, so
 * that's transparent to callers.
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { join, resolve as resolvePath, sep } from 'node:path';
import {
  CC_STATUS_SCHEMA_VERSION,
  type CcStatusQueryRow,
  type CcStatusSnapshot,
} from './types.js';

/** Suffix appended to the session id to form the per-session log filename. */
export const CC_STATUS_FILE_SUFFIX = '.cc-status.jsonl';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[A-Za-z0-9._-]+$/;

/** Bound how far back / how wide the readers scan, to keep a hostile dir cheap. */
const MAX_DATE_DIRS = 60;
const MAX_FILES_PER_DIR = 500;
const MAX_HISTORY_ROWS = 5000;

/** The exact set of keys persisted — anything else in an incoming body is dropped. */
const SNAPSHOT_KEYS: ReadonlyArray<keyof CcStatusSnapshot> = [
  'schema_version',
  'session_id',
  'user_id',
  'ts',
  'event',
  'display_name',
  'machine_id',
  'cwd',
  'git_branch',
  'model',
  'context_tokens',
  'context_pct',
  'session_health',
  'cost_usd',
  'tokens_5h',
  'tokens_7d',
  'subscription_tier',
  'five_hour_utilization',
  'seven_day_utilization',
  'five_hour_reset_at',
  'seven_day_reset_at',
  'quota_stale',
  'turn_count',
  'tool_calls_total',
  'tool_calls_failed',
  'files_touched',
  'session_started_at',
];

const NUMERIC_KEYS = new Set<string>([
  'context_tokens',
  'context_pct',
  'cost_usd',
  'tokens_5h',
  'tokens_7d',
  'five_hour_utilization',
  'seven_day_utilization',
  'five_hour_reset_at',
  'seven_day_reset_at',
  'turn_count',
  'tool_calls_total',
  'tool_calls_failed',
  'files_touched',
]);
const STRING_KEYS = new Set<string>([
  'session_id',
  'user_id',
  'ts',
  'event',
  'display_name',
  'machine_id',
  'cwd',
  'git_branch',
  'model',
  'subscription_tier',
  'session_started_at',
]);
const BOOL_KEYS = new Set<string>(['quota_stale']);

/** Mirror of `mock-server.safeUserId` — kept local to avoid a circular import. */
export function safeStatusUserId(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length === 0) return 'unknown';
  let cleaned = raw.replace(/[^a-zA-Z0-9._@+-]/g, '_').slice(0, 80);
  cleaned = cleaned.replace(/\.{2,}/g, '_');
  cleaned = cleaned.replace(/^[._-]+/, '').replace(/[._-]+$/, '');
  return cleaned.length > 0 ? cleaned : 'unknown';
}

function dateStampFor(ts: unknown, now: Date): string {
  let d = now;
  if (typeof ts === 'string' && ts.length > 0) {
    const parsed = new Date(ts);
    if (!Number.isNaN(parsed.getTime())) d = parsed;
  }
  const yyyy = d.getUTCFullYear().toString().padStart(4, '0');
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = d.getUTCDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function isUnder(parent: string, child: string): boolean {
  const p = resolvePath(parent);
  const c = resolvePath(child);
  if (c === p) return true;
  return c.startsWith(p + sep);
}

/**
 * Coerce an arbitrary parsed JSON value into a clean {@link CcStatusSnapshot}:
 * require the five core fields with the right primitive type, copy only known
 * keys, drop wrong-typed / non-finite optional fields. Returns `null` when the
 * core contract isn't met (the POST handler then 400s). `session_id` is also
 * required to match `[A-Za-z0-9._-]+` (it becomes part of a filename).
 */
export function sanitizeCcStatusSnapshot(v: unknown): CcStatusSnapshot | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (o.schema_version !== CC_STATUS_SCHEMA_VERSION) return null;
  if (typeof o.session_id !== 'string' || !ID_RE.test(o.session_id)) return null;
  if (typeof o.event !== 'string' || o.event.length === 0) return null;
  if (typeof o.ts !== 'string' || Number.isNaN(Date.parse(o.ts))) return null;
  const userId = safeStatusUserId(o.user_id);

  const out: Record<string, unknown> = {
    schema_version: CC_STATUS_SCHEMA_VERSION,
    session_id: o.session_id,
    user_id: userId,
    ts: o.ts,
    event: o.event,
  };
  for (const key of SNAPSHOT_KEYS) {
    if (key in out) continue;
    const val = o[key];
    if (val === undefined || val === null) continue;
    if (NUMERIC_KEYS.has(key)) {
      const n = typeof val === 'number' ? val : Number(val);
      if (Number.isFinite(n)) out[key] = n;
    } else if (STRING_KEYS.has(key)) {
      if (typeof val === 'string' && val.length > 0) out[key] = val;
    } else if (BOOL_KEYS.has(key)) {
      if (typeof val === 'boolean') out[key] = val;
    } else if (key === 'session_health') {
      if (val === 'OK' || val === 'OVER_200K') out[key] = val;
    }
  }
  return out as unknown as CcStatusSnapshot;
}

/** Absolute path of the per-session log file for `<user>/<date>/<session>`. */
export function ccStatusJsonlPath(
  outputDir: string,
  user: string,
  date: string,
  session: string,
): string {
  return join(outputDir, user, date, `${session}${CC_STATUS_FILE_SUFFIX}`);
}

export interface AppendResult {
  ok: boolean;
  reason?: 'invalid' | 'path' | 'io';
  user_id?: string;
  date?: string;
  session_id?: string;
}

/**
 * Validate + append one snapshot. The file is created (with parent dirs) on
 * first write. Returns `{ok:false, reason}` instead of throwing so the POST
 * handler can map it to a status code.
 */
export function appendCcStatusSnapshot(
  outputDir: string,
  raw: unknown,
  now: Date = new Date(),
): AppendResult {
  const snap = sanitizeCcStatusSnapshot(raw);
  if (!snap) return { ok: false, reason: 'invalid' };
  const user = snap.user_id;
  const date = dateStampFor(snap.ts, now);
  if (!DATE_RE.test(date)) return { ok: false, reason: 'invalid' };
  const target = ccStatusJsonlPath(outputDir, user, date, snap.session_id);
  if (!isUnder(outputDir, target)) return { ok: false, reason: 'path' };
  try {
    mkdirSync(join(outputDir, user, date), { recursive: true });
    appendFileSync(target, `${JSON.stringify(snap)}\n`, 'utf8');
  } catch {
    return { ok: false, reason: 'io' };
  }
  return { ok: true, user_id: user, date, session_id: snap.session_id };
}

function listDateDirs(userDir: string): string[] {
  if (!existsSync(userDir)) return [];
  try {
    return readdirSync(userDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && DATE_RE.test(d.name))
      .map((d) => d.name)
      .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)) // newest first
      .slice(0, MAX_DATE_DIRS);
  } catch {
    return [];
  }
}

function listStatusFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.endsWith(CC_STATUS_FILE_SUFFIX))
      .map((d) => d.name)
      .slice(0, MAX_FILES_PER_DIR);
  } catch {
    return [];
  }
}

function sessionIdFromFilename(name: string): string {
  return name.slice(0, name.length - CC_STATUS_FILE_SUFFIX.length);
}

/** Parse every JSON line of a file; junk lines are skipped. */
function readSnapshotLines(file: string): CcStatusSnapshot[] {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const out: CcStatusSnapshot[] = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (t.length === 0 || t[0] !== '{') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(t);
    } catch {
      continue;
    }
    const snap = sanitizeCcStatusSnapshot(parsed);
    if (snap) out.push(snap);
  }
  return out;
}

function tsMs(snap: CcStatusSnapshot): number {
  const ms = Date.parse(snap.ts);
  return Number.isFinite(ms) ? ms : 0;
}

function withStaleSeconds(snap: CcStatusSnapshot, nowMs: number): CcStatusQueryRow {
  const age = Math.max(0, Math.floor((nowMs - tsMs(snap)) / 1000));
  return { ...snap, stale_seconds: age };
}

/**
 * Latest snapshot per session for one user, across all date dirs. Sorted by
 * `ts` descending (freshest session first). `validateUserParam`-style callers
 * should pass an already-validated `user`.
 */
export function readLatestPerSession(
  outputDir: string,
  user: string,
  now: Date = new Date(),
): CcStatusQueryRow[] {
  const userDir = join(outputDir, user);
  if (!isUnder(outputDir, userDir)) return [];
  const latest = new Map<string, CcStatusSnapshot>();
  for (const date of listDateDirs(userDir)) {
    const dir = join(userDir, date);
    if (!isUnder(outputDir, dir)) continue;
    for (const fname of listStatusFiles(dir)) {
      const session = sessionIdFromFilename(fname);
      const file = join(dir, fname);
      if (!isUnder(outputDir, file)) continue;
      const lines = readSnapshotLines(file);
      if (lines.length === 0) continue;
      // last line of a per-session file is the freshest snapshot in that file;
      // a later date dir for the same session would overwrite via the Map.
      const candidate = lines[lines.length - 1]!;
      const existing = latest.get(session);
      if (!existing || tsMs(candidate) >= tsMs(existing)) latest.set(session, candidate);
    }
  }
  const nowMs = now.getTime();
  return [...latest.values()]
    .map((s) => withStaleSeconds(s, nowMs))
    .sort((a, b) => tsMs(b) - tsMs(a));
}

/** Latest snapshot for one explicit `<user>/<session>`, or `null`. */
export function readLatestForSession(
  outputDir: string,
  user: string,
  session: string,
  now: Date = new Date(),
): CcStatusQueryRow | null {
  if (!ID_RE.test(session)) return null;
  return readLatestPerSession(outputDir, user, now).find((r) => r.session_id === session) ?? null;
}

/** Latest snapshot per session across every user (leader roster). */
export function readLatestAllUsers(
  outputDir: string,
  now: Date = new Date(),
): CcStatusQueryRow[] {
  if (!existsSync(outputDir)) return [];
  let users: string[];
  try {
    users = readdirSync(outputDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
  const rows: CcStatusQueryRow[] = [];
  for (const u of users) {
    if (safeStatusUserId(u) !== u) continue;
    rows.push(...readLatestPerSession(outputDir, u, now));
  }
  return rows.sort((a, b) => tsMs(b) - tsMs(a));
}

/**
 * Time series for one `<user>/<session>` — every persisted snapshot with
 * `ts >= sinceMs`, sorted ascending, capped at {@link MAX_HISTORY_ROWS} rows
 * (most-recent kept when over the cap).
 */
export function readHistory(
  outputDir: string,
  user: string,
  session: string,
  sinceMs: number,
  now: Date = new Date(),
): CcStatusQueryRow[] {
  if (!ID_RE.test(session)) return [];
  const userDir = join(outputDir, user);
  if (!isUnder(outputDir, userDir)) return [];
  const all: CcStatusSnapshot[] = [];
  for (const date of listDateDirs(userDir)) {
    const file = ccStatusJsonlPath(outputDir, user, date, session);
    if (!isUnder(outputDir, file)) continue;
    if (!existsSync(file)) continue;
    all.push(...readSnapshotLines(file));
  }
  const cutoff = Number.isFinite(sinceMs) ? sinceMs : 0;
  const filtered = all
    .filter((s) => tsMs(s) >= cutoff)
    .sort((a, b) => tsMs(a) - tsMs(b));
  const trimmed = filtered.length > MAX_HISTORY_ROWS
    ? filtered.slice(filtered.length - MAX_HISTORY_ROWS)
    : filtered;
  const nowMs = now.getTime();
  return trimmed.map((s) => withStaleSeconds(s, nowMs));
}
