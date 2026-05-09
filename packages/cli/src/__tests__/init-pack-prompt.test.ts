import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeInit, parseInitArgs, renderInitResult } from "../commands/init.js";

function makeTempProject(): { cwd: string; home: string; packsDir: string; cleanup: () => void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ta-init-pack-"));
  const cwd = path.join(root, "proj");
  const home = path.join(root, "home");
  const packsDir = path.join(root, "packs");
  fs.mkdirSync(cwd, { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(packsDir, { recursive: true });
  // Real-world signal: a package.json (frontend project)
  fs.writeFileSync(path.join(cwd, "package.json"), JSON.stringify({ name: "p" }));
  // Copy fixtures
  const fixtures = path.join(__dirname, "fixtures", "packs");
  for (const f of fs.readdirSync(fixtures)) {
    fs.copyFileSync(path.join(fixtures, f), path.join(packsDir, f));
  }
  return {
    cwd,
    home,
    packsDir,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

describe("init pack prompt + --pack flag", () => {
  let dirs: ReturnType<typeof makeTempProject>;

  beforeEach(() => {
    dirs = makeTempProject();
  });

  afterEach(() => {
    dirs.cleanup();
  });

  describe("default behavior (no --pack)", () => {
    it("emits a versioned prompt block in result.packPrompt", async () => {
      const result = await executeInit({
        cwd: dirs.cwd,
        homeDir: dirs.home,
        skipImport: true,
        skipHook: true,
        skipWarmup: true,
        skipSeed: true,
        packsDir: dirs.packsDir,
      });
      expect(result.ok).toBe(true);
      expect(result.packPrompt).toBeDefined();
      const body = result.packPrompt ?? "";
      // Open / close v1 markers
      expect(body).toContain("<!-- teamagent-pack-prompt v1 -->");
      expect(body).toContain("<!-- /teamagent-pack-prompt v1 -->");
      // 6 observed rows in fixed order
      expect(body).toMatch(
        /package\.json[\s\S]*pyproject\.toml[\s\S]*Cargo\.toml[\s\S]*Dockerfile[\s\S]*requirements\.txt[\s\S]*go\.mod/,
      );
      // package.json present (we wrote it), others absent
      expect(body).toMatch(/✓[\s`]*package\.json/);
      expect(body).toMatch(/✗[\s`]*pyproject\.toml/);
      // Available packs and CTA
      expect(body).toContain("**frontend-js**");
      expect(body).toContain("**ops-safety**");
      expect(body).toContain("teamagent pack add");
      expect(body).toContain("--pack all");
      expect(body).toMatch(/--pack [a-z][\w-]*,[a-z][\w-]*/);
    });

    it("renderInitResult appends the prompt body to stdout", async () => {
      const result = await executeInit({
        cwd: dirs.cwd,
        homeDir: dirs.home,
        skipImport: true,
        skipHook: true,
        skipWarmup: true,
        skipSeed: true,
        packsDir: dirs.packsDir,
      });
      const out = renderInitResult(result);
      expect(out).toContain("<!-- teamagent-pack-prompt v1 -->");
      expect(out).toContain("<!-- /teamagent-pack-prompt v1 -->");
      expect(out).toContain("teamagent pack add");
    });

    it("records a pack-prompt step", async () => {
      const result = await executeInit({
        cwd: dirs.cwd,
        homeDir: dirs.home,
        skipImport: true,
        skipHook: true,
        skipWarmup: true,
        skipSeed: true,
        packsDir: dirs.packsDir,
      });
      const step = result.steps.find((s) => s.step === "pack-prompt");
      expect(step).toBeDefined();
      expect(step?.status).toBe("ok");
    });
  });

  describe("zero packs available (issue 174 #5)", () => {
    it("emits empty packPrompt and a single-line notice (no v1 marker)", async () => {
      // Empty packs directory => available.length === 0
      const emptyPacksDir = path.join(path.dirname(dirs.packsDir), "empty-packs");
      fs.mkdirSync(emptyPacksDir, { recursive: true });
      const result = await executeInit({
        cwd: dirs.cwd,
        homeDir: dirs.home,
        skipImport: true,
        skipHook: true,
        skipWarmup: true,
        skipSeed: true,
        packsDir: emptyPacksDir,
      });
      expect(result.ok).toBe(true);
      // packPrompt is the empty string (not undefined) when 0 packs available.
      expect(result.packPrompt ?? "").toBe("");
      // Rendered stdout must NOT contain the v1 prompt block …
      const out = renderInitResult(result);
      expect(out).not.toContain("<!-- teamagent-pack-prompt v1 -->");
      // … but MUST contain the new single-line notice.
      expect(out).toContain("暂无 stack packs 可用");
      // Step still records as ok.
      const step = result.steps.find((s) => s.step === "pack-prompt");
      expect(step).toBeDefined();
      expect(step?.status).toBe("ok");
      expect(step?.detail).toContain("暂无 stack packs 可用");
    });
  });

  describe("--pack all bypass", () => {
    it("installs every available pack and emits NO prompt block", async () => {
      const result = await executeInit({
        cwd: dirs.cwd,
        homeDir: dirs.home,
        skipImport: true,
        skipHook: true,
        skipWarmup: true,
        skipSeed: true,
        packsDir: dirs.packsDir,
        pack: "all",
      });
      expect(result.ok).toBe(true);
      expect(result.packPrompt ?? "").toBe("");
      const out = renderInitResult(result);
      expect(out).not.toContain("<!-- teamagent-pack-prompt");
      const step = result.steps.find((s) => s.step === "load-pack");
      expect(step?.status).toBe("ok");
      expect(step?.detail).toMatch(/2 个 pack/);
    });

    // Regression — Codex review on PR #110 (P2): summary.totalActiveEntries
    // must include pack-added rules. Phase C now runs BEFORE the totalActive
    // computation, so the count reflects the global store post-pack-add.
    it("summary.totalActiveEntries counts pack-added rules", async () => {
      const baseline = await executeInit({
        cwd: dirs.cwd,
        homeDir: dirs.home,
        skipImport: true,
        skipHook: true,
        skipWarmup: true,
        skipSeed: true,
        packsDir: dirs.packsDir,
      });
      // Fresh home for the second run so packs actually get added.
      const home2 = path.join(path.dirname(dirs.home), "home2");
      fs.mkdirSync(home2, { recursive: true });
      const withPack = await executeInit({
        cwd: dirs.cwd,
        homeDir: home2,
        skipImport: true,
        skipHook: true,
        skipWarmup: true,
        skipSeed: true,
        packsDir: dirs.packsDir,
        pack: "all",
      });
      expect(withPack.summary.totalActiveEntries).toBeGreaterThan(
        baseline.summary.totalActiveEntries,
      );
    });

    // Regression — Codex review on PR #110 (P2): install log must include
    // the new load-pack / pack-prompt steps. Phase C now appends to steps[]
    // BEFORE appendInstallLog runs.
    it("install log records load-pack step", async () => {
      const result = await executeInit({
        cwd: dirs.cwd,
        homeDir: dirs.home,
        skipImport: true,
        skipHook: true,
        skipWarmup: true,
        skipSeed: true,
        packsDir: dirs.packsDir,
        pack: "all",
      });
      expect(result.ok).toBe(true);
      const logPath = path.join(dirs.home, ".teamagent", ".install-log");
      expect(fs.existsSync(logPath)).toBe(true);
      const last = fs
        .readFileSync(logPath, "utf-8")
        .trim()
        .split(/\r?\n/)
        .pop()!;
      const payload = JSON.parse(last) as { steps: Array<{ step: string }> };
      const stepNames = payload.steps.map((s) => s.step);
      expect(stepNames).toContain("load-pack");
    });
  });

  describe("--pack <names> bypass", () => {
    it("installs only listed packs", async () => {
      const result = await executeInit({
        cwd: dirs.cwd,
        homeDir: dirs.home,
        skipImport: true,
        skipHook: true,
        skipWarmup: true,
        skipSeed: true,
        packsDir: dirs.packsDir,
        pack: "frontend-js",
      });
      const step = result.steps.find((s) => s.step === "load-pack");
      expect(step?.status).toBe("ok");
      expect(step?.detail).toMatch(/1 个 pack/);
    });

    it("flags load-pack as failed when a name is unknown", async () => {
      const result = await executeInit({
        cwd: dirs.cwd,
        homeDir: dirs.home,
        skipImport: true,
        skipHook: true,
        skipWarmup: true,
        skipSeed: true,
        packsDir: dirs.packsDir,
        pack: "does-not-exist",
      });
      const step = result.steps.find((s) => s.step === "load-pack");
      expect(step?.status).toBe("failed");
      expect(step?.detail).toMatch(/未找到/);
    });
  });

  describe("parseInitArgs --pack", () => {
    it("parses --pack=value form", () => {
      const opts = parseInitArgs(["--pack=frontend-js,ops-safety"]);
      expect(opts.pack).toBe("frontend-js,ops-safety");
    });

    it("parses --pack value form", () => {
      const opts = parseInitArgs(["--pack", "all"]);
      expect(opts.pack).toBe("all");
    });

    it("rejects --pack without a value", () => {
      expect(() => parseInitArgs(["--pack"])).toThrow();
    });
  });
});
