export {
  digitalTwinPaths,
  DEFAULT_PATHS,
  type DigitalTwinPaths,
} from './paths.js';

export { getUserId, getMachineId } from './identity.js';

export {
  loadConfig,
  saveConfig,
  defaultConfig,
  isEnabled,
  type DigitalTwinConfig,
  type DefaultConfigInput,
} from './config.js';

export {
  startMockServer,
  type MockServerOptions,
  type MockServerHandle,
} from './mock-server.js';

export {
  tapSession,
  projectDirForCwd,
  claudeTranscriptPath,
  type TapSessionInput,
  type TapSessionDeps,
  type TapSessionResult,
  type TapSessionStatus,
} from './hooks/tap-session.js';
