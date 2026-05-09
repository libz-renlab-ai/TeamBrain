/**
 * Unit tests for `runAdvancedHook` — covering its 4 escape mechanisms:
 *
 *   1. Lock file write/cleanup (happy path + handler throw)
 *   2. manualResources: true → lazy-open (no eager construction, memoized)
 *   3. pipelineTimeoutMs → race + TIMEOUT_SENTINEL (no stdout, resources closed)
 *   4. detached re-entry → readArgvInput instead of stdin
 *
 * Strategy mirrors run-hook.test.ts:
 *   - TEAMAGENT_HOME → tmpdir so sqlite lands nowhere real
 *   - feedStdin + process.stdin override
 *   - process.exit intercepted → exitCode capture
 *   - stdout/stderr captured
 *   - DualLayerStore + SqliteEventLog mocked at the @teamagent/adapters boundary
 *     so tests never open sqlite
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Readable } from "node:stream";

// ── mock @teamagent/adapters before importing runAdvancedHook ─────────────
// Constructor-call counters live at module scope so the vi.mock factory can
// increment them. Each test resets them in beforeEach.

const mockStoreClose = vi.fn();
const mockEventLogClose = vi.fn();
let dualLayerStoreConstructorCount = 0;
let sqliteEventLogConstructorCount = 0;

vi.mock("@teamagent/adapters", () => {
  class MockDualLayerStore {
    close = mockStoreClose;
    constructor(_config: unknown) {
      dualLayerStoreConstructorCount++;
    }
  }
  class MockSqliteEventLog {
    close = mockEventLogClose;
    constructor(_db: unknown) {
      sqliteEventLogConstructorCount++;
    }
  }
  function openDb(_p: string): object {
    return { filename: _p };
  }
  class MockInMemoryAttributionBus {
    subscribe(_fn: unknown) { return () => {}; }
    emit(_event: unknown) {}
  }
  class MockStdoutRenderer {
    render(_events: unknown[], _vis: unknown): string { return ""; }
  }
  function normalizeCwd(cwd: string): string { return cwd; }
  // `satisfies Partial<typeof import("@teamagent/adapters")>` would be ideal
  // to catch future key renames on the real adapters barrel at compile time.
  // However the mock stubs are intentionally minimal (missing the full instance
  // interfaces of DualLayerStore, SqliteEventLog, etc.), so TypeScript rejects
  // both `satisfies` and a direct `as Partial<...>` cast with TS2352.
  // We use `as unknown as Partial<...>` to escape for the factory return while
  // still documenting the intended shape. Key renames in the barrel will be
  // caught first by the import in index.ts failing typecheck.
  return {
    DualLayerStore: MockDualLayerStore,
    SqliteEventLog: MockSqliteEventLog,
    openDb,
    InMemoryAttributionBus: MockInMemoryAttributionBus,
    StdoutRenderer: MockStdoutRenderer,
    normalizeCwd,
  } as unknown as Partial<typeof import("@teamagent/adapters")>;
});

import { runAdvancedHook } from "../index.js";
import type { AdvancedHookContext } from "../types.js";

// ── shared test infrastructure ────────────────────────────────────────────

let tmpHome: string;
let tmpCwd: string;
let origTeamagentHome: string | undefined;
let origExit: typeof process.exit;
let origStdin: NodeJS.ReadStream;
let stdoutBuf: string[];
let stderrBuf: string[];
let origStdoutWrite: typeof process.stdout.write;
let origStderrWrite: typeof process.stderr.write;
let exitCode: number | undefined;

function feedStdin(text: string): void {
  const stream = Readable.from([Buffer.from(text, "utf-8")]) as unknown as NodeJS.ReadStream;
  Object.defineProperty(process, "stdin", {
    configurable: true,
    get: () => stream,
  });
}

beforeEach(() => {
  dualLayerStoreConstructorCount = 0;
  sqliteEventLogConstructorCount = 0;
  vi.clearAllMocks();

  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "teamagent-adv-hook-home-"));
  tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), "teamagent-adv-hook-cwd-"));

  origTeamagentHome = process.env.TEAMAGENT_HOME;
  process.env.TEAMAGENT_HOME = tmpHome;

  origExit = process.exit;
  exitCode = undefined;
  (process as { exit: (code?: number) => never }).exit = ((code?: number) => {
    exitCode = code ?? 0;
    throw new Error("__EXIT__");
  }) as never;

  origStdin = process.stdin;
  stdoutBuf = [];
  stderrBuf = [];
  origStdoutWrite = process.stdout.write.bind(process.stdout);
  origStderrWrite = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    stdoutBuf.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf-8"));
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array): boolean => {
    stderrBuf.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf-8"));
    return true;
  }) as typeof process.stderr.write;
});

afterEach(() => {
  if (origTeamagentHome === undefined) delete process.env.TEAMAGENT_HOME;
  else process.env.TEAMAGENT_HOME = origTeamagentHome;
  process.exit = origExit;
  Object.defineProperty(process, "stdin", { configurable: true, value: origStdin });
  process.stdout.write = origStdoutWrite;
  process.stderr.write = origStderrWrite;
  try { fs.rmSync(tmpHome, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(tmpCwd, { recursive: true, force: true }); } catch { /* ignore */ }
});

async function runUntilExit(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    if ((err as Error).message !== "__EXIT__") throw err;
  }
}

/** Minimal valid stdin payload that includes `cwd` for path resolution. */
function makePayload(cwd: string): string {
  return JSON.stringify({ tool_name: "Bash", cwd });
}

/** Accept any non-null object from stdin. */
function parseAny(raw: unknown): Record<string, unknown> | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object") return null;
  return raw as Record<string, unknown>;
}

// ── 1. Lock file — happy path ─────────────────────────────────────────────

describe("runAdvancedHook — lock file", () => {
  it("lock file is written before handler runs and unlinked after", async () => {
    const lockRelPath = ".teamagent/.adv-test.lock";
    const lockAbsPath = path.join(tmpCwd, lockRelPath);

    feedStdin(makePayload(tmpCwd));

    let lockExistedDuringHandler = false;

    await runUntilExit(() =>
      runAdvancedHook({
        channel: "Stop",
        parseInput: parseAny,
        escape: {
          lock: {
            relativePath: lockRelPath,
            payload: () => ({ pid: process.pid, started_at: "2026-01-01T00:00:00Z" }),
          },
        },
        handler: (_ctx: AdvancedHookContext<Record<string, unknown>>) => {
          lockExistedDuringHandler = fs.existsSync(lockAbsPath);
          return undefined;
        },
      }),
    );

    expect(lockExistedDuringHandler).toBe(true);
    expect(fs.existsSync(lockAbsPath)).toBe(false);
    expect(exitCode).toBe(0);
  });

  it("lock file is unlinked even when handler throws", async () => {
    const lockRelPath = ".teamagent/.adv-throw.lock";
    const lockAbsPath = path.join(tmpCwd, lockRelPath);

    feedStdin(makePayload(tmpCwd));

    await runUntilExit(() =>
      runAdvancedHook({
        channel: "Stop",
        parseInput: parseAny,
        escape: {
          lock: {
            relativePath: lockRelPath,
            payload: () => ({ pid: process.pid }),
          },
        },
        handler: (): undefined => {
          throw new Error("handler exploded");
        },
      }),
    );

    expect(exitCode).toBe(0);
    expect(fs.existsSync(lockAbsPath)).toBe(false);
  });

  it("lock file body contains the JSON-serialised payload", async () => {
    const lockRelPath = ".teamagent/.adv-payload.lock";
    const lockAbsPath = path.join(tmpCwd, lockRelPath);
    const expectedPayload = { pid: 42, started_at: "2026-05-08T00:00:00.000Z" };

    feedStdin(makePayload(tmpCwd));

    let bodyDuringHandler: string | null = null;

    await runUntilExit(() =>
      runAdvancedHook({
        channel: "Stop",
        parseInput: parseAny,
        escape: {
          lock: {
            relativePath: lockRelPath,
            payload: () => expectedPayload,
          },
        },
        handler: (): undefined => {
          bodyDuringHandler = fs.readFileSync(lockAbsPath, "utf-8");
          return undefined;
        },
      }),
    );

    expect(bodyDuringHandler).toBe(JSON.stringify(expectedPayload));
  });
});

// ── 2. manualResources — no eager open ────────────────────────────────────

describe("runAdvancedHook — manualResources: true", () => {
  it("DualLayerStore and SqliteEventLog are NOT constructed if handler never calls ctx.store()/ctx.eventLog()", async () => {
    feedStdin(makePayload(tmpCwd));

    await runUntilExit(() =>
      runAdvancedHook({
        channel: "Stop",
        parseInput: parseAny,
        escape: { manualResources: true },
        handler: (_ctx: AdvancedHookContext<Record<string, unknown>>): undefined => {
          // Deliberately do NOT call ctx.store() or ctx.eventLog().
          return undefined;
        },
      }),
    );

    expect(dualLayerStoreConstructorCount).toBe(0);
    expect(sqliteEventLogConstructorCount).toBe(0);
    expect(exitCode).toBe(0);
  });

  it("ctx.store() is constructed exactly once on repeated calls (memoized)", async () => {
    feedStdin(makePayload(tmpCwd));

    await runUntilExit(() =>
      runAdvancedHook({
        channel: "Stop",
        parseInput: parseAny,
        escape: { manualResources: true },
        handler: (ctx: AdvancedHookContext<Record<string, unknown>>): undefined => {
          // Call store() three times — constructor must fire only once.
          const s1 = ctx.store();
          const s2 = ctx.store();
          const s3 = ctx.store();
          expect(s1).toBe(s2);
          expect(s2).toBe(s3);
          return undefined;
        },
      }),
    );

    expect(dualLayerStoreConstructorCount).toBe(1);
    expect(exitCode).toBe(0);
  });

  it("ctx.eventLog() is constructed exactly once on repeated calls (memoized)", async () => {
    feedStdin(makePayload(tmpCwd));

    await runUntilExit(() =>
      runAdvancedHook({
        channel: "Stop",
        parseInput: parseAny,
        escape: { manualResources: true },
        handler: (ctx: AdvancedHookContext<Record<string, unknown>>): undefined => {
          const e1 = ctx.eventLog();
          const e2 = ctx.eventLog();
          expect(e1).toBe(e2);
          return undefined;
        },
      }),
    );

    expect(sqliteEventLogConstructorCount).toBe(1);
    expect(exitCode).toBe(0);
  });

  it("store opened by manual call is still closed in finally", async () => {
    feedStdin(makePayload(tmpCwd));

    await runUntilExit(() =>
      runAdvancedHook({
        channel: "Stop",
        parseInput: parseAny,
        escape: { manualResources: true },
        handler: (ctx: AdvancedHookContext<Record<string, unknown>>): undefined => {
          ctx.store(); // trigger the lazy open
          return undefined;
        },
      }),
    );

    expect(mockStoreClose).toHaveBeenCalledTimes(1);
    expect(exitCode).toBe(0);
  });

  it("eventLog opened by manual call is still closed in finally", async () => {
    feedStdin(makePayload(tmpCwd));

    await runUntilExit(() =>
      runAdvancedHook({
        channel: "Stop",
        parseInput: parseAny,
        escape: { manualResources: true },
        handler: (ctx: AdvancedHookContext<Record<string, unknown>>): undefined => {
          ctx.eventLog(); // trigger the lazy open
          return undefined;
        },
      }),
    );

    expect(mockEventLogClose).toHaveBeenCalledTimes(1);
    expect(exitCode).toBe(0);
  });
});

// ── 3. pipelineTimeoutMs — race + TIMEOUT_SENTINEL ────────────────────────

describe("runAdvancedHook — pipelineTimeoutMs", () => {
  it("handler that never resolves → timeout → no stdout written → exit 0", async () => {
    // Real 50ms timeout (not fake timers) — vi.advanceTimersByTime deadlocks
    // against readStdinJson's for-await on process.stdin. 50ms is the lower
    // bound that's reliable on a heavily-loaded CI host (10ms occasionally
    // raced with handler-coroutine scheduling). Total test runtime stays
    // well under the 5000ms vitest default.
    feedStdin(makePayload(tmpCwd));

    await runUntilExit(() =>
      runAdvancedHook({
        channel: "Stop",
        parseInput: parseAny,
        escape: { pipelineTimeoutMs: 50 },
        handler: () =>
          // A promise that never resolves — simulates a stuck pipeline.
          new Promise<{ result: string }>(() => { /* never */ }),
      }),
    );

    // TIMEOUT_SENTINEL → out is undefined → no stdout written.
    expect(stdoutBuf.join("")).toBe("");
    expect(exitCode).toBe(0);
  }, 5000);

  it("handler resolves before timeout → stdout IS written", async () => {
    feedStdin(makePayload(tmpCwd));

    await runUntilExit(() =>
      runAdvancedHook({
        channel: "Stop",
        parseInput: parseAny,
        escape: { pipelineTimeoutMs: 5000 },
        handler: async (): Promise<{ ok: boolean }> => {
          // Resolve immediately via microtask queue — well within 5 s.
          return { ok: true };
        },
      }),
    );

    expect(stdoutBuf.join("")).toBe(JSON.stringify({ ok: true }));
    expect(exitCode).toBe(0);
  }, 5000);

  it("resources are closed after timeout (finally block always runs)", async () => {
    feedStdin(makePayload(tmpCwd));

    await runUntilExit(() =>
      runAdvancedHook({
        channel: "Stop",
        parseInput: parseAny,
        // Combine manualResources + pipelineTimeoutMs to verify both interact correctly.
        escape: { pipelineTimeoutMs: 50, manualResources: true },
        handler: (ctx: AdvancedHookContext<Record<string, unknown>>) => {
          ctx.store(); // trigger lazy open so finally has something to close
          return new Promise<undefined>(() => { /* never */ });
        },
      }),
    );

    expect(mockStoreClose).toHaveBeenCalledTimes(1);
    expect(exitCode).toBe(0);
  }, 5000);

  it("lock file is cleaned up after timeout (finally block covers lock)", async () => {
    const lockRelPath = ".teamagent/.timeout-test.lock";
    const lockAbsPath = path.join(tmpCwd, lockRelPath);

    feedStdin(makePayload(tmpCwd));

    await runUntilExit(() =>
      runAdvancedHook({
        channel: "Stop",
        parseInput: parseAny,
        escape: {
          pipelineTimeoutMs: 50,
          lock: { relativePath: lockRelPath, payload: () => ({ pid: 1 }) },
        },
        handler: () => new Promise<undefined>(() => { /* never */ }),
      }),
    );

    // Lock must be gone even though handler timed out.
    expect(fs.existsSync(lockAbsPath)).toBe(false);
    expect(exitCode).toBe(0);
  }, 5000);
});

// ── 4. Detached re-entry ──────────────────────────────────────────────────

describe("runAdvancedHook — detached re-entry", () => {
  it("when isDetachedInvocation returns true, readArgvInput is called instead of stdin", async () => {
    // Feed empty stdin; if the shell mistakenly reads stdin, parseInput(null)
    // would return null and the handler would never run.
    feedStdin("");

    const detachedPayload = { tool_name: "Write", cwd: tmpCwd };
    let readArgvInputCalled = false;
    let isDetachedInvocationCalled = false;

    await runUntilExit(() =>
      runAdvancedHook({
        channel: "Stop",
        parseInput: parseAny,
        escape: {
          detached: {
            isDetachedInvocation: (_env, _argv) => {
              isDetachedInvocationCalled = true;
              return true;
            },
            readArgvInput: (_argv) => {
              readArgvInputCalled = true;
              return detachedPayload;
            },
          },
        },
        handler: (ctx: AdvancedHookContext<Record<string, unknown>>) => {
          return { ran: true, tool: ctx.input.tool_name };
        },
      }),
    );

    expect(isDetachedInvocationCalled).toBe(true);
    expect(readArgvInputCalled).toBe(true);
    // Handler ran with the argv-sourced input, not empty stdin → stdout written.
    expect(stdoutBuf.join("")).toBe(JSON.stringify({ ran: true, tool: "Write" }));
    expect(exitCode).toBe(0);
  });

  it("when isDetachedInvocation returns false, stdin is parsed normally", async () => {
    feedStdin(makePayload(tmpCwd));

    let readArgvInputCalled = false;
    let handlerRan = false;

    await runUntilExit(() =>
      runAdvancedHook({
        channel: "Stop",
        parseInput: parseAny,
        escape: {
          detached: {
            isDetachedInvocation: () => false,
            readArgvInput: (_argv): null => {
              readArgvInputCalled = true;
              return null;
            },
          },
        },
        handler: (): undefined => {
          handlerRan = true;
          return undefined;
        },
      }),
    );

    expect(readArgvInputCalled).toBe(false);
    // Handler ran because stdin parsed to a valid object.
    expect(handlerRan).toBe(true);
    expect(exitCode).toBe(0);
  });

  it("detached: readArgvInput returning null → fast-exit (parseInput receives null)", async () => {
    feedStdin("");

    let handlerRan = false;

    await runUntilExit(() =>
      runAdvancedHook({
        channel: "Stop",
        parseInput: (raw) => (raw === null ? null : (raw as Record<string, unknown>)),
        escape: {
          detached: {
            isDetachedInvocation: () => true,
            readArgvInput: () => null, // simulates a missing tmp file
          },
        },
        handler: (): undefined => {
          handlerRan = true;
          return undefined;
        },
      }),
    );

    // parseInput(null) → null → fast-exit before handler fires.
    expect(handlerRan).toBe(false);
    expect(exitCode).toBe(0);
  });
});

// ── 5. Misc edge cases ────────────────────────────────────────────────────

describe("runAdvancedHook — misc", () => {
  it("envelope wraps handler output before writing to stdout", async () => {
    feedStdin(makePayload(tmpCwd));

    await runUntilExit(() =>
      runAdvancedHook({
        channel: "Stop",
        parseInput: parseAny,
        escape: { manualResources: true },
        handler: (): { decision: string } => ({ decision: "allow" }),
        envelope: (out: { decision: string }) => ({ hookSpecificOutput: out }),
      }),
    );

    expect(stdoutBuf.join("")).toBe(
      JSON.stringify({ hookSpecificOutput: { decision: "allow" } }),
    );
    expect(exitCode).toBe(0);
  });

  it("empty stdin (null raw) → fast-exit 0 without calling handler", async () => {
    feedStdin("");

    let handlerCalled = false;
    await runUntilExit(() =>
      runAdvancedHook({
        channel: "Stop",
        parseInput: (raw) => (raw === null ? null : (raw as Record<string, unknown>)),
        escape: { manualResources: true },
        handler: (): undefined => {
          handlerCalled = true;
          return undefined;
        },
      }),
    );

    expect(handlerCalled).toBe(false);
    expect(exitCode).toBe(0);
  });

  it("handler can call ctx.mirrorSystemMessage which writes to stderr", async () => {
    feedStdin(makePayload(tmpCwd));

    await runUntilExit(() =>
      runAdvancedHook({
        channel: "Stop",
        parseInput: parseAny,
        escape: { manualResources: true },
        handler: (ctx: AdvancedHookContext<Record<string, unknown>>): undefined => {
          ctx.mirrorSystemMessage("advanced hook message");
          return undefined;
        },
      }),
    );

    expect(stderrBuf.join("")).toContain("advanced hook message");
    expect(exitCode).toBe(0);
  });

  it("ctx.clock.nowIso returns a valid ISO string", async () => {
    feedStdin(makePayload(tmpCwd));

    let clockNow: string | null = null;
    await runUntilExit(() =>
      runAdvancedHook({
        channel: "Stop",
        parseInput: parseAny,
        escape: { manualResources: true },
        handler: (ctx: AdvancedHookContext<Record<string, unknown>>): undefined => {
          clockNow = ctx.clock.nowIso();
          return undefined;
        },
      }),
    );

    expect(clockNow).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(exitCode).toBe(0);
  });

  it("ctx.clock.monotonicMs returns a non-negative number", async () => {
    feedStdin(makePayload(tmpCwd));

    let elapsed: number | null = null;
    await runUntilExit(() =>
      runAdvancedHook({
        channel: "Stop",
        parseInput: parseAny,
        escape: { manualResources: true },
        handler: (ctx: AdvancedHookContext<Record<string, unknown>>): undefined => {
          elapsed = ctx.clock.monotonicMs();
          return undefined;
        },
      }),
    );

    expect(typeof elapsed).toBe("number");
    expect(elapsed as unknown as number).toBeGreaterThanOrEqual(0);
    expect(exitCode).toBe(0);
  });

  it("escape gate rejects empty escape at runtime → stderr log + exit 0", async () => {
    feedStdin(makePayload(tmpCwd));

    let handlerCalled = false;
    await runUntilExit(() =>
      // Pass `as never` to bypass the compile-time RequireAtLeastOneEscape gate.
      runAdvancedHook({
        channel: "Stop",
        parseInput: parseAny,
        escape: {} as never,
        handler: (): undefined => {
          handlerCalled = true;
          return undefined;
        },
      } as never),
    );

    expect(handlerCalled).toBe(false);
    expect(stderrBuf.join("")).toContain("escape gate");
    expect(exitCode).toBe(0);
  });

  it("ctx.input carries the parsed stdin payload into the handler", async () => {
    feedStdin(makePayload(tmpCwd));

    let seenInput: Record<string, unknown> | null = null;
    await runUntilExit(() =>
      runAdvancedHook({
        channel: "Stop",
        parseInput: parseAny,
        escape: { manualResources: true },
        handler: (ctx: AdvancedHookContext<Record<string, unknown>>): undefined => {
          seenInput = ctx.input;
          return undefined;
        },
      }),
    );

    expect(seenInput).toMatchObject({ tool_name: "Bash", cwd: tmpCwd });
    expect(exitCode).toBe(0);
  });
});
