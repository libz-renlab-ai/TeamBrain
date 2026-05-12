/**
 * `teamagent video upload <file>` — single-shot video upload to centralized storage.
 *
 * Feature #3 wedge (see docs/BUSINESS-FEATURES.md Feature 3): the user records
 * screen video with whatever native tool they like (macOS `screencapture -v`,
 * OBS, ffmpeg, Loom export, etc.), then runs ONE command to push the file to
 * centralized storage and get back a shareable link.
 *
 * v1 scope is deliberately thin:
 *   - No queue/daemon path; single HTTP POST to the configured endpoint.
 *   - No transcoding; the file is uploaded as-is and the server picks the
 *     `<container>` extension from the file name. Containers accepted by the
 *     mock server: `mov`, `mp4`, `webm`, `mkv`.
 *   - No long-running record; the user provides an existing file. The doc
 *     `docs/features/video-record-upload.md` covers the recording step.
 *
 * Honest framing: this is the smallest wedge that lets a real user run one
 * command and end up with a centralized, shareable artifact. The queue +
 * retry/backoff path used by `record` audio recordings is the next-step
 * upgrade tracked in `docs/plans/2026-05-13-feature-3-video-easy/judge.md`.
 */
import { readFileSync, statSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { hostname as osHostname, platform as osPlatform } from 'node:os';
import { ulid as defaultUlid } from 'ulid';

export type VideoSubcommand = 'upload';

export interface VideoParsedArgs {
  sub: VideoSubcommand;
  filePath: string;
  endpoint: string;
  label?: string;
  userId?: string;
  jsonOut: boolean;
}

export interface VideoDeps {
  ulid?: () => string;
  print?: (msg: string) => void;
  printErr?: (msg: string) => void;
  readFile?: (path: string) => Buffer;
  statFile?: (path: string) => { size: number };
  /** Override for tests; defaults to global fetch. */
  fetchFn?: (
    url: string,
    init: {
      method: string;
      headers: Record<string, string>;
      body: string;
    },
  ) => Promise<{
    status: number;
    text: () => Promise<string>;
  }>;
  now?: () => Date;
  hostname?: () => string;
  platform?: () => string;
}

export interface VideoResult {
  exitCode: number;
}

export class VideoArgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VideoArgError';
  }
}

const ALLOWED_CONTAINERS = new Set(['mov', 'mp4', 'webm', 'mkv']);

const DEFAULT_ENDPOINT = 'http://127.0.0.1:8787';

export function parseVideoArgs(rest: string[], envEndpoint?: string): VideoParsedArgs {
  const sub = rest[0];
  if (!sub) {
    throw new VideoArgError(
      'Usage: teamagent video upload <file> [--endpoint <url>] [--label <l>] [--user-id <id>] [--json]',
    );
  }
  if (sub !== 'upload') {
    throw new VideoArgError(
      `Unknown video subcommand: ${sub}. The only subcommand today is "upload".`,
    );
  }
  const filePath = rest[1];
  if (!filePath || filePath.startsWith('--')) {
    throw new VideoArgError(
      'Usage: teamagent video upload <file> [--endpoint <url>] [--label <l>] [--user-id <id>] [--json]',
    );
  }
  let endpoint = envEndpoint && envEndpoint.length > 0 ? envEndpoint : DEFAULT_ENDPOINT;
  let label: string | undefined;
  let userId: string | undefined;
  let jsonOut = false;
  for (let i = 2; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === '--endpoint' && rest[i + 1]) {
      endpoint = rest[++i]!;
    } else if (a.startsWith('--endpoint=')) {
      endpoint = a.slice('--endpoint='.length);
    } else if (a === '--label' && rest[i + 1]) {
      label = rest[++i];
    } else if (a.startsWith('--label=')) {
      label = a.slice('--label='.length);
    } else if (a === '--user-id' && rest[i + 1]) {
      userId = rest[++i];
    } else if (a.startsWith('--user-id=')) {
      userId = a.slice('--user-id='.length);
    } else if (a === '--json') {
      jsonOut = true;
    } else {
      throw new VideoArgError(`Unknown argument: ${a}`);
    }
  }
  if (endpoint.endsWith('/')) endpoint = endpoint.slice(0, -1);
  return { sub: 'upload', filePath, endpoint, label, userId, jsonOut };
}

export function containerFromFile(filePath: string): string | null {
  const ext = extname(filePath).slice(1).toLowerCase();
  return ALLOWED_CONTAINERS.has(ext) ? ext : null;
}

interface UploadBody {
  schema_version: 1;
  envelope: {
    id: string;
    video_id: string;
    user_id: string;
    captured_at: string;
    container: string;
    payload_size: number;
    payload_sha256: string;
    label: string | null;
    source: string;
    host: { os: string; hostname: string };
  };
  video: {
    container: string;
    content: string;
  };
}

export async function executeVideo(
  args: VideoParsedArgs,
  deps: VideoDeps = {},
): Promise<VideoResult> {
  const print = deps.print ?? ((m: string) => process.stdout.write(m));
  const printErr = deps.printErr ?? ((m: string) => process.stderr.write(m));
  const ulid = deps.ulid ?? defaultUlid;
  const readFile = deps.readFile ?? readFileSync;
  const statFile =
    deps.statFile ??
    ((p: string) => {
      const s = statSync(p);
      return { size: s.size };
    });
  const now = deps.now ?? (() => new Date());
  const fetchFn =
    deps.fetchFn ??
    (async (url, init) => {
      const r = await fetch(url, init);
      return { status: r.status, text: () => r.text() };
    });
  const hostnameFn = deps.hostname ?? osHostname;
  const platformFn = deps.platform ?? osPlatform;

  const container = containerFromFile(args.filePath);
  if (!container) {
    printErr(
      `Unsupported video extension. Accepted: ${[...ALLOWED_CONTAINERS].join(', ')}\n`,
    );
    return { exitCode: 2 };
  }

  let fileBytes: Buffer;
  let size: number;
  try {
    fileBytes = readFile(args.filePath);
    const s = statFile(args.filePath);
    size = s.size;
  } catch (err) {
    printErr(
      `Failed to read ${args.filePath}: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return { exitCode: 2 };
  }

  if (size === 0) {
    printErr(`Refusing to upload empty file: ${args.filePath}\n`);
    return { exitCode: 2 };
  }

  const id = ulid();
  const userId = args.userId ?? 'local-dev';
  const sha = createHash('sha256').update(fileBytes).digest('hex');
  const body: UploadBody = {
    schema_version: 1,
    envelope: {
      id,
      video_id: id,
      user_id: userId,
      captured_at: now().toISOString(),
      container,
      payload_size: size,
      payload_sha256: sha,
      label: args.label ?? null,
      source: 'teamagent video upload',
      host: { os: platformFn(), hostname: hostnameFn() },
    },
    video: {
      container,
      content: fileBytes.toString('base64'),
    },
  };

  const url = `${args.endpoint}/v1/videos`;
  let status: number;
  let text: string;
  try {
    const r = await fetchFn(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    status = r.status;
    text = await r.text();
  } catch (err) {
    printErr(
      `Upload to ${url} failed: ${err instanceof Error ? err.message : String(err)}\n` +
        'Hint: start the local mock server (pnpm teamagent digital-twin start) or\n' +
        '      point --endpoint=<your storage URL> at production.\n',
    );
    return { exitCode: 1 };
  }

  if (status < 200 || status >= 300) {
    printErr(`Upload rejected (HTTP ${status}): ${text}\n`);
    return { exitCode: 1 };
  }

  let parsed: {
    ok?: boolean;
    id?: string;
    user_id?: string;
    date?: string;
    link?: string;
  } = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    // tolerate non-JSON 2xx
  }

  // The server returns a path-only `link` (e.g. `/api/file?user=...`) so the
  // CLI joins the endpoint host. Fallback for old servers without /v1/videos:
  // the same /api/file? query form, which has been live since pre-Feature-3.
  const builtFallback =
    `/api/file?user=${encodeURIComponent(parsed.user_id ?? userId)}` +
    `&date=${encodeURIComponent(parsed.date ?? 'latest')}` +
    `&id=${encodeURIComponent(parsed.id ?? id)}` +
    `&ext=${encodeURIComponent(container)}`;
  const linkPath = parsed.link ?? builtFallback;
  const link = linkPath.startsWith('http')
    ? linkPath
    : `${args.endpoint}${linkPath.startsWith('/') ? '' : '/'}${linkPath}`;

  if (args.jsonOut) {
    print(
      JSON.stringify(
        {
          ok: true,
          id: parsed.id ?? id,
          user_id: parsed.user_id ?? userId,
          date: parsed.date ?? null,
          link,
          payload_size: size,
          payload_sha256: sha,
          container,
          file: basename(args.filePath),
        },
        null,
        2,
      ) + '\n',
    );
  } else {
    print(
      `Uploaded ${basename(args.filePath)} (${size} bytes, ${container})\n` +
        `  id:   ${parsed.id ?? id}\n` +
        `  link: ${link}\n`,
    );
  }
  return { exitCode: 0 };
}

export const VIDEO_HELP =
  'Usage:\n' +
  '  teamagent video upload <file> [--endpoint <url>] [--label <l>] [--user-id <id>] [--json]\n' +
  '\n' +
  'Upload a screen video file to centralized storage and print a shareable link.\n' +
  'Accepted containers: mov, mp4, webm, mkv (case-insensitive).\n' +
  '\n' +
  'Endpoint resolution order:\n' +
  '  1. --endpoint <url>\n' +
  '  2. TEAMAGENT_VIDEO_ENDPOINT env var\n' +
  '  3. http://127.0.0.1:8787 (default — start `pnpm teamagent digital-twin start`)\n' +
  '\n' +
  'Recording the video itself is out of scope for this command; see\n' +
  'docs/features/video-record-upload.md for one-line capture commands per OS\n' +
  '(macOS `screencapture -v`, Linux `ffmpeg -f x11grab`, Windows `ffmpeg -f gdigrab`).\n';
