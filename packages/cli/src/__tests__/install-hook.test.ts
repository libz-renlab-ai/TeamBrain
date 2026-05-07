import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { installHook, uninstallHook } from "../commands/install-hook.js";

function mkTmp(): { cwd: string; cleanup: () => void } {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "install-hook-"));
  return {
    cwd,
    cleanup: () => fs.rmSync(cwd, { recursive: true, force: true }),
  };
}

// 用真实存在的文件作 fake hook entry，绕过"bundle 必须存在"的检查
const FAKE_HOOK_ENTRY = fileURLToPath(import.meta.url);

describe("installHook", () => {
  let tmp: ReturnType<typeof mkTmp>;

  beforeEach(() => {
    tmp = mkTmp();
  });

  afterEach(() => {
    tmp.cleanup();
  });

  it("creates settings.local.json with PreToolUse hook entry", () => {
    const r = installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY });
    expect(r.alreadyInstalled).toBe(false);

    const content = JSON.parse(fs.readFileSync(r.settingsPath, "utf-8"));
    expect(content.hooks.PreToolUse).toBeDefined();
    expect(content.hooks.PreToolUse[0]._teamagentTag).toBe("teamagent-pre-tool-use");
    expect(content.hooks.PreToolUse[0].matcher).toContain("Bash");
    expect(content.hooks.PreToolUse[0].hooks[0].command).toContain("node");
    // command 会把反斜杠转为正斜杠
    const forwardEntry = FAKE_HOOK_ENTRY.replace(/\\/g, "/");
    expect(content.hooks.PreToolUse[0].hooks[0].command).toContain(forwardEntry);
  });

  it("preserves existing user settings", () => {
    const settingsPath = path.join(tmp.cwd, ".claude", "settings.local.json");
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        someUserSetting: "preserved",
        hooks: {
          PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "user-hook.sh" }] }],
        },
      }),
    );

    installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY });

    const content = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    expect(content.someUserSetting).toBe("preserved");
    expect(content.hooks.PreToolUse).toHaveLength(2);
    expect(content.hooks.PreToolUse[0].hooks[0].command).toBe("user-hook.sh");
    expect(content.hooks.PreToolUse[1]._teamagentTag).toBe("teamagent-pre-tool-use");
  });

  it("idempotent: second install detects already-installed", () => {
    installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY });
    const r2 = installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY });
    expect(r2.alreadyInstalled).toBe(true);

    const content = JSON.parse(
      fs.readFileSync(r2.settingsPath, "utf-8"),
    );
    expect(content.hooks.PreToolUse).toHaveLength(1);
  });
});

describe("uninstallHook", () => {
  let tmp: ReturnType<typeof mkTmp>;

  beforeEach(() => {
    tmp = mkTmp();
  });

  afterEach(() => {
    tmp.cleanup();
  });

  it("returns removed=false when settings file missing", () => {
    const r = uninstallHook({ cwd: tmp.cwd });
    expect(r.removed).toBe(false);
  });

  it("removes only TeamAgent entry, preserves user hooks", () => {
    installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY });

    // 注入一条用户自己的 hook
    const settingsPath = path.join(tmp.cwd, ".claude", "settings.local.json");
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    settings.hooks.PreToolUse.push({
      matcher: "Read",
      hooks: [{ type: "command", command: "user-other.sh" }],
    });
    fs.writeFileSync(settingsPath, JSON.stringify(settings));

    const r = uninstallHook({ cwd: tmp.cwd });
    expect(r.removed).toBe(true);

    const after = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    expect(after.hooks.PreToolUse).toHaveLength(1);
    expect(after.hooks.PreToolUse[0].hooks[0].command).toBe("user-other.sh");
  });

  it("returns removed=false on second uninstall", () => {
    installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY });
    uninstallHook({ cwd: tmp.cwd });
    const r2 = uninstallHook({ cwd: tmp.cwd });
    expect(r2.removed).toBe(false);
  });
});

describe("installHook — UserPromptSubmit + Stop", () => {
  let tmp: ReturnType<typeof mkTmp>;
  beforeEach(() => { tmp = mkTmp(); });
  afterEach(() => { tmp.cleanup(); });

  it("registers UserPromptSubmit hook when bundle provided", () => {
    installHook({
      cwd: tmp.cwd,
      hookEntry: FAKE_HOOK_ENTRY,
      userPromptEntry: FAKE_HOOK_ENTRY,
    });
    const content = JSON.parse(
      fs.readFileSync(path.join(tmp.cwd, ".claude", "settings.local.json"), "utf-8")
    );
    expect(content.hooks.UserPromptSubmit).toBeDefined();
    expect(content.hooks.UserPromptSubmit[0]._teamagentTag).toBe("teamagent-user-prompt-submit");
    expect(content.hooks.UserPromptSubmit[0].hooks[0].timeout).toBe(10);
    expect(content.hooks.UserPromptSubmit[0].matcher).toBeUndefined();
  });

  it("registers Stop hook when bundle provided", () => {
    installHook({
      cwd: tmp.cwd,
      hookEntry: FAKE_HOOK_ENTRY,
      stopEntry: FAKE_HOOK_ENTRY,
    });
    const content = JSON.parse(
      fs.readFileSync(path.join(tmp.cwd, ".claude", "settings.local.json"), "utf-8")
    );
    expect(content.hooks.Stop).toBeDefined();
    expect(content.hooks.Stop[0]._teamagentTag).toBe("teamagent-stop");
    expect(content.hooks.Stop[0].hooks[0].timeout).toBe(60);
    expect(content.hooks.Stop[0].matcher).toBeUndefined();
  });

  it("idempotent: second install of UserPromptSubmit not duplicated", () => {
    installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY, userPromptEntry: FAKE_HOOK_ENTRY });
    installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY, userPromptEntry: FAKE_HOOK_ENTRY });
    const content = JSON.parse(
      fs.readFileSync(path.join(tmp.cwd, ".claude", "settings.local.json"), "utf-8")
    );
    expect(content.hooks.UserPromptSubmit).toHaveLength(1);
  });

  it("uninstall removes UserPromptSubmit and Stop entries", () => {
    installHook({
      cwd: tmp.cwd,
      hookEntry: FAKE_HOOK_ENTRY,
      userPromptEntry: FAKE_HOOK_ENTRY,
      stopEntry: FAKE_HOOK_ENTRY,
    });
    uninstallHook({ cwd: tmp.cwd });
    const content = JSON.parse(
      fs.readFileSync(path.join(tmp.cwd, ".claude", "settings.local.json"), "utf-8")
    );
    expect(content.hooks?.UserPromptSubmit).toBeUndefined();
    expect(content.hooks?.Stop).toBeUndefined();
  });
});

describe("installHook — statusLine", () => {
  let tmp: ReturnType<typeof mkTmp>;
  beforeEach(() => { tmp = mkTmp(); });
  afterEach(() => { tmp.cleanup(); });

  it("registers teamagent statusLine when none exists", () => {
    const r = installHook({
      cwd: tmp.cwd,
      hookEntry: FAKE_HOOK_ENTRY,
      statusLineEntry: FAKE_HOOK_ENTRY,
    });
    expect(r.statusLineSkipped).toBe(false);

    const content = JSON.parse(
      fs.readFileSync(path.join(tmp.cwd, ".claude", "settings.local.json"), "utf-8"),
    );
    expect(content.statusLine).toBeDefined();
    expect(content.statusLine.type).toBe("command");
    expect(content.statusLine._teamagentTag).toBe("teamagent-statusline");
    expect(content.statusLine.command).toContain("node");
    expect(content.statusLine.command).toContain(FAKE_HOOK_ENTRY.replace(/\\/g, "/"));
  });

  it("updates tagged teamagent statusLine (idempotent)", () => {
    installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY, statusLineEntry: FAKE_HOOK_ENTRY });
    const r2 = installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY, statusLineEntry: FAKE_HOOK_ENTRY });
    expect(r2.statusLineSkipped).toBe(false);

    const content = JSON.parse(
      fs.readFileSync(path.join(tmp.cwd, ".claude", "settings.local.json"), "utf-8"),
    );
    expect(content.statusLine._teamagentTag).toBe("teamagent-statusline");
  });

  it("wraps user's project-level statusLine into bash -c chain (#104)", () => {
    const settingsPath = path.join(tmp.cwd, ".claude", "settings.local.json");
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    const preExisting = {
      statusLine: {
        type: "command",
        command: "node /custom/user/bar.js",
      },
    };
    fs.writeFileSync(settingsPath, JSON.stringify(preExisting));

    const r = installHook({
      cwd: tmp.cwd,
      hookEntry: FAKE_HOOK_ENTRY,
      statusLineEntry: FAKE_HOOK_ENTRY,
      homeDir: tmp.cwd, // 测试用空 home，避免读到本机真 ~/.claude
    });
    expect(r.statusLineSkipped).toBe(false);
    expect(r.statusLineMergedScope).toBe("project");

    const content = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    // command 现在是 chain 形态：bash -c '<user>; echo; <team>'
    expect(content.statusLine.command).toMatch(/^bash -c '/);
    expect(content.statusLine.command).toContain("node /custom/user/bar.js");
    expect(content.statusLine.command).toContain("; echo;");
    expect(content.statusLine._teamagentTag).toBe("teamagent-statusline");
    expect(content.statusLine._teamagentOriginalCommand).toBe("node /custom/user/bar.js");
    expect(content.statusLine._teamagentOriginalType).toBe("command");
    expect(content.statusLine._teamagentOriginalScope).toBe("project");
  });

  it("wraps user-level ~/.claude/settings.json statusLine (#104)", () => {
    // 模拟 ~/.claude/settings.json
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "fake-home-"));
    const userSettingsPath = path.join(fakeHome, ".claude", "settings.json");
    fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
    fs.writeFileSync(
      userSettingsPath,
      JSON.stringify({
        statusLine: { type: "command", command: "echo USER_OWN_STATUSLINE_TOKEN" },
      }),
    );

    try {
      const r = installHook({
        cwd: tmp.cwd,
        hookEntry: FAKE_HOOK_ENTRY,
        statusLineEntry: FAKE_HOOK_ENTRY,
        homeDir: fakeHome,
      });
      expect(r.statusLineMergedScope).toBe("user");

      const projectSettings = JSON.parse(
        fs.readFileSync(path.join(tmp.cwd, ".claude", "settings.local.json"), "utf-8"),
      );
      expect(projectSettings.statusLine.command).toContain("echo USER_OWN_STATUSLINE_TOKEN");
      expect(projectSettings.statusLine.command).toMatch(/^bash -c '/);
      expect(projectSettings.statusLine._teamagentOriginalCommand).toBe(
        "echo USER_OWN_STATUSLINE_TOKEN",
      );
      expect(projectSettings.statusLine._teamagentOriginalScope).toBe("user");

      // user-level 文件保持原样（V4 / V1 不变）
      const userAfter = JSON.parse(fs.readFileSync(userSettingsPath, "utf-8"));
      expect(userAfter.statusLine.command).toBe("echo USER_OWN_STATUSLINE_TOKEN");
    } finally {
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it("project-level user statusLine takes precedence over user-level (#104)", () => {
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "fake-home-"));
    fs.mkdirSync(path.join(fakeHome, ".claude"), { recursive: true });
    fs.writeFileSync(
      path.join(fakeHome, ".claude", "settings.json"),
      JSON.stringify({ statusLine: { type: "command", command: "USER_LEVEL_CMD" } }),
    );
    const projectPath = path.join(tmp.cwd, ".claude", "settings.local.json");
    fs.mkdirSync(path.dirname(projectPath), { recursive: true });
    fs.writeFileSync(
      projectPath,
      JSON.stringify({ statusLine: { type: "command", command: "PROJECT_LEVEL_CMD" } }),
    );

    try {
      const r = installHook({
        cwd: tmp.cwd,
        hookEntry: FAKE_HOOK_ENTRY,
        statusLineEntry: FAKE_HOOK_ENTRY,
        homeDir: fakeHome,
      });
      expect(r.statusLineMergedScope).toBe("project");
      const content = JSON.parse(fs.readFileSync(projectPath, "utf-8"));
      expect(content.statusLine._teamagentOriginalCommand).toBe("PROJECT_LEVEL_CMD");
      expect(content.statusLine.command).toContain("PROJECT_LEVEL_CMD");
      expect(content.statusLine.command).not.toContain("USER_LEVEL_CMD");
    } finally {
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it("escapes single quotes in user cmd safely (#104)", () => {
    const settingsPath = path.join(tmp.cwd, ".claude", "settings.local.json");
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        statusLine: { type: "command", command: "echo \"it's fine\"" },
      }),
    );

    installHook({
      cwd: tmp.cwd,
      hookEntry: FAKE_HOOK_ENTRY,
      statusLineEntry: FAKE_HOOK_ENTRY,
      homeDir: tmp.cwd,
    });

    const content = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    // POSIX 单引号转义：' → '\''
    expect(content.statusLine.command).toContain("it'\\''s fine");
    expect(content.statusLine._teamagentOriginalCommand).toBe("echo \"it's fine\"");
  });

  it("idempotent: second install does not double-wrap (#104)", () => {
    const settingsPath = path.join(tmp.cwd, ".claude", "settings.local.json");
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        statusLine: { type: "command", command: "USER_CMD" },
      }),
    );
    installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY, statusLineEntry: FAKE_HOOK_ENTRY, homeDir: tmp.cwd });
    installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY, statusLineEntry: FAKE_HOOK_ENTRY, homeDir: tmp.cwd });
    const content = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    expect(content.statusLine._teamagentOriginalCommand).toBe("USER_CMD");
    // chain 中只出现一次原 cmd
    const matches = content.statusLine.command.match(/USER_CMD/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("uninstall removes teamagent statusLine when no backup", () => {
    installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY, statusLineEntry: FAKE_HOOK_ENTRY, homeDir: tmp.cwd });
    uninstallHook({ cwd: tmp.cwd });
    const content = JSON.parse(
      fs.readFileSync(path.join(tmp.cwd, ".claude", "settings.local.json"), "utf-8"),
    );
    expect(content.statusLine).toBeUndefined();
  });

  it("uninstall restores user's project-level statusLine from backup (#104)", () => {
    const settingsPath = path.join(tmp.cwd, ".claude", "settings.local.json");
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        statusLine: { type: "command", command: "user-status.sh" },
      }),
    );
    installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY, statusLineEntry: FAKE_HOOK_ENTRY, homeDir: tmp.cwd });
    uninstallHook({ cwd: tmp.cwd });
    const content = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    expect(content.statusLine.command).toBe("user-status.sh");
    expect(content.statusLine.type).toBe("command");
    expect(content.statusLine._teamagentTag).toBeUndefined();
  });

  it("uninstall scope=user just deletes project-level entry (#104)", () => {
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "fake-home-"));
    fs.mkdirSync(path.join(fakeHome, ".claude"), { recursive: true });
    const userSettingsPath = path.join(fakeHome, ".claude", "settings.json");
    fs.writeFileSync(
      userSettingsPath,
      JSON.stringify({
        statusLine: { type: "command", command: "echo USER_OWN_STATUSLINE_TOKEN" },
      }),
    );
    try {
      installHook({
        cwd: tmp.cwd,
        hookEntry: FAKE_HOOK_ENTRY,
        statusLineEntry: FAKE_HOOK_ENTRY,
        homeDir: fakeHome,
      });
      uninstallHook({ cwd: tmp.cwd });

      const projectSettings = JSON.parse(
        fs.readFileSync(path.join(tmp.cwd, ".claude", "settings.local.json"), "utf-8"),
      );
      expect(projectSettings.statusLine).toBeUndefined();

      // user-level 永远不变（V4）
      const userAfter = JSON.parse(fs.readFileSync(userSettingsPath, "utf-8"));
      expect(userAfter.statusLine.command).toBe("echo USER_OWN_STATUSLINE_TOKEN");
    } finally {
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });
});
