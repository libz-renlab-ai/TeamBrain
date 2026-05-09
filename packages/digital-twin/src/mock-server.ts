import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { gunzipSync } from 'node:zlib';
import {
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
  existsSync,
  readFileSync,
} from 'node:fs';
import { join, resolve as resolvePath, sep } from 'node:path';
import { DASHBOARD_HTML } from './dashboard-html.js';

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

export function safeUserId(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length === 0) return 'unknown';
  let cleaned = raw.replace(/[^a-zA-Z0-9._@+-]/g, '_').slice(0, 80);
  cleaned = cleaned.replace(/\.{2,}/g, '_');
  cleaned = cleaned.replace(/^[._-]+/, '').replace(/[._-]+$/, '');
  return cleaned.length > 0 ? cleaned : 'unknown';
}

export function dateStamp(raw: unknown, now: Date): string {
  let d = now;
  if (typeof raw === 'string' && raw.length > 0) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) d = parsed;
  }
  const yyyy = d.getUTCFullYear().toString().padStart(4, '0');
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = d.getUTCDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
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

function validateIdParam(raw: string | undefined): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  if (raw.includes('..')) return null;
  return ID_RE.test(raw) ? raw : null;
}

function validateExtParam(raw: string | undefined): 'jsonl' | 'ogg' | null {
  return raw === 'jsonl' || raw === 'ogg' ? raw : null;
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

function handleGet(
  req: IncomingMessage,
  res: ServerResponse,
  outputDir: string,
): void {
  const url = req.url ?? '';
  const path = url.split('?')[0];

  if (path === '/' || path === '/index.html') {
    res.statusCode = 200;
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(DASHBOARD_HTML);
    return;
  }

  const q = parseQuery(url);

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
      if (ext === 'jsonl') {
        res.setHeader('content-type', 'text/plain; charset=utf-8');
      } else {
        res.setHeader('content-type', 'audio/ogg');
      }
      res.setHeader('content-length', String(buf.length));
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
      handleGet(req, res, outputDir);
      return;
    }
    if (req.method !== 'POST') {
      send(res, 405);
      return;
    }
    const route = req.url ?? '';
    if (route !== ROUTE_CC_SESSIONS && route !== ROUTE_RECORDINGS) {
      send(res, 404);
      return;
    }

    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
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

      const isLog = route === ROUTE_CC_SESSIONS;
      const obj = json as Record<string, unknown>;
      const envelope = (obj.envelope ?? {}) as Record<string, unknown>;
      const idRaw = isLog ? envelope.session_id : envelope.recording_id;
      const id = typeof idRaw === 'string' && idRaw.length > 0
        ? idRaw
        : `unknown-${Date.now()}`;

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
        const decoded = isLog ? gunzipSync(buf) : buf;
        const ext = isLog ? 'jsonl' : 'ogg';
        const userIdSafe = safeUserId(envelope.user_id);
        const date = dateStamp(envelope.captured_at, now());
        const targetDir = join(outputDir, userIdSafe, date);
        mkdirSync(targetDir, { recursive: true });
        writeFileSync(join(targetDir, `${id}.${ext}`), decoded);
        send(res, 200, { ok: true, id, user_id: userIdSafe, date });
      } catch (err) {
        send(res, 500, {
          error: 'decode or write failed',
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    });
    req.on('error', () => {
      send(res, 500);
    });
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
          new Promise<void>((r, rej) =>
            server.close((err) => (err ? rej(err) : r())),
          ),
      });
    });
  });
}
