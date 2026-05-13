import { spawnSync as nodeSpawnSync } from 'node:child_process';

/**
 * Resolve the platform-specific ffmpeg input format + device for capturing
 * the local default audio source.
 *
 * - macOS: `avfoundation` `:0` (default audio input — typically the built-in mic)
 * - Windows: `dshow` `audio=Microphone` (first DirectShow microphone device)
 * - Linux: `pulse` `default`
 *
 * Issue #297: Windows previously defaulted to `audio=virtual-audio-capturer`
 * (a third-party loopback filter from `rdp/virtual-audio-capturer` that ships
 * separately). That captured the speaker mix, not the user's voice, and silently
 * failed on stock Windows 11 boxes without the filter installed. The new default
 * targets the built-in microphone, matching macOS/Linux behavior. Users with
 * different device names should run `teamagent record devices` to list available
 * audio inputs and pass `--device "audio=<name>"` to `record start`.
 *
 * Callers can override the device string via `deviceArg` (e.g. ":1" for the
 * second avfoundation input, or `audio=Stereo Mix` on Windows for loopback).
 */
export interface PlatformInput {
  format: string;
  device: string;
}

export interface ResolvePlatformInputOptions {
  platform: NodeJS.Platform;
  deviceArg?: string;
}

export function resolvePlatformInput(opts: ResolvePlatformInputOptions): PlatformInput {
  switch (opts.platform) {
    case 'darwin':
      return { format: 'avfoundation', device: opts.deviceArg ?? ':0' };
    case 'win32':
      return {
        format: 'dshow',
        device: opts.deviceArg ?? 'audio=Microphone',
      };
    case 'linux':
      return { format: 'pulse', device: opts.deviceArg ?? 'default' };
    default:
      throw new Error(
        `unsupported platform for ffmpeg recorder: ${opts.platform}. ` +
          `supported: darwin, win32, linux`,
      );
  }
}

/**
 * Issue #297: the ffmpeg argv for listing platform audio input devices.
 *
 * `ffmpeg -list_devices true -f dshow -i dummy` (Windows) writes the device
 * table to **stderr** and exits non-zero by design — the call "fails" but the
 * payload arrives correctly. Same shape on macOS via `-f avfoundation
 * -list_devices true`. Linux PulseAudio prefers `-sources pulse`.
 *
 * Exported as a pure function so callers / tests can assert the argv shape
 * without needing a real ffmpeg binary.
 */
export function listAudioDevicesArgs(platform: NodeJS.Platform): readonly string[] {
  switch (platform) {
    case 'darwin':
      return ['-f', 'avfoundation', '-list_devices', 'true', '-i', ''];
    case 'win32':
      return ['-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'];
    case 'linux':
      return ['-sources', 'pulse'];
    default:
      throw new Error(
        `unsupported platform for audio device listing: ${platform}. ` +
          `supported: darwin, win32, linux`,
      );
  }
}

export interface ListAudioDevicesSpawnSync {
  (cmd: string, args: readonly string[]): {
    status: number | null;
    stderr: Buffer | string | null;
    stdout: Buffer | string | null;
  };
}

export interface ListAudioDevicesOptions {
  platform: NodeJS.Platform;
  /** DI hook for tests; defaults to node:child_process spawnSync. */
  spawnSync?: ListAudioDevicesSpawnSync;
}

export interface ListAudioDevicesResult {
  /** Raw stderr-or-stdout output suitable for printing verbatim. */
  raw: string;
  /** The exit code ffmpeg returned (non-zero is normal for -list_devices). */
  exitCode: number | null;
  /** Argv actually executed (re-export of listAudioDevicesArgs result). */
  argv: readonly string[];
}

function bufToString(b: Buffer | string | null): string {
  if (!b) return '';
  if (typeof b === 'string') return b;
  return b.toString('utf-8');
}

export function listAudioDevices(opts: ListAudioDevicesOptions): ListAudioDevicesResult {
  const argv = listAudioDevicesArgs(opts.platform);
  const spawn = opts.spawnSync ?? defaultListAudioDevicesSpawnSync;
  const res = spawn('ffmpeg', argv);
  const stderr = bufToString(res.stderr);
  const stdout = bufToString(res.stdout);
  return { raw: stderr || stdout, exitCode: res.status, argv };
}

function defaultListAudioDevicesSpawnSync(
  cmd: string,
  args: readonly string[],
): ReturnType<ListAudioDevicesSpawnSync> {
  const r = nodeSpawnSync(cmd, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  return { status: r.status, stderr: r.stderr, stdout: r.stdout };
}

export function installHintForPlatform(platform: NodeJS.Platform): string {
  switch (platform) {
    case 'darwin':
      return 'install ffmpeg with: brew install ffmpeg';
    case 'win32':
      return 'install ffmpeg from https://ffmpeg.org/download.html or run: scoop install ffmpeg';
    case 'linux':
      return 'install ffmpeg with: apt-get install ffmpeg (Debian/Ubuntu) or dnf install ffmpeg (Fedora/RHEL)';
    default:
      return 'install ffmpeg from https://ffmpeg.org/download.html';
  }
}
