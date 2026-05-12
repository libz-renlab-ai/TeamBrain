import {
  existsSync,
  copyFileSync,
  mkdirSync,
  writeFileSync,
  statSync,
  openSync,
  closeSync,
} from 'node:fs';
import { join } from 'node:path';
import { homedir as osHomedir, platform as osPlatform, arch as osArch, hostname } from 'node:os';
import { spawn as nodeSpawn } from 'node:child_process';
import type { SpawnOptions, ChildProcess } from 'node:child_process';
import { ulid as defaultUlid } from 'ulid';
import { digitalTwinPaths } from '../paths.js';
import { MAX_PAYLOAD_BYTES } from '../limits.js';
import type { CcSessionQuotaBlock, CcSessionMetadata } from '../schemas/cc-session.js';

export interface TapSessionInput {
  cwd: string;
  sessionId: string;
  /**
   * Issue #283 — optional Max-tier quota snapshot to persist on this
   * entry's metadata.json. Passed through to the wire envelope by the
   * uploader's defaultBuildEnvelope. Absent on Stop-hook taps; present
   * on hourly scan taps.
   */
  quota?: CcSessionQuotaBlock;
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
  /** Issue #266 F8 — override the size cap for tests. Defaults to MAX_PAYLOAD_BYTES. */
  maxPayloadBytes?: number;
}

/**
 * Issue #266 F8 — `'too-large'` is a distinct status (kept out of `'error'`)
 * so the bin-digital-twin-tap caller can emit a clean "oversize transcript
 * skipped" diagnostic instead of a generic exception text.
 */
export type TapSessionStatus = 'tapped' | 'no-log' | 'too-large' | 'error';

export interface TapSessionResult {
  status: TapSessionStatus;
  payloadPath?: string;
  metadataPath?: string;
  /** Size in bytes of the source transcript that was rejected (when status = 'too-large'). */
  payload_size?: number;
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

    // Issue #266 F8: size-check the source transcript before we copy it
    // into the queue, so an accidentally huge `.jsonl` never gets read into
    // RAM downstream.
    let sourceSize = 0;
    try {
      sourceSize = statSync(transcriptPath).size;
    } catch {
      // best-effort: if stat fails we still attempt the copy; downstream
      // size-check on the queue file will catch it.
    }
    const sizeCap = deps.maxPayloadBytes ?? MAX_PAYLOAD_BYTES;
    if (sourceSize > sizeCap) {
      return { status: 'too-large', payload_size: sourceSize };
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
    const metadata: CcSessionMetadata = {
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
      // Issue #283: forward quota only when caller provided one — keeps the
      // field absent from the JSON on pre-#283 Stop taps (no JSON churn).
      ...(input.quota ? { quota: input.quota } : {}),
    };
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');

    // Best-effort spawn uploader daemon. The caller (bin-digital-twin-tap.ts)
    // is responsible for resolving + self-installing the binary; we only
    // spawn what was passed in. Spawn failure is silent — the queue file
    // persists for later daemon runs to pick up.
    //
    // Issue #368: capture the daemon's stdout+stderr into uploader.log instead
    // of `stdio: 'ignore'`, so a `MODULE_NOT_FOUND` / auth-failure / crash is
    // recorded (visible via `teamagent digital-twin status` / `teamagent
    // doctor`) rather than swallowed. If the log can't be opened we fall back
    // to `'ignore'` — the daemon must still spawn.
    if (deps.daemonBin && existsSync(deps.daemonBin)) {
      const spawnFn = deps.spawn ?? nodeSpawn;
      let logFd: number | undefined;
      try {
        const logPath = paths.uploaderLogFile;
        // Single-file rotation-by-truncation: the tap fires once per Stop, so
        // an append-only log would grow unbounded over a machine's lifetime.
        try {
          if (existsSync(logPath) && statSync(logPath).size > 1_000_000) {
            writeFileSync(logPath, '', 'utf-8');
          }
        } catch {
          /* best-effort cap; ignore */
        }
        logFd = openSync(logPath, 'a');
      } catch {
        logFd = undefined;
      }
      const stdio: 'ignore' | ['ignore', number, number] =
        logFd === undefined ? 'ignore' : ['ignore', logFd, logFd];
      try {
        const nodeBin = deps.nodeBin ?? process.execPath;
        const child = spawnFn(nodeBin, [deps.daemonBin], {
          detached: true,
          stdio,
          windowsHide: true,
          cwd: paths.digitalTwinDir,
        });
        child.on('error', () => {
          /* daemon spawn must never throw into the hook */
        });
        child.unref();
      } catch {
        // spawn failure must not block tap-session result
      } finally {
        // The child has its own dup'd handle on the log fd; close the parent's.
        if (logFd !== undefined) {
          try {
            closeSync(logFd);
          } catch {
            /* already closed / never opened */
          }
        }
      }
    }

    return { status: 'tapped', payloadPath, metadataPath };
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : String(err) };
  }
}
