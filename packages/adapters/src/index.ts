// v2 SQLite stores
export { SqliteKnowledgeStore } from "./storage/sqlite/sqlite-knowledge-store.js";
export { SqliteEventLog } from "./storage/sqlite/sqlite-event-log.js";
export { SqliteObservations, type Observation } from "./storage/sqlite/sqlite-observations.js";
export { DualLayerStore, type DualLayerStoreConfig } from "./storage/sqlite/dual-layer-store.js";
export { openDb, closeDb, INIT_SQL, CURRENT_SCHEMA_VERSION } from "./storage/sqlite/schema.js";
export { syncRuleVectors, deleteRuleVectors, syncToolVector } from "./storage/sqlite/vec-sync.js";

// v2 SDK hooks
export {
  createPreToolUseHandler,
  type PreToolUseDeps,
  type PreToolUseResult,
} from "./hook/claude-agent-sdk/pre-tool-use-sdk.js";
export {
  createPostToolUseHandler,
  type PostToolUseDeps,
} from "./hook/claude-agent-sdk/post-tool-use-sdk.js";

// util
export { normalizeCwd } from "./util/normalize-cwd.js";

export { InMemoryKnowledgeStore } from "./storage/in-memory-store.js";
export { InMemoryAttributionBus } from "./attribution/in-memory-bus.js";
export { StdoutRenderer } from "./attribution/stdout-renderer.js";
export {
  MarkdownCompiler,
  type CompileWriteInfo,
} from "./compiler/markdown-compiler.js";
export {
  NestedRuleStoreCompiler,
  type NestedRuleStoreCompilerOptions,
  type NestedRuleStoreWriteInfo,
} from "./compiler/nested-rule-store.js";
export {
  createRuleCompiler,
  type CreateRuleCompilerOptions,
} from "./compiler/rule-compiler-factory.js";
export { CursorRulesCompiler } from "./compiler/cursor-rules-compiler.js";
export {
  ClaudeSessionSource,
  parseSessionFile,
} from "./session-source/claude-session-source.js";
export {
  ClaudeCodeLLMClient,
  parseClaudeJsonOutput,
  type ClaudeCodeLLMClientOptions,
  type Spawner,
  type SpawnResult,
} from "./llm/claude-code-client.js";
export { makeSkillCompiler } from "./compiler/skill-compiler.js";
export {
  ClaudePluginInstaller,
  type PluginCmdSpawner,
  type PluginCmdResult,
  type PluginInstallerOptions,
  type InstallPluginOptions,
  type StepOutcome,
} from "./plugins/claude-plugin-installer.js";
export type { SkillCompilerOptions } from "./compiler/skill-compiler.js";
export {
  SqliteCandidateQueue,
  type CandidateQueue,
  type RuleCandidate,
} from "./storage/sqlite/sqlite-candidate-queue.js";
export {
  CompositeErrorSignalCollector,
  type ErrorSignalCollector,
} from "./error-collector/composite-error-signal-collector.js";
export { XenovaRuleEmbedder } from "./embedding/xenova-rule-embedder.js";
export type { XenovaProgressEvent } from "./embedding/xenova-rule-embedder.js";
export { SqliteSemanticRetriever } from "./retriever/sqlite-semantic-retriever.js";
export { SqliteToolRetriever } from "./retriever/sqlite-tool-retriever.js";
export {
  FsBootstrap,
  type BootstrapPort,
  type ProjectProbe,
} from "./m5/fs-bootstrap.js";
export {
  FsTeamRuleStore,
  type TeamRuleStorePort,
  type TeamRuleClaim,
} from "./m5/fs-team-rule-store.js";

export {
  GhCliGitHubActivityAdapter,
  type GhCliGitHubActivityAdapterOptions,
  type GhSpawner,
  type GhSpawnResult,
} from "./github-activity/gh-cli-adapter.js";
