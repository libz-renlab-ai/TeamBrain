/**
 * Feature #2 v2 spike — single-host end-to-end demo for "second-level realtime
 * boss-visibility". Runs:
 *
 *   - HTTP server on $REALTIME_PORT (default 9787) on 127.0.0.1
 *   - POST /v1/cc-status     → appendCcStatusSnapshot
 *   - GET  /v1/cc-status/stream → SSE from createSseHandler
 *   - GET  /                 → inline HTML page subscribing via EventSource
 *
 * Per docs/POP-OPEN-HTML.md, the served HTML is also dumped under
 * /tmp/teamagent/feature-2-demo/kanban-<ts>.html so a `open -a "Google Chrome"`
 * pop-open works against a static file or against the local URL; the demo
 * doesn't auto-spawn Chrome (that's a wrapper script's job).
 *
 * Usage:
 *   tsx packages/digital-twin/src/bin-realtime-demo.ts
 *   curl -N http://127.0.0.1:9787/v1/cc-status/stream  # observe SSE events
 *   open -a "Google Chrome" http://127.0.0.1:9787/
 *
 * The demo also seeds 3 fake-teammate snapshots on boot and pushes one
 * synthetic update every 2 seconds so the kanban DOM has live churn to render.
 * Env:
 *   REALTIME_PORT     — TCP port (default 9787)
 *   REALTIME_OUTDIR   — store directory (default /tmp/teamagent/feature-2-demo/cc-status-store)
 *   REALTIME_SILENT   — when set, suppresses the per-tick stdout line
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CC_STATUS_SCHEMA_VERSION,
  type CcStatusSnapshot,
} from './cc-status/types.js';
import { appendCcStatusSnapshot } from './cc-status/store.js';
import { createSseHandler } from './realtime-stream.js';

const PORT = Number(process.env.REALTIME_PORT ?? 9787);
const OUTDIR = process.env.REALTIME_OUTDIR ?? '/tmp/teamagent/feature-2-demo/cc-status-store';
const HTML_OUTDIR = '/tmp/teamagent/feature-2-demo';
const SILENT = !!process.env.REALTIME_SILENT;

mkdirSync(OUTDIR, { recursive: true });
mkdirSync(HTML_OUTDIR, { recursive: true });

const SEED_TEAMMATES = [
  { user: 'alice', session: 'sess-alice-001', cwd: '/Users/alice/projects/api-service', branch: 'feat/auth' },
  { user: 'bob',   session: 'sess-bob-002',   cwd: '/Users/bob/projects/web-frontend',   branch: 'fix/checkout' },
  { user: 'carol', session: 'sess-carol-003', cwd: '/Users/carol/projects/data-pipeline', branch: 'main' },
];

const ACTIVITIES = [
  'session_start',
  'user_prompt_submit',
];

function nowSnapshot(t: { user: string; session: string; cwd: string; branch: string }): CcStatusSnapshot {
  return {
    schema_version: CC_STATUS_SCHEMA_VERSION,
    session_id: t.session,
    user_id: t.user,
    ts: new Date().toISOString(),
    event: ACTIVITIES[Math.floor(Math.random() * ACTIVITIES.length)]!,
    display_name: t.user,
    machine_id: `${t.user}-laptop`,
    cwd: t.cwd,
    git_branch: t.branch,
    model: 'claude-opus-4-7',
    context_tokens: Math.floor(40_000 + Math.random() * 80_000),
    context_pct: Math.round((40_000 + Math.random() * 80_000) / 200_000 * 100) / 100,
    session_health: 'OK',
  };
}

// Seed once so SSE first-frame is non-empty.
for (const t of SEED_TEAMMATES) appendCcStatusSnapshot(OUTDIR, nowSnapshot(t));

const INLINE_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>TeamBrain · Feature #2 v2 live kanban</title>
  <style>
    :root { font-family: -apple-system, system-ui, sans-serif; color-scheme: dark; }
    body { background: #0b0d10; color: #d9e0ea; margin: 0; padding: 2rem; }
    h1 { font-size: 1.2rem; letter-spacing: 0.08em; text-transform: uppercase; color: #6ee7b7; margin: 0 0 1rem; }
    .meta { color: #6b7280; font-size: 0.78rem; margin-bottom: 1.5rem; }
    .grid { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); }
    .row { background: #131820; border: 1px solid #1f2933; padding: 0.9rem 1rem; border-radius: 12px; transition: opacity .25s, border-color .25s; }
    .row.stale { opacity: 0.4; border-color: #312e2e; }
    .row.fresh { border-color: #34d399; }
    .who { font-weight: 600; color: #e5e7eb; }
    .session { font-family: ui-monospace, SF Mono, monospace; color: #94a3b8; font-size: 0.78rem; margin-top: 0.2rem; }
    .event { display: inline-block; padding: 0.1rem 0.5rem; border-radius: 999px; background: #1f2937; color: #93c5fd; font-size: 0.72rem; margin-top: 0.5rem; }
    .cwd { color: #fbbf24; font-size: 0.8rem; margin-top: 0.45rem; word-break: break-all; }
    .ctx { color: #a78bfa; font-size: 0.75rem; margin-top: 0.3rem; }
    .stale-marker { color: #f87171; font-size: 0.7rem; margin-top: 0.4rem; }
  </style>
</head>
<body>
  <h1>TeamBrain · Feature #2 v2 — boss kanban (live)</h1>
  <div class="meta">
    Source: <code>GET /v1/cc-status/stream</code> · poll 1s · stale &gt; 30s greys out.
    First frame: <span id="firstFrame">—</span> · Last frame: <span id="lastFrame">—</span> · Events: <span id="evCount">0</span>
  </div>
  <div id="grid" class="grid"></div>
  <script>
    const grid = document.getElementById('grid');
    const firstFrameEl = document.getElementById('firstFrame');
    const lastFrameEl = document.getElementById('lastFrame');
    const evCountEl = document.getElementById('evCount');
    let firstSeen = null;
    let evCount = 0;
    // Escape every untrusted cc-status field before splicing into HTML — POST
    // bodies from teammate hooks can contain any string the producer chose, so
    // raw interpolation would be a stored-XSS vector against the leader's tab.
    const esc = (s) => String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const src = new EventSource('/v1/cc-status/stream');
    src.onmessage = (ev) => {
      const t = new Date().toISOString();
      if (!firstSeen) { firstSeen = t; firstFrameEl.textContent = t; }
      lastFrameEl.textContent = t;
      evCount += 1;
      evCountEl.textContent = String(evCount);
      let parsed;
      try { parsed = JSON.parse(ev.data); } catch { return; }
      const rows = (parsed.sessions || []).map((r) => {
        const stale = (r.stale_seconds ?? 0) > 30;
        const cls = 'row ' + (stale ? 'stale' : 'fresh');
        const ctxPct = r.context_pct != null ? (Math.round(r.context_pct * 100) + '%') : '—';
        const tokens = r.context_tokens != null ? r.context_tokens.toLocaleString() : '—';
        return \`<div class="\${cls}">
          <div class="who">\${esc(r.display_name || r.user_id)}</div>
          <div class="session">session: \${esc(r.session_id)}</div>
          <div class="event">\${esc(r.event)}</div>
          <div class="cwd">\${esc(r.cwd || '')} @ \${esc(r.git_branch || '')}</div>
          <div class="ctx">ctx: \${esc(tokens)} (\${esc(ctxPct)}) · model: \${esc(r.model || '—')}</div>
          \${stale ? '<div class="stale-marker">stale ' + esc(r.stale_seconds) + 's</div>' : ''}
        </div>\`;
      });
      grid.innerHTML = rows.join('');
    };
    src.onerror = () => { /* keep the connection; EventSource auto-retries */ };
  </script>
</body>
</html>
`;

// Also dump the HTML to /tmp per docs/POP-OPEN-HTML.md so a static-file pop-open path works.
const HTML_PATH = join(HTML_OUTDIR, `kanban-${Date.now()}.html`);
writeFileSync(HTML_PATH, INLINE_HTML, 'utf8');

const sseHandler = createSseHandler({ outputDir: OUTDIR });

function readBody(req: IncomingMessage, max: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > max) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = req.url || '/';
  const method = (req.method || 'GET').toUpperCase();

  if (method === 'GET' && (url === '/' || url === '/index.html')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(INLINE_HTML);
    return;
  }
  if (method === 'GET' && url === '/v1/cc-status/stream') {
    sseHandler(req, res);
    return;
  }
  if (method === 'POST' && url === '/v1/cc-status') {
    try {
      const body = await readBody(req, 64 * 1024);
      const parsed = JSON.parse(body.toString('utf8'));
      const r = appendCcStatusSnapshot(OUTDIR, parsed);
      if (!r.ok) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: r.reason }));
        return;
      }
      res.writeHead(204);
      res.end();
    } catch (err) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'bad body', detail: String(err) }));
    }
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found', url, method }));
});

server.listen(PORT, '127.0.0.1', () => {
  if (!SILENT) {
    process.stdout.write(
      JSON.stringify({
        ready: true,
        url: `http://127.0.0.1:${PORT}/`,
        sse: `http://127.0.0.1:${PORT}/v1/cc-status/stream`,
        post: `http://127.0.0.1:${PORT}/v1/cc-status`,
        outdir: OUTDIR,
        html_dump: HTML_PATH,
      }) + '\n',
    );
  }
});

// Synthetic teammate-writer: every 2s push a fresh snapshot for each fake teammate.
const writer = setInterval(() => {
  for (const t of SEED_TEAMMATES) {
    appendCcStatusSnapshot(OUTDIR, nowSnapshot(t));
  }
  if (!SILENT) process.stdout.write(`tick ${new Date().toISOString()}\n`);
}, 2000);

const shutdown = (sig: NodeJS.Signals): void => {
  clearInterval(writer);
  server.close(() => process.exit(0));
  // Forced exit safety net if close hangs (e.g., open SSE connection).
  setTimeout(() => process.exit(0), 500).unref();
  if (!SILENT) process.stdout.write(`shutdown on ${sig}\n`);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
