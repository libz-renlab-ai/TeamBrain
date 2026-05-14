import { describe, it, expect, vi, afterEach } from "vitest";
import {
  isSqliteLoadError,
  handleHookUncaughtException,
  armHookBootstrap,
  HOOK_SQLITE_FALLBACK_MESSAGE,
} from "../hook-bootstrap.js";

/**
 * Issue #477: the last-resort guard for hook bundles that fail to load
 * `node:sqlite`. The `uncaughtException` *registration* is unit-untestable
 * (and intentionally skipped under VITEST), so the handler body is exported
 * and tested directly here. P3 of the issue's judge harness — "hook bundle
 * fallback message fires, not a raw stack" — lives in this file.
 */

function sqliteError(extra: Partial<{ cause: unknown }> = {}): Error & {
  code: string;
} {
  const e = new Error(
    "Cannot find module 'node:sqlite'\nNo such built-in module: node:sqlite",
  ) as Error & { code: string };
  e.code = "ERR_UNKNOWN_BUILTIN_MODULE";
  if ("cause" in extra) (e as { cause?: unknown }).cause = extra.cause;
  return e;
}

describe("isSqliteLoadError (#477)", () => {
  it("matches the node:sqlite builtin-load failure", () => {
    expect(isSqliteLoadError(sqliteError())).toBe(true);
  });

  it("matches when the real error is one level down under err.cause", () => {
    const wrapped = new Error("hook bundle failed to initialize") as Error & {
      cause?: unknown;
    };
    wrapped.cause = sqliteError();
    expect(isSqliteLoadError(wrapped)).toBe(true);
  });

  it("matches MODULE_NOT_FOUND for node:sqlite (defensive hedge for older Node)", () => {
    const e = new Error("Cannot find module 'node:sqlite'") as Error & {
      code: string;
    };
    e.code = "MODULE_NOT_FOUND";
    expect(isSqliteLoadError(e)).toBe(true);
  });

  it("does NOT match a generic MODULE_NOT_FOUND for some other module", () => {
    const e = new Error("Cannot find module 'lodash'") as Error & {
      code: string;
    };
    e.code = "MODULE_NOT_FOUND";
    expect(isSqliteLoadError(e)).toBe(false);
  });

  it("does NOT match a different unknown builtin (tight predicate)", () => {
    const e = new Error("No such built-in module: node:foobar") as Error & {
      code: string;
    };
    e.code = "ERR_UNKNOWN_BUILTIN_MODULE";
    expect(isSqliteLoadError(e)).toBe(false);
  });

  it("does NOT match an unrelated error that merely mentions node:sqlite", () => {
    const e = new Error("query against node:sqlite returned 0 rows") as Error & {
      code: string;
    };
    e.code = "SOME_OTHER_CODE";
    expect(isSqliteLoadError(e)).toBe(false);
  });

  it("does NOT match non-objects / nullish", () => {
    expect(isSqliteLoadError(null)).toBe(false);
    expect(isSqliteLoadError(undefined)).toBe(false);
    expect(isSqliteLoadError("ERR_UNKNOWN_BUILTIN_MODULE node:sqlite")).toBe(
      false,
    );
  });
});

describe("HOOK_SQLITE_FALLBACK_MESSAGE (#477)", () => {
  it("is one actionable line pointing at `teamagent doctor` — no stack", () => {
    expect(HOOK_SQLITE_FALLBACK_MESSAGE).toContain("node:sqlite");
    expect(HOOK_SQLITE_FALLBACK_MESSAGE).toContain("teamagent doctor");
    expect(HOOK_SQLITE_FALLBACK_MESSAGE).not.toContain("\n");
    // Must not look like a raw V8 stack frame.
    expect(HOOK_SQLITE_FALLBACK_MESSAGE).not.toMatch(/\bat\s+\S+:\d+/);
  });
});

describe("handleHookUncaughtException (#477, P3)", () => {
  let exitCode: number | undefined;
  let stderr: string;

  function arm(): void {
    exitCode = undefined;
    stderr = "";
    vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      exitCode = code;
      throw new Error(`__process_exit__:${code}`);
    }) as never);
    vi.spyOn(process.stderr, "write").mockImplementation(((
      chunk: string | Uint8Array,
    ) => {
      stderr += String(chunk);
      return true;
    }) as never);
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("node:sqlite load failure → one actionable line, exit 0, no stack dump", () => {
    arm();
    expect(() => handleHookUncaughtException(sqliteError())).toThrow(
      "__process_exit__:0",
    );
    expect(exitCode).toBe(0);
    expect(stderr).toContain(HOOK_SQLITE_FALLBACK_MESSAGE);
    expect(stderr).toContain("teamagent doctor");
    // The whole point of P3: NOT a raw stack trace.
    expect(stderr).not.toMatch(/\bat\s+\S+:\d+/);
    expect(stderr).not.toContain("ERR_UNKNOWN_BUILTIN_MODULE");
  });

  it("unrelated error → restores loud default behavior: stack printed, exit 1", () => {
    arm();
    const bug = new Error("a genuine hook bug");
    expect(() => handleHookUncaughtException(bug)).toThrow(
      "__process_exit__:1",
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain("a genuine hook bug");
    expect(stderr).not.toContain(HOOK_SQLITE_FALLBACK_MESSAGE);
  });
});

describe("armHookBootstrap (#477)", () => {
  it("is idempotent — repeated calls do not throw", () => {
    expect(() => {
      armHookBootstrap();
      armHookBootstrap();
      armHookBootstrap();
    }).not.toThrow();
  });
});
