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
