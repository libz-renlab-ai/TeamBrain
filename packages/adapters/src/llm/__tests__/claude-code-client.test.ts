import { describe, it, expect } from "vitest";
import {
  runLLMClientContract,
  type LLMBehavior,
} from "@teamagent/ports/contracts";
import {
  ClaudeCodeLLMClient,
  defaultSpawnerOptions,
  parseClaudeJsonOutput,
  type Spawner,
  type SpawnResult,
} from "../claude-code-client.js";
import { LLMClientError } from "@teamagent/ports";

/** 按 behavior 指令构造 fake spawner。 */
function makeSpawner(behavior: LLMBehavior): Spawner {
  return async (_cmd, _args, _opts): Promise<SpawnResult> => {
    switch (behavior.kind) {
      case "ok":
        return {
          kind: "exit",
          code: 0,
          stdout: JSON.stringify({
            type: "result",
            subtype: "success",
            is_error: false,
            result: behavior.text,
          }),
          stderr: "",
        };
      case "not-installed":
        return { kind: "enoent" };
      case "timeout":
        return { kind: "timeout" };
      case "non-zero-exit":
        return {
          kind: "exit",
          code: behavior.exitCode,
          stdout: "",
          stderr: "some error",
        };
      case "unparseable-output":
        return {
          kind: "exit",
          code: 0,
          stdout: "not-a-json-blob",
          stderr: "",
        };
    }
  };
}

describe("ClaudeCodeLLMClient", () => {
  runLLMClientContract((behavior) =>
    new ClaudeCodeLLMClient({ spawner: makeSpawner(behavior) }),
  );

  describe("prompt dispatch", () => {
    it("passes prompt via stdin and extracts .result", async () => {
      let capturedInput = "";
      const spawner: Spawner = async (_cmd, _args, opts) => {
        capturedInput = opts.input;
        return {
          kind: "exit",
          code: 0,
          stdout: JSON.stringify({ result: "done" }),
          stderr: "",
        };
      };
      const client = new ClaudeCodeLLMClient({ spawner });
      const out = await client.complete("hello");
      expect(out).toBe("done");
      expect(capturedInput).toBe("hello");
    });

    it("uses -p --output-format json --no-session-persistence flags", async () => {
      let capturedArgs: string[] = [];
      const spawner: Spawner = async (_cmd, args, _opts) => {
        capturedArgs = args;
        return {
          kind: "exit",
          code: 0,
          stdout: JSON.stringify({ result: "ok" }),
          stderr: "",
        };
      };
      const client = new ClaudeCodeLLMClient({ spawner });
      await client.complete("x");
      expect(capturedArgs).toContain("-p");
      expect(capturedArgs).toContain("--output-format");
      expect(capturedArgs).toContain("json");
      expect(capturedArgs).toContain("--no-session-persistence");
    });

    it("passes --model when model option provided", async () => {
      let capturedArgs: string[] = [];
      const spawner: Spawner = async (_cmd, args, _opts) => {
        capturedArgs = args;
        return {
          kind: "exit",
          code: 0,
          stdout: JSON.stringify({ result: "ok" }),
          stderr: "",
        };
      };
      const client = new ClaudeCodeLLMClient({ spawner, model: "haiku" });
      await client.complete("x");
      const idx = capturedArgs.indexOf("--model");
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(capturedArgs[idx + 1]).toBe("haiku");
    });

    it("omits --model when model option not provided (no env set)", async () => {
      const origEnv = process.env.TEAMAGENT_LLM_MODEL;
      delete process.env.TEAMAGENT_LLM_MODEL;
      try {
        let capturedArgs: string[] = [];
        const spawner: Spawner = async (_cmd, args, _opts) => {
          capturedArgs = args;
          return {
            kind: "exit",
            code: 0,
            stdout: JSON.stringify({ result: "ok" }),
            stderr: "",
          };
        };
        const client = new ClaudeCodeLLMClient({ spawner });
        await client.complete("x");
        expect(capturedArgs).not.toContain("--model");
      } finally {
        if (origEnv !== undefined) process.env.TEAMAGENT_LLM_MODEL = origEnv;
      }
    });

    it("reads TEAMAGENT_LLM_MODEL env as default model", async () => {
      process.env.TEAMAGENT_LLM_MODEL = "sonnet";
      try {
        let capturedArgs: string[] = [];
        const spawner: Spawner = async (_cmd, args, _opts) => {
          capturedArgs = args;
          return {
            kind: "exit",
            code: 0,
            stdout: JSON.stringify({ result: "ok" }),
            stderr: "",
          };
        };
        const client = new ClaudeCodeLLMClient({ spawner });
        await client.complete("x");
        const idx = capturedArgs.indexOf("--model");
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(capturedArgs[idx + 1]).toBe("sonnet");
      } finally {
        delete process.env.TEAMAGENT_LLM_MODEL;
      }
    });
  });
});

describe("parseClaudeJsonOutput", () => {
  it("extracts .result field", () => {
    const out = parseClaudeJsonOutput(
      JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: false,
        result: "hello world",
      }),
    );
    expect(out).toBe("hello world");
  });

  it("throws on empty output", () => {
    expect(() => parseClaudeJsonOutput("")).toThrow(LLMClientError);
    expect(() => parseClaudeJsonOutput("   \n")).toThrow(LLMClientError);
  });

  it("throws on malformed JSON", () => {
    expect(() => parseClaudeJsonOutput("not json")).toThrow(LLMClientError);
  });

  it("throws when is_error=true", () => {
    const stdout = JSON.stringify({
      type: "result",
      is_error: true,
      result: "rate limited",
    });
    expect(() => parseClaudeJsonOutput(stdout)).toThrow(/is_error/);
  });

  it("throws when .result missing or not string", () => {
    expect(() =>
      parseClaudeJsonOutput(JSON.stringify({ is_error: false })),
    ).toThrow(LLMClientError);
    expect(() =>
      parseClaudeJsonOutput(JSON.stringify({ result: 42 })),
    ).toThrow(LLMClientError);
  });

  // Claude CLI v2.1+ returns an array of streaming events (system/assistant/result/...).
  // Parser must locate the {type:"result"} element and return its .result field.
  it("extracts .result from streaming-events array (CLI v2.1+ format)", () => {
    const stdout = JSON.stringify([
      { type: "system", subtype: "init", session_id: "abc" },
      { type: "assistant", message: { content: [{ type: "text", text: "Hi." }] } },
      { type: "rate_limit_event", rate_limit_info: { status: "allowed" } },
      {
        type: "result",
        subtype: "success",
        is_error: false,
        result: "Hi.",
        duration_ms: 1234,
      },
    ]);
    expect(parseClaudeJsonOutput(stdout)).toBe("Hi.");
  });

  it("throws when array has no {type:'result'} element", () => {
    const stdout = JSON.stringify([
      { type: "system", subtype: "init" },
      { type: "assistant", message: {} },
    ]);
    expect(() => parseClaudeJsonOutput(stdout)).toThrow(LLMClientError);
  });

  it("throws when array's result event has is_error=true", () => {
    const stdout = JSON.stringify([
      { type: "system" },
      { type: "result", is_error: true, result: "rate limited" },
    ]);
    expect(() => parseClaudeJsonOutput(stdout)).toThrow(/is_error/);
  });
});

/**
 * Issue #280: assert the Windows-conditional `shell: true` branch of the
 * default spawner. Tested via the exported `defaultSpawnerOptions` helper
 * so we do not have to monkey-patch `process.platform` or actually spawn.
 *
 * Why this matters: with `shell: false` on Windows, Node's spawn lookup
 * does NOT honor PATHEXT and lands on the first `*.exe` in PATH — which
 * on machines that have moved their global npm prefix is a stale
 * `claude.exe` launcher pointing to a deleted `cli.js`. The user's
 * `analyze --commit` then logs `failed=N, extracted=0` every cycle and
 * learning silently halts.
 */
describe("defaultSpawnerOptions (issue #280)", () => {
  it("enables shell on Windows so cmd.exe honors PATHEXT", () => {
    const opts = defaultSpawnerOptions("win32");
    expect(opts.shell).toBe(true);
  });

  it("keeps shell off on macOS / Linux to avoid an extra shell process", () => {
    expect(defaultSpawnerOptions("darwin").shell).toBe(false);
    expect(defaultSpawnerOptions("linux").shell).toBe(false);
    expect(defaultSpawnerOptions("freebsd").shell).toBe(false);
  });

  it("always pipes stdio (stdin/stdout/stderr) so the client can write the prompt", () => {
    for (const p of ["win32", "darwin", "linux"] as NodeJS.Platform[]) {
      expect(defaultSpawnerOptions(p).stdio).toEqual(["pipe", "pipe", "pipe"]);
    }
  });

  it("always keeps windowsHide=true to avoid console flashes from the Stop pipeline", () => {
    for (const p of ["win32", "darwin", "linux"] as NodeJS.Platform[]) {
      expect(defaultSpawnerOptions(p).windowsHide).toBe(true);
    }
  });

  it("defaults to the current process.platform when called with no argument", () => {
    // Sanity check: should not throw and should produce a consistent
    // shape regardless of host platform. We only assert structural keys
    // because the actual `shell` value depends on where this test runs.
    const opts = defaultSpawnerOptions();
    expect(Object.keys(opts).sort()).toEqual(["shell", "stdio", "windowsHide"]);
    expect(opts.shell).toBe(process.platform === "win32");
  });
});
