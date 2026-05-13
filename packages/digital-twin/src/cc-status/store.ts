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
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve as resolvePath, sep } from 'node:path';
import {
  CC_STATUS_SCHEMA_VERSION,
  type CcStatusQueryRow,
  type CcStatusSnapshot,
} from './types.js';
import { dateStamp, isUnreservedComponent, safeUserId } from './path-safety.js';

/** Suffix appended to the session id to form the per-session log filename. */
export const CC_STATUS_FILE_SUFFIX = '.cc-status.jsonl';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[A-Za-z0-9._-]+$/;

/** Bound how far back / how wide the readers scan, to keep a hostile dir cheap. */
const MAX_DATE_DIRS = 60;
const MAX_FILES_PER_DIR = 500;
const MAX_USERS_PER_ALL = 500;
const MAX_HISTORY_ROWS = 5000;

/**
 * Per-session log size cap. The endpoint is unauthenticated and `session_id` is
 * caller-chosen, so a loop POSTing with a fixed id would otherwise grow one
 * file without bound (and every read re-parses the whole file). When a file
 * grows past this, `appendCcStatusSnapshot` rewrites it down to a tail that
 * fits in ~half the cap (bounded both by bytes and by line count) before
 * appending — "latest" + recent history are preserved; ancient snapshots roll
 * off. Steady-state file size oscillates between ~cap/2 and ~cap.
 */
const CC_STATUS_FILE_CAP_BYTES = 2 * 1024 * 1024;
const CC_STATUS_KEEP_TAIL_BYTES = CC_STATUS_FILE_CAP_BYTES / 2;
const CC_STATUS_KEEP_TAIL_LINES = 5000;

/** Per-string-field length caps — a single 30 MB `cwd` under MAX_BODY_BYTES would otherwise persist verbatim. */
const STRING_FIELD_CAP: Record<string, number> = {
  cwd: 4096,
  session_started_at: 64,
  ts: 64,
  event: 64,
  model: 256,
  git_branch: 256,
  display_name: 256,
  machine_id: 256,
  subscription_tier: 256,
  // Issue #308 grill §3: raw prompt evidence. Cap at 64 KiB — comfortably
  // larger than typical CC prompts (≤8 KiB) but small enough that a hostile
  // client looping POSTs cannot fill disk through this single field. Anything
  // longer is truncated and persisted; downstream normalized_event extractors
  // see "<truncated>" rather than failing.
  raw_prompt: 65_536,
};
const DEFAULT_STRING_CAP = 256;

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
  // Issue #308 grill §3 — raw prompt evidence. See STRING_FIELD_CAP for the cap.
  'raw_prompt',
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
  // Issue #308 grill §3 — raw prompt evidence. Capped at 64 KiB via STRING_FIELD_CAP.
  'raw_prompt',
]);
const BOOL_KEYS = new Set<string>(['quota_stale']);

/** @deprecated alias of {@link safeUserId} from `cc-status/path-safety.ts`. Kept for the public re-export. */
export const safeStatusUserId = safeUserId;

function isUnder(parent: string, child: string): boolean {
  const p = resolvePath(parent);
  const c = resolvePath(child);
  if (c === p) return true;
  return c.startsWith(p + sep);
}

/** Truncate an incoming string field to its cap (or the default cap). */
function capString(key: string, val: string): string {
  const cap = STRING_FIELD_CAP[key] ?? DEFAULT_STRING_CAP;
  return val.length > cap ? val.slice(0, cap) : val;
}

/**
 * Coerce an arbitrary parsed JSON value into a clean {@link CcStatusSnapshot}:
 * require the five core fields with the right primitive type, copy only known
 * keys, drop wrong-typed / non-finite optional fields, and clamp every string
 * field to a sane length (the POST endpoint is unauthenticated — a 30 MB `cwd`
 * under `MAX_BODY_BYTES` must not be persisted verbatim). Returns `null` when
 * the core contract isn't met (the POST handler then 400s). `session_id` is
 * required to match `[A-Za-z0-9._-]+`, contain no `..`, and not be a Windows
 * reserved device name — it becomes part of a filename.
 */
export function sanitizeCcStatusSnapshot(v: unknown): CcStatusSnapshot | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (o.schema_version !== CC_STATUS_SCHEMA_VERSION) return null;
  if (
    typeof o.session_id !== 'string' ||
    !ID_RE.test(o.session_id) ||
    !isUnreservedComponent(o.session_id)
  ) {
    return null;
  }
  if (typeof o.event !== 'string' || o.event.length === 0) return null;
  if (
    typeof o.ts !== 'string' ||
    o.ts.length > (STRING_FIELD_CAP.ts ?? DEFAULT_STRING_CAP) ||
    Number.isNaN(Date.parse(o.ts))
  ) {
    return null;
  }
  const userId = safeUserId(o.user_id);

  const out: Record<string, unknown> = {
    schema_version: CC_STATUS_SCHEMA_VERSION,
    session_id: o.session_id,
    user_id: userId,
    ts: o.ts,
    event: capString('event', o.event),
  };
  for (const key of SNAPSHOT_KEYS) {
    if (key in out) continue;
    const val = o[key];
    if (val === undefined || val === null) continue;
    if (NUMERIC_KEYS.has(key)) {
      const n = typeof val === 'number' ? val : Number(val);
      if (Number.isFinite(n)) out[key] = n;
    } else if (STRING_KEYS.has(key)) {
      if (typeof val === 'string' && val.length > 0) out[key] = capString(key, val);
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
 * If `file` has grown past {@link CC_STATUS_FILE_CAP_BYTES}, rewrite it down to
 * a tail that fits in {@link CC_STATUS_KEEP_TAIL_BYTES} (and at most
 * {@link CC_STATUS_KEEP_TAIL_LINES} lines), keeping ≥1 line, via an atomic
 * rename. Best-effort: any failure leaves the file as-is (the append still
 * happens — a slightly-over-cap file is fine; only unbounded growth is the
 * problem). Called from `appendCcStatusSnapshot` before the append.
 */
function rotateIfOversize(file: string): void {
  let size = 0;
  try {
    size = statSync(file).size;
  } catch {
    return; // file doesn't exist yet — nothing to rotate
  }
  if (size <= CC_STATUS_FILE_CAP_BYTES) return;
  try {
    const lines = readSnapshotLines(file).map((s) => JSON.stringify(s));
    if (lines.length === 0) return;
    // Walk back from the newest line, accumulating bytes until the budget or
    // line cap is hit. Always keep at least the freshest line.
    const tail: string[] = [];
    let bytes = 0;
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i]!;
      const lineBytes = Buffer.byteLength(line, 'utf8') + 1; // + newline
      if (tail.length > 0 && (bytes + lineBytes > CC_STATUS_KEEP_TAIL_BYTES || tail.length >= CC_STATUS_KEEP_TAIL_LINES)) {
        break;
      }
      tail.push(line);
      bytes += lineBytes;
    }
    tail.reverse();
    const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
    writeFileSync(tmp, `${tail.join('\n')}\n`, 'utf8');
    try {
      renameSync(tmp, file);
    } catch {
      // Windows: rename can fail if the target exists. unlink + rename.
      try {
        unlinkSync(file);
      } catch {
        /* may not exist */
      }
      renameSync(tmp, file);
    }
  } catch {
    /* best-effort — leave the (over-cap) file alone */
  }
}

/**
 * Validate + append one snapshot. The file is created (with parent dirs) on
 * first write, and rotated down to its tail when it grows past the size cap.
 * Returns `{ok:false, reason}` instead of throwing so the POST handler can map
 * it to a status code.
 */
export function appendCcStatusSnapshot(
  outputDir: string,
  raw: unknown,
  now: Date = new Date(),
): AppendResult {
  const snap = sanitizeCcStatusSnapshot(raw);
  if (!snap) return { ok: false, reason: 'invalid' };
  const user = snap.user_id;
  const date = dateStamp(snap.ts, now);
  if (!DATE_RE.test(date)) return { ok: false, reason: 'invalid' };
  const target = ccStatusJsonlPath(outputDir, user, date, snap.session_id);
  // Unreachable in practice: `sanitizeCcStatusSnapshot` already forces a safe
  // `user_id` (safeUserId) + `session_id` (ID_RE, no `..`), and `date` matches
  // DATE_RE — so the resolved path can't escape `outputDir`. Kept as a
  // belt-and-braces guard.
  if (!isUnder(outputDir, target)) return { ok: false, reason: 'path' };
  try {
    mkdirSync(join(outputDir, user, date), { recursive: true });
    rotateIfOversize(target);
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
      // Freshest by `ts` — not just the last line: a non-monotonic client clock
      // (NTP correction, manual change) could append an older-`ts` snapshot last
      // within a UTC day. The cross-date-dir comparison via the Map then keeps
      // the overall freshest.
      let candidate = lines[0]!;
      for (const s of lines) if (tsMs(s) >= tsMs(candidate)) candidate = s;
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
  if (!ID_RE.test(session) || !isUnreservedComponent(session)) return null;
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
      .map((d) => d.name)
      .filter((u) => safeUserId(u) === u) // skip dirs that aren't valid user ids
      .sort()
      .slice(0, MAX_USERS_PER_ALL); // bound an unauthenticated /all request
  } catch {
    return [];
  }
  const rows: CcStatusQueryRow[] = [];
  for (const u of users) rows.push(...readLatestPerSession(outputDir, u, now));
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
  if (!ID_RE.test(session) || !isUnreservedComponent(session)) return [];
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
