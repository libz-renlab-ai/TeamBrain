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
  };
}

export const DEFAULT_PATHS: DigitalTwinPaths = digitalTwinPaths();
