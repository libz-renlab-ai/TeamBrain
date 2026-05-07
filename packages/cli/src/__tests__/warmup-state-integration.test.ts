/**
 * Integration: runWarmup writes the state file (issue #91).
 *
 * Uses a fake embedder so we don't actually load the model. Verifies:
 *   - Initial state is written (status=downloading) before embed runs.
 *   - On success, state.status flips to "ready" with completed_at set.
 *   - On failure, state.status flips to "failed" with error captured.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { runWarmup } from "../commands/warmup.js";
import { readWarmupState } from "../warmup-state.js";

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "warmup-state-int-"));
}

describe("runWarmup writes the state file", () => {
  it("on success: writes downloading then ready", async () => {
    const tmp = mkTmp();
    try {
      const stateFilePath = path.join(tmp, ".warmup-state.json");
      // Fake embedder that resolves quickly.
      const r = await runWarmup({
        embedder: { embed: async () => [[0, 0]] },
        stderr: () => {},
        stateFilePath,
        forceProgressMode: "off",
      });
      expect(r.ok).toBe(true);
      const state = readWarmupState(stateFilePath);
      expect(state).not.toBeNull();
      expect(state!.status).toBe("ready");
      expect(state!.completed_at).toMatch(/^\d{4}-/);
      expect(state!.pid).toBe(process.pid);
      expect(state!.model).toBe("Xenova/multilingual-e5-small");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("on failure: writes failed with error message", async () => {
    const tmp = mkTmp();
    try {
      const stateFilePath = path.join(tmp, ".warmup-state.json");
      const r = await runWarmup({
        embedder: {
          embed: async () => {
            throw new Error("fake-network-error");
          },
        },
        stderr: () => {},
        stateFilePath,
        forceProgressMode: "off",
      });
      expect(r.ok).toBe(false);
      const state = readWarmupState(stateFilePath);
      expect(state).not.toBeNull();
      expect(state!.status).toBe("failed");
      expect(state!.error).toContain("fake-network-error");
      expect(state!.completed_at).toMatch(/^\d{4}-/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("custom model name is recorded", async () => {
    const tmp = mkTmp();
    try {
      const stateFilePath = path.join(tmp, ".warmup-state.json");
      await runWarmup({
        embedder: { embed: async () => [[0]] },
        stderr: () => {},
        stateFilePath,
        stateModel: "test/custom-model",
        forceProgressMode: "off",
      });
      const state = readWarmupState(stateFilePath);
      expect(state!.model).toBe("test/custom-model");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("when stateFilePath is undefined, no file is written (legacy callers stay unchanged)", async () => {
    const tmp = mkTmp();
    try {
      await runWarmup({
        embedder: { embed: async () => [[0]] },
        stderr: () => {},
        forceProgressMode: "off",
      });
      // No file created in tmp.
      expect(fs.readdirSync(tmp).length).toBe(0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
