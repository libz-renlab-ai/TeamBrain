import { homedir } from 'node:os';
import { join } from 'node:path';

export interface DigitalTwinPaths {
  teamagentDir: string;
  digitalTwinDir: string;
  configFile: string;
  machineIdFile: string;
  queueDir: string;
  pendingDir: string;
  deadLetterDir: string;
  recordingTempDir: string;
  daemonPidFile: string;
  /**
   * Issue #283 — sentinel file written every time the hourly scan fires.
   * Contains a single ISO timestamp. Acts as the time fence so the Stop
   * hook can decide whether the hourly slot has elapsed without spawning a
   * separate daemon.
   */
  lastHourlyScanFile: string;
  /**
   * Issue #283 — local cache of the most recent successful quota probe.
   * Persisted as a serialized `CcSessionQuotaBlock` so a probe failure
   * (401/429/network) can still attach a stale snapshot to the envelope.
   */
  quotaCacheFile: string;
  /**
   * Issue #368 — combined stdout+stderr of the uploader daemon. The Stop-hook
   * tap spawns the daemon with this file as the child's stdio target (instead
   * of `'ignore'`), so a `MODULE_NOT_FOUND` / auth-failure / crash is no
   * longer invisible. `teamagent digital-twin status` and `teamagent doctor`
   * surface the last error line from here.
   */
  uploaderLogFile: string;
}

export function digitalTwinPaths(home: string = homedir()): DigitalTwinPaths {
  const teamagentDir = join(home, '.teamagent');
  const digitalTwinDir = join(teamagentDir, 'digital-twin');
  const queueDir = join(digitalTwinDir, 'queue');
  return {
    teamagentDir,
    digitalTwinDir,
    configFile: join(teamagentDir, 'digital-twin.json'),
    machineIdFile: join(digitalTwinDir, 'machine-id'),
    queueDir,
    pendingDir: join(queueDir, 'pending'),
    deadLetterDir: join(queueDir, 'dead-letter'),
    recordingTempDir: join(queueDir, 'recording_temp'),
    daemonPidFile: join(digitalTwinDir, 'daemon.pid'),
    lastHourlyScanFile: join(digitalTwinDir, 'last-hourly-scan.txt'),
    quotaCacheFile: join(digitalTwinDir, 'quota-cache.json'),
    uploaderLogFile: join(digitalTwinDir, 'uploader.log'),
  };
}

export const DEFAULT_PATHS: DigitalTwinPaths = digitalTwinPaths();
