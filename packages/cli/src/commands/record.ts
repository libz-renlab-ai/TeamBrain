/**
 * `teamagent record <subcommand>` handlers.
 *
 * 3 subcommands:
 *   - start [--id <id>]              spawn ffmpeg detached, write pid sidecar to queue/recording_temp/
 *   - stop  [--id <id>]              SIGTERM the ffmpeg process, finalize ogg + metadata to queue/pending/
 *   - import <file> [--label <l>]    transcode an arbitrary file to Opus/OGG and drop into queue/pending/
 *
 * Wires through to the ffmpeg-wrapper shipped in PR-4. Dependency injection keeps
 * tests deterministic (homedir, ulid, ffmpeg probe, spawn fns).
 */
import { mkdirSync, readdirSync } from 'node:fs';
import { homedir as osHomedir } from 'node:os';
import { join } from 'node:path';
import { ulid as defaultUlid } from 'ulid';
import {
  digitalTwinPaths,
  start as ffmpegStart,
  stop as ffmpegStop,
  importRecording as ffmpegImport,
  detectFfmpegDefault,
  listAudioDevices as defaultListAudioDevices,
  installHintForPlatform,
  type FfmpegProbe,
  type StartDeps,
  type StopDeps,
  type ImportDeps,
  type StartResult,
  type StopResult,
  type ImportResult,
  type ListAudioDevicesOptions,
  type ListAudioDevicesResult,
} from '@teamagent/digital-twin';

export type RecordSubcommand = 'start' | 'stop' | 'import' | 'devices';

export interface RecordParsedArgs {
  sub: RecordSubcommand;
  id?: string;
  filePath?: string;
  label?: string;
  /**
   * Override the platform-default audio device, e.g. `audio=Microphone` on
   * Windows DirectShow or `:1` for the second avfoundation input on macOS.
   * See `resolvePlatformInput` for the exact mapping. Issue #297.
   */
  device?: string;
}

export interface RecordDeps {
  homedir?: () => string;
  ulid?: () => string;
  print?: (msg: string) => void;
  printErr?: (msg: string) => void;
  /** Inject ffmpeg-wrapper for tests. */
  ffmpegStart?: typeof ffmpegStart;
  ffmpegStop?: typeof ffmpegStop;
  ffmpegImport?: typeof ffmpegImport;
  detectFfmpeg?: () => FfmpegProbe;
  startDeps?: StartDeps;
  stopDeps?: StopDeps;
  importDeps?: ImportDeps;
  /** Override directory listing for tests (used to find latest recording when no --id). */
  listRecordingTemp?: (dir: string) => string[];
  /** Issue #297: override platform-input listAudioDevices for tests. */
  listAudioDevices?: (opts: ListAudioDevicesOptions) => ListAudioDevicesResult;
  /** Issue #297: override platform detection for tests. */
  platform?: NodeJS.Platform;
}

export interface RecordResult {
  exitCode: number;
}

export class RecordArgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecordArgError';
  }
}

export function parseRecordArgs(rest: string[]): RecordParsedArgs {
  const sub = rest[0];
  if (!sub) {
    throw new RecordArgError(
      // Issue #296: distinguish from `teamagent recording` (Recording Memory).
      "Usage: teamagent record <start|stop|import|devices> [args]\n" +
        "  'teamagent record' is the digital-twin audio recorder.\n" +
        "  For transcript JSON ingestion, use 'teamagent recording'.",
    );
  }
  switch (sub) {
    case 'start':
    case 'stop': {
      const result: RecordParsedArgs = { sub };
      for (let i = 1; i < rest.length; i++) {
        const a = rest[i]!;
        if (a === '--id' && rest[i + 1]) {
          result.id = rest[++i];
        } else if (a.startsWith('--id=')) {
          result.id = a.slice('--id='.length);
        } else if (a === '--label' && rest[i + 1]) {
          result.label = rest[++i];
        } else if (a.startsWith('--label=')) {
          result.label = a.slice('--label='.length);
        } else if (a === '--device' && rest[i + 1]) {
          result.device = rest[++i];
        } else if (a.startsWith('--device=')) {
          result.device = a.slice('--device='.length);
        }
      }
      return result;
    }
    case 'import': {
      const file = rest[1];
      if (!file) {
        // Issue #310: audio may be recorded off-device (phone / external recorder) and
        // imported later — discoverability fix, mention the off-device path inline so
        // the user does not need to read docs to discover it.
        throw new RecordArgError(
          'Usage: teamagent record import <file> [--label <l>]\n' +
            '  <file> may be any audio file ffmpeg accepts (m4a / wav / mp3 / ogg / opus / flac).\n' +
            '  Common recipe: record on phone (voice memo / phone recorder), transfer to laptop,\n' +
            '  then `teamagent record import <file>` — no need to open the laptop while recording.',
        );
      }
      // Issue #296: a transcript JSON file belongs to `teamagent recording`
      // (Recording Memory), not this audio recorder. Catch the wrong-tool
      // mistake at parse time with a redirect rather than letting ffmpeg
      // fail downstream with a cryptic "not a valid audio file".
      if (/\.json$/i.test(file)) {
        throw new RecordArgError(
          `record import takes an audio file, got a JSON file (${file}). ` +
            `Did you mean 'teamagent recording import --file ${file}'? ` +
            `'teamagent record' is the digital-twin audio recorder; ` +
            `'teamagent recording' is the Recording Memory subsystem. See 'teamagent recording --help'.`,
        );
      }
      const result: RecordParsedArgs = { sub: 'import', filePath: file };
      for (let i = 2; i < rest.length; i++) {
        const a = rest[i]!;
        if (a === '--label' && rest[i + 1]) {
          result.label = rest[++i];
        } else if (a.startsWith('--label=')) {
          result.label = a.slice('--label='.length);
        }
      }
      return result;
    }
    case 'devices': {
      // Issue #297: `teamagent record devices` prints platform-specific
      // ffmpeg audio-input listing so users can discover the exact device
      // name to pass via `--device`. No flags accepted.
      return { sub: 'devices' };
    }
    default:
      throw new RecordArgError(
        `Unknown record subcommand: ${sub}. Use one of start|stop|import|devices.`,
      );
  }
}

function defaultListRecordingTemp(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/**
 * When `record stop` is called without --id, pick the most-recently-modified
 * .pid sidecar in recording_temp/ and use its base name as the id.
 */
function findLatestRecordingId(
  recordingTempDir: string,
  list: (dir: string) => string[],
): string | null {
  const names = list(recordingTempDir);
  const pidFiles = names.filter((n) => n.endsWith('.pid'));
  if (pidFiles.length === 0) return null;
  // Names are ulid-prefixed, which sort lexicographically by time — pick last.
  pidFiles.sort();
  const last = pidFiles[pidFiles.length - 1]!;
  return last.slice(0, -'.pid'.length);
}

function resolveDeps(deps: RecordDeps) {
  return {
    homedir: deps.homedir ?? osHomedir,
    ulid: deps.ulid ?? defaultUlid,
    print: deps.print ?? ((m: string) => process.stdout.write(m + '\n')),
    printErr: deps.printErr ?? ((m: string) => process.stderr.write(m + '\n')),
    ffmpegStart: deps.ffmpegStart ?? ffmpegStart,
    ffmpegStop: deps.ffmpegStop ?? ffmpegStop,
    ffmpegImport: deps.ffmpegImport ?? ffmpegImport,
    detectFfmpeg: deps.detectFfmpeg ?? detectFfmpegDefault,
    startDeps: deps.startDeps ?? {},
    stopDeps: deps.stopDeps ?? {},
    importDeps: deps.importDeps ?? {},
    listRecordingTemp: deps.listRecordingTemp ?? defaultListRecordingTemp,
    listAudioDevices: deps.listAudioDevices ?? defaultListAudioDevices,
    platform: deps.platform ?? process.platform,
  };
}

export function executeRecordStart(
  parsed: RecordParsedArgs,
  deps: RecordDeps = {},
): RecordResult {
  const r = resolveDeps(deps);
  const paths = digitalTwinPaths(r.homedir());
  try {
    mkdirSync(paths.recordingTempDir, { recursive: true });
  } catch (err) {
    r.printErr(`record start: cannot create ${paths.recordingTempDir}: ${err instanceof Error ? err.message : String(err)}`);
    return { exitCode: 1 };
  }
  const id = parsed.id ?? r.ulid();
  const output = join(paths.recordingTempDir, id);
  try {
    const result: StartResult = r.ffmpegStart(
      { id, output, deviceArg: parsed.device },
      { detectFfmpeg: r.detectFfmpeg, ...r.startDeps },
    );
    r.print(
      `record: started id=${result.id} pid=${result.pid} output=${result.output}`,
    );
    return { exitCode: 0 };
  } catch (err) {
    r.printErr(
      `record start failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    // Issue #297: nudge users toward the discovery + escape-hatch surface.
    r.printErr(
      'hint: run `teamagent record devices` to list available audio devices, ' +
        'then pass `--device "<name>"` to override the platform default.',
    );
    return { exitCode: 1 };
  }
}

export async function executeRecordStop(
  parsed: RecordParsedArgs,
  deps: RecordDeps = {},
): Promise<RecordResult> {
  const r = resolveDeps(deps);
  const paths = digitalTwinPaths(r.homedir());
  const id =
    parsed.id ?? findLatestRecordingId(paths.recordingTempDir, r.listRecordingTemp);
  if (!id) {
    r.printErr(
      'record stop: no --id provided and no active recording found in queue/recording_temp/',
    );
    return { exitCode: 1 };
  }
  const output = join(paths.recordingTempDir, id);
  try {
    const result: StopResult = await r.ffmpegStop({ id, output }, r.stopDeps);
    if (result.status === 'stopped') {
      r.print(
        `record: stopped id=${id} payload=${result.payloadPath ?? '(unknown)'}`,
      );
      return { exitCode: 0 };
    }
    r.printErr(
      `record stop: status=${result.status}${result.error ? ` error=${result.error}` : ''}`,
    );
    return { exitCode: 1 };
  } catch (err) {
    r.printErr(
      `record stop failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { exitCode: 1 };
  }
}

export async function executeRecordImport(
  parsed: RecordParsedArgs,
  deps: RecordDeps = {},
): Promise<RecordResult> {
  const r = resolveDeps(deps);
  if (!parsed.filePath) {
    r.printErr('record import: missing <file> argument');
    return { exitCode: 1 };
  }
  const paths = digitalTwinPaths(r.homedir());
  try {
    mkdirSync(paths.pendingDir, { recursive: true });
  } catch (err) {
    r.printErr(`record import: cannot create ${paths.pendingDir}: ${err instanceof Error ? err.message : String(err)}`);
    return { exitCode: 1 };
  }
  const id = r.ulid();
  const output = join(paths.pendingDir, id);
  try {
    const result: ImportResult = r.ffmpegImport(
      { inputPath: parsed.filePath, output },
      { detectFfmpeg: r.detectFfmpeg, ...r.importDeps },
    );
    if (result.status === 'imported') {
      r.print(
        `record: imported ${parsed.filePath} -> ${result.payloadPath ?? '(unknown)'}`,
      );
      return { exitCode: 0 };
    }
    r.printErr(
      `record import: status=${result.status}${result.error ? ` error=${result.error}` : ''}`,
    );
    return { exitCode: 1 };
  } catch (err) {
    r.printErr(
      `record import failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { exitCode: 1 };
  }
}

/**
 * Issue #297: `teamagent record devices` lists platform-specific audio input
 * devices via ffmpeg, so users discover the exact name to pass to `--device`.
 *
 * ffmpeg `-list_devices true` typically exits non-zero by design (it can't
 * actually open the synthetic input), but writes the device table to stderr;
 * we treat ANY captured output (stderr or stdout) as success. Only a full
 * failure to spawn ffmpeg, or completely empty output, surfaces as exit 1.
 */
export function executeRecordDevices(
  parsed: RecordParsedArgs,
  deps: RecordDeps = {},
): RecordResult {
  const r = resolveDeps(deps);
  if (parsed.sub !== 'devices') {
    r.printErr(`record devices: unexpected subcommand: ${parsed.sub}`);
    return { exitCode: 1 };
  }
  const probe = r.detectFfmpeg();
  if (!probe.available) {
    r.printErr(
      `ffmpeg not found on PATH. ${installHintForPlatform(r.platform)}`,
    );
    return { exitCode: 1 };
  }
  try {
    const result = r.listAudioDevices({ platform: r.platform });
    const trimmed = result.raw.trimEnd();
    if (!trimmed) {
      r.printErr(
        `record devices: ffmpeg produced no output (argv: ffmpeg ${result.argv.join(' ')}). ` +
          `Try running the command manually to see what went wrong.`,
      );
      return { exitCode: 1 };
    }
    r.print(`# audio devices (ffmpeg ${result.argv.join(' ')})`);
    r.print(trimmed);
    const example =
      r.platform === 'win32'
        ? '--device "audio=<exact-name>"'
        : r.platform === 'darwin'
          ? '--device ":<index>"'
          : '--device "<source-name>"';
    r.print(
      `\nPass an exact device to \`teamagent record start ${example}\`. ` +
        'Issue #297 for context.',
    );
    return { exitCode: 0 };
  } catch (err) {
    r.printErr(
      `record devices failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { exitCode: 1 };
  }
}

/** Top-level dispatcher used by bin.ts. */
export async function executeRecord(
  parsed: RecordParsedArgs,
  deps: RecordDeps = {},
): Promise<RecordResult> {
  switch (parsed.sub) {
    case 'start':
      return executeRecordStart(parsed, deps);
    case 'stop':
      return executeRecordStop(parsed, deps);
    case 'import':
      return executeRecordImport(parsed, deps);
    case 'devices':
      return executeRecordDevices(parsed, deps);
  }
}
