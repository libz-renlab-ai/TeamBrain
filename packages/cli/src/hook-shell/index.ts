/**
 * HookShell — imperative shell shared by 8 hook channel binaries.
 *
 * Two layers:
 *   - `runHook(opts)`     default; 7 simple channels use this.
 *   - `runAdvancedHook`   bin-stop-class heavy channels; opts in via `escape`.
 *
 * Lifecycle invariants (both layers):
 *   1. read stdin → JSON.parse (catch + exit 0 on failure)
 *   2. parseInput(raw) returns null → fast exit 0
 *   3. mkdirSync 3 db paths; open DualLayerStore + SqliteEventLog (or lazy
 *      via manualResources); construct InMemoryAttributionBus
 *   4. invoke handler(ctx)
 *   5. write stdout (channel envelope or identity); exit 0
 *   6. close stores (always, in finally); remove lock (always); exit 0
 *
 * The shell never propagates an exception out of the process — every error
 * path resolves to `process.exit(0)` with a single stderr fallback log line
 * prefixed by the channel name. Hooks must never block Claude Code.
 *
 * See ADR-0008 for design rationale.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  DualLayerStore,
  InMemoryAttributionBus,
  SqliteEventLog,
  StdoutRenderer,
  normalizeCwd,
  openDb,
} from "@teamagent/adapters";

import type {
  AdvancedHookContext,
  AdvancedHookOptions,
  DefaultHookContext,
  HookChannel,
  HookDbPaths,
  HookEventLog,
  HookKnowledgeStore,
  HookOptions,
  Visibility,
} from "./types.js";
import { assertEscapeNonEmpty, type RequireAtLeastOneEscape } from "./conditional-gate.js";
import { findTeamagentRoot } from "../find-teamagent-root.js";

// ──────────────────────────────────────────────────────────────────────────
// Shared helpers
// ──────────────────────────────────────────────────────────────────────────

async function readStdinJson(): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  if (raw.length === 0) return null;
  return JSON.parse(raw);
}

function parseVisibility(env: Readonly<NodeJS.ProcessEnv>): Visibility {
  const raw = (env.TEAMAGENT_VISIBILITY ?? "verbose").toLowerCase();
  return raw === "silent" || raw === "smart" || raw === "verbose"
    ? raw
    : "verbose";
}

function resolvePaths(cwd: string, home: string): HookDbPaths {
  // Walk up from cwd to find the nearest ancestor with .teamagent/knowledge.db.
  // Falls back to cwd if no ancestor has it (new project, not yet initialized).
  // This mirrors git's .git/ ancestor-walk semantics (issue #161).
  const projectRoot = findTeamagentRoot(cwd);
  return {
    projectDbPath: path.join(projectRoot, ".teamagent", "knowledge.db"),
    globalDbPath: path.join(home, ".teamagent", "global.db"),
    eventsDbPath: path.join(home, ".teamagent", "events.db"),
  };
}

function ensureDirsForPaths(paths: HookDbPaths): void {
  for (const p of [paths.projectDbPath, paths.globalDbPath, paths.eventsDbPath]) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
  }
}

function makeMirror(env: Readonly<NodeJS.ProcessEnv>): (text: string) => void {
  return (text: string) => {
    if (env.TEAMAGENT_HOOK_STDERR === "0") return;
    if (typeof text !== "string" || text.length === 0) return;
    try { process.stderr.write(`${text}\n`); } catch { /* best-effort */ }
  };
}

function logFallback(channel: HookChannel, phase: string, err: unknown): void {
  try {
    const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
    process.stderr.write(`teamagent ${channel}-hook: ${phase}: ${msg}\n`);
  } catch { /* never throw from logger */ }
}

function writeStdout(payload: unknown): void {
  if (payload === undefined) return;
  const text = typeof payload === "string" ? payload : JSON.stringify(payload);
  try { process.stdout.write(text); } catch { /* best-effort */ }
}

function closeIfPresent(resource: { close(): void } | null): void {
  if (!resource) return;
  try { resource.close(); } catch { /* ignore */ }
}

function exitZero(): never {
  process.exit(0);
}

interface ResolvedRuntime {
  readonly cwd: string;
  readonly home: string;
  readonly env: Readonly<NodeJS.ProcessEnv>;
  readonly paths: HookDbPaths;
}

function resolveRuntime(rawCwd: unknown): ResolvedRuntime {
  const env: Readonly<NodeJS.ProcessEnv> = process.env;
  // TEAMAGENT_HOME takes precedence over os.homedir() for the same reason
  // bin-stop and other commands already honor it: a clean override slot for
  // ops scripts and tests that don't want to mutate the system home. Falls
  // back to os.homedir() in production where TEAMAGENT_HOME is unset.
  const home = (env.TEAMAGENT_HOME && env.TEAMAGENT_HOME.length > 0)
    ? env.TEAMAGENT_HOME
    : os.homedir();
  // cwd resolution priority (Codex P2 fix on PR #152):
  //   1. raw.cwd from stdin payload — Claude Code SDK populates this for
  //      tool-use channels (PreToolUse, PostToolUse, Stop, ...).
  //   2. CLAUDE_PROJECT_DIR env — Claude Code sets this before *every* hook
  //      invocation regardless of channel. Channels that accept empty/minimal
  //      stdin (SessionStart, UserPromptSubmit) rely on this fallback when
  //      no raw.cwd is sent. Hook processes can also be launched from a
  //      non-project working directory while project root is conveyed via
  //      this env — without the fallback we'd read/write `.teamagent` state
  //      under the wrong path.
  //   3. process.cwd() — last-resort, matches legacy bin-*.ts behavior for
  //      manual / test invocations where neither signal is present.
  const claudeProjectDir = env.CLAUDE_PROJECT_DIR;
  const cwdInput =
    typeof rawCwd === "string" && rawCwd.length > 0
      ? rawCwd
      : claudeProjectDir && claudeProjectDir.length > 0
        ? claudeProjectDir
        : process.cwd();
  const cwd = normalizeCwd(cwdInput);
  const paths = resolvePaths(cwd, home);
  return { cwd, home, env, paths };
}

function pickRawCwd(raw: unknown): unknown {
  if (raw && typeof raw === "object" && "cwd" in (raw as Record<string, unknown>)) {
    return (raw as { cwd?: unknown }).cwd;
  }
  return undefined;
}

// ──────────────────────────────────────────────────────────────────────────
// Default layer
// ──────────────────────────────────────────────────────────────────────────

export async function runHook<TInput, TOutput>(
  opts: HookOptions<TInput, TOutput>,
): Promise<never> {
  let raw: unknown = null;
  try {
    raw = await readStdinJson();
  } catch (err) {
    logFallback(opts.channel, "stdin parse", err);
    return exitZero();
  }

  let input: TInput | null;
  try {
    input = opts.parseInput(raw);
  } catch (err) {
    logFallback(opts.channel, "parseInput", err);
    return exitZero();
  }
  if (input === null) return exitZero();

  const rt = resolveRuntime(pickRawCwd(raw));

  let store: DualLayerStore | null = null;
  let eventLog: SqliteEventLog | null = null;
  try {
    ensureDirsForPaths(rt.paths);
    store = new DualLayerStore({
      projectDbPath: rt.paths.projectDbPath,
      userGlobalDbPath: rt.paths.globalDbPath,
    });
    eventLog = new SqliteEventLog(openDb(rt.paths.eventsDbPath));

    const bus = new InMemoryAttributionBus();
    const visibility = parseVisibility(rt.env);
    const mirror = makeMirror(rt.env);

    // Wire StdoutRenderer to the bus so handler-emitted AttributionEvents
    // become user-visible stderr lines (per visibility). bin handlers can
    // emit `bus.emit({ kind, ... })` and trust the rendering reaches the
    // terminal — no need for each bin to wire its own renderer.
    const renderer = new StdoutRenderer();
    const unsubscribeRenderer = bus.subscribe((event) => {
      if (visibility === "silent") return;
      const text = renderer.render([event], visibility);
      if (text && text.length > 0) {
        try { process.stderr.write(`${text}\n`); } catch { /* best-effort */ }
      }
    });

    const ctx: DefaultHookContext<TInput> = {
      input,
      cwd: rt.cwd,
      home: rt.home,
      env: rt.env,
      paths: rt.paths,
      store: store as HookKnowledgeStore,
      eventLog: eventLog as HookEventLog,
      bus,
      visibility,
      mirrorSystemMessage: mirror,
    };

    try {
      const out = await opts.handler(ctx);
      const wrapped = opts.envelope && out !== undefined ? opts.envelope(out) : out;
      writeStdout(wrapped);
    } finally {
      unsubscribeRenderer();
    }
  } catch (err) {
    logFallback(opts.channel, "handler", err);
  } finally {
    closeIfPresent(store);
    closeIfPresent(eventLog);
  }

  return exitZero();
}

// ──────────────────────────────────────────────────────────────────────────
// Advanced layer
// ──────────────────────────────────────────────────────────────────────────

export async function runAdvancedHook<
  TInput,
  TOutput,
  T extends AdvancedHookOptions<TInput, TOutput>,
>(opts: RequireAtLeastOneEscape<T>): Promise<never> {
  // Defensive runtime check — RequireAtLeastOneEscape catches literal call
  // sites at compile time, but typed-variable / `as any` callers slip
  // through. Throw early before any IO so we don't half-run.
  const advOpts = opts as unknown as AdvancedHookOptions<TInput, TOutput>;
  try {
    assertEscapeNonEmpty(advOpts.escape);
  } catch (err) {
    logFallback(advOpts.channel, "escape gate", err);
    return exitZero();
  }

  const channel = advOpts.channel;

  // 1. Detached re-entry probe — bin-stop async mode reads input from
  //    argv tmp file instead of stdin when the env flag is set.
  let raw: unknown = null;
  try {
    if (advOpts.escape.detached?.isDetachedInvocation(process.env, process.argv)) {
      raw = advOpts.escape.detached.readArgvInput(process.argv);
    } else {
      raw = await readStdinJson();
    }
  } catch (err) {
    logFallback(channel, "stdin/argv parse", err);
    return exitZero();
  }

  let input: TInput | null;
  try {
    input = advOpts.parseInput(raw);
  } catch (err) {
    logFallback(channel, "parseInput", err);
    return exitZero();
  }
  if (input === null) return exitZero();

  const rt = resolveRuntime(pickRawCwd(raw));

  // 2. Lazy resources — opened only when handler actually calls ctx.store()
  //    / ctx.eventLog(). Always closed in finally if opened.
  let store: DualLayerStore | null = null;
  let eventLog: SqliteEventLog | null = null;
  const manual = advOpts.escape.manualResources === true;

  const lazyStore = (): HookKnowledgeStore => {
    if (store === null) {
      ensureDirsForPaths(rt.paths);
      store = new DualLayerStore({
        projectDbPath: rt.paths.projectDbPath,
        userGlobalDbPath: rt.paths.globalDbPath,
      });
    }
    // TS doesn't track narrowing across this closure; assert non-null.
    return store as DualLayerStore;
  };
  const lazyEventLog = (): HookEventLog => {
    if (eventLog === null) {
      ensureDirsForPaths(rt.paths);
      eventLog = new SqliteEventLog(openDb(rt.paths.eventsDbPath));
    }
    return eventLog as SqliteEventLog;
  };

  // Eager-open if not manual, so handler matches the default-layer mental model.
  if (!manual) { lazyStore(); lazyEventLog(); }

  // 3. Lock file — best-effort; failed writes silently swallowed.
  let lockAbsPath: string | null = null;
  if (advOpts.escape.lock) {
    try {
      lockAbsPath = path.join(rt.cwd, advOpts.escape.lock.relativePath);
      fs.mkdirSync(path.dirname(lockAbsPath), { recursive: true });
      fs.writeFileSync(lockAbsPath, JSON.stringify(advOpts.escape.lock.payload()));
    } catch { /* best-effort */ }
  }

  // 4. Build advanced context.
  const bus = new InMemoryAttributionBus();
  const visibility = parseVisibility(rt.env);
  const mirror = makeMirror(rt.env);

  // Wire StdoutRenderer to the bus (same pattern as default layer). bin-stop
  // emits ~12 user-visible AttributionEvents through ctx.bus; the renderer
  // ensures each lands on stderr per visibility mode without each handler
  // managing its own subscription.
  const renderer = new StdoutRenderer();
  const unsubscribeRenderer = bus.subscribe((event) => {
    if (visibility === "silent") return;
    const text = renderer.render([event], visibility);
    if (text && text.length > 0) {
      try { process.stderr.write(`${text}\n`); } catch { /* best-effort */ }
    }
  });
  const teamagentHome = (rt.env.TEAMAGENT_HOME ?? rt.home);
  const errorLogPath = path.join(teamagentHome, ".teamagent", `${channel}-errors.log`);
  const logError = (step: string, err: unknown): void => {
    try {
      fs.mkdirSync(path.dirname(errorLogPath), { recursive: true });
      const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
      fs.appendFileSync(
        errorLogPath,
        `[${new Date().toISOString()}] step=${step} err=${msg}\n`,
      );
    } catch { /* never throw */ }
  };
  const monoStart = process.hrtime.bigint();
  const ctx: AdvancedHookContext<TInput> = {
    input,
    cwd: rt.cwd,
    home: rt.home,
    env: rt.env,
    paths: rt.paths,
    bus,
    visibility,
    mirrorSystemMessage: mirror,
    store: lazyStore,
    eventLog: lazyEventLog,
    logError,
    clock: {
      nowIso: () => new Date().toISOString(),
      monotonicMs: () => Number(process.hrtime.bigint() - monoStart) / 1_000_000,
    },
  };

  // 5. Invoke handler under timeout race if requested.
  try {
    const handlerPromise = Promise.resolve().then(() => advOpts.handler(ctx));
    const timeoutMs = advOpts.escape.pipelineTimeoutMs;
    const out = typeof timeoutMs === "number" && timeoutMs > 0
      ? await raceWithTimeout(handlerPromise, timeoutMs)
      : await handlerPromise;

    if (out !== undefined && out !== null) {
      const wrapped = advOpts.envelope ? advOpts.envelope(out as TOutput) : out;
      writeStdout(wrapped);
    }
  } catch (err) {
    logError("handler", err);
    logFallback(channel, "handler", err);
  } finally {
    unsubscribeRenderer();
    closeIfPresent(store);
    closeIfPresent(eventLog);
    if (lockAbsPath) {
      try { fs.unlinkSync(lockAbsPath); } catch { /* ignore */ }
    }
  }

  return exitZero();
}

/** Symbol returned when the timeout fires (vs. handler completion). */
const TIMEOUT_SENTINEL = Symbol("hook-shell.timeout");

async function raceWithTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<typeof TIMEOUT_SENTINEL>((resolve) => {
    timer = setTimeout(() => resolve(TIMEOUT_SENTINEL), ms);
    if (timer && typeof timer === "object" && "unref" in timer) {
      (timer as { unref(): void }).unref();
    }
  });
  try {
    const winner = await Promise.race([p, timeout]);
    if (winner === TIMEOUT_SENTINEL) return undefined;
    return winner as T;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Re-exports for caller convenience
// ──────────────────────────────────────────────────────────────────────────

export type {
  AdvancedHookContext,
  AdvancedHookOptions,
  DefaultHookContext,
  DetachedSpec,
  EscapeOptions,
  HookChannel,
  HookDbPaths,
  HookEnvelope,
  HookEventLog,
  HookKnowledgeStore,
  HookOptions,
  LockSpec,
  Visibility,
} from "./types.js";
export { assertEscapeNonEmpty, type RequireAtLeastOneEscape } from "./conditional-gate.js";
