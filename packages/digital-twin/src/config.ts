import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  chmodSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { DEFAULT_PATHS } from './paths.js';

export interface DigitalTwinConfig {
  schema_version: '1';
  identity: {
    user_id: string;
    machine_id: string;
  };
  uploader: {
    enabled: boolean;
    endpoint: string;
    token: string | null;
  };
}

export interface DefaultConfigInput {
  user_id: string;
  machine_id: string;
  endpoint?: string;
}

const DEFAULT_ENDPOINT = 'http://localhost:8080';

export function defaultConfig(input: DefaultConfigInput): DigitalTwinConfig {
  return {
    schema_version: '1',
    identity: {
      user_id: input.user_id,
      machine_id: input.machine_id,
    },
    uploader: {
      enabled: true,
      endpoint: input.endpoint ?? DEFAULT_ENDPOINT,
      token: null,
    },
  };
}

export function loadConfig(file: string = DEFAULT_PATHS.configFile): DigitalTwinConfig | null {
  if (!existsSync(file)) return null;
  try {
    const raw = readFileSync(file, 'utf8');
    return JSON.parse(raw) as DigitalTwinConfig;
  } catch {
    return null;
  }
}

export function saveConfig(
  config: DigitalTwinConfig,
  file: string = DEFAULT_PATHS.configFile,
): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(config, null, 2), { encoding: 'utf8' });
  try {
    chmodSync(tmp, 0o600);
  } catch {
    // Windows: chmod is best-effort
  }
  try {
    renameSync(tmp, file);
  } catch {
    // Windows renameSync may fail on existing target — fall back to unlink + rename
    try {
      unlinkSync(file);
    } catch {
      // file may not exist; ignore
    }
    renameSync(tmp, file);
  }
  try {
    chmodSync(file, 0o600);
  } catch {
    // best-effort on Windows
  }
}

export function isEnabled(config: DigitalTwinConfig | null): boolean {
  if (!config) return false;
  if (!config.uploader.enabled) return false;
  if (!config.uploader.token) return false;
  return true;
}
