import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  readHooksFromSettingsFile,
  readInstalledHooksImpl,
} from "../m5-default-port.js";

/**
 * 测两层契约：
 *   1) `readHooksFromSettingsFile(path)` —— 纯路径输入，单文件读取
 *   2) `readInstalledHooksImpl(projectRoot?)` —— 二者并集 + 去重 + projectRoot 缺省回退
 *
 * 关键 bug：`m5-bootstrap` 的旧检测器只读 user-level，对 project-level
 * `.claude/settings.local.json` 视而不见，导致 UserPromptSubmit / Stop 永远
 * 被误报缺失。这套测试锁住"必须读两处"的契约。
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

describe("readInstalledHooksImpl (user + project 并集)", () => {
  // 每个测试自己有干净的 fakeHome。通过 USERPROFILE/HOME 覆盖让
  // os.homedir() 解析到 fakeHome — Node `os.homedir()` 在 Win 看 USERPROFILE，
  // 在 *nix 看 HOME，写两个就跨平台了。
  let fakeHome: string;
  let projectRoot: string;
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;

  beforeEach(async () => {
    fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), "m5-port-home-"));
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "m5-port-proj-"));
    originalHome = process.env.HOME;
    originalUserProfile = process.env.USERPROFILE;
    process.env.HOME = fakeHome;
    process.env.USERPROFILE = fakeHome;
  });

  afterEach(async () => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = originalUserProfile;
    await fs.rm(fakeHome, { recursive: true, force: true });
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  async function writeUserHooks(hooks: Record<string, unknown>): Promise<void> {
    const dir = path.join(fakeHome, ".claude");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, "settings.json"),
      JSON.stringify({ hooks }),
      "utf8"
    );
  }

  async function writeProjectHooks(
    hooks: Record<string, unknown>
  ): Promise<void> {
    const dir = path.join(projectRoot, ".claude");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, "settings.local.json"),
      JSON.stringify({ hooks }),
      "utf8"
    );
  }

  it("returns project-level hooks when only project settings.local.json has them (the bug fix)", async () => {
    await writeProjectHooks({
      UserPromptSubmit: [{}],
      Stop: [{}],
    });
    const result = await readInstalledHooksImpl(projectRoot);
    expect(result).toContain("UserPromptSubmit");
    expect(result).toContain("Stop");
  });

  it("returns user-level hooks when only ~/.claude/settings.json has them", async () => {
    await writeUserHooks({ SessionStart: [{}] });
    const result = await readInstalledHooksImpl(projectRoot);
    expect(result).toContain("SessionStart");
  });

  it("returns the union when both scopes have different hooks", async () => {
    await writeUserHooks({ SessionStart: [{}] });
    await writeProjectHooks({
      UserPromptSubmit: [{}],
      Stop: [{}],
    });
    const result = await readInstalledHooksImpl(projectRoot);
    expect(result).toContain("SessionStart");
    expect(result).toContain("UserPromptSubmit");
    expect(result).toContain("Stop");
  });

  it("deduplicates a hook wired at both scopes", async () => {
    await writeUserHooks({ Stop: [{}] });
    await writeProjectHooks({ Stop: [{}] });
    const result = await readInstalledHooksImpl(projectRoot);
    expect(result.filter((h) => h === "Stop")).toHaveLength(1);
  });

  it("falls back to user-level only when projectRoot is omitted", async () => {
    await writeUserHooks({ SessionStart: [{}] });
    await writeProjectHooks({ UserPromptSubmit: [{}] });
    const result = await readInstalledHooksImpl();
    expect(result).toContain("SessionStart");
    expect(result).not.toContain("UserPromptSubmit");
  });
});
