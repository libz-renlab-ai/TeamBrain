/**
 * Inline single-page dashboard for the collector.
 *
 * Vanilla JS + fetch + minimal CSS. No external deps. No frameworks.
 * Served by mock-server.ts on `GET /`.
 *
 * Avoid using literal "</script>" or "</style>" inside this template — it
 * would break the inline <script>/<style> blocks. We don't.
 */
export const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>TeamAgent Collector</title>
<style>
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f6f7f9; color: #222; }
header { display: flex; align-items: center; gap: 12px; padding: 10px 16px; background: #1f2937; color: #fff; border-bottom: 1px solid #111; }
header h1 { font-size: 16px; margin: 0; font-weight: 600; }
header .ts { color: #9ca3af; font-size: 12px; margin-left: auto; }
header button { background: #2563eb; color: #fff; border: 0; border-radius: 4px; padding: 6px 12px; font-size: 13px; cursor: pointer; }
header button:hover { background: #1d4ed8; }
.grid { display: grid; grid-template-columns: 1fr 1fr 1.5fr; gap: 8px; padding: 8px; height: 38vh; }
.panel { background: #fff; border: 1px solid #e5e7eb; border-radius: 4px; display: flex; flex-direction: column; min-height: 0; }
.panel h2 { margin: 0; padding: 8px 10px; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #e5e7eb; }
.panel ul { list-style: none; padding: 0; margin: 0; overflow-y: auto; flex: 1; }
.panel li { padding: 6px 10px; cursor: pointer; font-size: 13px; border-bottom: 1px solid #f3f4f6; }
.panel li:hover { background: #f9fafb; }
.panel li.sel { background: #dbeafe; color: #1e3a8a; font-weight: 500; }
.panel li .meta { color: #9ca3af; font-size: 11px; margin-left: 8px; }
.preview { margin: 0 8px 8px; background: #fff; border: 1px solid #e5e7eb; border-radius: 4px; padding: 10px; min-height: 30vh; max-height: 50vh; overflow: auto; }
.preview h2 { margin: 0 0 8px; font-size: 13px; color: #6b7280; }
.preview pre { margin: 0; font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
.preview .ev { padding: 4px 6px; border-bottom: 1px solid #f3f4f6; }
.preview .ev .k { color: #7c3aed; }
.preview .ev .s { color: #059669; }
.preview .ev .n { color: #dc2626; }
.preview audio { width: 100%; }
.empty { color: #9ca3af; font-size: 13px; padding: 8px; }
.err { color: #dc2626; font-size: 12px; padding: 8px; }
</style>
</head>
<body>
<header>
  <h1>TeamAgent Collector</h1>
  <span class="ts" id="ts"></span>
  <button id="refresh">Refresh</button>
</header>
<div class="grid">
  <div class="panel"><h2>Users</h2><ul id="users"><li class="empty">loading...</li></ul></div>
  <div class="panel"><h2>Dates</h2><ul id="dates"><li class="empty">select a user</li></ul></div>
  <div class="panel"><h2>Sessions</h2><ul id="sessions"><li class="empty">select a date</li></ul></div>
</div>
<div class="preview">
  <h2 id="ph">Preview</h2>
  <div id="pv"><div class="empty">select a session</div></div>
</div>
<script>
(function () {
  var sel = { user: null, date: null, sid: null, sext: null };
  var $ = function (id) { return document.getElementById(id); };
  function setTs() {
    var d = new Date();
    $('ts').textContent = 'last refreshed ' + d.toLocaleTimeString();
  }
  function escHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function render(ulId, items, fn) {
    var ul = $(ulId);
    ul.innerHTML = '';
    if (!items || items.length === 0) {
      var li = document.createElement('li');
      li.className = 'empty';
      li.textContent = '(empty)';
      ul.appendChild(li);
      return;
    }
    items.forEach(function (it) {
      var li = document.createElement('li');
      fn(li, it);
      ul.appendChild(li);
    });
  }
  function showErr(ulId, msg) {
    var ul = $(ulId);
    ul.innerHTML = '<li class="err">' + escHtml(msg) + '</li>';
  }
  function loadUsers() {
    sel.user = sel.date = sel.sid = sel.sext = null;
    $('dates').innerHTML = '<li class="empty">select a user</li>';
    $('sessions').innerHTML = '<li class="empty">select a date</li>';
    $('pv').innerHTML = '<div class="empty">select a session</div>';
    $('ph').textContent = 'Preview';
    fetch('/api/users').then(function (r) { return r.json(); }).then(function (d) {
      render('users', d.users, function (li, u) {
        li.textContent = u;
        li.onclick = function () { selectUser(u, li); };
      });
      setTs();
    }).catch(function (e) { showErr('users', 'failed: ' + e.message); });
  }
  function selectUser(u, li) {
    sel.user = u; sel.date = sel.sid = sel.sext = null;
    Array.prototype.forEach.call($('users').querySelectorAll('li'), function (x) { x.classList.remove('sel'); });
    if (li) li.classList.add('sel');
    $('sessions').innerHTML = '<li class="empty">select a date</li>';
    $('pv').innerHTML = '<div class="empty">select a session</div>';
    $('dates').innerHTML = '<li class="empty">loading...</li>';
    fetch('/api/dates?user=' + encodeURIComponent(u)).then(function (r) { return r.json(); }).then(function (d) {
      render('dates', d.dates, function (li2, dt) {
        li2.textContent = dt;
        li2.onclick = function () { selectDate(dt, li2); };
      });
    }).catch(function (e) { showErr('dates', 'failed: ' + e.message); });
  }
  function selectDate(dt, li) {
    sel.date = dt; sel.sid = sel.sext = null;
    Array.prototype.forEach.call($('dates').querySelectorAll('li'), function (x) { x.classList.remove('sel'); });
    if (li) li.classList.add('sel');
    $('pv').innerHTML = '<div class="empty">select a session</div>';
    $('sessions').innerHTML = '<li class="empty">loading...</li>';
    var url = '/api/sessions?user=' + encodeURIComponent(sel.user) + '&date=' + encodeURIComponent(dt);
    fetch(url).then(function (r) { return r.json(); }).then(function (d) {
      render('sessions', d.sessions, function (li2, s) {
        var size = s.size < 1024 ? s.size + ' B' : (s.size / 1024).toFixed(1) + ' KB';
        li2.innerHTML = '<span>' + escHtml(s.id) + '.' + escHtml(s.ext) + '</span><span class="meta">' + size + '</span>';
        li2.onclick = function () { selectSession(s, li2); };
      });
    }).catch(function (e) { showErr('sessions', 'failed: ' + e.message); });
  }
  function selectSession(s, li) {
    sel.sid = s.id; sel.sext = s.ext;
    Array.prototype.forEach.call($('sessions').querySelectorAll('li'), function (x) { x.classList.remove('sel'); });
    if (li) li.classList.add('sel');
    var url = '/api/file?user=' + encodeURIComponent(sel.user) + '&date=' + encodeURIComponent(sel.date) + '&id=' + encodeURIComponent(s.id) + '&ext=' + encodeURIComponent(s.ext);
    $('ph').textContent = s.id + '.' + s.ext;
    if (s.ext === 'ogg') {
      $('pv').innerHTML = '<audio controls preload="metadata" src="' + escHtml(url) + '"></audio>';
      return;
    }
    $('pv').innerHTML = '<div class="empty">loading...</div>';
    fetch(url).then(function (r) { return r.text(); }).then(function (t) {
      renderJsonl(t);
    }).catch(function (e) { $('pv').innerHTML = '<div class="err">failed: ' + escHtml(e.message) + '</div>'; });
  }
  function renderJsonl(text) {
    var lines = text.split(/\\r?\\n/);
    var html = '';
    var count = 0;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line.trim()) continue;
      count++;
      try {
        var obj = JSON.parse(line);
        html += '<div class="ev"><pre>' + colorize(JSON.stringify(obj, null, 2)) + '</pre></div>';
      } catch (e) {
        html += '<div class="ev"><pre>' + escHtml(line) + '</pre></div>';
      }
      if (count >= 500) {
        html += '<div class="empty">(truncated at 500 events)</div>';
        break;
      }
    }
    if (count === 0) html = '<div class="empty">(empty)</div>';
    $('pv').innerHTML = html;
  }
  function colorize(s) {
    var esc = escHtml(s);
    esc = esc.replace(/(&quot;[^&]*?&quot;)(\\s*:)/g, '<span class="k">$1</span>$2');
    esc = esc.replace(/:\\s*(&quot;[^&]*?&quot;)/g, function (m, p) { return ': <span class="s">' + p + '</span>'; });
    esc = esc.replace(/:\\s*(-?\\d+(?:\\.\\d+)?)/g, ': <span class="n">$1</span>');
    return esc;
  }
  $('refresh').onclick = loadUsers;
  loadUsers();
})();
</script>
</body>
</html>`;
