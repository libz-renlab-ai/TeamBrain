import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  readHooksFromSettingsFile,
  readInstalledHooksFromPaths,
} from "../m5-default-port.js";

/**
 * 测两层契约：
 *   1) `readHooksFromSettingsFile(path)` —— 纯路径输入，单文件读取
 *   2) `readInstalledHooksFromPaths({ userPath, projectPath })`
 *        —— 二者并集 + 去重 + 任一缺省的回退
 *
 * 关键 bug：`m5-bootstrap` 的旧检测器只读 user-level，对 project-level
 * `.claude/settings.local.json` 视而不见，导致 UserPromptSubmit / Stop 永远
 * 被误报缺失。这套测试锁住"必须读两处"的契约。
 *
 * 注意：测试用纯路径 API 而不是 `readInstalledHooksImpl(projectRoot?)`，
 * 因为后者内部调 `os.homedir()`，在 Linux CI 上 `process.env.HOME` 覆盖不
 * 一定生效（vitest worker 启动时已绑定真实 HOME）。把"路径解析"留给生
 * 产代码、把"路径加路径"逻辑独立测试，是最稳妥的分层。
 */
describe("readHooksFromSettingsFile (单文件读取)", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "m5-port-file-"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("returns [] when the file does not exist", async () => {
    const result = await readHooksFromSettingsFile(
      path.join(tmp, "missing.json")
    );
    expect(result).toEqual([]);
  });

  it("returns [] when JSON is malformed (fail-soft)", async () => {
    const p = path.join(tmp, "bad.json");
    await fs.writeFile(p, "{ not valid json", "utf8");
    expect(await readHooksFromSettingsFile(p)).toEqual([]);
  });

  it("returns [] when the file has no hooks key", async () => {
    const p = path.join(tmp, "empty.json");
    await fs.writeFile(p, JSON.stringify({ unrelated: 1 }), "utf8");
    expect(await readHooksFromSettingsFile(p)).toEqual([]);
  });

  it("extracts only the HookKind keys present in hooks", async () => {
    const p = path.join(tmp, "hooks.json");
    await fs.writeFile(
      p,
      JSON.stringify({
        hooks: {
          UserPromptSubmit: [{}],
          Stop: [{}],
          PreToolUse: [{}],
        },
      }),
      "utf8"
    );
    const result = await readHooksFromSettingsFile(p);
    expect(result).toContain("UserPromptSubmit");
    expect(result).toContain("Stop");
    expect(result).toContain("PreToolUse");
    expect(result).not.toContain("SessionStart");
  });

  it("ignores unknown keys that aren't in HookKind union", async () => {
    const p = path.join(tmp, "junk.json");
    await fs.writeFile(
      p,
      JSON.stringify({
        hooks: {
          NotARealHook: [{}],
          Stop: [{}],
        },
      }),
      "utf8"
    );
    expect(await readHooksFromSettingsFile(p)).toEqual(["Stop"]);
  });
});

describe("readInstalledHooksFromPaths (user + project 并集)", () => {
  let tmp: string;
  let userPath: string;
  let projectPath: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "m5-port-paths-"));
    userPath = path.join(tmp, "user-settings.json");
    projectPath = path.join(tmp, "project-settings.local.json");
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  async function writeUser(hooks: Record<string, unknown>): Promise<void> {
    await fs.writeFile(userPath, JSON.stringify({ hooks }), "utf8");
  }

  async function writeProject(hooks: Record<string, unknown>): Promise<void> {
    await fs.writeFile(projectPath, JSON.stringify({ hooks }), "utf8");
  }

  it("returns project-level hooks when only project settings has them (the bug fix)", async () => {
    await writeProject({
      UserPromptSubmit: [{}],
      Stop: [{}],
    });
    const result = await readInstalledHooksFromPaths({
      userSettingsPath: userPath,
      projectSettingsPath: projectPath,
    });
    expect(result).toContain("UserPromptSubmit");
    expect(result).toContain("Stop");
  });

  it("returns user-level hooks when only user settings has them", async () => {
    await writeUser({ SessionStart: [{}] });
    const result = await readInstalledHooksFromPaths({
      userSettingsPath: userPath,
      projectSettingsPath: projectPath,
    });
    expect(result).toContain("SessionStart");
  });

  it("returns the union when both scopes have different hooks", async () => {
    await writeUser({ SessionStart: [{}] });
    await writeProject({
      UserPromptSubmit: [{}],
      Stop: [{}],
    });
    const result = await readInstalledHooksFromPaths({
      userSettingsPath: userPath,
      projectSettingsPath: projectPath,
    });
    expect(result).toContain("SessionStart");
    expect(result).toContain("UserPromptSubmit");
    expect(result).toContain("Stop");
  });

  it("deduplicates a hook wired at both scopes", async () => {
    await writeUser({ Stop: [{}] });
    await writeProject({ Stop: [{}] });
    const result = await readInstalledHooksFromPaths({
      userSettingsPath: userPath,
      projectSettingsPath: projectPath,
    });
    expect(result.filter((h) => h === "Stop")).toHaveLength(1);
  });

  it("returns user-level only when projectSettingsPath is undefined", async () => {
    await writeUser({ SessionStart: [{}] });
    await writeProject({ UserPromptSubmit: [{}] });
    const result = await readInstalledHooksFromPaths({
      userSettingsPath: userPath,
    });
    expect(result).toContain("SessionStart");
    expect(result).not.toContain("UserPromptSubmit");
  });

  it("returns [] when neither path is given", async () => {
    const result = await readInstalledHooksFromPaths({});
    expect(result).toEqual([]);
  });
});
