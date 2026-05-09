import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { runWarmup } from "../commands/warmup.js";
import { readWarmupState } from "../warmup-state.js";

describe("warmup", () => {
  it("calls embedder.embed once and returns ok=true", async () => {
    const embed = vi.fn().mockResolvedValue([[0.1, 0.2]]);
    const stderr = vi.fn();
    const result = await runWarmup({ embedder: { embed }, stderr });
    expect(embed).toHaveBeenCalledOnce();
    expect(embed).toHaveBeenCalledWith(["warmup"]);
    expect(result.ok).toBe(true);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns ok=false on embedder error", async () => {
    const embed = vi.fn().mockRejectedValue(new Error("network"));
    const stderr = vi.fn();
    const result = await runWarmup({ embedder: { embed }, stderr });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("network");
  });
});

describe("warmup graceful skip (issue #160)", () => {
  it("returns ok=true skipped=true when optional vector deps are absent", async () => {
    const stderr = vi.fn();
    const result = await runWarmup({
      // No embedder injected — exercises the real-path branch where
      // haveVectorOptionals is consulted.
      stderr,
      haveVectorOptionals: () => false,
    });
    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("optional-deps-missing");
    expect(result.error).toBeUndefined();
    // Friendly message reaches stderr; no failure/error wording.
    const msgs = stderr.mock.calls.map((c) => c[0]).join("");
    expect(msgs).toContain("跳过向量模型预热");
    expect(msgs).not.toContain("预热失败");
  });

  it("writes status=skipped to the state file when skipping", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "warmup-skip-"));
    try {
      const stateFilePath = path.join(tmp, ".warmup-state.json");
      const result = await runWarmup({
        stderr: () => {},
        stateFilePath,
        haveVectorOptionals: () => false,
      });
      expect(result.skipped).toBe(true);
      const state = readWarmupState(stateFilePath);
      expect(state).not.toBeNull();
      expect(state!.status).toBe("skipped");
      expect(state!.completed_at).toMatch(/^\d{4}-/);
      // pid=0 (placeholder convention) ensures older teamagent readers that
      // don't recognize "skipped" fall through to "downloading" with
      // isPidAlive(0)=true rather than reporting `stale_downloading` FAIL.
      expect(state!.pid).toBe(0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("does NOT overwrite a live downloading state (race with detached warmup)", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "warmup-race-"));
    try {
      const stateFilePath = path.join(tmp, ".warmup-state.json");
      // Pre-write a "live" downloading state with a pid that's actually alive
      // (the current test process). The skip path must respect this and not
      // overwrite.
      fs.writeFileSync(stateFilePath, JSON.stringify({
        status: "downloading",
        started_at: "2026-05-09T07:00:00Z",
        pid: process.pid,
        model: "Xenova/multilingual-e5-small",
        progress: { loaded_bytes: 1024, total_bytes: 100_000, files_done: 0, files_total: 5 },
      }), "utf-8");
      const result = await runWarmup({
        stderr: () => {},
        stateFilePath,
        haveVectorOptionals: () => false,
      });
      expect(result.skipped).toBe(true);
      // State should remain "downloading" — skip path saw a live writer and
      // backed off.
      const state = readWarmupState(stateFilePath);
      expect(state!.status).toBe("downloading");
      expect(state!.pid).toBe(process.pid);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("does NOT short-circuit when an embedder is injected (tests stay deterministic)", async () => {
    // Even with haveVectorOptionals=false, an injected embedder bypasses the
    // gate: tests should be able to opt into the real warmup pipeline using a
    // mock without having to also mock filesystem state.
    const embed = vi.fn().mockResolvedValue([[1, 2]]);
    const result = await runWarmup({
      embedder: { embed },
      stderr: () => {},
      haveVectorOptionals: () => false,
    });
    expect(embed).toHaveBeenCalledOnce();
    expect(result.skipped).toBeUndefined();
    expect(result.ok).toBe(true);
  });
});
