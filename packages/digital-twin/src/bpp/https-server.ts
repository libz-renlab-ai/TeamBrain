// BPP HTTPS wrapper — Phase 5 deployment hardening.
//
// Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §6.3
// ("HTTPS-only + VPC / 内网 only deployment"). This is a thin wrapper that
// re-uses the existing HTTP request listener from `mock-server.ts` and serves
// it over TLS. We do NOT modify mock-server.ts — the wrapper extracts the
// request listener from the already-built http.Server and binds it to a fresh
// https.Server backed by a key+cert pair on disk.
//
// Why this shape:
//   - Keeps the plain-HTTP path intact for tests / dev / behind-nginx-TLS
//     deployments.
//   - Allows operators to put HTTPS in front of the receiver without an
//     external reverse proxy (e.g. small single-machine / air-gapped deploys).
//   - Caller owns lifecycle: `wrapServerWithHttps` returns a fresh
//     `https.Server` — the caller decides when to `.listen()` / `.close()`.

import { readFileSync } from 'node:fs';
import {
  createServer as createHttpsServer,
  type Server as HttpsServer,
} from 'node:https';
import type {
  IncomingMessage,
  Server as HttpServer,
  ServerResponse,
} from 'node:http';

export interface WrapServerWithHttpsOptions {
  /** Filesystem path to a PEM-encoded private key. */
  httpsKeyPath: string;
  /** Filesystem path to a PEM-encoded certificate (chain ok). */
  httpsCertPath: string;
  /** The plain-HTTP server whose request listener should be reused over TLS. */
  http: HttpServer;
}

/**
 * Reuse the request listener bound to an existing `http.Server` and serve it
 * over TLS using the key + cert at the given paths. Returns a brand-new
 * `https.Server` that is NOT yet listening — caller invokes `.listen(port, host)`.
 *
 * The original `http` server is left untouched and unbound (caller may still
 * `.listen()` it on a separate port if they want both HTTP and HTTPS). This
 * function never mutates the input server.
 *
 * Throws if no request listener is registered on the HTTP server, or if the
 * key / cert files cannot be read.
 */
export function wrapServerWithHttps(
  opts: WrapServerWithHttpsOptions,
): HttpsServer {
  const listeners = opts.http.listeners('request') as Array<
    (req: IncomingMessage, res: ServerResponse) => void
  >;
  if (listeners.length === 0) {
    throw new Error(
      "wrapServerWithHttps: input HTTP server has no 'request' listener; " +
        'pass the server returned by startMockServer (or createServer(handler))',
    );
  }
  const requestListener = listeners[0]!;

  // Read key + cert eagerly so a misconfigured deploy fails at wrap time, not
  // on the first TLS handshake.
  const key = readFileSync(opts.httpsKeyPath);
  const cert = readFileSync(opts.httpsCertPath);

  return createHttpsServer({ key, cert }, requestListener);
}
