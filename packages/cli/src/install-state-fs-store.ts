/**
 * FsInstallStateStore — fs-backed implementation of the
 * InstallStateStore Port (issue #155 / ADR-0011).
 *
 * Reads/writes `~/.teamagent/install-state/<projectId>.json`. This file
 * is the only place `node:fs` appears for the install-state feature —
 * by Port construction, `packages/core/src/install-state/` stays
 * fs-free.
 *
 * Behaviour:
 *   - `load`:
 *       - returns null on ENOENT (file not yet written)
 *       - returns null on ANY parse failure (invalid JSON, bad schema,
 *         future schemaVersion) AFTER renaming the bad file to
 *         `<file>.corrupt.<epoch>.bak` so the evidence is preserved
 *       - never throws, never writes to stdout
 *   - `save`:
 *       - validates the value against the Zod schema first (refuses to
 *         persist a corrupt state — same defense `serializeState`
 *         applies)
 *       - auto-creates `<rootDir>/install-state/` recursively
 *       - writes atomically via tmp-file + rename so a partial write
 *         never wins a race against a concurrent reader
 *
 * The directory layout matches the existing `~/.teamagent/` convention
 * (cf. `warmup-state.ts`); unlike `scan-state.json` and friends, this
 * lives one level deeper under `install-state/<projectId>.json` so
 * many concurrent project installs don't collide.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  parseState,
  serializeState,
  type InstallState as CoreInstallState,
} from "@teamagent/core/install-state";
import type {
  InstallState,
  InstallStateStore,
} from "@teamagent/ports";

export interface FsInstallStateStoreOptions {
  /**
   * Root directory containing the `install-state/` subdir. Defaults to
   * `${process.env.TEAMAGENT_HOME ?? path.join(os.homedir(), '.teamagent')}`.
   * Tests pass a tmpdir so they don't pollute the real `~/.teamagent/`.
   */
  rootDir?: string;
  /**
   * Injected clock for deterministic corrupt-rename suffixes in tests.
   * Defaults to `Date.now()`.
   */
  now?: () => number;
}

export class FsInstallStateStore implements InstallStateStore {
  private readonly rootDir: string;
  private readonly now: () => number;

  constructor(options: FsInstallStateStoreOptions = {}) {
    const envHome = process.env["TEAMAGENT_HOME"];
    const defaultRoot = envHome ?? path.join(os.homedir(), ".teamagent");
    this.rootDir = options.rootDir ?? defaultRoot;
    this.now = options.now ?? (() => Date.now());
  }

  /** Absolute path to the JSON file for this projectId. */
  private filePath(projectId: string): string {
    return path.join(this.rootDir, "install-state", `${projectId}.json`);
  }

  async load(projectId: string): Promise<InstallState | null> {
    const file = this.filePath(projectId);
    let raw: string;
    try {
      raw = await fs.readFile(file, "utf-8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      // Other read errors (EACCES, EISDIR, etc) — treat as "no clean
      // state available". The caller will create a fresh notebook.
      // Best-effort: do NOT rethrow.
      return null;
    }
    const result = parseState(raw);
    if (result.ok) {
      return result.state as InstallState;
    }
    // Bad file: rename aside so evidence is preserved, then return null.
    await this.renameCorrupt(file).catch(() => {
      // If even the rename fails (e.g., disk full, ro-fs), give up
      // silently — never throw from load().
    });
    return null;
  }

  async save(projectId: string, state: InstallState): Promise<void> {
    const file = this.filePath(projectId);
    // Defense in depth: serializeState validates against the Zod schema
    // before producing bytes. A bad value throws here rather than landing
    // on disk as a corrupt notebook.
    const body = serializeState(state as CoreInstallState);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp.${process.pid}.${this.now()}`;
    await fs.writeFile(tmp, body, "utf-8");
    await fs.rename(tmp, file);
  }

  /** Move a bad file aside so a re-run starts clean. */
  private async renameCorrupt(file: string): Promise<void> {
    const corruptName = `${file}.corrupt.${this.now()}.bak`;
    await fs.rename(file, corruptName);
  }
}
