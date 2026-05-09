import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { gunzipSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface MockServerOptions {
  /** Port to bind. Use 0 to pick an ephemeral port. */
  port: number;
  /** Where to write decoded payloads. Defaults to ./test-output under process.cwd(). */
  outputDir?: string;
  /** Bind host. Defaults to 127.0.0.1. */
  host?: string;
}

export interface MockServerHandle {
  url: string;
  port: number;
  outputDir: string;
  close(): Promise<void>;
}

const ROUTE_CC_SESSIONS = '/v1/cc-sessions';
const ROUTE_RECORDINGS = '/v1/recordings';

function send(res: ServerResponse, status: number, body?: unknown): void {
  res.statusCode = status;
  if (body !== undefined) {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body));
  } else {
    res.end();
  }
}

export async function startMockServer(opts: MockServerOptions): Promise<MockServerHandle> {
  const outputDir = opts.outputDir ?? join(process.cwd(), 'test-output');
  mkdirSync(outputDir, { recursive: true });
  const host = opts.host ?? '127.0.0.1';

  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
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
        writeFileSync(join(outputDir, `${id}.${ext}`), decoded);
        send(res, 200, { ok: true, id });
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
