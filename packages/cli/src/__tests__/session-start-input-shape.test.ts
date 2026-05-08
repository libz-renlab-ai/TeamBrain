import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { promises as fs, statSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/**
 * B-145: bin-session-start.cjs must reject non-SessionStart payloads
 * (garbage / empty stdin without env hint) so accidental invocation by
 * cron jobs / typos / unrelated tools cannot fire m5-bootstrap or write
 * to ~/.claude/settings.json.
 *
 * We invoke the built bundle directly via `node` and inspect stdout/stderr.
 */

// Use the source TS via `node --import tsx` so this test runs without a
// fresh dist build and without depending on the .cmd shim shape.
const HOOK = path.resolve(__dirname, "..", "bin-session-start.ts");
// monorepo-root node_modules from packages/cli/src/__tests__/ → 4 levels up
const TSX_LOADER = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "node_modules",
  "tsx",
);

describe.skipIf(!isHookBuilt())("bin-session-start input-shape gate (B-145)", () => {
  let tempHome: string;
  beforeEach(async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "teamagent-session-start-test-"));
  });
  afterEach(async () => {
    await fs.rm(tempHome, { recursive: true, force: true });
  });

  it("garbage stdin without CLAUDE_PROJECT_DIR is silent (no m5-bootstrap)", () => {
    const r = spawnSync(process.execPath, ["--import", "tsx/esm", HOOK], {
      input: "this is total garbage\n",
      encoding: "utf-8",
      env: cleanEnv(tempHome),
    });
    // Must not block — exit 0 always.
    expect(r.status).toBe(0);
    // Must not have run m5-bootstrap (no banner).
    expect(r.stderr).not.toMatch(/teamagent M5/);
    expect(r.stdout).not.toMatch(/teamagent M5/);
  });

  it("empty stdin without CLAUDE_PROJECT_DIR is silent", () => {
    const r = spawnSync(process.execPath, ["--import", "tsx/esm", HOOK], {
      input: "",
      encoding: "utf-8",
      env: cleanEnv(tempHome),
    });
    expect(r.status).toBe(0);
    expect(r.stderr).not.toMatch(/teamagent M5/);
  });

  it("payload without hook_event_name is silent", () => {
    const r = spawnSync(process.execPath, ["--import", "tsx/esm", HOOK], {
      input: JSON.stringify({ cwd: tempHome, foo: "bar" }),
      encoding: "utf-8",
      env: cleanEnv(tempHome),
    });
    expect(r.status).toBe(0);
    expect(r.stderr).not.toMatch(/teamagent M5/);
  });

  it("hook_event_name=SessionStart proceeds (CLAUDE_PROJECT_DIR not set)", () => {
    const r = spawnSync(process.execPath, ["--import", "tsx/esm", HOOK], {
      input: JSON.stringify({ cwd: tempHome, hook_event_name: "SessionStart" }),
      encoding: "utf-8",
      env: cleanEnv(tempHome),
    });
    expect(r.status).toBe(0);
    // Either the M5 banner appeared, the auto-init banner appeared, or the
    // skip-not-a-project notice appeared — any one means the gate let us through.
    const combined = (r.stdout ?? "") + (r.stderr ?? "");
    expect(combined.length).toBeGreaterThan(0);
  });

  it("CLAUDE_PROJECT_DIR set in env proceeds even with empty stdin", () => {
    const r = spawnSync(process.execPath, ["--import", "tsx/esm", HOOK], {
      input: "",
      encoding: "utf-8",
      env: { ...cleanEnv(tempHome), CLAUDE_PROJECT_DIR: tempHome },
    });
    expect(r.status).toBe(0);
    const combined = (r.stdout ?? "") + (r.stderr ?? "");
    expect(combined.length).toBeGreaterThan(0);
  });
});

function isHookBuilt(): boolean {
  try {
    statSync(TSX_LOADER);
    return true;
  } catch {
    return false;
  }
}

function cleanEnv(home: string): NodeJS.ProcessEnv {
  // Drop CLAUDE_PROJECT_DIR + TEAMAGENT_* so each case starts from a known baseline.
  // Keep PATH so node can find subprocess deps.
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: home,
    USERPROFILE: home,
    TEAMAGENT_HOME: path.join(home, ".teamagent"),
    TEAMAGENT_M5_AUTOSESSION: "0", // do not actually mutate filesystem in test
  };
  return env;
}
