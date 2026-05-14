// BPP HTTPS wrapper — Phase 5 P5.3.
//
// Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §6.3
// (HTTPS-only deploy). Verifies wrapServerWithHttps reuses the existing HTTP
// request listener over TLS without touching mock-server.ts.

import { describe, it, expect } from 'vitest';
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { request as httpsRequest } from 'node:https';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { wrapServerWithHttps } from '../https-server.js';

const FIXTURE_DIR = join(__dirname, 'fixtures');
const KEY_PATH = join(FIXTURE_DIR, 'test-https-key.pem');
const CERT_PATH = join(FIXTURE_DIR, 'test-https-cert.pem');

function makeHttpServerEchoing(): ReturnType<typeof createHttpServer> {
  return createHttpServer((req: IncomingMessage, res: ServerResponse) => {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ url: req.url, method: req.method, via: 'echo' }));
  });
}

function fetchHttpsJson(
  port: number,
  path: string,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        host: '127.0.0.1',
        port,
        path,
        method: 'GET',
        // Self-signed test cert — disable verification for this test only.
        rejectUnauthorized: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let body: unknown = raw;
          try {
            body = JSON.parse(raw);
          } catch {
            // leave raw
          }
          resolve({ status: res.statusCode ?? 0, body });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describe('wrapServerWithHttps', () => {
  it('test fixtures (cert + key) exist on disk', () => {
    // Sanity check — if fixtures are missing, the remaining tests are meaningless.
    expect(existsSync(KEY_PATH)).toBe(true);
    expect(existsSync(CERT_PATH)).toBe(true);
  });

  it('returns a fresh https.Server that is not yet listening', () => {
    const http = makeHttpServerEchoing();
    const https = wrapServerWithHttps({
      httpsKeyPath: KEY_PATH,
      httpsCertPath: CERT_PATH,
      http,
    });
    // Different object than the input.
    expect(https).not.toBe(http);
    // Not yet bound to a port.
    expect(https.listening).toBe(false);
    https.close();
  });

  it('throws if the input HTTP server has no request listener', () => {
    const http = createHttpServer(); // no listener bound
    expect(() =>
      wrapServerWithHttps({
        httpsKeyPath: KEY_PATH,
        httpsCertPath: CERT_PATH,
        http,
      }),
    ).toThrow(/no 'request' listener/);
  });

  it('throws if the key path does not exist', () => {
    const http = makeHttpServerEchoing();
    expect(() =>
      wrapServerWithHttps({
        httpsKeyPath: join(FIXTURE_DIR, 'does-not-exist.pem'),
        httpsCertPath: CERT_PATH,
        http,
      }),
    ).toThrow();
  });

  it('does not mutate the input HTTP server (still has its listener, still not listening)', () => {
    const http = makeHttpServerEchoing();
    const before = http.listeners('request').length;
    const https = wrapServerWithHttps({
      httpsKeyPath: KEY_PATH,
      httpsCertPath: CERT_PATH,
      http,
    });
    expect(http.listeners('request').length).toBe(before);
    expect(http.listening).toBe(false);
    https.close();
  });

  it.skipIf(!process.env.BPP_HTTPS_E2E)(
    'serves the HTTP listener over TLS end-to-end',
    async () => {
      const http = makeHttpServerEchoing();
      const https = wrapServerWithHttps({
        httpsKeyPath: KEY_PATH,
        httpsCertPath: CERT_PATH,
        http,
      });
      await new Promise<void>((res) => https.listen(0, '127.0.0.1', () => res()));
      const addr = https.address();
      if (!addr || typeof addr === 'string') throw new Error('no addr');
      const { status, body } = await fetchHttpsJson(addr.port, '/health');
      expect(status).toBe(200);
      expect(body).toMatchObject({ url: '/health', method: 'GET', via: 'echo' });
      await new Promise<void>((res) => https.close(() => res()));
    },
  );
});
