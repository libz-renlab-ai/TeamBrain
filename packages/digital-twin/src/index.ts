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

export {
  buildCcSessionEnvelope,
  isCcSessionMetadata,
  type CcSessionEnvelope,
  type CcSessionMetadata,
} from './schemas/cc-session.js';

export {
  uploadCcSession,
  classifyResponse,
  type UploadOutcome,
  type UploadInput,
  type UploadDeps,
  type FetchLike,
} from './daemon/uploader.js';

export {
  listPending,
  loadEntry,
  removeEntry,
  moveToDeadLetter,
  enforceCapacity,
  DEFAULT_QUEUE_CAPACITY_BYTES,
  type QueueEntry,
  type LoadedEntry,
} from './daemon/queue.js';

export {
  backoffMs,
  shouldDeadLetter,
  BASE_BACKOFF_MS,
  MAX_BACKOFF_MS,
  MAX_FAILURES_BEFORE_DEAD_LETTER,
} from './daemon/backoff.js';

export {
  acquirePidLock,
  releasePidLock,
  readPidFile,
  isPidAlive,
  runUploadCycle,
  mainLoop,
  POLL_INTERVAL_MS,
  IDLE_EXIT_MS,
  type DaemonConfig,
  type CycleSummary,
  type CyclePerEntryOutcome,
  type PidFileContent,
  type MainLoopExit,
} from './daemon/process-manager.js';

export { runDaemon } from './bin-uploader.js';

export {
  buildRecordingEnvelope,
  isRecordingMetadata,
  RECORDING_CODEC_DEFAULTS,
  type RecordingEnvelope,
  type RecordingMetadata,
  type BuildRecordingEnvelopeInput,
} from './schemas/recording.js';

export {
  resolvePlatformInput,
  installHintForPlatform,
  type PlatformInput,
  type ResolvePlatformInputOptions,
} from './recorder/platform-input.js';

export {
  start,
  stop,
  importRecording,
  detectFfmpegDefault,
  RECORDING_CODEC_FLAGS,
  type StartInput,
  type StartDeps,
  type StartResult,
  type StopInput,
  type StopDeps,
  type StopResult,
  type StopStatus,
  type ImportInput,
  type ImportDeps,
  type ImportResult,
  type ImportStatus,
  type FfmpegProbe,
} from './recorder/ffmpeg-wrapper.js';
