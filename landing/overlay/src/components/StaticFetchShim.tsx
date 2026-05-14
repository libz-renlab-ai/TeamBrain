'use client';

// In static-export mode (NEXT_PUBLIC_STATIC_EXPORT=1) the /api/* routes don't
// exist on the deployed host (GitHub Pages). This shim wraps window.fetch and:
//   - Rewrites GET /api/<resource>[/...][?...] to GET /data/<resource>.json
//     (the build-time inline-static-data.ts script materialises those JSON files).
//   - Short-circuits non-GET /api/* requests with a static no-op response so
//     mutating actions don't crash the UI; a console warning is emitted.
//
// The shim is a no-op when NEXT_PUBLIC_STATIC_EXPORT !== '1', so dev / server
// builds keep their real API routes.

import { useEffect } from 'react';

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

const STATIC_PATH_MAP: Record<string, string> = {
  '/api/agents': '/data/agents.json',
  '/api/tasks': '/data/tasks.json',
  '/api/resources': '/data/resources.json',
  '/api/meetings': '/data/meetings.json',
  '/api/timeline': '/data/timeline.json',
  '/api/github/status': '/data/github_status.json',
  '/api/github/repos': '/data/github_repos.json',
  '/api/slack/status': '/data/slack_status.json',
  '/api/slack/transcripts': '/data/slack_transcripts.json',
  '/api/slack/channels': '/data/slack_channels.json'
};

function meetingFileToJson(file: string): string {
  const safe = file.replace(/\.txt$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `/data/meetings/${safe}.json`;
}

function dynamicAgentJson(name: string): string {
  const safe = encodeURIComponent(name);
  return `/data/agents/${safe}.json`;
}

function dynamicTaskJson(id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `/data/tasks/${safe}.json`;
}

function rewriteUrl(rawUrl: string, basePath: string): string | null {
  // Strip query/hash for prefix matching
  const noQuery = rawUrl.split('?')[0]!.split('#')[0]!;
  // Normalise to start at /api
  const apiIdx = noQuery.indexOf('/api/');
  if (apiIdx === -1) return null;
  const apiPath = noQuery.slice(apiIdx);
  if (STATIC_PATH_MAP[apiPath]) return basePath + STATIC_PATH_MAP[apiPath];
  // Dynamic /api/meetings/<file>
  if (apiPath.startsWith('/api/meetings/')) {
    const file = decodeURIComponent(apiPath.slice('/api/meetings/'.length));
    return basePath + meetingFileToJson(file);
  }
  // Dynamic /api/agents/<name>
  if (apiPath.startsWith('/api/agents/')) {
    const name = decodeURIComponent(apiPath.slice('/api/agents/'.length).split('/')[0] || '');
    if (name) return basePath + dynamicAgentJson(name);
  }
  // Dynamic /api/tasks/<id>
  if (apiPath.startsWith('/api/tasks/')) {
    const id = apiPath.slice('/api/tasks/'.length).split('/')[0] || '';
    if (id) return basePath + dynamicTaskJson(id);
  }
  // Unknown /api/* — leave null, caller will short-circuit
  return null;
}

function isReadOnlyMethod(method: string | undefined): boolean {
  const m = (method ?? 'GET').toUpperCase();
  return m === 'GET' || m === 'HEAD';
}

function staticOkResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

function patchFetch(basePath: string): () => void {
  if (typeof window === 'undefined') return () => {};
  const original = window.fetch.bind(window);
  const patched: typeof window.fetch = async (input: FetchInput, init?: FetchInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    if (!/^\/?(api\/)|\/api\//.test(url)) return original(input, init);
    const method = init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET');
    if (isReadOnlyMethod(method)) {
      const rewritten = rewriteUrl(url, basePath);
      if (rewritten) return original(rewritten, { method: 'GET' });
      console.warn(`[StaticFetchShim] no static mirror for GET ${url} → empty payload`);
      return staticOkResponse({});
    }
    console.warn(`[StaticFetchShim] non-GET ${method} ${url} short-circuited`);
    return staticOkResponse({ ok: true, static: true, message: 'Mutating actions are disabled in the static demo.' });
  };
  window.fetch = patched;
  return () => {
    window.fetch = original;
  };
}

export function StaticFetchShim(): null {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_STATIC_EXPORT !== '1') return;
    const basePath = process.env.NEXT_PUBLIC_STATIC_BASE_PATH ?? '';
    const restore = patchFetch(basePath);
    return restore;
  }, []);
  return null;
}
