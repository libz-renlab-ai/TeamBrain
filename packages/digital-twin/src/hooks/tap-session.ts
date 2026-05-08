import { existsSync, copyFileSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir as osHomedir, platform as osPlatform, arch as osArch, hostname } from 'node:os';
import { spawn as nodeSpawn } from 'node:child_process';
import type { SpawnOptions, ChildProcess } from 'node:child_process';
import { ulid as defaultUlid } from 'ulid';
import { digitalTwinPaths } from '../paths.js';

export interface TapSessionInput {
  cwd: string;
  sessionId: string;
}

export interface TapSessionDeps {
  homedir?: () => string;
  daemonBin?: string | null;
  spawn?: (
    cmd: string,
    args: readonly string[],
    opts: SpawnOptions,
  ) => Pick<ChildProcess, 'unref' | 'on'>;
  ulid?: () => string;
  now?: () => Date;
  teamagentVersion?: string;
  platform?: NodeJS.Platform;
  arch?: string;
  hostname?: string;
  nodeBin?: string;
}

export type TapSessionStatus = 'tapped' | 'no-log' | 'error';

export interface TapSessionResult {
  status: TapSessionStatus;
  payloadPath?: string;
  metadataPath?: string;
  error?: string;
}

/**
 * Compute the Claude Code projects/<dir> name for a given cwd.
 *
 * Claude Code replaces `:`, `/`, `\` with `-` in the absolute cwd path.
 * Example: `C:\Users\foo\proj` -> `C--Users-foo-proj`.
 */
export function projectDirForCwd(cwd: string): string {
  return cwd.replace(/[:/\\]/g, '-');
}

/**
 * Compute the path to Claude Code's transcript JSONL for (cwd, sessionId).
 */
export function claudeTranscriptPath(home: string, cwd: string, sessionId: string): string {
  return join(home, '.claude', 'projects', projectDirForCwd(cwd), `${sessionId}.jsonl`);
}

/**
 * Tap the Claude Code Stop hook: copy the session transcript into the
 * digital-twin queue, write metadata, and best-effort spawn the uploader
 * daemon. Must be fast (< 50ms) and never throw — Stop hook cannot block.
 */
export function tapSession(
  input: TapSessionInput,
  deps: TapSessionDeps = {},
): TapSessionResult {
  try {
    const home = (deps.homedir ?? osHomedir)();
    const ulidFn = deps.ulid ?? defaultUlid;
    const now = deps.now ?? (() => new Date());
    const platform = deps.platform ?? osPlatform();
    const arch = deps.arch ?? osArch();
    const host = deps.hostname ?? hostname();

    const transcriptPath = claudeTranscriptPath(home, input.cwd, input.sessionId);
    if (!existsSync(transcriptPath)) {
      return { status: 'no-log' };
    }

    const paths = digitalTwinPaths(home);
    mkdirSync(paths.pendingDir, { recursive: true });

    const id = ulidFn();
    const payloadPath = join(paths.pendingDir, `${id}.payload`);
    const metadataPath = join(paths.pendingDir, `${id}.json`);

    copyFileSync(transcriptPath, payloadPath);

    let payloadSize = 0;
    try {
      payloadSize = statSync(payloadPath).size;
    } catch {
      // best-effort
    }

    const projectName = input.cwd.split(/[/\\]/).filter(Boolean).pop() ?? '';
    const metadata = {
      id,
      kind: 'cc-session' as const,
      session_id: input.sessionId,
      cwd: input.cwd,
      project_name: projectName,
      transcript_path: transcriptPath,
      payload_size: payloadSize,
      captured_at: now().toISOString(),
      source: 'stop-hook',
      host: { os: platform, arch, hostname: host },
      teamagent_version: deps.teamagentVersion ?? 'unknown',
      schema_version: 1 as const,
    };
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');

    // Best-effort spawn uploader daemon. PR-3 will provide the binary; in PR-2
    // it may not exist yet (silent fail acceptable — the queue file persists
    // for later daemon runs to pick up).
    if (deps.daemonBin && existsSync(deps.daemonBin)) {
      const spawnFn = deps.spawn ?? nodeSpawn;
      try {
        const nodeBin = deps.nodeBin ?? process.execPath;
        const child = spawnFn(nodeBin, [deps.daemonBin], {
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
          cwd: paths.digitalTwinDir,
        });
        child.on('error', () => {
          /* daemon spawn must never throw into the hook */
        });
        child.unref();
      } catch {
        // spawn failure must not block tap-session result
      }
    }

    return { status: 'tapped', payloadPath, metadataPath };
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : String(err) };
  }
}
