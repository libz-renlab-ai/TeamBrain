import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  M5_INFECT_DEPRECATION_BANNER,
  parseM5InfectArgs,
  renderM5InfectResult,
  runM5Infect,
} from "../commands/m5-infect.js";
import { runM5Bootstrap } from "../commands/m5-bootstrap.js";
import { FsBootstrap } from "@teamagent/adapters/m5/fs-bootstrap";

function gitAvailable(): boolean {
  try {
    execSync("git --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function initRepo(root: string): void {
  execSync("git init -q", { cwd: root });
  execSync("git config user.email tester@example.com", { cwd: root });
  execSync("git config user.name tester", { cwd: root });
}

/** Stub port that reports "本机什么都没装"——测试需要确定性，不依赖实际机器配置。 */
function makeStubPort(): FsBootstrap {
  return new FsBootstrap({
    readTeamagentVersion: async () => null,
    readInstalledPlugins: async () => [],
    readInstalledProjectSkills: async () => [],
    readInstalledHooks: async () => [],
  });
}

describe("m5-infect command", () => {
  it("infects a clean project with all artifacts", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "m5-cli-"));
    try {
      const r = await runM5Infect({
        projectRoot: root,
        author: "tester",
        teamagentVersion: "0.9.4",
        now: "2026-05-06T10:00:00Z",
      });
      expect(r.skipped).toBe(false);
      expect(r.written_files).toContain(".teamagent/manifest.json");
      expect(r.written_files).toContain(".githooks/pre-commit");
      expect(r.written_dirs).toContain(".teamagent/team");
      const manifest = await fs.readFile(
        path.join(root, ".teamagent", "manifest.json"),
        "utf8"
      );
      expect(manifest).toContain('"created_by": "tester"');
      expect(manifest).toContain('"teamagent_version": "0.9.4"');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it.skipIf(!gitAvailable())(
    "W15-002: refuses to clobber non-default core.hooksPath (husky/lefthook)",
    async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), "m5-cli-husky-"));
      try {
        initRepo(root);
        // Simulate husky setup.
        execSync("git config core.hooksPath .husky", { cwd: root });

        const r = await runM5Infect({
          projectRoot: root,
          author: "tester",
          teamagentVersion: "0.9.4",
          now: "2026-05-08T10:00:00Z",
        });

        expect(r.hookspath_blocked).toBe(true);
        expect(r.hookspath_existing).toBe(".husky");
        expect(r.git_hookspath_set).toBe(false);

        // user's husky config preserved (W15-002 root cause)
        const cur = execSync("git config --get core.hooksPath", {
          cwd: root,
          encoding: "utf8",
        }).trim();
        expect(cur).toBe(".husky");
      } finally {
        await fs.rm(root, { recursive: true, force: true });
      }
    },
  );

  it.skipIf(!gitAvailable())(
    "W15-002: --force overrides hookspath protection",
    async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), "m5-cli-force-"));
      try {
        initRepo(root);
        execSync("git config core.hooksPath .husky", { cwd: root });

        const r = await runM5Infect({
          projectRoot: root,
          author: "tester",
          teamagentVersion: "0.9.4",
          now: "2026-05-08T10:00:00Z",
          force: true,
        });

        expect(r.hookspath_blocked).toBeFalsy();
        expect(r.git_hookspath_set).toBe(true);

        const cur = execSync("git config --get core.hooksPath", {
          cwd: root,
          encoding: "utf8",
        }).trim();
        expect(cur).toBe(".githooks");
      } finally {
        await fs.rm(root, { recursive: true, force: true });
      }
    },
  );

  it.skipIf(!gitAvailable())(
    "W15-002: empty/default hookspath proceeds without --force",
    async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), "m5-cli-default-"));
      try {
        initRepo(root);
        // No core.hooksPath set.

        const r = await runM5Infect({
          projectRoot: root,
          author: "tester",
          teamagentVersion: "0.9.4",
          now: "2026-05-08T10:00:00Z",
        });

        expect(r.hookspath_blocked).toBeFalsy();
        expect(r.git_hookspath_set).toBe(true);
      } finally {
        await fs.rm(root, { recursive: true, force: true });
      }
    },
  );

  it.skipIf(!gitAvailable())(
    "W15-003: chain-loads into preexisting user post-merge hook (no silent skip)",
    async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), "m5-cli-chain-"));
      try {
        initRepo(root);
        await fs.mkdir(path.join(root, ".githooks"), { recursive: true });
        await fs.writeFile(
          path.join(root, ".githooks", "post-merge"),
          "#!/bin/sh\necho [user-custom-post-merge]\n",
        );

        const r = await runM5Infect({
          projectRoot: root,
          author: "tester",
          teamagentVersion: "0.9.4",
          now: "2026-05-08T10:00:00Z",
        });

        expect(r.chained_files).toContain(".githooks/post-merge");
        const merged = await fs.readFile(
          path.join(root, ".githooks", "post-merge"),
          "utf8",
        );
        expect(merged).toContain("echo [user-custom-post-merge]");
        expect(merged).toContain("teamagent");
      } finally {
        await fs.rm(root, { recursive: true, force: true });
      }
    },
  );

  it("parseM5InfectArgs accepts --force", () => {
    expect(parseM5InfectArgs(["--force"]).force).toBe(true);
    expect(parseM5InfectArgs([]).force).toBeUndefined();
  });

  it("is idempotent on already-infected project", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "m5-cli-"));
    try {
      await runM5Infect({
        projectRoot: root,
        author: "a",
        teamagentVersion: "0.9.4",
        now: "2026-05-06T10:00:00Z",
      });
      const r2 = await runM5Infect({
        projectRoot: root,
        author: "b",
        teamagentVersion: "0.9.5",
        now: "2026-05-06T11:00:00Z",
      });
      expect(r2.skipped).toBe(true);
      const manifest = await fs.readFile(
        path.join(root, ".teamagent", "manifest.json"),
        "utf8"
      );
      // 不被覆盖：仍是第一次的 author / 版本
      expect(manifest).toContain('"created_by": "a"');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe("m5-bootstrap manifest validation (W15-011)", () => {
  const port = makeStubPort();
  const corruptForms: Array<{ name: string; content: string; rxn: RegExp }> = [
    { name: "empty file", content: "", rxn: /invalid JSON/ },
    {
      name: "non-JSON plain text",
      content: "this is not json",
      rxn: /invalid JSON/,
    },
    {
      name: "schema_version=99",
      content: JSON.stringify({
        schema_version: 99,
        teamagent_version: "0.0.0",
        required_plugins: [],
        required_project_skills: [],
        required_hooks: [],
        created_by: "x",
        created_at: "2026-05-08T10:00:00Z",
      }),
      rxn: /unsupported schema_version/,
    },
    {
      name: "missing created_by",
      content: JSON.stringify({
        schema_version: 1,
        teamagent_version: "0.0.0",
        required_plugins: [],
        required_project_skills: [],
        required_hooks: [],
        created_at: "2026-05-08T10:00:00Z",
      }),
      rxn: /created_by/,
    },
  ];

  for (const form of corruptForms) {
    it(`runM5Bootstrap throws on ${form.name} (--check)`, async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), "m5-cli-bad-"));
      try {
        await fs.mkdir(path.join(root, ".teamagent"), { recursive: true });
        await fs.writeFile(
          path.join(root, ".teamagent", "manifest.json"),
          form.content,
        );
        await expect(
          runM5Bootstrap({ projectRoot: root, checkOnly: true, port }),
        ).rejects.toThrow(form.rxn);
      } finally {
        await fs.rm(root, { recursive: true, force: true });
      }
    });

    it(`runM5Bootstrap throws on ${form.name} (--apply)`, async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), "m5-cli-bad-"));
      try {
        await fs.mkdir(path.join(root, ".teamagent"), { recursive: true });
        await fs.writeFile(
          path.join(root, ".teamagent", "manifest.json"),
          form.content,
        );
        await expect(
          runM5Bootstrap({ projectRoot: root, checkOnly: false, port }),
        ).rejects.toThrow(form.rxn);
      } finally {
        await fs.rm(root, { recursive: true, force: true });
      }
    });
  }
});

describe("m5-bootstrap command", () => {
  it("returns diff=null on uninfected project", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "m5-cli-"));
    try {
      const r = await runM5Bootstrap({ projectRoot: root, checkOnly: true, port: makeStubPort() });
      expect(r.diff).toBeNull();
      expect(r.reason).toContain("no manifest");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("returns needs_bootstrap=true when manifest requires plugins missing locally", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "m5-cli-"));
    try {
      await runM5Infect({
        projectRoot: root,
        author: "tester",
        teamagentVersion: "0.9.4",
        now: "2026-05-06T10:00:00Z",
      });
      // 改 manifest 加 required_plugins
      const mPath = path.join(root, ".teamagent", "manifest.json");
      const raw = await fs.readFile(mPath, "utf8");
      const m = JSON.parse(raw);
      m.required_plugins = ["code-review", "playground"];
      await fs.writeFile(mPath, JSON.stringify(m, null, 2));
      const r = await runM5Bootstrap({ projectRoot: root, checkOnly: true, port: makeStubPort() });
      expect(r.diff?.needs_bootstrap).toBe(true);
      expect(r.diff?.install_plugins).toEqual(["code-review", "playground"]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

// Issue #284 slice 1: m5-infect soft-archive.
describe("m5-infect deprecation banner", () => {
  it("renderM5InfectResult prepends the [legacy] banner pointing at `teamagent init .`", () => {
    const out = renderM5InfectResult({
      written_files: [".githooks/pre-commit"],
      written_dirs: [".teamagent/team"],
      skipped: false,
    });
    const lines = out.split("\n");
    expect(lines[0]).toBe(M5_INFECT_DEPRECATION_BANNER);
    expect(lines[0]).toContain("[legacy]");
    expect(lines[0]).toContain("teamagent init");
  });

  it("renderM5InfectResult emits the banner even when skipped (already infected)", () => {
    const out = renderM5InfectResult({
      written_files: [],
      written_dirs: [],
      skipped: true,
    });
    expect(out.startsWith(M5_INFECT_DEPRECATION_BANNER)).toBe(true);
  });

  it("banner string mentions teamagent init . exactly (grill canonical replacement)", () => {
    expect(M5_INFECT_DEPRECATION_BANNER).toContain("teamagent init .");
  });
});
