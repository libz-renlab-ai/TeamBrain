/**
 * Tests for `teamagent demo` (issue #93) — three modes.
 *
 * Default mode polls events.db for a matching attribution event.
 * --inline mode renders deterministic ANSI output without an IDE.
 * --record mode generates a vhs tape and (optionally) renders a GIF.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";

import {
  parseDemoArgs,
  executeDemoInlineWithSpawn,
  executeDemoRecord,
  executeDemoDefault,
  buildVhsTape,
  renderInlineDecisionAnsi,
  type SpawnLike,
} from "../commands/demo.js";

const requireCjs = createRequire(import.meta.url);

function mkTmp(prefix: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return {
    dir,
    cleanup: () => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    },
  };
}

describe("parseDemoArgs", () => {
  it("no args → default mode", () => {
    expect(parseDemoArgs([])).toEqual({ mode: "default" });
  });

  it("--inline → inline mode", () => {
    expect(parseDemoArgs(["--inline"])).toEqual({ mode: "inline" });
  });

  it("--record <path> → record mode with explicit path", () => {
    expect(parseDemoArgs(["--record", "out.gif"])).toEqual({
      mode: "record",
      recordPath: "out.gif",
    });
  });

  it("--record without path → record mode with default path", () => {
    expect(parseDemoArgs(["--record"])).toMatchObject({
      mode: "record",
      recordPath: expect.stringMatching(/demo\.gif$/),
    });
  });

  it("`hook ...` is reserved for the legacy demo-hook subcommand", () => {
    // demo dispatcher in bin.ts handles this case; parseDemoArgs only deals
    // with the new modes, so seeing "hook" should be flagged as unknown.
    expect(parseDemoArgs(["hook", "Bash"])).toEqual({
      mode: "unknown",
      reason: "hook is handled by `teamagent demo hook` (legacy dispatcher)",
    });
  });

  it("unrecognized flags surface as unknown mode", () => {
    expect(parseDemoArgs(["--bogus"])).toMatchObject({
      mode: "unknown",
    });
  });
});

describe("renderInlineDecisionAnsi", () => {
  it("renders a deny decision as a red box mentioning moment and dayjs", () => {
    const out = renderInlineDecisionAnsi({
      tool_name: "Bash",
      tool_input: { command: "npm install moment" },
      decision: "deny",
      message:
        "🚫 TeamAgent 拦截 (置信 0.85)\n应改用: 使用 dayjs 或 date-fns 替代 moment\n原因: deprecated\n(规则 id: seed-pack-universal-moment)",
    });
    expect(out).toContain("npm install moment");
    expect(out).toContain("dayjs");
    expect(out).toContain("seed-pack-universal-moment");
    // deny carries the red-flagged emoji marker
    expect(out).toMatch(/🚫|⛔|deny/i);
  });

  it("renders an allow decision plainly without a deny marker", () => {
    const out = renderInlineDecisionAnsi({
      tool_name: "Bash",
      tool_input: { command: "ls" },
      decision: "allow",
      message: "no rule matched",
    });
    expect(out).toContain("allow");
    expect(out).not.toMatch(/🚫/);
  });
});

describe("executeDemoInlineWithSpawn", () => {
  it("feeds the canonical fixture (npm install moment) to stdin and renders deny output", async () => {
    let stdinPayload = "";
    const stdoutPayload = JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          "TeamAgent: 应改用 dayjs 或 date-fns 替代 moment (rule seed-pack-universal-moment)",
      },
    });

    const fakeSpawn: SpawnLike = (_cmd, _args, _opts) => {
      const dataHandlers: Array<(d: Buffer) => void> = [];
      const closeHandlers: Array<(code: number) => void> = [];
      return {
        stdin: {
          write: (chunk: string) => {
            stdinPayload += chunk;
            return true;
          },
          end: () => {
            // Simulate hook returning stdout payload + exit 0
            for (const h of dataHandlers) h(Buffer.from(stdoutPayload));
            for (const h of closeHandlers) h(0);
          },
        },
        stdout: {
          on: (event: string, cb: (d: Buffer) => void) => {
            if (event === "data") dataHandlers.push(cb);
          },
        },
        stderr: { on: () => {} },
        on: (event: string, cb: (code: number) => void) => {
          if (event === "close" || event === "exit") closeHandlers.push(cb);
        },
      };
    };

    const result = await executeDemoInlineWithSpawn({
      spawn: fakeSpawn,
      hookBinPath: "/fake/dist/bin-pre-tool-use.cjs",
    });

    // stdin was the canonical fixture
    expect(JSON.parse(stdinPayload)).toMatchObject({
      tool_name: "Bash",
      tool_input: { command: "npm install moment" },
    });
    // rendered output mentions deny + the fixture command
    expect(result.exitCode).toBe(0);
    expect(result.rendered).toContain("npm install moment");
    expect(result.rendered).toMatch(/deny|🚫/);
  });
});

describe("executeDemoRecord / buildVhsTape", () => {
  it("buildVhsTape emits a vhs config that types the moment fixture", () => {
    const tape = buildVhsTape({ outputPath: "demo.gif", width: 1200, height: 600 });
    expect(tape).toContain("Output demo.gif");
    expect(tape).toContain('Type "npm install moment"');
    expect(tape).toMatch(/Set\s+Width\s+1200/);
    expect(tape).toMatch(/Set\s+Height\s+600/);
  });

  it("executeDemoRecord writes a .tape next to the GIF target and reports vhs presence", async () => {
    const tmp = mkTmp("demo-record-");
    try {
      const gifPath = path.join(tmp.dir, "demo.gif");
      const r = await executeDemoRecord({
        recordPath: gifPath,
        checkVhs: () => false,
        spawnVhs: () => {
          throw new Error("must not spawn vhs when checkVhs returns false");
        },
      });
      expect(r.tapePath).toMatch(/\.tape$/);
      expect(fs.existsSync(r.tapePath)).toBe(true);
      expect(r.vhsAvailable).toBe(false);
      expect(r.message).toMatch(/vhs/i);
      const tape = fs.readFileSync(r.tapePath, "utf-8");
      expect(tape).toContain("npm install moment");
    } finally {
      tmp.cleanup();
    }
  });

  it("executeDemoRecord spawns vhs when available and reports success", async () => {
    const tmp = mkTmp("demo-record-");
    try {
      const gifPath = path.join(tmp.dir, "demo.gif");
      let spawned: { args: string[] } | null = null;
      const r = await executeDemoRecord({
        recordPath: gifPath,
        checkVhs: () => true,
        spawnVhs: (args) => {
          spawned = { args };
          return { ok: true };
        },
      });
      expect(spawned).not.toBeNull();
      expect(spawned!.args[0]).toMatch(/\.tape$/);
      expect(r.vhsAvailable).toBe(true);
      expect(r.spawnResult?.ok).toBe(true);
    } finally {
      tmp.cleanup();
    }
  });
});

describe("executeDemoDefault — events.db poll", () => {
  it("returns the matching event when one appears within the timeout", async () => {
    const tmp = mkTmp("demo-default-");
    try {
      const home = tmp.dir;
      // Pre-create events.db with a fixture row that the poll should pick up.
      const teamagentDir = path.join(home, ".teamagent");
      fs.mkdirSync(teamagentDir, { recursive: true });
      const eventsDb = path.join(teamagentDir, "events.db");
      // Create the file with a matching row already present.
      const { DatabaseSync } = requireCjs("node:sqlite") as typeof import("node:sqlite");
      const db = new DatabaseSync(eventsDb);
      db.exec(
        "CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, kind TEXT, knowledge_id TEXT, tool_use_id TEXT, timestamp TEXT, payload TEXT)",
      );
      const matchTs = new Date().toISOString();
      db.prepare(
        "INSERT INTO events (id, kind, knowledge_id, tool_use_id, timestamp, payload) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(
        "demo-evt-1",
        "rule_applied",
        "seed-pack-universal-moment",
        "tool-1",
        matchTs,
        JSON.stringify({ rule_id: "seed-pack-universal-moment", decision: "deny" }),
      );
      db.close();

      const r = await executeDemoDefault({
        homeDir: home,
        timeoutMs: 1500,
        pollIntervalMs: 100,
        // Match on knowledge_id substring; the seeded row above passes.
        matchKnowledgeIdLike: "moment",
        // start time before our seeded event timestamp so it counts as "new"
        sinceIso: new Date(Date.now() - 60_000).toISOString(),
        nowIso: matchTs,
      });
      expect(r.status).toBe("matched");
      expect(r.event?.knowledge_id).toBe("seed-pack-universal-moment");
    } finally {
      tmp.cleanup();
    }
  });

  it("returns timeout status when no event arrives in time", async () => {
    const tmp = mkTmp("demo-default-");
    try {
      const r = await executeDemoDefault({
        homeDir: tmp.dir,
        timeoutMs: 200,
        pollIntervalMs: 50,
        matchKnowledgeIdLike: "moment",
        sinceIso: new Date(Date.now() - 60_000).toISOString(),
      });
      expect(r.status).toBe("timeout");
      expect(r.event).toBeUndefined();
    } finally {
      tmp.cleanup();
    }
  });
});
