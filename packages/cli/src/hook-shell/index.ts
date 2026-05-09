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
import { findTeamagentRoot } from "../lib/walk-up.js";

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

/**
 * Hook-level verbose opt-in (issue #174 W3).
 *
 * Default visibility for hook channels is `verbose`, which makes
 * `StdoutRenderer` append the `--- raw events ---` JSON dump and the
 * `counterfactual` line to every rendered AttributionEvent on stderr. That
 * trailing block is noisy for end users — they only need the three-line
 * highlight/warning summary that `smart` mode already produces.
 *
 * This helper opts users into the noisy verbose tail explicitly via
 * `TEAMAGENT_HOOK_VERBOSE=1` (or `=true`). When unset, the shell
 * downgrades the renderer's mode from `verbose` to `smart` for hook
 * channels only, preserving the JSON envelope on stdout (returned to
 * Claude Code) untouched.
 *
 * Non-hook commands (`pitfall`, `skeleton-demo`) continue to honour
 * `TEAMAGENT_VISIBILITY` directly because they construct their own
 * renderer outside this shell.
 */
export function shouldShowVerboseHookOutput(env: Readonly<NodeJS.ProcessEnv>): boolean {
  const raw = env.TEAMAGENT_HOOK_VERBOSE;
  return raw === "1" || raw === "true";
}

/**
 * Effective hook-channel visibility — downgrades `verbose` to `smart` unless
 * `TEAMAGENT_HOOK_VERBOSE=1` is set. `silent` and `smart` pass through
 * unchanged.
 *
 * PR #183 fix: the original W3 commit only used this for the
 * `StdoutRenderer` mode (stderr human-prose), but `ctx.visibility` was still
 * forwarded to handlers as the raw `verbose` and pre-tool-use-handler.ts:120
 * went on to write `◈ TeamAgent: ✓ <tool> 放行 (检查 N 条规则)` into the
 * stdout JSON envelope's `systemMessage` on every clean pass. That stdout
 * leak defeated the user-visible promise of the W3 slice. We now thread
 * this single effective value into BOTH the renderer mode AND `ctx.visibility`
 * so the gate covers stdout + stderr together.
 */
export function effectiveHookVisibility(
  visibility: Visibility,
  env: Readonly<NodeJS.ProcessEnv>,
): Visibility {
  if (visibility === "verbose" && !shouldShowVerboseHookOutput(env)) {
    return "smart";
  }
  return visibility;
}

function resolvePaths(cwd: string, home: string): HookDbPaths {
  // Issue #161: walk up from cwd to find the nearest ancestor with
  // .teamagent/knowledge.db (a hook fired from a sub-directory must still
  // resolve to the project root's DB). Falls back to cwd itself if no
  // ancestor contains one — preserves the legacy "create new project
  // here" path for first-run.
  const projectRoot = findTeamagentRoot(cwd) ?? cwd;
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

  // Lazy resources — opened only when handler actually reads ctx.store /
  // ctx.eventLog. Handlers that don't touch them incur zero sqlite cost.
  // Always closed in finally iff opened (null check inside closeIfPresent).
  let store: DualLayerStore | null = null;
  let eventLog: SqliteEventLog | null = null;
  let dirsEnsured = false;

  const ensureDirsOnce = (): void => {
    if (dirsEnsured) return;
    ensureDirsForPaths(rt.paths);
    dirsEnsured = true;
  };

  try {
    const bus = new InMemoryAttributionBus();
    const visibility = parseVisibility(rt.env);
    const mirror = makeMirror(rt.env);

    // Wire StdoutRenderer to the bus so handler-emitted AttributionEvents
    // become user-visible stderr lines (per visibility). bin handlers can
    // emit `bus.emit({ kind, ... })` and trust the rendering reaches the
    // terminal — no need for each bin to wire its own renderer.
    //
    // Issue #174 W3 + PR #183 fix: gate `verbose` behind `TEAMAGENT_HOOK_VERBOSE=1`
    // for BOTH the StdoutRenderer mode (stderr human-prose) and ctx.visibility
    // (the value handlers consume to decide whether to emit a verbose
    // `systemMessage` into the stdout JSON envelope). Computing once and
    // threading it everywhere keeps stdout + stderr in lockstep — the W3
    // commit only gated the renderer, leaving the stdout systemMessage leak
    // (`◈ TeamAgent: ✓ <tool> 放行`) on by default. The JSON envelope SHAPE
    // is unchanged; only the human-prose `systemMessage` field is suppressed
    // when verbose isn't opted in.
    const effectiveVisibility = effectiveHookVisibility(visibility, rt.env);
    const renderer = new StdoutRenderer();
    const unsubscribeRenderer = bus.subscribe((event) => {
      if (effectiveVisibility === "silent") return;
      const text = renderer.render([event], effectiveVisibility);
      if (text && text.length > 0) {
        try { process.stderr.write(`${text}\n`); } catch { /* best-effort */ }
      }
    });

    // Build ctx with lazy accessor properties for store and eventLog.
    // Property API is preserved (ctx.store / ctx.eventLog, not functions),
    // so existing callers like `ctx.store as unknown as DualLayerStore` work
    // unchanged. The getter memoises: second read returns same instance.
    // Cast through unknown: the store/eventLog properties are defined below
    // via Object.defineProperty; the literal itself omits them intentionally.
    const ctx = {
      input,
      cwd: rt.cwd,
      home: rt.home,
      env: rt.env,
      paths: rt.paths,
      bus,
      visibility: effectiveVisibility,
      mirrorSystemMessage: mirror,
    } as unknown as DefaultHookContext<TInput>;

    // non-enumerable: prevents accidental eager-open via {...ctx} spread / JSON.stringify
    Object.defineProperty(ctx, "store", {
      enumerable: false,
      configurable: false,
      get(): HookKnowledgeStore {
        if (store === null) {
          ensureDirsOnce();
          store = new DualLayerStore({
            projectDbPath: rt.paths.projectDbPath,
            userGlobalDbPath: rt.paths.globalDbPath,
          });
        }
        return store as DualLayerStore;
      },
    });

    // non-enumerable: prevents accidental eager-open via {...ctx} spread / JSON.stringify
    Object.defineProperty(ctx, "eventLog", {
      enumerable: false,
      configurable: false,
      get(): HookEventLog {
        if (eventLog === null) {
          ensureDirsOnce();
          eventLog = new SqliteEventLog(openDb(rt.paths.eventsDbPath));
        }
        return eventLog as SqliteEventLog;
      },
    });

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
  let dirsEnsured = false;
  const manual = advOpts.escape.manualResources === true;

  // Hoist ensureDirsForPaths into a single guarded call (perf-specialist
  // /review on PR #152): previously each lazy getter called it
  // independently, so an eager-open caller incurred 6 mkdirSync syscalls
  // (3 paths × 2 getters) when 3 would suffice. With manualResources the
  // helper still defers correctly: it only runs if either getter fires.
  const ensureDirsOnce = (): void => {
    if (dirsEnsured) return;
    ensureDirsForPaths(rt.paths);
    dirsEnsured = true;
  };

  const lazyStore = (): HookKnowledgeStore => {
    if (store === null) {
      ensureDirsOnce();
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
      ensureDirsOnce();
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
  //
  // Issue #174 W3 + PR #183 fix: same `TEAMAGENT_HOOK_VERBOSE=1` gate as the
  // default layer — downgrade `verbose` to `smart` for BOTH the renderer
  // (stderr) AND ctx.visibility (which advanced handlers consume to gate
  // verbose `systemMessage` writes into the stdout JSON envelope). The W3
  // commit only gated the renderer; PR #183 closes the stdout half too. The
  // JSON envelope SHAPE on stdout is unchanged; only the verbose
  // `systemMessage` field is suppressed when the env opt-in is missing.
  const effectiveVisibility = effectiveHookVisibility(visibility, rt.env);
  const renderer = new StdoutRenderer();
  const unsubscribeRenderer = bus.subscribe((event) => {
    if (effectiveVisibility === "silent") return;
    const text = renderer.render([event], effectiveVisibility);
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
    visibility: effectiveVisibility,
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
