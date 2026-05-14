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

// Feature #2 v3 — fire-and-forget cc-status push wired from SessionStart /
// UserPromptSubmit hooks so the boss kanban shows real teammates' Claude Code
// sessions, not just the bin-realtime-demo synthetic writer. See
// packages/cli/src/realtime-emit.ts for the caller.
export {
  postCcStatusSnapshot,
  type PostCcStatusOptions,
  type PostCcStatusOutcome,
} from './realtime-client.js';
export {
  createSseHandler,
  type SseHandlerOptions,
} from './realtime-stream.js';

export { runProdServer, type RunProdServerDeps } from './bin-prod-server.js';

export { computeMemberStats, type MemberStats } from './member-stats.js';

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

export { readLastUploaderError, type UploaderLogError } from './daemon/uploader-log.js';

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
  listAudioDevicesArgs,
  listAudioDevices,
  type PlatformInput,
  type ResolvePlatformInputOptions,
  type ListAudioDevicesOptions,
  type ListAudioDevicesResult,
  type ListAudioDevicesSpawnSync,
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

// BPP (Best-Practice Push) — spec 2026-05-13. Server-side fan-out of
// AI-mined best practices to team inboxes. Phase 1 (this PR): types,
// store, HTTP handlers, route wiring. Phase 2-6: AI mining pipeline,
// receiver UX, lead console, privacy, verify harness.
export type {
  BestPractice,
  InboxItem,
  TeamMember,
  PushEvent,
  BpType,
  BpTier,
  BpTopic,
  InboxStatus,
  DeliveryChannel,
  PushEventType,
  MiningEvidence,
} from './bpp/types.js';
export {
  writeBp,
  readBp,
  listBpIds,
  appendInbox,
  listInbox,
  appendAudit,
  listAuditEvents,
  writeMember,
  readMembers,
} from './bpp/store.js';
export {
  handleBpPush,
  handleInbox,
  handleMemberJoin,
  type BpPushBody,
  type BpPushResult,
  type InboxResult,
  type MemberJoinBody,
  type MemberJoinResult,
} from './bpp/server-handlers.js';

// BPP Phase 2-6 modules (added in PR #430 follow-up after parallel agent team).
export { handleRevoke } from './bpp/revoke.js';
export { handleForcePush } from './bpp/force-push.js';
export { isLead, assertIsLead } from './bpp/lead-gate.js';
export {
  type RoleTier,
  type RoleMetadataFile,
  getRoleTier,
  readRoleMetadata,
  writeRoleMetadata,
  assertCanTransferLead,
  assertCanElevate,
  assertCanRevoke,
  assertCanForcePush,
  assertCanDeleteAudit,
} from './bpp/role-hierarchy.js';
export {
  MAX_CO_LEADS,
  transferLead,
  elevateToCoLead,
  demoteCoLead,
  type TransferLeadResult,
  type ElevateResult,
  type DemoteResult,
} from './bpp/role-transitions.js';
export { requireBearerToken } from './bpp/auth-gate.js';
export { purgeStaleTranscripts } from './bpp/transcript-purge.js';
export { linkAuditEvent, verifyAuditChain } from './bpp/audit-hash-chain.js';
export {
  type CandidateBp,
  type CorrectionMoment,
  type SessionSummary,
  type GitActivity,
  type MiningInput,
} from './bpp/mining/mining-types.js';
export {
  listConversationSessions,
  readMinedCursor,
  writeMinedCursor,
  filterUnmined,
  normalizeSignal,
  extractMiningInput,
  MINED_CURSOR_FILE,
  type SessionRef,
  type MinedCursor,
} from './bpp/mining/transcript-extractor.js';
export {
  mineCorrectionCandidates,
  correctionCandidateId,
  type CorrectionAdapterInput,
} from './bpp/mining/correction-adapter.js';
export {
  runMining,
  SEED_SAMPLE_DIR,
  type MiningRunOptions,
  type MiningRunResult,
} from './bpp/mining/orchestrator.js';
export {
  mineBehaviorCandidates,
  type BehaviorMinerInput,
} from './bpp/mining/behavior-miner.js';
export {
  mineContextPatternCandidates,
  type ContextPatternMinerInput,
} from './bpp/mining/context-pattern-miner.js';
export {
  wilsonLowerBound,
  bppTierFromConfidence,
  wilsonTierGate,
  PUSHABLE_TIERS,
  type WilsonTierGateOptions,
} from './bpp/mining/wilson-tier-gate.js';

// BPP Gap 1 — real LLM mining (claudefast / Anthropic SDK / mock).
export {
  extractCandidates,
  parseModelJson,
  type LlmProvider,
  type LlmClientConfig,
  type LlmExtractType,
  type LlmExtractRequest,
  type LlmCandidate,
  type LlmExtractResponse,
} from './bpp/mining/llm-client.js';
export {
  promptForRule,
  promptForHabit,
  promptForContextMgmt,
  type SessionExcerpt,
} from './bpp/mining/llm-prompt-templates.js';
export {
  BudgetTracker,
  BudgetExhaustedError,
  DEFAULT_BUDGET_USD,
} from './bpp/mining/budget-tracker.js';

// BPP Gap 2 — SSE realtime + accept→compile path.
export {
  BppSseBroadcaster,
  wireBroadcasterToHandlers,
  type BppEvent,
  type BppEventType,
  type SseSink,
} from './bpp/sse-broadcast.js';
export {
  compileBpToSkill,
  type CompileBpToSkillResult,
} from './bpp/compile-to-skill.js';
export {
  handleInboxAct,
  type InboxActBody,
  type InboxActResult,
} from './bpp/accept-handler.js';

// BPP Gap 4 — HTTPS wrapper + transcript-purge cron.
export {
  wrapServerWithHttps,
  type WrapServerWithHttpsOptions,
} from './bpp/https-server.js';
