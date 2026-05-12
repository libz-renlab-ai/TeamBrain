import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  findUpdaterBinary,
  runUpdateCommand,
  parseUpdateArgs,
  readState,
  writeState,
} from "../commands/update.js";
import { defaultUpdateState } from "@teamagent/core";
import type { FetchShaResult } from "../github-api.js";

// Mock the github-api module so legacy checkCmd tests don't make real HTTP calls.
// Pre-#313 path; runUpdater + checkCmd no longer call fetchRemoteSha in #313.
vi.mock("../github-api.js", () => ({
  fetchRemoteSha: vi.fn(),
}));

// Issue #313: checkCmd now goes through fetchLatestVersion (Pages → npm).
// Mock the new module so the #313 path is also test-injectable.
vi.mock("../update/fetch-latest.js", () => ({
  fetchLatestVersion: vi.fn(),
}));

// Issue #245: capture every upgrade emit without touching the real
// events.db / sqlite. Each test inspects `emittedEvents` to assert.
const emittedEvents: { kind: string; [k: string]: unknown }[] = [];
vi.mock("../lib/upgrade-event-emitter.js", () => ({
  emitUpgradeEventSync: (event: { kind: string; [k: string]: unknown }) => {
    emittedEvents.push(event);
  },
  emitUpgradeEvent: async (event: { kind: string; [k: string]: unknown }) => {
    emittedEvents.push(event);
  },
}));

let tmpHome: string;
let envBak: string | undefined;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "tg-upd-cmd-"));
  envBak = process.env["TEAMAGENT_HOME"];
  process.env["TEAMAGENT_HOME"] = tmpHome;
  emittedEvents.length = 0;
});

afterEach(() => {
  if (envBak === undefined) delete process.env["TEAMAGENT_HOME"];
  else process.env["TEAMAGENT_HOME"] = envBak;
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

describe("update command", () => {
  it("status default returns full snapshot", async () => {
    const s = defaultUpdateState();
    s.last_installed_sha = "abcdef1234";
    writeState(s);
    const r = await runUpdateCommand("status");
    expect(r.ok).toBe(true);
    expect(r.output).toContain("abcdef1234");
    expect(r.output).toContain("updater_binary:");
  });

  it("findUpdaterBinary exposes missing updater without running install", () => {
    const fakeModule = path.join(tmpHome, "src", "commands", "update.js");
    expect(findUpdaterBinary(`file://${fakeModule}`)).toBeNull();
  });

  it("disable creates marker, enable removes", async () => {
    const dis = await runUpdateCommand("disable");
    expect(dis.ok).toBe(true);
    expect(fs.existsSync(path.join(tmpHome, "auto-update.disabled"))).toBe(true);
    const en = await runUpdateCommand("enable");
    expect(en.ok).toBe(true);
    expect(fs.existsSync(path.join(tmpHome, "auto-update.disabled"))).toBe(false);
  });

  it("logs shows tail or empty", async () => {
    const r = await runUpdateCommand("logs");
    expect(r.output).toBe("(empty)\n");
    fs.writeFileSync(path.join(tmpHome, "update.log"), "line1\nline2\n");
    const r2 = await runUpdateCommand("logs");
    expect(r2.output).toContain("line1");
  });

  it("parseUpdateArgs picks correct subcommand", () => {
    expect(parseUpdateArgs(["--status"]).sub).toBe("status");
    expect(parseUpdateArgs(["--check"]).sub).toBe("check");
    expect(parseUpdateArgs(["--rollback", "abc"]).rest).toEqual(["abc"]);
    expect(parseUpdateArgs([]).sub).toBe("status");
  });

  it("rollback with no backups returns error", async () => {
    const r = await runUpdateCommand("rollback", []);
    expect(r.ok).toBe(false);
    expect(r.output).toContain("no backups");
  });
});

// ────────────────────────────────────────────────────────────────
// checkCmd — per-reason error formatting (§ 2.4) and ETag persistence
// Issue #313: rate_limit_anonymous / rate_limit_authed / etag reasons no longer
// exist on the checkCmd path (Pages + npm has its own discriminated failure
// taxonomy, see FetchLatestFailureReason). Skipped; #313-aligned checkCmd
// tests live further down in describe("checkCmd (#313 fetchLatestVersion)").
// ────────────────────────────────────────────────────────────────
describe.skip("checkCmd — per-reason error messages (pre-#313, behaviour removed)", () => {
  let mockFetchRemoteSha: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const mod = await import("../github-api.js");
    mockFetchRemoteSha = mod.fetchRemoteSha as ReturnType<typeof vi.fn>;
    mockFetchRemoteSha.mockReset();
  });

  function failResult(
    reason: "rate_limit_anonymous" | "rate_limit_authed" | "auth" | "not_found" | "server" | "network" | "parse",
    message: string,
    status = 0,
  ): FetchShaResult {
    return { ok: false, reason, status, message };
  }

  it("rate_limit_anonymous: surfaces the exact error message", async () => {
    const msg = "GitHub anonymous rate limit exhausted; set TEAMAGENT_GITHUB_TOKEN to authenticate (5000 req/h)";
    mockFetchRemoteSha.mockResolvedValue(failResult("rate_limit_anonymous", msg, 403));
    const r = await runUpdateCommand("check");
    expect(r.ok).toBe(false);
    expect(r.output).toBe(msg + "\n");
  });

  it("rate_limit_authed: surfaces the exact error message", async () => {
    const msg = "GitHub authenticated rate limit exhausted; retry later";
    mockFetchRemoteSha.mockResolvedValue(failResult("rate_limit_authed", msg, 403));
    const r = await runUpdateCommand("check");
    expect(r.ok).toBe(false);
    expect(r.output).toBe(msg + "\n");
  });

  it("auth: surfaces the exact error message", async () => {
    const msg = "GitHub auth rejected (token invalid or expired)";
    mockFetchRemoteSha.mockResolvedValue(failResult("auth", msg, 401));
    const r = await runUpdateCommand("check");
    expect(r.ok).toBe(false);
    expect(r.output).toBe(msg + "\n");
  });

  it("not_found: surfaces the exact error message", async () => {
    const msg = "branch not found: libz-renlab-ai/TeamBrain@release";
    mockFetchRemoteSha.mockResolvedValue(failResult("not_found", msg, 404));
    const r = await runUpdateCommand("check");
    expect(r.ok).toBe(false);
    expect(r.output).toBe(msg + "\n");
  });

  it("server: surfaces the exact error message", async () => {
    const msg = "GitHub server error 503";
    mockFetchRemoteSha.mockResolvedValue(failResult("server", msg, 503));
    const r = await runUpdateCommand("check");
    expect(r.ok).toBe(false);
    expect(r.output).toBe(msg + "\n");
  });

  it("network: surfaces the exact error message", async () => {
    const msg = "ECONNREFUSED";
    mockFetchRemoteSha.mockResolvedValue(failResult("network", msg));
    const r = await runUpdateCommand("check");
    expect(r.ok).toBe(false);
    expect(r.output).toBe(msg + "\n");
  });

  it("parse: surfaces the exact error message", async () => {
    const msg = "malformed response body";
    mockFetchRemoteSha.mockResolvedValue(failResult("parse", msg, 200));
    const r = await runUpdateCommand("check");
    expect(r.ok).toBe(false);
    expect(r.output).toBe(msg + "\n");
  });
});

// Issue #313: ETag conditional GET removed (Pages doesn't return useful ETag);
// SHA-based comparison replaced with version-based. PR #194 backoff tests
// document removed legacy behaviour. #313-aligned tests below.
describe.skip("checkCmd — ETag and sha persistence on success (pre-#313, behaviour removed)", () => {
  let mockFetchRemoteSha: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const mod = await import("../github-api.js");
    mockFetchRemoteSha = mod.fetchRemoteSha as ReturnType<typeof vi.fn>;
    mockFetchRemoteSha.mockReset();
  });

  it("persists last_branch_etag and last_branch_sha on ok:true", async () => {
    const s = defaultUpdateState();
    s.last_installed_sha = "abc1234";
    writeState(s);

    mockFetchRemoteSha.mockResolvedValue({
      ok: true,
      sha: "new-sha-12345",
      etag: "W/\"etag-test\"",
      source: "200",
    } satisfies FetchShaResult);

    const r = await runUpdateCommand("check");
    expect(r.ok).toBe(true);
    expect(r.output).toContain("update available");

    const written = readState();
    expect(written.last_branch_etag).toBe("W/\"etag-test\"");
    expect(written.last_branch_sha).toBe("new-sha-12345");
  });

  it("persists empty string for etag when server omits it", async () => {
    writeState(defaultUpdateState());
    mockFetchRemoteSha.mockResolvedValue({
      ok: true,
      sha: "some-sha",
      etag: null,
      source: "200",
    } satisfies FetchShaResult);

    await runUpdateCommand("check");
    const written = readState();
    expect(written.last_branch_etag).toBe("");
  });

  // ── PR #194 follow-up tests for F5 (checkCmd backoff) ────────────────────

  it("checkCmd: backoff active → early return, no fetch (PR #194 F5)", async () => {
    const s = defaultUpdateState();
    s.next_check_after_ts = Date.now() + 60 * 60 * 1000; // 1h from now
    writeState(s);

    // fetchRemoteSha should never be called
    const r = await runUpdateCommand("check");
    expect(r.ok).toBe(false);
    expect(r.output).toContain("backoff active until");
    expect(mockFetchRemoteSha).not.toHaveBeenCalled();
  });

  it("checkCmd: backoff window expired → fetch proceeds (PR #194 F5)", async () => {
    const s = defaultUpdateState();
    s.next_check_after_ts = Date.now() - 60 * 1000; // 1 min ago — expired
    writeState(s);

    mockFetchRemoteSha.mockResolvedValue({
      ok: true, sha: "abc1234", etag: null, source: "200",
    } satisfies FetchShaResult);

    const r = await runUpdateCommand("check");
    expect(r.ok).toBe(true);
    expect(mockFetchRemoteSha).toHaveBeenCalled();
  });

  it("checkCmd: rate_limit_anonymous → persists backoff state (PR #194 F5)", async () => {
    writeState(defaultUpdateState());
    mockFetchRemoteSha.mockResolvedValue({
      ok: false,
      reason: "rate_limit_anonymous",
      status: 403,
      message: "GitHub anonymous rate limit exhausted; set TEAMAGENT_GITHUB_TOKEN to authenticate (5000 req/h)",
    } satisfies FetchShaResult);

    const before = Date.now();
    const r = await runUpdateCommand("check");
    const after = Date.now();

    expect(r.ok).toBe(false);
    const written = readState();
    expect(written.consecutive_rate_limits).toBe(1);
    // First failure: 2^(1-1) = 1h
    expect(written.next_check_after_ts).toBeGreaterThanOrEqual(before + 60 * 60 * 1000);
    expect(written.next_check_after_ts).toBeLessThanOrEqual(after + 60 * 60 * 1000);
    // Must NOT bump install-failure counter
    expect(written.consecutive_install_failures).toBe(0);
  });

  it("checkCmd: success resets rate_limits and next_check_after_ts (PR #194 F5)", async () => {
    const s = defaultUpdateState();
    s.consecutive_rate_limits = 3;
    s.next_check_after_ts = Date.now() - 1000; // expired
    writeState(s);

    mockFetchRemoteSha.mockResolvedValue({
      ok: true, sha: "newsha", etag: 'W/"new"', source: "200",
    } satisfies FetchShaResult);

    await runUpdateCommand("check");
    const written = readState();
    expect(written.consecutive_rate_limits).toBe(0);
    expect(written.next_check_after_ts).toBe(0);
    expect(written.last_branch_etag).toBe('W/"new"');
    expect(written.last_branch_sha).toBe("newsha");
  });

  it("returns up-to-date when sha matches last_installed_sha", async () => {
    const s = defaultUpdateState();
    s.last_installed_sha = "current-sha";
    writeState(s);

    mockFetchRemoteSha.mockResolvedValue({
      ok: true,
      sha: "current-sha",
      etag: "W/\"e1\"",
      source: "304",
    } satisfies FetchShaResult);

    const r = await runUpdateCommand("check");
    expect(r.ok).toBe(true);
    expect(r.output).toContain("up-to-date");
  });
});

// ────────────────────────────────────────────────────────────────
// Issue #313: checkCmd via fetchLatestVersion (Pages → npm chain)
// ────────────────────────────────────────────────────────────────
describe("checkCmd (#313 fetchLatestVersion)", () => {
  let mockFetchLatest: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const mod = await import("../update/fetch-latest.js");
    mockFetchLatest = mod.fetchLatestVersion as ReturnType<typeof vi.fn>;
    mockFetchLatest.mockReset();
  });

  it("up-to-date when fetched version equals last_installed_version", async () => {
    const s = defaultUpdateState();
    s.last_installed_version = "0.11.5";
    writeState(s);
    mockFetchLatest.mockResolvedValue({
      ok: true,
      version: "0.11.5",
      source: "pages",
    });
    const r = await runUpdateCommand("check");
    expect(r.ok).toBe(true);
    expect(r.output).toContain("up-to-date");
    expect(r.output).toContain("0.11.5");
    expect(r.output).toContain("source=pages");
  });

  it("update available: prints versions + source", async () => {
    const s = defaultUpdateState();
    s.last_installed_version = "0.11.0";
    writeState(s);
    mockFetchLatest.mockResolvedValue({
      ok: true,
      version: "0.11.6",
      source: "pages",
      sha: "deadbeef",
    });
    const r = await runUpdateCommand("check");
    expect(r.ok).toBe(true);
    expect(r.output).toContain("update available");
    expect(r.output).toContain("0.11.0");
    expect(r.output).toContain("0.11.6");
    expect(r.output).toContain("source=pages");
  });

  it("Tier 3 failure: prints human-readable banner with recovery paths", async () => {
    writeState(defaultUpdateState());
    mockFetchLatest.mockResolvedValue({
      ok: false,
      pagesReason: "pages_5xx",
      pagesMessage: "Pages server error 503",
      npmReason: "npm_5xx",
      npmMessage: "npm registry server error 503",
    });
    const r = await runUpdateCommand("check");
    expect(r.ok).toBe(false);
    expect(r.output).toContain("暂时查不到新版本");
    expect(r.output).toContain("pages_5xx");
    expect(r.output).toContain("npm_5xx");
    expect(r.output).toContain("npm i -g teamagent@latest");
    expect(r.output).toContain("TEAMAGENT_GITHUB_TOKEN");
    // MUST NOT include the old internal jargon
    expect(r.output).not.toContain("GitHub anonymous rate limit");
  });

  it("npm fallback source is surfaced when Pages failed", async () => {
    const s = defaultUpdateState();
    s.last_installed_version = "0.11.0";
    writeState(s);
    mockFetchLatest.mockResolvedValue({
      ok: true,
      version: "0.11.5",
      source: "npm",
    });
    const r = await runUpdateCommand("check");
    expect(r.ok).toBe(true);
    expect(r.output).toContain("source=npm");
  });

  it("respects legacy next_check_after_ts during transition window", async () => {
    // Old state file with backoff set from pre-#313 code; new code honors it
    // so users aren't surprised with double-fetch on the first session after upgrade.
    const s = defaultUpdateState();
    s.next_check_after_ts = Date.now() + 60 * 60 * 1000;
    writeState(s);
    const r = await runUpdateCommand("check");
    expect(r.ok).toBe(false);
    expect(r.output).toContain("backoff active until");
    expect(mockFetchLatest).not.toHaveBeenCalled();
  });
});

// Issue #245 — emit AttributionBus events from the snooze / never CLI cmds.
// Each persists state then fires update-snoozed / update-never-set so the
// 装机率 / snooze 转化率 telemetry has a row per user action.
describe("update --snooze / --never AttributionBus emit (issue #245)", () => {
  it("snoozeCmd emits update-snoozed once with the new level + untilTs", async () => {
    const s = defaultUpdateState();
    s.snooze_level = 0;
    writeState(s);
    const r = await runUpdateCommand("snooze");
    expect(r.ok).toBe(true);
    expect(emittedEvents).toHaveLength(1);
    const event = emittedEvents[0]!;
    expect(event).toMatchObject({
      kind: "update-snoozed",
      source: "update",
      severity: "info",
    });
    // Persisted state and emitted level must agree
    const persisted = readState();
    expect(event.level).toBe(persisted.snooze_level);
    expect(event.untilTs).toBe(persisted.snooze_until_ts);
    expect(typeof event.timestamp).toBe("string");
  });

  it("snoozeCmd emit reflects the next snooze level on each invocation", async () => {
    const s = defaultUpdateState();
    s.snooze_level = 1;
    writeState(s);
    await runUpdateCommand("snooze");
    expect(emittedEvents).toHaveLength(1);
    expect(emittedEvents[0]?.level).toBeGreaterThan(1);
  });

  it("neverCmd emits update-never-set once with empty payload", async () => {
    writeState(defaultUpdateState());
    const r = await runUpdateCommand("never");
    expect(r.ok).toBe(true);
    expect(emittedEvents).toHaveLength(1);
    const event = emittedEvents[0]!;
    expect(event).toMatchObject({
      kind: "update-never-set",
      source: "update",
      severity: "info",
    });
    expect(typeof event.timestamp).toBe("string");
    // never_prompt persisted alongside the emit
    expect(readState().never_prompt).toBe(true);
  });

  it("snoozeCmd emit fires AFTER writeState (state already persisted on emit)", async () => {
    writeState(defaultUpdateState());
    await runUpdateCommand("snooze");
    // Snooze always persists state (snooze_level / snooze_until_ts changed),
    // so by the time the emit fires the state file already reflects the
    // new snooze level — verifies emit happens after persist.
    const persisted = readState();
    expect(persisted.snooze_level).toBeGreaterThan(0);
    expect(emittedEvents[0]?.level).toBe(persisted.snooze_level);
  });

  it("neither cmd touches events when emit is the only side channel", async () => {
    // Negative: --status / --logs / --enable / --disable do NOT emit any
    // upgrade event (their telemetry pivot is auto-update.disabled, not
    // the prompt/install funnel).
    writeState(defaultUpdateState());
    await runUpdateCommand("status");
    await runUpdateCommand("logs");
    await runUpdateCommand("disable");
    await runUpdateCommand("enable");
    expect(emittedEvents).toHaveLength(0);
  });
});

// Issue #151: findUpdaterBinary returned null in every real install layout
// because both candidate paths jumped out of dist/, but published artifacts
// keep update-*.js and bin-updater.cjs as siblings inside dist/. Regression
// guard for the three layouts the function must support.
describe("findUpdaterBinary install layouts (issue #151)", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tg-find-updater-"));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("npm flat dist layout: locates sibling bin-updater.cjs", () => {
    // npm published artifact: <root>/dist/update-XXX.js + <root>/dist/bin-updater.cjs
    const dist = path.join(tmpRoot, "teamagent", "dist");
    fs.mkdirSync(dist, { recursive: true });
    const updaterFile = path.join(dist, "bin-updater.cjs");
    fs.writeFileSync(updaterFile, "// stub");
    const updateModule = path.join(dist, "update-NPMFLAT.js");
    fs.writeFileSync(updateModule, "// stub");

    const found = findUpdaterBinary(pathToFileURL(updateModule).href);
    expect(found).toBe(updaterFile);
  });

  it("monorepo dev tree (packages/cli/dist): locates sibling bin-updater.cjs", () => {
    const cliDist = path.join(tmpRoot, "packages", "cli", "dist");
    fs.mkdirSync(cliDist, { recursive: true });
    const updaterFile = path.join(cliDist, "bin-updater.cjs");
    fs.writeFileSync(updaterFile, "// stub");
    const updateModule = path.join(cliDist, "update-MONOREPO.js");
    fs.writeFileSync(updateModule, "// stub");

    const found = findUpdaterBinary(pathToFileURL(updateModule).href);
    expect(found).toBe(updaterFile);
  });

  it("returns null when bin-updater.cjs is absent", () => {
    const dist = path.join(tmpRoot, "teamagent", "dist");
    fs.mkdirSync(dist, { recursive: true });
    const updateModule = path.join(dist, "update-MISSING.js");
    fs.writeFileSync(updateModule, "// stub");

    const found = findUpdaterBinary(pathToFileURL(updateModule).href);
    expect(found).toBeNull();
  });
});
