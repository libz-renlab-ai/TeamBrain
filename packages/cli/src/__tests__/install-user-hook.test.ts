import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { installUserHook, uninstallUserHook } from "../commands/install-user-hook.js";

describe("installUserHook", () => {
  let home: string;
  let sessionStartEntry: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "uh-home-"));
    const stubDir = fs.mkdtempSync(path.join(os.tmpdir(), "uh-entry-"));
    sessionStartEntry = path.join(stubDir, "bin-session-start.cjs");
    fs.writeFileSync(sessionStartEntry, "// stub");
  });

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(path.dirname(sessionStartEntry), { recursive: true, force: true });
  });

  it("首次安装: 写 ~/.claude/settings.json 并注册 SessionStart hook", () => {
    const r = installUserHook({ homeDir: home, sessionStartEntry });
    expect(r.alreadyInstalled).toBe(false);
    expect(r.backupPath).toBeNull();
    expect(fs.existsSync(r.settingsPath)).toBe(true);

    const settings = JSON.parse(fs.readFileSync(r.settingsPath, "utf-8"));
    expect(settings.hooks?.SessionStart).toHaveLength(1);
    expect(settings.hooks.SessionStart[0]._teamagentTag).toBe("teamagent-session-start");
    expect(settings.hooks.SessionStart[0].hooks[0].command).toContain("bin-session-start.cjs");
  });

  it("已有其他 SessionStart hook: 不覆盖, 追加", () => {
    const settingsPath = path.join(home, ".claude", "settings.json");
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          SessionStart: [
            { hooks: [{ type: "command", command: "echo other" }] },
          ],
        },
        otherSetting: "keep me",
      }, null, 2),
    );

    const r = installUserHook({ homeDir: home, sessionStartEntry });
    expect(r.backupPath).not.toBeNull();
    expect(fs.existsSync(r.backupPath!)).toBe(true);

    const settings = JSON.parse(fs.readFileSync(r.settingsPath, "utf-8"));
    expect(settings.hooks.SessionStart).toHaveLength(2);
    expect(settings.otherSetting).toBe("keep me");
  });

  it("幂等: 跑两次只注册一条", () => {
    installUserHook({ homeDir: home, sessionStartEntry });
    const r2 = installUserHook({ homeDir: home, sessionStartEntry });
    expect(r2.alreadyInstalled).toBe(true);
    const settings = JSON.parse(fs.readFileSync(r2.settingsPath, "utf-8"));
    const ourHooks = settings.hooks.SessionStart.filter(
      (h: any) => h._teamagentTag === "teamagent-session-start",
    );
    expect(ourHooks).toHaveLength(1);
  });

  it("bundle 不存在 → 抛错", () => {
    expect(() =>
      installUserHook({ homeDir: home, sessionStartEntry: "/does/not/exist.cjs" }),
    ).toThrow(/SessionStart bundle not found/);
  });

  it("uninstallUserHook 只删自己那条, 不动其他", () => {
    const settingsPath = path.join(home, ".claude", "settings.json");
    installUserHook({ homeDir: home, sessionStartEntry });
    // Manually inject an unrelated hook
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    settings.hooks.SessionStart.push({
      hooks: [{ type: "command", command: "echo unrelated" }],
    });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    const r = uninstallUserHook({ homeDir: home });
    expect(r.removed).toBe(true);
    const after = JSON.parse(fs.readFileSync(r.settingsPath, "utf-8"));
    expect(after.hooks.SessionStart).toHaveLength(1);
    expect(after.hooks.SessionStart[0].hooks[0].command).toBe("echo unrelated");
  });

  // B-086: legacy entries written before _teamagentTag was added (or via
  // npm tarball install pre-tag, or via older monorepo install path) leave
  // orphan SessionStart entries that point at bin-session-start.cjs in some
  // path. installUserHook must replace them, and uninstallUserHook must
  // remove them — otherwise users accumulate stale teamagent hooks across
  // reinstalls and uninstall leaves them dangling.
  it("install 清理 untagged 但指向 bin-session-start.cjs 的旧条目", () => {
    const settingsPath = path.join(home, ".claude", "settings.json");
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          SessionStart: [
            { hooks: [{ type: "command", command: "node /tmp/old-install/bin-session-start.cjs" }] },
            { hooks: [{ type: "command", command: "node C:/other/dist/bin-session-start.cjs" }] },
            { hooks: [{ type: "command", command: "echo unrelated" }] },
          ],
        },
      }, null, 2),
    );

    installUserHook({ homeDir: home, sessionStartEntry });
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    // 2 untagged teamagent legacy entries removed, unrelated kept, new tagged entry added
    expect(settings.hooks.SessionStart).toHaveLength(2);
    expect(settings.hooks.SessionStart[0].hooks[0].command).toBe("echo unrelated");
    expect(settings.hooks.SessionStart[1]._teamagentTag).toBe("teamagent-session-start");
  });

  it("uninstall 清理 untagged 但指向 bin-session-start.cjs 的旧条目", () => {
    const settingsPath = path.join(home, ".claude", "settings.json");
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          SessionStart: [
            { hooks: [{ type: "command", command: "node /tmp/old/bin-session-start.cjs" }] },
            { _teamagentTag: "teamagent-session-start", hooks: [{ type: "command", command: "node /current/bin-session-start.cjs" }] },
            { hooks: [{ type: "command", command: "echo unrelated" }] },
          ],
        },
      }, null, 2),
    );

    const r = uninstallUserHook({ homeDir: home });
    expect(r.removed).toBe(true);
    const after = JSON.parse(fs.readFileSync(r.settingsPath, "utf-8"));
    expect(after.hooks.SessionStart).toHaveLength(1);
    expect(after.hooks.SessionStart[0].hooks[0].command).toBe("echo unrelated");
  });
});
