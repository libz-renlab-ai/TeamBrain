/**
 * Resolve the platform-specific ffmpeg input format + device for capturing
 * the local default audio source.
 *
 * - macOS: `avfoundation` `:0` (default audio input — typically the built-in mic)
 * - Windows: `dshow` `audio=virtual-audio-capturer` (or `audio=Microphone`)
 * - Linux: `pulse` `default`
 *
 * Callers can override the device string via `deviceArg` (e.g. ":1" for the
 * second avfoundation input, or `audio=Microphone` on Windows).
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
        device: opts.deviceArg ?? 'audio=virtual-audio-capturer',
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
