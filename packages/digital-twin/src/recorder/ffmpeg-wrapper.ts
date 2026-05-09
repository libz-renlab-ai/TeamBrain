/**
 * ffmpeg-wrapper: start / stop / importRecording API for capturing local audio
 * to Opus/OGG via ffmpeg.
 *
 * Heavy DI: spawn, spawnSync, fs ops, ffmpeg-version detection, time, ulid,
 * homedir, platform — all injectable so tests don't need a real ffmpeg binary.
 *
 * NOTE on routing: as of PR-4, recordings are NOT pushed to the daemon's
 * pending/ queue. PR-3's daemon `loadEntry` only knows the cc-session schema
 * and would dead-letter any recording entry. Recordings instead live in
 * `~/.teamagent/digital-twin/queue/recording_temp/` until a follow-up PR wires
 * them into the daemon + uploads via `POST /v1/recordings`.
 *
 * NOTE on Windows graceful stop: `process.kill(pid, 'SIGTERM')` on Windows
 * maps to `TerminateProcess`, which does not let ffmpeg flush its OGG
 * container. We accept a slightly truncated tail; ffmpeg pre-writes the
 * container header so the file remains playable. macOS / Linux get clean
 * SIGTERM flushing.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  spawn as nodeSpawn,
  spawnSync as nodeSpawnSync,
} from 'node:child_process';
import type {
  ChildProcess,
  SpawnOptions,
  SpawnSyncOptions,
  SpawnSyncReturns,
} from 'node:child_process';
import {
  homedir as osHomedir,
  platform as osPlatform,
  arch as osArch,
  hostname as osHostname,
} from 'node:os';
import { ulid as defaultUlid } from 'ulid';
import { digitalTwinPaths } from '../paths.js';
import {
  RECORDING_CODEC_DEFAULTS,
  type RecordingMetadata,
} from '../schemas/recording.js';
import {
  resolvePlatformInput,
  installHintForPlatform,
} from './platform-input.js';

/**
 * ffmpeg argv fragments that lock in opus 24kbps / 16kHz / mono output.
 * Re-exported via index.ts so callers/tests can assert on the shape.
 */
export const RECORDING_CODEC_FLAGS: readonly string[] = Object.freeze([
  '-vn',
  '-c:a',
  'libopus',
  '-b:a',
  '24k',
  '-ar',
  '16000',
  '-ac',
  '1',
]);

export type FfmpegProbe =
  | { available: true; version: string }
  | { available: false };

type ChildLike = Pick<ChildProcess, 'unref' | 'on'> & { pid?: number };

type SpawnFn = (
  cmd: string,
  args: readonly string[],
  opts: SpawnOptions,
) => ChildLike;

type SpawnSyncFn = (
  cmd: string,
  args: readonly string[],
  opts?: SpawnSyncOptions,
) => Pick<SpawnSyncReturns<Buffer>, 'status' | 'stderr'>;

type KillFn = (pid: number, signal?: NodeJS.Signals | number) => boolean;
type IsAliveFn = (pid: number) => boolean;
type SleepFn = (ms: number) => Promise<void>;

export interface StartInput {
  id: string;
  output: string; // basename without `.ogg`; we append `.ogg`, `.pid`, `.start.json`
  deviceArg?: string;
}

export interface StartDeps {
  detectFfmpeg?: () => FfmpegProbe;
  spawn?: SpawnFn;
  platform?: NodeJS.Platform;
  now?: () => Date;
}

export interface StartResult {
  id: string;
  pid: number;
  output: string; // resolved OGG path
}

export interface StopInput {
  id: string;
  output: string;
}

export interface StopDeps {
  kill?: KillFn;
  spawn?: SpawnFn;
  isAlive?: IsAliveFn;
  sleep?: SleepFn;
  now?: () => Date;
  homedir?: () => string;
  ulid?: () => string;
  platform?: NodeJS.Platform;
  arch?: string;
  hostname?: string;
  teamagentVersion?: string;
  maxWaitMs?: number;
  pollIntervalMs?: number;
}

export type StopStatus = 'stopped' | 'timeout' | 'no-pid' | 'error';

export interface StopResult {
  status: StopStatus;
  payloadPath?: string;
  metadataPath?: string;
  error?: string;
}

export interface ImportInput {
  inputPath: string;
  output: string;
}

export interface ImportDeps {
  detectFfmpeg?: () => FfmpegProbe;
  spawnSync?: SpawnSyncFn;
  now?: () => Date;
  homedir?: () => string;
  ulid?: () => string;
  platform?: NodeJS.Platform;
  arch?: string;
  hostname?: string;
  teamagentVersion?: string;
}

export type ImportStatus = 'imported' | 'failed';

export interface ImportResult {
  status: ImportStatus;
  payloadPath?: string;
  metadataPath?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Default ffmpeg version detection (cached). Tests inject their own.
// ---------------------------------------------------------------------------

let cachedProbe: FfmpegProbe | null = null;

export function detectFfmpegDefault(): FfmpegProbe {
  if (cachedProbe) return cachedProbe;
  try {
    const r = nodeSpawnSync('ffmpeg', ['-version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (r.status === 0 && r.stdout) {
      const out = r.stdout.toString('utf-8');
      const m = /ffmpeg version (\S+)/.exec(out);
      cachedProbe = { available: true, version: m?.[1] ?? 'unknown' };
      return cachedProbe;
    }
  } catch {
    // fall through
  }
  cachedProbe = { available: false };
  return cachedProbe;
}

function ensureFfmpegOrThrow(probe: FfmpegProbe, platform: NodeJS.Platform): void {
  if (probe.available) return;
  throw new Error(
    `ffmpeg not found on PATH. ${installHintForPlatform(platform)}`,
  );
}

// ---------------------------------------------------------------------------
// start()
// ---------------------------------------------------------------------------

export function start(input: StartInput, deps: StartDeps = {}): StartResult {
  const platform = deps.platform ?? osPlatform();
  const detect = deps.detectFfmpeg ?? detectFfmpegDefault;
  const spawnFn: SpawnFn = deps.spawn ?? (nodeSpawn as unknown as SpawnFn);
  const now = deps.now ?? (() => new Date());

  const probe = detect();
  ensureFfmpegOrThrow(probe, platform);

  const inputDevice = resolvePlatformInput({ platform, deviceArg: input.deviceArg });
  const oggPath = `${input.output}.ogg`;

  const args: string[] = [
    '-y',
    '-f',
    inputDevice.format,
    '-i',
    inputDevice.device,
    ...RECORDING_CODEC_FLAGS,
    oggPath,
  ];

  const child = spawnFn('ffmpeg', args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });

  const pid = child.pid;
  if (typeof pid !== 'number') {
    throw new Error('failed to spawn ffmpeg: no pid returned');
  }

  // Best-effort: don't let the parent process hang on the child.
  try {
    child.unref();
  } catch {
    /* ignore */
  }
  try {
    child.on('error', () => {
      /* swallow async spawn errors; nothing actionable in caller */
    });
  } catch {
    /* ignore */
  }

  // Write pid sidecar + start metadata sidecar so stop() can finalize.
  writeFileSync(`${input.output}.pid`, String(pid), 'utf-8');
  writeFileSync(
    `${input.output}.start.json`,
    JSON.stringify({ id: input.id, started_at: now().toISOString() }),
    'utf-8',
  );

  return { id: input.id, pid, output: oggPath };
}

// ---------------------------------------------------------------------------
// stop()
// ---------------------------------------------------------------------------

const DEFAULT_MAX_WAIT_MS = 10_000;
const DEFAULT_POLL_INTERVAL_MS = 100;

function defaultIsAlive(pid: number): boolean {
  try {
    // Signal 0 doesn't kill — it just probes.
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function defaultKill(pid: number, signal?: NodeJS.Signals | number): boolean {
  return process.kill(pid, signal ?? 'SIGTERM');
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

export async function stop(
  input: StopInput,
  deps: StopDeps = {},
): Promise<StopResult> {
  const platform = deps.platform ?? osPlatform();
  const home = (deps.homedir ?? osHomedir)();
  const ulidFn = deps.ulid ?? defaultUlid;
  const now = deps.now ?? (() => new Date());
  const arch = deps.arch ?? osArch();
  const host = deps.hostname ?? osHostname();
  const isAlive = deps.isAlive ?? defaultIsAlive;
  const kill = deps.kill ?? defaultKill;
  const sleep = deps.sleep ?? defaultSleep;
  const spawnFn: SpawnFn = deps.spawn ?? (nodeSpawn as unknown as SpawnFn);
  const maxWaitMs = deps.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  const pidFile = `${input.output}.pid`;
  const startMetaFile = `${input.output}.start.json`;
  const oggPath = `${input.output}.ogg`;

  if (!existsSync(pidFile)) {
    return { status: 'no-pid' };
  }

  const pidStr = readFileSync(pidFile, 'utf-8').trim();
  const pid = Number(pidStr);
  if (!Number.isFinite(pid) || pid <= 0) {
    return { status: 'error', error: `invalid pid in ${pidFile}: ${pidStr}` };
  }

  // Send SIGTERM. On Windows process.kill maps to TerminateProcess; if it
  // fails (e.g. EPERM), fall back to spawning `taskkill /PID <pid> /F`.
  try {
    kill(pid, 'SIGTERM');
  } catch (err) {
    if (platform === 'win32') {
      try {
        const child = spawnFn('taskkill', ['/PID', String(pid), '/F'], {
          stdio: 'ignore',
          windowsHide: true,
        });
        try {
          child.unref();
        } catch {
          /* ignore */
        }
      } catch (spawnErr) {
        return {
          status: 'error',
          error: `failed to kill pid ${pid}: ${(spawnErr as Error).message ?? String(spawnErr)}`,
        };
      }
    } else {
      return {
        status: 'error',
        error: `failed to kill pid ${pid}: ${(err as Error).message ?? String(err)}`,
      };
    }
  }

  // Poll for ffmpeg to flush + exit.
  const deadline = Date.now() + maxWaitMs;
  let alive = isAlive(pid);
  while (alive && Date.now() < deadline) {
    await sleep(pollIntervalMs);
    alive = isAlive(pid);
  }
  if (alive) {
    return { status: 'timeout' };
  }

  // Read started_at from the start metadata sidecar.
  let startedAt = now().toISOString();
  let recId = input.id;
  try {
    const sm = JSON.parse(readFileSync(startMetaFile, 'utf-8')) as {
      id?: string;
      started_at?: string;
    };
    if (typeof sm.started_at === 'string') startedAt = sm.started_at;
    if (typeof sm.id === 'string') recId = sm.id;
  } catch {
    // best-effort
  }

  if (!existsSync(oggPath)) {
    cleanupTempFiles(pidFile, startMetaFile);
    return { status: 'error', error: `ffmpeg did not produce output: ${oggPath}` };
  }

  const endedAtDate = now();
  const endedAt = endedAtDate.toISOString();
  const startedAtMs = Date.parse(startedAt);
  const duration = Number.isFinite(startedAtMs)
    ? Math.max(0, endedAtDate.getTime() - startedAtMs)
    : 0;

  const paths = digitalTwinPaths(home);
  mkdirSync(paths.recordingTempDir, { recursive: true });

  const newId = ulidFn();
  const payloadPath = join(paths.recordingTempDir, `${newId}.payload`);
  const metadataPath = join(paths.recordingTempDir, `${newId}.json`);

  let payloadSize = 0;
  try {
    payloadSize = statSync(oggPath).size;
  } catch {
    /* keep 0 */
  }

  // Move OGG into recording_temp.
  try {
    renameSync(oggPath, payloadPath);
  } catch {
    // Cross-device rename can fail on some FS; fall back to copy + unlink.
    try {
      const buf = readFileSync(oggPath);
      writeFileSync(payloadPath, buf);
      unlinkSync(oggPath);
    } catch (copyErr) {
      cleanupTempFiles(pidFile, startMetaFile);
      return {
        status: 'error',
        error: `failed to move OGG into recording_temp: ${(copyErr as Error).message ?? String(copyErr)}`,
      };
    }
  }

  const metadata: RecordingMetadata = {
    id: newId,
    kind: 'recording',
    started_at: startedAt,
    ended_at: endedAt,
    duration_ms: duration,
    codec: RECORDING_CODEC_DEFAULTS.codec,
    bitrate: RECORDING_CODEC_DEFAULTS.bitrate,
    sample_rate: RECORDING_CODEC_DEFAULTS.sample_rate,
    channels: RECORDING_CODEC_DEFAULTS.channels,
    container: RECORDING_CODEC_DEFAULTS.container,
    payload_size: payloadSize,
    source: 'recorder',
    host: { os: platform, arch, hostname: host },
    teamagent_version: deps.teamagentVersion ?? 'unknown',
    schema_version: 1,
  };
  // Embed the caller's transient id (recId) for traceability in audit logs.
  const metaWithCorrelation = { ...metadata, correlation_id: recId };
  writeFileSync(metadataPath, JSON.stringify(metaWithCorrelation, null, 2), 'utf-8');

  cleanupTempFiles(pidFile, startMetaFile);

  return { status: 'stopped', payloadPath, metadataPath };
}

function cleanupTempFiles(...files: string[]): void {
  for (const f of files) {
    try {
      if (existsSync(f)) unlinkSync(f);
    } catch {
      /* best-effort */
    }
  }
}

// ---------------------------------------------------------------------------
// importRecording()
// ---------------------------------------------------------------------------

export function importRecording(
  input: ImportInput,
  deps: ImportDeps = {},
): ImportResult {
  const platform = deps.platform ?? osPlatform();
  const detect = deps.detectFfmpeg ?? detectFfmpegDefault;
  const probe = detect();
  ensureFfmpegOrThrow(probe, platform);

  const spawnSyncFn: SpawnSyncFn =
    deps.spawnSync ?? (nodeSpawnSync as unknown as SpawnSyncFn);
  const home = (deps.homedir ?? osHomedir)();
  const ulidFn = deps.ulid ?? defaultUlid;
  const now = deps.now ?? (() => new Date());
  const arch = deps.arch ?? osArch();
  const host = deps.hostname ?? osHostname();

  const oggPath = `${input.output}.ogg`;
  const args: string[] = [
    '-y',
    '-i',
    input.inputPath,
    ...RECORDING_CODEC_FLAGS,
    oggPath,
  ];

  const r = spawnSyncFn('ffmpeg', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  if (r.status !== 0) {
    const stderr = r.stderr ? r.stderr.toString('utf-8') : '';
    return {
      status: 'failed',
      error: stderr.trim() || `ffmpeg exited with status ${r.status}`,
    };
  }

  if (!existsSync(oggPath)) {
    return {
      status: 'failed',
      error: `ffmpeg reported success but output missing: ${oggPath}`,
    };
  }

  const paths = digitalTwinPaths(home);
  mkdirSync(paths.recordingTempDir, { recursive: true });

  const id = ulidFn();
  const payloadPath = join(paths.recordingTempDir, `${id}.payload`);
  const metadataPath = join(paths.recordingTempDir, `${id}.json`);

  let payloadSize = 0;
  try {
    payloadSize = statSync(oggPath).size;
  } catch {
    /* keep 0 */
  }

  try {
    renameSync(oggPath, payloadPath);
  } catch {
    try {
      const buf = readFileSync(oggPath);
      writeFileSync(payloadPath, buf);
      unlinkSync(oggPath);
    } catch (copyErr) {
      return {
        status: 'failed',
        error: `failed to move imported OGG: ${(copyErr as Error).message ?? String(copyErr)}`,
      };
    }
  }

  const nowDate = now();
  const metadata: RecordingMetadata = {
    id,
    kind: 'recording',
    started_at: nowDate.toISOString(),
    ended_at: nowDate.toISOString(),
    duration_ms: 0,
    codec: RECORDING_CODEC_DEFAULTS.codec,
    bitrate: RECORDING_CODEC_DEFAULTS.bitrate,
    sample_rate: RECORDING_CODEC_DEFAULTS.sample_rate,
    channels: RECORDING_CODEC_DEFAULTS.channels,
    container: RECORDING_CODEC_DEFAULTS.container,
    payload_size: payloadSize,
    source: 'import',
    host: { os: platform, arch, hostname: host },
    teamagent_version: deps.teamagentVersion ?? 'unknown',
    schema_version: 1,
  };
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');

  return { status: 'imported', payloadPath, metadataPath };
}
