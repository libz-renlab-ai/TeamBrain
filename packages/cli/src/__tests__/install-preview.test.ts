/**
 * Issue #155 / Order 1 — tests for `pnpm teamagent install --preview`.
 *
 * Plan: docs/plans/issue-155/order-1-preview/plan.md § 2 "Tests".
 *
 *   1. Unit: renderInstallManifest returns all 5 sections.
 *   2. Unit: pure function — no filesystem calls (mock fs to throw).
 *   3. Integration: install --preview exits 0 and emits 5 section headers
 *      (regex /\[config\].*\[skills\].*\[kb\].*\[download\].*\[refusal\]/s).
 *   4. Integration: install --preview writes nothing.
 *
 * Cross-slice contract after Order 3: the `[download]` section must expose no
 * foreground vector-model skip flag. The warmup is detached.
 */
import { describe, it, expect, vi } from "vitest";
import { spawnSync } from "node:child_process";
import nodeFs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_PROJECT_SKILLS,
  formatInstallManifest,
  parseInstallArgs,
  renderInstallManifest,
  renderInstallPreviewOutput,
} from "../commands/install-manifest.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// packages/cli/src/__tests__ → packages/cli/src/bin.ts
const BIN_TS = path.resolve(__dirname, "..", "bin.ts");
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");

function spawnTeamagent(args: readonly string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) {
  // Use `tsx` to execute the TS source directly. `tsx` is a workspace dev
  // dependency on the monorepo root; we resolve via `npx --no-install` so
  // the test runs against the in-tree code without depending on a built
  // dist/ artefact.
  return spawnSync(
    process.execPath,
    [
      // npx shim: invoke tsx without npm install
      path.join(REPO_ROOT, "node_modules", "tsx", "dist", "cli.mjs"),
      BIN_TS,
      ...args,
    ],
    {
      cwd: opts.cwd ?? REPO_ROOT,
      env: { ...process.env, ...(opts.env ?? {}) },
      encoding: "utf-8",
      // 30s is plenty for a pure-render command; tsx cold start ≤ a few seconds.
      timeout: 30_000,
    },
  );
}

describe("renderInstallManifest", () => {
  it("returns an object with all 5 keys (config, skills, kb, download, refusal)", () => {
    const m = renderInstallManifest();
    expect(Object.keys(m).sort()).toEqual(
      ["config", "download", "kb", "refusal", "skills"].sort(),
    );
    // Each section has the bracketed header and at least one rendered line.
    expect(m.config.header).toBe("[config]");
    expect(m.skills.header).toBe("[skills]");
    expect(m.kb.header).toBe("[kb]");
    expect(m.download.header).toBe("[download]");
    expect(m.refusal.header).toBe("[refusal]");
    for (const k of ["config", "skills", "kb", "download", "refusal"] as const) {
      expect(m[k].lines.length).toBeGreaterThan(0);
    }
  });

  it("lists the 6 default project-level skills", () => {
    const m = renderInstallManifest();
    const skillsBlock = [m.skills.header, ...m.skills.lines].join("\n");
    for (const id of DEFAULT_PROJECT_SKILLS) {
      expect(skillsBlock).toContain(id);
    }
    // Should NOT list user-level teamagent skills as part of [skills].
    expect(skillsBlock).toContain("NOT listed here");
  });

  it("does not expose any foreground vector-model skip flag", () => {
    const m = renderInstallManifest();
    const downloadBlock = [m.download.header, ...m.download.lines].join("\n");
    expect(downloadBlock).not.toContain("--skip-vector-model");
    expect(downloadBlock).not.toMatch(/--skip-model(?!-)/);
  });

  it("respects injected projectSkills option (purity check)", () => {
    const m = renderInstallManifest({ projectSkills: ["only-one"] });
    const skillsBlock = [m.skills.header, ...m.skills.lines].join("\n");
    expect(skillsBlock).toContain("only-one");
    expect(skillsBlock).not.toContain("design-html");
  });

  it("is pure: does not call into node:fs or node:os", () => {
    // Mock fs to throw on any call. If the function is pure, this never trips.
    // We rely on vi.spyOn so it survives without fully replacing the module.
    const fsSpies = [
      vi.spyOn(nodeFs, "readFileSync").mockImplementation(() => {
        throw new Error("renderInstallManifest must not call fs.readFileSync");
      }),
      vi.spyOn(nodeFs, "writeFileSync").mockImplementation(() => {
        throw new Error("renderInstallManifest must not call fs.writeFileSync");
      }),
      vi.spyOn(nodeFs, "existsSync").mockImplementation(() => {
        throw new Error("renderInstallManifest must not call fs.existsSync");
      }),
      vi.spyOn(nodeFs, "mkdirSync").mockImplementation(() => {
        throw new Error("renderInstallManifest must not call fs.mkdirSync");
      }),
      vi.spyOn(os, "homedir").mockImplementation(() => {
        throw new Error("renderInstallManifest must not call os.homedir");
      }),
    ];
    try {
      expect(() => renderInstallManifest()).not.toThrow();
      expect(() => formatInstallManifest(renderInstallManifest())).not.toThrow();
      expect(() => renderInstallPreviewOutput()).not.toThrow();
    } finally {
      for (const s of fsSpies) s.mockRestore();
    }
  });
});

describe("formatInstallManifest", () => {
  it("emits all 5 section headers in fixed order config→skills→kb→download→refusal", () => {
    const out = renderInstallPreviewOutput();
    expect(out).toMatch(/\[config\].*\[skills\].*\[kb\].*\[download\].*\[refusal\]/s);
  });

  it("ends with a clear 'Exit code: 0' marker for reviewer skim-readability", () => {
    const out = renderInstallPreviewOutput();
    expect(out).toContain("Exit code: 0");
  });
});

describe("parseInstallArgs", () => {
  it("returns preview=false when --preview is absent", () => {
    expect(parseInstallArgs([])).toMatchObject({ preview: false });
    expect(parseInstallArgs(["--something-else"])).toMatchObject({ preview: false });
  });
  it("returns preview=true when --preview is present", () => {
    expect(parseInstallArgs(["--preview"])).toMatchObject({ preview: true });
    // Order does not matter.
    expect(parseInstallArgs(["--foo", "--preview", "--bar"])).toMatchObject({ preview: true });
  });
});

describe("integration: pnpm teamagent install --preview", () => {
  // Skip subprocess integration tests on Windows: per CLAUDE.md the file
  // already works around vitest OOM by serialising files; spawning a TS
  // toolchain on Windows under that constraint is flaky. The unit tests
  // above cover the formatter contract; macOS/Linux CI exercises the
  // subprocess path.
  const SKIP_SUBPROCESS = process.platform === "win32";

  it.skipIf(SKIP_SUBPROCESS)(
    "exits 0 and emits the 5 section headers in order",
    () => {
      const result = spawnTeamagent(["install", "--preview"]);
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      const stdout = result.stdout ?? "";
      expect(stdout).toMatch(/\[config\].*\[skills\].*\[kb\].*\[download\].*\[refusal\]/s);
    },
  );

  it.skipIf(SKIP_SUBPROCESS)(
    "writes no files into a temporary HOME or cwd",
    () => {
      const tmpRoot = nodeFs.mkdtempSync(path.join(os.tmpdir(), "tb-issue155-preview-"));
      const fakeHome = path.join(tmpRoot, "home");
      const fakeCwd = path.join(tmpRoot, "cwd");
      nodeFs.mkdirSync(fakeHome, { recursive: true });
      nodeFs.mkdirSync(fakeCwd, { recursive: true });

      try {
        const result = spawnTeamagent(["install", "--preview"], {
          cwd: fakeCwd,
          env: {
            // Keep PATH so tsx + node can still resolve. Override HOME so any
            // accidental ~/.teamagent write would land here.
            HOME: fakeHome,
            USERPROFILE: fakeHome,
          },
        });
        expect(result.error).toBeUndefined();
        expect(result.status).toBe(0);

        // Walk the temp tree; only directories we created (home, cwd) should
        // exist, no nested files.
        const filesUnder = (root: string): string[] => {
          const out: string[] = [];
          const stack = [root];
          while (stack.length) {
            const dir = stack.pop()!;
            for (const ent of nodeFs.readdirSync(dir, { withFileTypes: true })) {
              const p = path.join(dir, ent.name);
              if (ent.isDirectory()) stack.push(p);
              else out.push(p);
            }
          }
          return out;
        };
        expect(filesUnder(fakeHome)).toEqual([]);
        expect(filesUnder(fakeCwd)).toEqual([]);
      } finally {
        nodeFs.rmSync(tmpRoot, { recursive: true, force: true });
      }
    },
  );

  it.skipIf(SKIP_SUBPROCESS)(
    "install --help advertises install without a vector skip flag",
    () => {
      const result = spawnTeamagent(["install", "--help"]);
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(result.stdout ?? "").toContain("Usage: teamagent install");
      expect(result.stdout ?? "").not.toMatch(/--skip-(vector-)?model/);
    },
  );
});
