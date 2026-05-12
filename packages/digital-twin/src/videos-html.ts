/**
 * `GET /videos` — polished, boss-grade Team Videos dashboard.
 *
 * Vanilla JS + fetch + inline CSS. No framework, no external deps. Designed to
 * be the *external surface* a team leader actually sees when they click into
 * the collector: a list of teammate uploads, inline playback, share links.
 *
 * Separate from the existing `/` dashboard (transcripts + audio) on purpose:
 * `/` is the engineering ops view; `/videos` is the visual product view.
 *
 * Avoid literal `</script>` and `</style>` inside the template.
 */
export const VIDEOS_DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Team Videos — TeamBrain</title>
<style>
  :root {
    --bg: #0b1220;
    --bg-panel: #131c2f;
    --bg-card: #1a2438;
    --border: #243049;
    --ink: #e8eef7;
    --mute: #93a4c1;
    --accent: #5b9bff;
    --accent-2: #8b6cff;
    --ok: #2ea043;
    --warn: #d29922;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, "SF Pro Text", BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: linear-gradient(180deg, #0b1220 0%, #0a1a2e 100%);
    color: var(--ink);
    min-height: 100vh;
  }
  header {
    display: flex; align-items: center; gap: 16px;
    padding: 18px 28px;
    border-bottom: 1px solid var(--border);
    background: rgba(11, 18, 32, 0.85);
    backdrop-filter: saturate(140%) blur(8px);
    position: sticky; top: 0; z-index: 10;
  }
  .logo {
    width: 32px; height: 32px; border-radius: 8px;
    background: linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%);
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 14px; color: white;
  }
  h1 { font-size: 18px; font-weight: 600; margin: 0; letter-spacing: -0.2px; }
  .sub { color: var(--mute); font-size: 12px; margin-left: 4px; }
  .nav-right { margin-left: auto; display: flex; gap: 10px; align-items: center; }
  .badge {
    background: rgba(91, 155, 255, 0.15);
    color: var(--accent);
    border: 1px solid rgba(91, 155, 255, 0.35);
    border-radius: 999px;
    padding: 4px 10px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.3px;
  }
  .refresh {
    background: rgba(255,255,255,0.06);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 12px;
    cursor: pointer;
  }
  .refresh:hover { background: rgba(255,255,255,0.1); }

  .layout {
    display: grid;
    grid-template-columns: minmax(320px, 380px) 1fr;
    gap: 18px;
    padding: 18px 28px 28px;
    max-width: 1480px;
    margin: 0 auto;
  }

  .left { display: flex; flex-direction: column; gap: 10px; min-height: 0; }
  .summary {
    display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
  }
  .stat {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px 14px;
  }
  .stat .lbl { color: var(--mute); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
  .stat .val { font-size: 20px; font-weight: 600; margin-top: 4px; }

  .list-card {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
    display: flex; flex-direction: column;
    flex: 1; min-height: 0;
  }
  .list-card h2 {
    margin: 0; padding: 12px 16px;
    font-size: 12px; font-weight: 600; color: var(--mute);
    text-transform: uppercase; letter-spacing: 0.6px;
    border-bottom: 1px solid var(--border);
    display: flex; align-items: center; gap: 8px;
  }
  .list-card h2 .count { color: var(--ink); font-weight: 700; }

  .vlist { list-style: none; padding: 0; margin: 0; overflow-y: auto; flex: 1; max-height: 70vh; }
  .vitem {
    padding: 12px 16px;
    border-bottom: 1px solid rgba(36, 48, 73, 0.6);
    cursor: pointer;
    transition: background 100ms ease;
    display: flex; align-items: flex-start; gap: 12px;
  }
  .vitem:hover { background: rgba(91, 155, 255, 0.06); }
  .vitem.sel { background: rgba(91, 155, 255, 0.14); border-left: 3px solid var(--accent); padding-left: 13px; }
  .vthumb {
    width: 56px; height: 36px;
    background: linear-gradient(135deg, #2a3550 0%, #1e2842 100%);
    border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    border: 1px solid var(--border);
  }
  .vthumb .play { color: var(--accent); font-size: 14px; }
  .vbody { flex: 1; min-width: 0; }
  .vlabel { font-size: 13px; font-weight: 600; color: var(--ink); margin-bottom: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .vmeta { font-size: 11px; color: var(--mute); display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .vmeta .who { color: var(--accent); font-weight: 600; }
  .vmeta .when { color: var(--mute); }
  .vmeta .ext {
    background: rgba(139, 108, 255, 0.15);
    color: var(--accent-2);
    border-radius: 4px;
    padding: 1px 6px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
  }

  .right {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 0;
    overflow: hidden;
    display: flex; flex-direction: column;
  }
  .player-head {
    padding: 14px 18px;
    border-bottom: 1px solid var(--border);
    display: flex; align-items: center; gap: 12px;
  }
  .player-head .title { font-size: 15px; font-weight: 600; }
  .player-head .meta { color: var(--mute); font-size: 12px; margin-left: 4px; }
  .player-head .share {
    margin-left: auto;
    background: linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%);
    color: white;
    border: 0;
    border-radius: 6px;
    padding: 8px 14px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .player-head .share:hover { opacity: 0.92; }
  .player-body { padding: 18px; flex: 1; display: flex; flex-direction: column; gap: 14px; }
  video {
    width: 100%; max-height: 56vh;
    border-radius: 10px;
    background: black;
    border: 1px solid var(--border);
  }
  .link-row {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px 14px;
    display: flex; gap: 10px; align-items: center;
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 12px;
  }
  .link-row .url { color: var(--mute); flex: 1; overflow-x: auto; white-space: nowrap; }
  .link-row .copy {
    background: rgba(91, 155, 255, 0.15);
    color: var(--accent);
    border: 1px solid rgba(91, 155, 255, 0.3);
    border-radius: 5px;
    padding: 4px 10px;
    font-size: 11px;
    cursor: pointer;
    font-family: inherit;
  }
  .link-row .copy:hover { background: rgba(91, 155, 255, 0.25); }
  .link-row .copy.copied { background: rgba(46, 160, 67, 0.2); color: var(--ok); border-color: var(--ok); }

  .details {
    display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
    font-size: 12px;
  }
  .detail { background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 10px 14px; }
  .detail .lbl { color: var(--mute); font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
  .detail .val { color: var(--ink); font-weight: 500; word-break: break-all; font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 11px; }

  .empty { padding: 80px 30px; color: var(--mute); text-align: center; font-size: 13px; }
  .empty .big { font-size: 16px; color: var(--ink); margin-bottom: 8px; font-weight: 500; }

  @media (max-width: 900px) {
    .layout { grid-template-columns: 1fr; }
    .right { min-height: 60vh; }
  }
</style>
</head>
<body>
<header>
  <div class="logo">TB</div>
  <h1>Team Videos <span class="sub">— TeamBrain Feature #3</span></h1>
  <div class="nav-right">
    <span class="badge">LIVE</span>
    <button class="refresh" onclick="loadVideos()">↻ Refresh</button>
  </div>
</header>

<div class="layout">
  <div class="left">
    <div class="summary">
      <div class="stat"><div class="lbl">Total uploads</div><div class="val" id="stat-total">…</div></div>
      <div class="stat"><div class="lbl">Teammates</div><div class="val" id="stat-users">…</div></div>
    </div>
    <div class="list-card">
      <h2>Recent uploads <span class="count" id="list-count"></span></h2>
      <ul class="vlist" id="vlist">
        <li class="empty"><div class="big">Loading…</div></li>
      </ul>
    </div>
  </div>
  <div class="right" id="player">
    <div class="empty">
      <div class="big">Select an upload from the list</div>
      Pick any video on the left to preview, copy a share link, and see who shipped it.
    </div>
  </div>
</div>

<script>
let videos = [];
let selectedIdx = -1;

// Escape every user-controlled string before it touches innerHTML / attribute
// interpolation. Required because label, id, user_id, sha256, captured_at,
// container, and link all originate from the upload envelope written by the
// CLI — a hostile teammate could otherwise stuff <script> into --label and
// the boss's browser would execute it on /videos.
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"'\\/]/g, function (c) {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      case '/': return '&#x2F;';
      default: return c;
    }
  });
}

function formatBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024*1024) return (n/1024).toFixed(1) + ' KB';
  return (n/(1024*1024)).toFixed(2) + ' MB';
}
function formatWhen(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch { return iso; }
}

function renderList() {
  const ul = document.getElementById('vlist');
  document.getElementById('list-count').textContent = videos.length;
  document.getElementById('stat-total').textContent = videos.length;
  document.getElementById('stat-users').textContent = new Set(videos.map(v => v.user_id)).size;
  if (videos.length === 0) {
    ul.innerHTML = '<li class="empty"><div class="big">No videos yet</div>Run <code>teamagent video upload &lt;file&gt;</code> from any teammate to get started.</li>';
    return;
  }
  ul.innerHTML = videos.map((v, i) => {
    const sel = i === selectedIdx ? ' sel' : '';
    return [
      '<li class="vitem' + sel + '" onclick="selectVideo(' + i + ')">',
        '<div class="vthumb"><span class="play">▶</span></div>',
        '<div class="vbody">',
          '<div class="vlabel">' + esc(v.label || v.id) + '</div>',
          '<div class="vmeta">',
            '<span class="who">@' + esc(v.user_id) + '</span>',
            '<span class="when">' + esc(v.date) + ' · ' + formatBytes(v.size) + '</span>',
            '<span class="ext">' + esc(v.container) + '</span>',
          '</div>',
        '</div>',
      '</li>'
    ].join('');
  }).join('');
}

function selectVideo(i) {
  selectedIdx = i;
  renderList();
  const v = videos[i];
  // Build the link via URL to defang any injected javascript: / data: schemes
  // and to keep the server-supplied path-encoding intact. window.location.origin
  // is always http(s)://host[:port], so absolute URLs win and we fall through
  // to URL() only for server-relative links.
  let link;
  try {
    const base = v.link.startsWith('http') ? v.link : window.location.origin + v.link;
    const u = new URL(base);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('unsupported protocol');
    link = u.toString();
  } catch {
    link = '';
  }
  const linkEsc = esc(link);
  // Pass the link to copyLink via the DOM (dataset) instead of inline JS so a
  // crafted link can't break out of the attribute. The handler reads
  // event.currentTarget.dataset.link, which the browser already escapes.
  document.getElementById('player').innerHTML = [
    '<div class="player-head">',
      '<div>',
        '<div class="title">' + esc(v.label || 'Untitled upload') + '</div>',
        '<div class="meta">by <strong style="color:var(--accent)">@' + esc(v.user_id) + '</strong> · ' + esc(v.date) + ' · ' + formatBytes(v.size) + '</div>',
      '</div>',
      '<button class="share" data-link="' + linkEsc + '" onclick="copyLinkFromBtn(this)">Share link</button>',
    '</div>',
    '<div class="player-body">',
      '<video controls preload="metadata" src="' + linkEsc + '"></video>',
      '<div class="link-row">',
        '<span class="url">' + linkEsc + '</span>',
        '<button class="copy" data-link="' + linkEsc + '" onclick="copyLinkFromBtn(this)">Copy</button>',
      '</div>',
      '<div class="details">',
        '<div class="detail"><div class="lbl">Upload ID</div><div class="val">' + esc(v.id) + '</div></div>',
        '<div class="detail"><div class="lbl">SHA-256</div><div class="val">' + esc(v.sha256 || '—') + '</div></div>',
        '<div class="detail"><div class="lbl">Container</div><div class="val">' + esc((v.container || '').toUpperCase()) + '</div></div>',
        '<div class="detail"><div class="lbl">Captured at</div><div class="val">' + esc(formatWhen(v.captured_at)) + '</div></div>',
      '</div>',
    '</div>'
  ].join('');
}

function copyLinkFromBtn(btn) {
  copyLink(btn.dataset.link || '', btn);
}

function copyLink(link, btn) {
  navigator.clipboard.writeText(link).then(() => {
    const orig = btn.textContent;
    btn.textContent = '✓ Copied';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 1500);
  }).catch(() => {});
}

async function loadVideos() {
  try {
    const r = await fetch('/api/videos');
    const j = await r.json();
    videos = j.videos || [];
    renderList();
    if (videos.length > 0 && selectedIdx === -1) {
      // ?select=<idx> URL param picks a video on first paint (used by
      // screenshot tooling). Default = newest.
      const params = new URLSearchParams(window.location.search);
      const raw = params.get('select');
      const idx = raw === null ? 0 : Math.max(0, Math.min(videos.length - 1, Number(raw) || 0));
      selectVideo(idx);
    }
  } catch (e) {
    document.getElementById('vlist').innerHTML = '<li class="empty"><div class="big">Failed to load</div>' + String(e) + '</li>';
  }
}

loadVideos();
</script>
</body>
</html>`;
