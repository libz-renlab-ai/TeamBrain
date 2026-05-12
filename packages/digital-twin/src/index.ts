export {
  digitalTwinPaths,
  DEFAULT_PATHS,
  type DigitalTwinPaths,
} from './paths.js';

export { MAX_PAYLOAD_BYTES } from './limits.js';

export { getUserId, getMachineId } from './identity.js';

export {
  loadConfig,
  saveConfig,
  defaultConfig,
  isEnabled,
  ensureDefaultConfig,
  TEAM_SHARED_TOKEN,
  quotaProbeSettings,
  DEFAULT_QUOTA_PROBE_WINDOW_MINUTES,
  type DigitalTwinConfig,
  type DefaultConfigInput,
  type EnsureDefaultConfigDeps,
  type QuotaProbeConfig,
  type ResolvedQuotaProbeSettings,
} from './config.js';

export {
  startMockServer,
  safeUserId,
  dateStamp,
  type MockServerOptions,
  type MockServerHandle,
} from './mock-server.js';

// Issue #350 — CC runtime status snapshot subsystem (epic #335 F2-D).
export {
  CC_STATUS_SCHEMA_VERSION,
  CC_STATUS_FILE_SUFFIX,
  CONTEXT_BUDGET_TOKENS,
  FIVE_HOURS_MS,
  SEVEN_DAYS_MS,
  shouldPush,
  parseTranscriptLines,
  buildCcStatusSnapshot,
  safeStatusUserId,
  sanitizeCcStatusSnapshot,
  ccStatusJsonlPath,
  appendCcStatusSnapshot,
  readLatestPerSession,
  readLatestForSession,
  readLatestAllUsers,
  readHistory,
  type CcSessionHealth,
  type CcStatusSnapshot,
  type CcStatusQueryRow,
  type TranscriptMetrics,
  type QuotaSnapshotInput,
  type BuildCcStatusInput,
  type AppendResult,
} from './cc-status/index.js';

export { DASHBOARD_HTML } from './dashboard-html.js';

export { runProdServer, type RunProdServerDeps } from './bin-prod-server.js';

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
  type CcSessionQuotaBlock,
  type BuildEnvelopeInput,
} from './schemas/cc-session.js';

// Issue #283 — quota subsystem public surface.
export {
  probeQuota,
  parseQuotaHeaders,
  type ProbeQuotaInput,
  type ProbeQuotaDeps,
  type ProbeQuotaResult,
} from './quota/probe.js';

export {
  claudeCredentialsPath,
  loadOAuthCredentials,
  loadQuotaCache,
  saveQuotaCache,
  markStale,
  type OAuthCredentials,
  type FsReadDeps,
  type FsWriteDeps,
} from './quota/state.js';

export {
  shouldRunHourlyScan,
  loadLastHourlyScanAt,
  recordHourlyScanFired,
  type SchedulerReadDeps,
  type SchedulerWriteDeps,
} from './quota/scheduler.js';

export {
  listLocalSessions,
  filterToUtcDate,
  planIncrementalUpload,
  type LocalSession,
  type ScanLocalDeps,
} from './incremental/scan.js';

export {
  runHourlyScanIfDue,
  utcDateString,
  projectDirFromTranscriptPath,
  type HourlyScanInput,
  type HourlyScanDeps,
  type HourlyScanOutcome,
} from './quota/hourly.js';

export { quotaBucket } from './dashboard-html.js';

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
  writeMetadataAtomic,
  DEFAULT_QUEUE_CAPACITY_BYTES,
  type QueueEntry,
  type LoadedEntry,
  type LoadedEntryMetadata,
} from './daemon/queue.js';

export {
  backoffMs,
  shouldDeadLetter,
  BASE_BACKOFF_MS,
  MAX_BACKOFF_MS,
  DEAD_LETTER_AFTER_MS,
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
