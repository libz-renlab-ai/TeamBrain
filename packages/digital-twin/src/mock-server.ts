import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { Socket } from 'node:net';
import { gunzipSync } from 'node:zlib';
import {
  writeFileSync,
  renameSync,
  unlinkSync,
  mkdirSync,
  readdirSync,
  statSync,
  existsSync,
  readFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, resolve as resolvePath, sep } from 'node:path';
import { DASHBOARD_HTML } from './dashboard-html.js';
import { VIDEOS_DASHBOARD_HTML } from './videos-html.js';
import { safeUserId, dateStamp } from './cc-status/path-safety.js';
import {
  appendCcStatusSnapshot,
  readLatestPerSession,
  readLatestForSession,
  readLatestAllUsers,
  readHistory,
} from './cc-status/store.js';

// Re-exported here for backwards compat — `safeUserId` / `dateStamp` were
// originally defined in this module before `cc-status/path-safety.ts` split
// them out (issue #350 /review iter 1) so both this and `store.ts` could
// share them without a circular import.
export { safeUserId, dateStamp };

/** Cap raw POST body to bound memory + reject obvious DoS payloads. */
export const MAX_BODY_BYTES = 32 * 1024 * 1024;
/** Cap gzip output to defeat zip-bomb DoS (jsonl rarely compresses >30x). */
export const MAX_DECOMPRESSED_BYTES = 256 * 1024 * 1024;

export interface MockServerOptions {
  /** Port to bind. Use 0 to pick an ephemeral port. */
  port: number;
  /** Where to write decoded payloads. Defaults to ./test-output under process.cwd(). */
  outputDir?: string;
  /** Bind host. Defaults to 127.0.0.1. */
  host?: string;
  /** Clock for date-stamping subdirectories. Defaults to () => new Date(). */
  now?: () => Date;
}

export interface MockServerHandle {
  url: string;
  port: number;
  outputDir: string;
  close(): Promise<void>;
}

const ROUTE_CC_SESSIONS = '/v1/cc-sessions';
const ROUTE_RECORDINGS = '/v1/recordings';
/** Issue #350 — lightweight CC runtime status snapshot ingress (plain JSON, not gzipped). */
const ROUTE_CC_STATUS = '/v1/cc-status';
/** Feature #3 wedge — screen-video upload (mov/mp4/webm/mkv). */
const ROUTE_VIDEOS = '/v1/videos';
const ALLOWED_VIDEO_CONTAINERS = new Set(['mov', 'mp4', 'webm', 'mkv']);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[A-Za-z0-9._-]+$/;

function send(res: ServerResponse, status: number, body?: unknown): void {
  res.statusCode = status;
  if (body !== undefined) {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body));
  } else {
    res.end();
  }
}

/**
 * Validate a raw user_id string for use in dashboard GET endpoints.
 * Returns the value if it round-trips through safeUserId unchanged AND
 * does not contain path separators or `..`. Otherwise returns null.
 */
function validateUserParam(raw: string | undefined): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  if (raw.includes('/') || raw.includes('\\') || raw.includes('..')) return null;
  if (safeUserId(raw) !== raw) return null;
  return raw;
}

function validateDateParam(raw: string | undefined): string | null {
  if (typeof raw !== 'string') return null;
  if (!DATE_RE.test(raw)) return null;
  // Also reject syntactically-valid but impossible dates like 2026-13-99.
  const parts = raw.split('-');
  const yyyy = Number(parts[0]);
  const mm = Number(parts[1]);
  const dd = Number(parts[2]);
  if (!Number.isFinite(yyyy) || !Number.isFinite(mm) || !Number.isFinite(dd)) {
    return null;
  }
  if (mm < 1 || mm > 12) return null;
  if (dd < 1 || dd > 31) return null;
  // Best-effort calendar sanity check via UTC Date.
  const probe = new Date(Date.UTC(yyyy, mm - 1, dd));
  if (
    probe.getUTCFullYear() !== yyyy ||
    probe.getUTCMonth() !== mm - 1 ||
    probe.getUTCDate() !== dd
  ) {
    return null;
  }
  return raw;
}

export function validateIdParam(raw: string | undefined): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  if (raw.includes('..')) return null;
  return ID_RE.test(raw) ? raw : null;
}

/**
 * Issue #283 — defensive type guard for the optional `envelope.quota` block.
 * All six fields must be present with the exact expected primitive type. Numeric
 * fields additionally must be finite (rejects NaN / Infinity). Returning false
 * here causes the POST handler to silently skip writing the quota.json sidecar
 * while still persisting the transcript — quota is non-critical metadata, a
 * malformed block must not 4xx the whole upload.
 */
export function isValidQuotaBlock(v: unknown): boolean {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.subscription_tier === 'string' &&
    typeof o.five_hour_utilization === 'number' &&
    Number.isFinite(o.five_hour_utilization) &&
    typeof o.seven_day_utilization === 'number' &&
    Number.isFinite(o.seven_day_utilization) &&
    typeof o.five_hour_reset_at === 'number' &&
    Number.isFinite(o.five_hour_reset_at) &&
    typeof o.seven_day_reset_at === 'number' &&
    Number.isFinite(o.seven_day_reset_at) &&
    typeof o.probed_at === 'string' &&
    typeof o.stale === 'boolean'
  );
}

/**
 * Atomic write via tmp + rename. Prevents the dashboard from reading a
 * half-written file and also avoids data loss on concurrent writes.
 */
function atomicWriteFileSync(target: string, data: Buffer): void {
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  writeFileSync(tmp, data);
  try {
    renameSync(tmp, target);
  } catch {
    // Windows: rename can fail if target exists. Fall back to unlink + rename.
    try {
      unlinkSync(target);
    } catch {
      // target may not exist; ignore
    }
    renameSync(tmp, target);
  }
}

type GetableExt = 'jsonl' | 'ogg' | 'mov' | 'mp4' | 'webm' | 'mkv';
function validateExtParam(raw: string | undefined): GetableExt | null {
  if (
    raw === 'jsonl' ||
    raw === 'ogg' ||
    raw === 'mov' ||
    raw === 'mp4' ||
    raw === 'webm' ||
    raw === 'mkv'
  ) {
    return raw;
  }
  return null;
}

function contentTypeForExt(ext: GetableExt): string {
  switch (ext) {
    case 'jsonl':
      return 'text/plain; charset=utf-8';
    case 'ogg':
      return 'audio/ogg';
    case 'mov':
      return 'video/quicktime';
    case 'mp4':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    case 'mkv':
      return 'video/x-matroska';
  }
}

/** Confirm a resolved path stays under outputDir (defense-in-depth vs traversal). */
function isUnder(parent: string, child: string): boolean {
  const p = resolvePath(parent);
  const c = resolvePath(child);
  if (c === p) return true;
  return c.startsWith(p + sep);
}

function listDirNames(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

interface SessionEntry {
  id: string;
  ext: 'jsonl' | 'ogg';
  size: number;
  mtime: string;
}

function listSessions(dir: string): SessionEntry[] {
  if (!existsSync(dir)) return [];
  let entries: SessionEntry[] = [];
  try {
    const files = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isFile());
    for (const f of files) {
      const m = /^(.+)\.(jsonl|ogg)$/.exec(f.name);
      if (!m || m[1] === undefined || m[2] === undefined) continue;
      const id: string = m[1];
      const ext = m[2] as 'jsonl' | 'ogg';
      try {
        const st = statSync(join(dir, f.name));
        entries.push({
          id,
          ext,
          size: st.size,
          mtime: st.mtime.toISOString(),
        });
      } catch {
        // ignore unreadable files
      }
    }
  } catch {
    return [];
  }
  entries.sort((a, b) => (a.mtime < b.mtime ? 1 : a.mtime > b.mtime ? -1 : 0));
  return entries;
}

function parseQuery(url: string): URLSearchParams {
  const idx = url.indexOf('?');
  return new URLSearchParams(idx >= 0 ? url.slice(idx + 1) : '');
}

/**
 * Below this value an all-digits `since` param is read as epoch *seconds*; at
 * or above it, epoch *milliseconds*. 1e12 ms ≈ 2001-09; 1e12 s ≈ year 33658 —
 * so the heuristic is unambiguous for any realistic timestamp.
 */
const EPOCH_MS_THRESHOLD = 1e12;
/** Largest millisecond value `new Date(...)` accepts (±100,000,000 days). */
const MAX_DATE_MS = 8.64e15;

/**
 * Issue #350 — parse the `since` query param for `/api/cc-status/history`.
 * Accepts ISO-8601, epoch milliseconds, or epoch seconds; missing/garbage
 * falls back to "24h ago" so a bare `?user=&session=` still returns something
 * bounded rather than the whole history. The result is always clamped to
 * `[0, MAX_DATE_MS]` — without that, `?since=99999999999999999` would flow into
 * `new Date(sinceMs).toISOString()` below, throw a `RangeError` inside the
 * request handler, and crash the (unauthenticated) collector process.
 */
function parseSinceMs(raw: string | null | undefined, nowMs: number): number {
  let ms = nowMs - 24 * 60 * 60 * 1000;
  if (typeof raw === 'string' && raw.length > 0) {
    if (/^\d+$/.test(raw)) {
      const n = Number(raw);
      if (Number.isFinite(n)) ms = n < EPOCH_MS_THRESHOLD ? n * 1000 : n;
    } else {
      const parsed = Date.parse(raw);
      if (Number.isFinite(parsed)) ms = parsed;
    }
  }
  if (!Number.isFinite(ms)) return 0;
  return Math.min(Math.max(0, ms), MAX_DATE_MS);
}

function handleGet(
  req: IncomingMessage,
  res: ServerResponse,
  outputDir: string,
  now: () => Date,
): void {
  const url = req.url ?? '';
  const path = url.split('?')[0];

  if (path === '/' || path === '/index.html') {
    res.statusCode = 200;
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(DASHBOARD_HTML);
    return;
  }

  // Feature #3 wedge — polished Team Videos dashboard. Separate from the
  // engineering `/` dashboard on purpose: this is the surface a team leader
  // (not an SRE) actually clicks into.
  if (path === '/videos' || path === '/videos.html') {
    res.statusCode = 200;
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(VIDEOS_DASHBOARD_HTML);
    return;
  }

  const q = parseQuery(url);

  // Feature #3 wedge — list every uploaded video across all users/dates so
  // the /videos dashboard can render a single chronological feed.
  if (path === '/api/videos') {
    const videos: Array<{
      id: string;
      user_id: string;
      date: string;
      container: string;
      size: number;
      sha256?: string;
      label?: string;
      captured_at?: string;
      link: string;
    }> = [];
    const allowedExts = new Set(['mov', 'mp4', 'webm', 'mkv']);
    try {
      for (const userName of listDirNames(outputDir)) {
        if (safeUserId(userName) !== userName) continue;
        const userDir = join(outputDir, userName);
        if (!isUnder(outputDir, userDir)) continue;
        for (const dateName of listDirNames(userDir)) {
          if (!DATE_RE.test(dateName)) continue;
          const dateDir = join(userDir, dateName);
          if (!isUnder(outputDir, dateDir)) continue;
          let files: string[];
          try {
            files = readdirSync(dateDir);
          } catch {
            continue;
          }
          for (const fname of files) {
            const m = /^([A-Za-z0-9._-]+)\.([A-Za-z0-9]+)$/.exec(fname);
            if (!m) continue;
            const id = m[1]!;
            const ext = m[2]!.toLowerCase();
            if (!allowedExts.has(ext)) continue;
            if (id.includes('..')) continue;
            const full = join(dateDir, fname);
            let size = 0;
            let mtime = '';
            try {
              const st = statSync(full);
              size = st.size;
              mtime = st.mtime.toISOString();
            } catch {
              continue;
            }
            const link =
              '/api/file?user=' + encodeURIComponent(userName) +
              '&date=' + encodeURIComponent(dateName) +
              '&id=' + encodeURIComponent(id) +
              '&ext=' + encodeURIComponent(ext);
            // Optional per-upload metadata sidecar: `<id>.meta.json`. Same
            // user/date dir, written by the collector when an upload carried
            // a `label` or a sender-supplied SHA. Absent metadata is fine —
            // the dashboard degrades gracefully to just (id / size / date).
            let label: string | undefined;
            let sha256: string | undefined;
            let capturedAt = mtime;
            try {
              const metaPath = join(dateDir, id + '.meta.json');
              if (isUnder(outputDir, metaPath) && existsSync(metaPath)) {
                const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as Record<string, unknown>;
                if (typeof meta.label === 'string') label = meta.label;
                if (typeof meta.payload_sha256 === 'string') sha256 = meta.payload_sha256;
                if (typeof meta.captured_at === 'string') capturedAt = meta.captured_at;
              }
            } catch {
              // best-effort
            }
            videos.push({
              id,
              user_id: userName,
              date: dateName,
              container: ext,
              size,
              sha256,
              label,
              captured_at: capturedAt,
              link,
            });
          }
        }
      }
    } catch (err) {
      send(res, 500, {
        error: 'list failed',
        detail: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    // Newest first (by captured_at, then mtime fallback).
    videos.sort((a, b) => (a.captured_at && b.captured_at ? (a.captured_at < b.captured_at ? 1 : -1) : 0));
    send(res, 200, { videos });
    return;
  }

  // ── Issue #350 — CC runtime status query API. Unauthenticated, like the
  //    other /api/* endpoints (the issue body flags LAN-readability as a known
  //    exposure; adding auth to /api/* is a separate issue). ──────────────────
  if (path === '/api/cc-status/all') {
    send(res, 200, { sessions: readLatestAllUsers(outputDir, now()) });
    return;
  }
  if (path === '/api/cc-status/history') {
    const user = validateUserParam(q.get('user') ?? undefined);
    const session = validateIdParam(q.get('session') ?? undefined);
    if (!user) {
      send(res, 400, { error: 'invalid user' });
      return;
    }
    if (!session) {
      send(res, 400, { error: 'invalid session' });
      return;
    }
    const sinceMs = parseSinceMs(q.get('since'), now().getTime());
    send(res, 200, {
      user_id: user,
      session_id: session,
      since: new Date(sinceMs).toISOString(),
      history: readHistory(outputDir, user, session, sinceMs, now()),
    });
    return;
  }
  if (path === '/api/cc-status') {
    const user = validateUserParam(q.get('user') ?? undefined);
    if (!user) {
      send(res, 400, { error: 'invalid user' });
      return;
    }
    const sessionRaw = q.get('session');
    if (sessionRaw !== null) {
      const session = validateIdParam(sessionRaw);
      if (!session) {
        send(res, 400, { error: 'invalid session' });
        return;
      }
      const row = readLatestForSession(outputDir, user, session, now());
      if (!row) {
        send(res, 404, { error: 'not found' });
        return;
      }
      send(res, 200, row);
      return;
    }
    send(res, 200, { sessions: readLatestPerSession(outputDir, user, now()) });
    return;
  }

  if (path === '/api/users') {
    const users = listDirNames(outputDir).sort((a, b) => a.localeCompare(b));
    send(res, 200, { users });
    return;
  }

  if (path === '/api/dates') {
    const user = validateUserParam(q.get('user') ?? undefined);
    if (!user) {
      send(res, 400, { error: 'invalid user' });
      return;
    }
    const userDir = join(outputDir, user);
    if (!isUnder(outputDir, userDir)) {
      send(res, 400, { error: 'invalid path' });
      return;
    }
    const dates = listDirNames(userDir)
      .filter((n) => DATE_RE.test(n))
      .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
    send(res, 200, { dates });
    return;
  }

  if (path === '/api/sessions') {
    const user = validateUserParam(q.get('user') ?? undefined);
    const date = validateDateParam(q.get('date') ?? undefined);
    if (!user) {
      send(res, 400, { error: 'invalid user' });
      return;
    }
    if (!date) {
      send(res, 400, { error: 'invalid date' });
      return;
    }
    const dir = join(outputDir, user, date);
    if (!isUnder(outputDir, dir)) {
      send(res, 400, { error: 'invalid path' });
      return;
    }
    send(res, 200, { sessions: listSessions(dir) });
    return;
  }

  if (path === '/api/quota') {
    const user = validateUserParam(q.get('user') ?? undefined);
    const date = validateDateParam(q.get('date') ?? undefined);
    if (!user) {
      send(res, 400, { error: 'invalid user' });
      return;
    }
    if (!date) {
      send(res, 400, { error: 'invalid date' });
      return;
    }
    const quotaFile = join(outputDir, user, date, 'quota.json');
    if (!isUnder(outputDir, quotaFile)) {
      send(res, 400, { error: 'invalid path' });
      return;
    }
    if (!existsSync(quotaFile)) {
      send(res, 404, { error: 'not found' });
      return;
    }
    try {
      const raw = readFileSync(quotaFile, 'utf8');
      const parsed = JSON.parse(raw);
      send(res, 200, parsed);
    } catch (err) {
      send(res, 500, {
        error: 'read failed',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  if (path === '/api/file') {
    const user = validateUserParam(q.get('user') ?? undefined);
    const date = validateDateParam(q.get('date') ?? undefined);
    const id = validateIdParam(q.get('id') ?? undefined);
    const ext = validateExtParam(q.get('ext') ?? undefined);
    if (!user) {
      send(res, 400, { error: 'invalid user' });
      return;
    }
    if (!date) {
      send(res, 400, { error: 'invalid date' });
      return;
    }
    if (!id) {
      send(res, 400, { error: 'invalid id' });
      return;
    }
    if (!ext) {
      send(res, 400, { error: 'invalid ext' });
      return;
    }
    const filePath = join(outputDir, user, date, `${id}.${ext}`);
    if (!isUnder(outputDir, filePath)) {
      send(res, 400, { error: 'invalid path' });
      return;
    }
    if (!existsSync(filePath)) {
      send(res, 404, { error: 'not found' });
      return;
    }
    try {
      const buf = readFileSync(filePath);
      res.statusCode = 200;
      res.setHeader('content-type', contentTypeForExt(ext));
      res.setHeader('content-length', String(buf.length));
      // Swallow client-disconnect EPIPE/ECONNRESET — already-sent response,
      // nothing to recover. Without this listener the error crashes Node.
      res.on('error', () => {});
      res.end(buf);
    } catch (err) {
      send(res, 500, {
        error: 'read failed',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  send(res, 404);
}

export async function startMockServer(opts: MockServerOptions): Promise<MockServerHandle> {
  const outputDir = opts.outputDir ?? join(process.cwd(), 'test-output');
  mkdirSync(outputDir, { recursive: true });
  const host = opts.host ?? '127.0.0.1';
  const now = opts.now ?? (() => new Date());

  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method === 'GET') {
      handleGet(req, res, outputDir, now);
      return;
    }
    if (req.method !== 'POST') {
      send(res, 405);
      return;
    }
    const route = (req.url ?? '').split('?')[0] ?? '';
    if (
      route !== ROUTE_CC_SESSIONS &&
      route !== ROUTE_RECORDINGS &&
      route !== ROUTE_CC_STATUS &&
      route !== ROUTE_VIDEOS
    ) {
      send(res, 404);
      return;
    }

    let bodyBytes = 0;
    let aborted = false;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      if (aborted) return;
      bodyBytes += chunk.length;
      if (bodyBytes > MAX_BODY_BYTES) {
        aborted = true;
        send(res, 413, { error: 'payload too large', limit: MAX_BODY_BYTES });
        // Do NOT destroy the request — that races the response flush and the
        // client sees ECONNRESET instead of 413. Just discard subsequent chunks
        // (memory stays bounded by the per-chunk handler's early-return).
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (aborted) return;
      let json: unknown;
      try {
        json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch (err) {
        send(res, 400, {
          error: 'invalid json',
          detail: err instanceof Error ? err.message : String(err),
        });
        return;
      }

      // Issue #350 — CC status snapshot: plain JSON body, no gzip, no envelope.
      // sanitizeCcStatusSnapshot does the allowlist + type checks; a malformed
      // body 400s (unlike the optional quota sidecar on /v1/cc-sessions, the
      // snapshot IS the payload here).
      if (route === ROUTE_CC_STATUS) {
        const r = appendCcStatusSnapshot(outputDir, json, now());
        if (!r.ok) {
          if (r.reason === 'path') {
            send(res, 400, { error: 'invalid path' });
          } else if (r.reason === 'io') {
            send(res, 500, { error: 'write failed' });
          } else {
            send(res, 400, { error: 'invalid cc-status snapshot' });
          }
          return;
        }
        send(res, 200, {
          ok: true,
          user_id: r.user_id,
          date: r.date,
          session_id: r.session_id,
        });
        return;
      }

      // Feature #3 wedge — screen-video upload. Validates container, writes
      // `<user>/<date>/<id>.<container>` under outputDir, returns a link the
      // CLI can print verbatim. Kept inline to avoid bumping the existing
      // recording/cc-session schema; the path semantics are identical to
      // /v1/recordings so downstream tooling can list videos via the same
      // GET /sessions/:user/:date endpoints.
      if (route === ROUTE_VIDEOS) {
        const obj = json as Record<string, unknown>;
        const envelope = (obj.envelope ?? {}) as Record<string, unknown>;
        const idRaw = envelope.video_id ?? envelope.id;
        let id: string;
        if (typeof idRaw === 'string' && idRaw.length > 0) {
          const validated = validateIdParam(idRaw);
          if (validated === null) {
            send(res, 400, { error: 'invalid id' });
            return;
          }
          id = validated;
        } else {
          id = `video-${Date.now()}-${randomUUID().slice(0, 8)}`;
        }

        const videoBlock = obj.video as Record<string, unknown> | undefined;
        const containerRaw = videoBlock?.container ?? envelope.container;
        const container =
          typeof containerRaw === 'string' ? containerRaw.toLowerCase() : '';
        if (!ALLOWED_VIDEO_CONTAINERS.has(container)) {
          send(res, 400, {
            error: 'unsupported container',
            allowed: [...ALLOWED_VIDEO_CONTAINERS],
          });
          return;
        }

        const contentB64 = videoBlock?.content;
        if (typeof contentB64 !== 'string' || contentB64.length === 0) {
          send(res, 400, { error: 'missing content', route });
          return;
        }

        try {
          const buf = Buffer.from(contentB64, 'base64');
          if (buf.length > MAX_DECOMPRESSED_BYTES) {
            send(res, 413, {
              error: 'decoded payload too large',
              limit: MAX_DECOMPRESSED_BYTES,
            });
            return;
          }
          const userIdSafe = safeUserId(envelope.user_id);
          const date = dateStamp(envelope.captured_at, now());
          const targetDir = join(outputDir, userIdSafe, date);
          const targetFile = join(targetDir, `${id}.${container}`);
          if (!isUnder(outputDir, targetFile)) {
            send(res, 400, { error: 'invalid path' });
            return;
          }
          mkdirSync(targetDir, { recursive: true });
          atomicWriteFileSync(targetFile, buf);

          // Sidecar: persist label / SHA / captured_at so the /videos
          // dashboard can render upload metadata without rescanning the
          // file. Optional — absent sidecar = dashboard falls back to
          // `(id, size, mtime)`. Best-effort write.
          try {
            const labelRaw = envelope.label;
            const shaRaw = envelope.payload_sha256;
            const capturedRaw = envelope.captured_at;
            const sidecar: Record<string, unknown> = {};
            if (typeof labelRaw === 'string' && labelRaw.length > 0) sidecar.label = labelRaw;
            if (typeof shaRaw === 'string' && shaRaw.length > 0) sidecar.payload_sha256 = shaRaw;
            if (typeof capturedRaw === 'string' && capturedRaw.length > 0) sidecar.captured_at = capturedRaw;
            if (Object.keys(sidecar).length > 0) {
              const metaPath = join(targetDir, `${id}.meta.json`);
              if (isUnder(outputDir, metaPath)) {
                atomicWriteFileSync(metaPath, Buffer.from(JSON.stringify(sidecar), 'utf8'));
              }
            }
          } catch {
            // sidecar failures must never 5xx the upload
          }

          // Build the share-link the CLI will print verbatim. We reuse the
          // existing GET /api/file query handler (which now accepts video
          // extensions) so a recipient who clicks the link gets the bytes
          // back with no new endpoint to memorise.
          const link =
            `/api/file?user=${encodeURIComponent(userIdSafe)}` +
            `&date=${encodeURIComponent(date)}` +
            `&id=${encodeURIComponent(id)}` +
            `&ext=${encodeURIComponent(container)}`;
          send(res, 200, {
            ok: true,
            id,
            user_id: userIdSafe,
            date,
            container,
            link,
            payload_size: buf.length,
          });
        } catch (err) {
          send(res, 500, {
            error: 'decode or write failed',
            detail: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      const isLog = route === ROUTE_CC_SESSIONS;
      const obj = json as Record<string, unknown>;
      const envelope = (obj.envelope ?? {}) as Record<string, unknown>;
      const idRaw = isLog ? envelope.session_id : envelope.recording_id;
      let id: string;
      if (typeof idRaw === 'string' && idRaw.length > 0) {
        const validated = validateIdParam(idRaw);
        if (validated === null) {
          send(res, 400, { error: 'invalid id', detail: 'id must match [A-Za-z0-9._-]+ and not contain ".."' });
          return;
        }
        id = validated;
      } else {
        // Fallback for missing id — randomized to avoid collisions on concurrent uploads.
        id = `unknown-${Date.now()}-${randomUUID().slice(0, 8)}`;
      }

      const payloadBlock = (isLog ? obj.transcript : obj.audio) as
        | Record<string, unknown>
        | undefined;
      const contentB64 = payloadBlock?.content;
      if (typeof contentB64 !== 'string' || contentB64.length === 0) {
        send(res, 400, { error: 'missing content', route });
        return;
      }

      try {
        const buf = Buffer.from(contentB64, 'base64');
        const decoded = isLog
          ? gunzipSync(buf, { maxOutputLength: MAX_DECOMPRESSED_BYTES })
          : buf;
        if (decoded.length > MAX_DECOMPRESSED_BYTES) {
          send(res, 413, {
            error: 'decompressed payload too large',
            limit: MAX_DECOMPRESSED_BYTES,
          });
          return;
        }
        const ext = isLog ? 'jsonl' : 'ogg';
        const userIdSafe = safeUserId(envelope.user_id);
        const date = dateStamp(envelope.captured_at, now());
        const targetDir = join(outputDir, userIdSafe, date);
        const targetFile = join(targetDir, `${id}.${ext}`);
        // Defense-in-depth: confirm the resolved write path stays under outputDir.
        if (!isUnder(outputDir, targetFile)) {
          send(res, 400, { error: 'invalid path' });
          return;
        }
        mkdirSync(targetDir, { recursive: true });
        atomicWriteFileSync(targetFile, decoded);

        // Issue #283 — write quota.json sidecar when envelope carries a
        // well-formed quota block. Latest write per <user>/<date>/ wins
        // (overwrites). Malformed quota is silently skipped; the transcript
        // is the primary payload and must not 4xx because of a bad sidecar.
        if (isLog) {
          const quotaCandidate = (obj.envelope as Record<string, unknown> | undefined)?.quota;
          if (isValidQuotaBlock(quotaCandidate)) {
            const quotaFile = join(targetDir, 'quota.json');
            if (isUnder(outputDir, quotaFile)) {
              try {
                const quotaBuf = Buffer.from(JSON.stringify(quotaCandidate), 'utf8');
                atomicWriteFileSync(quotaFile, quotaBuf);
              } catch {
                // Defense-in-depth: never let a quota sidecar failure 5xx the
                // transcript upload. Best-effort write only.
              }
            }
          }
        }

        send(res, 200, { ok: true, id, user_id: userIdSafe, date });
      } catch (err) {
        send(res, 500, {
          error: 'decode or write failed',
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    });
    req.on('error', () => {
      if (!res.headersSent) {
        send(res, 500);
      }
    });
  });

  // Track open sockets so close() can force-destroy slow connections instead of
  // hanging until systemd's TimeoutStopSec SIGKILL.
  const sockets = new Set<Socket>();
  server.on('connection', (socket: Socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });

  return new Promise<MockServerHandle>((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port, host, () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('mock server failed to bind'));
        return;
      }
      resolve({
        url: `http://${host}:${addr.port}`,
        port: addr.port,
        outputDir,
        close: () =>
          new Promise<void>((r, rej) => {
            server.close((err) => (err ? rej(err) : r()));
            // Force-destroy any in-flight connections so a slowloris client
            // can't keep the process alive past graceful close.
            for (const s of sockets) s.destroy();
            sockets.clear();
          }),
      });
    });
  });
}
