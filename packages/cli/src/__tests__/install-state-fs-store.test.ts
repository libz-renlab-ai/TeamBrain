import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { runInstallStateStoreContract } from "@teamagent/ports/contracts";
import type { InstallState } from "@teamagent/ports";
import { FsInstallStateStore } from "../install-state-fs-store.js";

/**
 * Run the canonical contract suite against the fs adapter — every
 * conforming impl must pass these 8 cases.
 */
describe("FsInstallStateStore — runs the @teamagent/ports/contracts suite", () => {
  runInstallStateStoreContract(async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "teamagent-isfs-"));
    return {
      store: new FsInstallStateStore({ rootDir: root }),
      teardown: async () => {
        await fs.rm(root, { recursive: true, force: true });
      },
    };
  });
});

/**
 * Fs-specific cases not part of the cross-impl contract.
 */
describe("FsInstallStateStore — fs-specific behaviour", () => {
  let root: string;
  let store: FsInstallStateStore;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "teamagent-isfs-"));
    store = new FsInstallStateStore({ rootDir: root, now: () => 999 });
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  function statePath(projectId: string): string {
    return path.join(root, "install-state", `${projectId}.json`);
  }

  function makeState(projectId: string, completedSteps: InstallState["completedSteps"] = []): InstallState {
    return {
      schemaVersion: "v1",
      projectId,
      createdAt: 100,
      updatedAt: 100,
      completedSteps,
      lastRunAt: 100,
    };
  }

  it("save creates the install-state directory automatically", async () => {
    // Confirm the dir does not exist before save
    await expect(fs.stat(path.join(root, "install-state"))).rejects.toThrow();
    await store.save("p_x", makeState("p_x"));
    const stat = await fs.stat(path.join(root, "install-state"));
    expect(stat.isDirectory()).toBe(true);
  });

  it("save writes the canonical filename layout", async () => {
    await store.save("p_canon", makeState("p_canon", ["hook-write"]));
    const file = statePath("p_canon");
    const exists = await fs
      .stat(file)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);
    const json = JSON.parse(await fs.readFile(file, "utf-8")) as InstallState;
    expect(json.completedSteps).toEqual(["hook-write"]);
  });

  it("save is atomic — leaves no .tmp artefact behind on success", async () => {
    await store.save("p_atomic", makeState("p_atomic"));
    const dir = path.join(root, "install-state");
    const entries = await fs.readdir(dir);
    // Only the final json file, no .tmp.<pid>.<now> turd
    expect(entries).toEqual(["p_atomic.json"]);
  });

  it("load on a corrupt file (invalid JSON) renames it aside and returns null", async () => {
    const file = statePath("p_corrupt");
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, "{not json", "utf-8");

    const result = await store.load("p_corrupt");
    expect(result).toBeNull();

    // Original file should be gone
    const origExists = await fs
      .stat(file)
      .then(() => true)
      .catch(() => false);
    expect(origExists).toBe(false);

    // Rename target should exist
    const corruptFile = `${file}.corrupt.999.bak`;
    const corruptExists = await fs
      .stat(corruptFile)
      .then(() => true)
      .catch(() => false);
    expect(corruptExists).toBe(true);

    // Content preserved
    expect(await fs.readFile(corruptFile, "utf-8")).toBe("{not json");
  });

  it("load on a v2-from-the-future file renames it aside and returns null", async () => {
    const file = statePath("p_future");
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(
      file,
      JSON.stringify({
        schemaVersion: "v2",
        projectId: "p_future",
        createdAt: 0,
        updatedAt: 0,
        completedSteps: [],
        lastRunAt: 0,
      }),
      "utf-8",
    );
    const result = await store.load("p_future");
    expect(result).toBeNull();
    const corruptExists = await fs
      .stat(`${file}.corrupt.999.bak`)
      .then(() => true)
      .catch(() => false);
    expect(corruptExists).toBe(true);
  });

  it("load on a missing file returns null without creating anything", async () => {
    const result = await store.load("p_does_not_exist");
    expect(result).toBeNull();
    // Did NOT create the directory
    const dirExists = await fs
      .stat(path.join(root, "install-state"))
      .then(() => true)
      .catch(() => false);
    expect(dirExists).toBe(false);
  });

  it("save refuses to persist a value that violates the Zod schema", async () => {
    const bad: InstallState = {
      schemaVersion: "v1",
      projectId: "", // empty rejected
      createdAt: 0,
      updatedAt: 0,
      completedSteps: [],
      lastRunAt: 0,
    };
    await expect(store.save("p_bad", bad)).rejects.toThrow();
    const file = statePath("p_bad");
    const exists = await fs
      .stat(file)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false); // no partial write
  });

  it("rootDir defaults to TEAMAGENT_HOME or ~/.teamagent when not set", async () => {
    // Just verifies the default-path code path runs without throwing.
    // We do NOT actually save anything to ~/.teamagent in tests.
    const fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), "teamagent-home-"));
    const prev = process.env["TEAMAGENT_HOME"];
    process.env["TEAMAGENT_HOME"] = fakeHome;
    try {
      const defaultStore = new FsInstallStateStore();
      await defaultStore.save("p_env", makeState("p_env", ["hook-write"]));
      const loaded = await defaultStore.load("p_env");
      expect(loaded?.completedSteps).toEqual(["hook-write"]);
    } finally {
      if (prev === undefined) delete process.env["TEAMAGENT_HOME"];
      else process.env["TEAMAGENT_HOME"] = prev;
      await fs.rm(fakeHome, { recursive: true, force: true });
    }
  });
});
