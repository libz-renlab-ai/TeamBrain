import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { installHook, uninstallHook, stageDaemonBinaryToUser } from "../commands/install-hook.js";

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
    const r = installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY, userLevel: false });
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

  it("#477: project-level hook command bakes in --experimental-sqlite --no-warnings (P1)", () => {
    // Claude Code spawns hooks as child processes that do NOT inherit the
    // calling shell's NODE_OPTIONS — the flag must live in the registered
    // command itself or every hook is DOA with ERR_UNKNOWN_BUILTIN_MODULE
    // on Node 22.5–23.3.
    const r = installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY, userLevel: false });
    const content = JSON.parse(fs.readFileSync(r.settingsPath, "utf-8"));
    const cmd: string = content.hooks.PreToolUse[0].hooks[0].command;
    expect(cmd).toContain("--experimental-sqlite");
    expect(cmd).toContain("--no-warnings");
    // Flags sit between `node` and the bundle path.
    expect(cmd).toMatch(/^node --experimental-sqlite --no-warnings /);
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

    installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY, userLevel: false });

    const content = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    expect(content.someUserSetting).toBe("preserved");
    expect(content.hooks.PreToolUse).toHaveLength(2);
    expect(content.hooks.PreToolUse[0].hooks[0].command).toBe("user-hook.sh");
    expect(content.hooks.PreToolUse[1]._teamagentTag).toBe("teamagent-pre-tool-use");
  });

  it("idempotent: second install detects already-installed", () => {
    installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY, userLevel: false });
    const r2 = installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY, userLevel: false });
    expect(r2.alreadyInstalled).toBe(true);

    const content = JSON.parse(
      fs.readFileSync(r2.settingsPath, "utf-8"),
    );
    expect(content.hooks.PreToolUse).toHaveLength(1);
  });

  // v0.11.0 channelOps unification: project-level applyChannelOps now also
  // strips untagged-legacy entries that point at TeamAgent bundle filenames
  // (mirrors B-086 user-level dedup). Without this test, a future refactor
  // could silently regress project-level dedup since the symmetric user-level
  // test (line ~790) only exercises ~/.claude/settings.json — not
  // <cwd>/.claude/settings.local.json.
  it("(B-086 project) untagged-legacy PreToolUse entry replaced cleanly on install", () => {
    const settingsPath = path.join(tmp.cwd, ".claude", "settings.local.json");
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: "Bash",
              hooks: [
                {
                  type: "command",
                  command: "node /old/install/path/bin-pre-tool-use.cjs",
                },
              ],
            },
          ],
        },
      }),
      "utf-8",
    );

    installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY, userLevel: false });

    const content = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    expect(content.hooks.PreToolUse).toHaveLength(1);
    expect(content.hooks.PreToolUse[0]._teamagentTag).toBe("teamagent-pre-tool-use");
    const cmd: string = content.hooks.PreToolUse[0].hooks[0].command;
    expect(cmd).not.toContain("/old/install/path/bin-pre-tool-use.cjs");
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
    installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY, userLevel: false });

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
    installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY, userLevel: false });
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
      userLevel: false,
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
      userLevel: false,
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
    installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY, userPromptEntry: FAKE_HOOK_ENTRY, userLevel: false });
    installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY, userPromptEntry: FAKE_HOOK_ENTRY, userLevel: false });
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
      userLevel: false,
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
      userLevel: false,
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
    installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY, statusLineEntry: FAKE_HOOK_ENTRY, userLevel: false });
    const r2 = installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY, statusLineEntry: FAKE_HOOK_ENTRY, userLevel: false });
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
      userLevel: false,
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

  it("fans out stdin to BOTH chained segments so CC JSON reaches teamagent (#331)", () => {
    // Pre-existing user statusLine that drains stdin via `input=$(cat)` — the
    // realworld shape from ~/.claude/statusline-command.sh on the maintainer's
    // box. Before #331, the second segment (our cjs) saw EOF on stdin and all
    // CC-derived fields (model / context / cost) silently vanished. The
    // wrapper must snapshot stdin once at the top and replay it to both
    // segments via `printf %s | ...`.
    const settingsPath = path.join(tmp.cwd, ".claude", "settings.local.json");
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    const preExisting = {
      statusLine: { type: "command", command: 'input=$(cat); echo USER_OUT' },
    };
    fs.writeFileSync(settingsPath, JSON.stringify(preExisting));

    installHook({
      cwd: tmp.cwd,
      hookEntry: FAKE_HOOK_ENTRY,
      statusLineEntry: FAKE_HOOK_ENTRY,
      homeDir: tmp.cwd,
      userLevel: false,
    });

    const cmd = (JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as {
      statusLine: { command: string };
    }).statusLine.command;
    // The new chain wrap snapshots stdin into `_TS_IN` once, then replays it
    // to BOTH segments via `printf %s "$_TS_IN" | { ... }`.
    expect(cmd).toContain("_TS_IN=$(cat)");
    // `printf %s "$_TS_IN" | {` must appear at least twice — once per segment.
    const fanOutCount = (cmd.match(/printf "%s" "\$_TS_IN" \| \{/g) ?? []).length;
    expect(fanOutCount).toBe(2);
    // Both the user cmd and the teamagent cmd are still present.
    expect(cmd).toContain("input=$(cat); echo USER_OUT");
    expect(cmd).toContain("node");
    // Cosmetic newline separator preserved (legacy contract from PR #124).
    expect(cmd).toContain("; echo;");
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
        userLevel: false,
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
        userLevel: false,
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
      userLevel: false,
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
    installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY, statusLineEntry: FAKE_HOOK_ENTRY, homeDir: tmp.cwd, userLevel: false });
    installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY, statusLineEntry: FAKE_HOOK_ENTRY, homeDir: tmp.cwd, userLevel: false });
    const content = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    expect(content.statusLine._teamagentOriginalCommand).toBe("USER_CMD");
    // chain 中只出现一次原 cmd
    const matches = content.statusLine.command.match(/USER_CMD/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("uninstall removes teamagent statusLine when no backup", () => {
    installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY, statusLineEntry: FAKE_HOOK_ENTRY, homeDir: tmp.cwd, userLevel: false });
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
    installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY, statusLineEntry: FAKE_HOOK_ENTRY, homeDir: tmp.cwd, userLevel: false });
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
        userLevel: false,
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

// ─── Issue #161 — Layer 1 viral install (userLevel option) ──────────────────
describe("installHook — userLevel (issue #161)", () => {
  let tmp: ReturnType<typeof mkTmp>;
  let fakeHome: string;

  beforeEach(() => {
    tmp = mkTmp();
    fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "fake-home-uh-"));
  });

  afterEach(() => {
    tmp.cleanup();
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });

  it("userLevel: true writes ~/.claude/settings.json with the same hook shape", () => {
    installHook({
      cwd: tmp.cwd,
      hookEntry: FAKE_HOOK_ENTRY,
      postHookEntry: FAKE_HOOK_ENTRY,
      userPromptEntry: FAKE_HOOK_ENTRY,
      stopEntry: FAKE_HOOK_ENTRY,
      homeDir: fakeHome,
      userLevel: true,
    });

    const userSettingsPath = path.join(fakeHome, ".claude", "settings.json");
    expect(fs.existsSync(userSettingsPath)).toBe(true);
    const content = JSON.parse(fs.readFileSync(userSettingsPath, "utf-8"));

    // Same shape as project-level: PreToolUse / PostToolUse / UserPromptSubmit / Stop
    expect(content.hooks).toBeDefined();
    expect(content.hooks.PreToolUse).toBeDefined();
    expect(content.hooks.PreToolUse[0]._teamagentTag).toBe("teamagent-pre-tool-use");
    expect(content.hooks.PreToolUse[0].matcher).toContain("Bash");
    expect(content.hooks.PreToolUse[0].hooks[0].command).toContain("node");

    expect(content.hooks.PostToolUse).toBeDefined();
    expect(content.hooks.PostToolUse[0]._teamagentTag).toBe("teamagent-post-tool-use");
    expect(content.hooks.PostToolUse[0].matcher).toContain("Bash");

    expect(content.hooks.UserPromptSubmit).toBeDefined();
    expect(content.hooks.UserPromptSubmit[0]._teamagentTag).toBe("teamagent-user-prompt-submit");
    expect(content.hooks.UserPromptSubmit[0].hooks[0].timeout).toBe(10);

    expect(content.hooks.Stop).toBeDefined();
    expect(content.hooks.Stop[0]._teamagentTag).toBe("teamagent-stop");
    expect(content.hooks.Stop[0].hooks[0].timeout).toBe(60);
  });

  it("userLevel: true is idempotent — running twice produces a single entry", () => {
    installHook({
      cwd: tmp.cwd,
      hookEntry: FAKE_HOOK_ENTRY,
      postHookEntry: FAKE_HOOK_ENTRY,
      userPromptEntry: FAKE_HOOK_ENTRY,
      stopEntry: FAKE_HOOK_ENTRY,
      homeDir: fakeHome,
      userLevel: true,
    });
    installHook({
      cwd: tmp.cwd,
      hookEntry: FAKE_HOOK_ENTRY,
      postHookEntry: FAKE_HOOK_ENTRY,
      userPromptEntry: FAKE_HOOK_ENTRY,
      stopEntry: FAKE_HOOK_ENTRY,
      homeDir: fakeHome,
      userLevel: true,
    });

    const userSettingsPath = path.join(fakeHome, ".claude", "settings.json");
    const content = JSON.parse(fs.readFileSync(userSettingsPath, "utf-8"));

    // Each TeamAgent-tagged channel must contain exactly ONE entry after two installs.
    const preTagged = content.hooks.PreToolUse.filter(
      (h: { _teamagentTag?: string }) => h._teamagentTag === "teamagent-pre-tool-use",
    );
    expect(preTagged).toHaveLength(1);

    const postTagged = content.hooks.PostToolUse.filter(
      (h: { _teamagentTag?: string }) => h._teamagentTag === "teamagent-post-tool-use",
    );
    expect(postTagged).toHaveLength(1);

    const upTagged = content.hooks.UserPromptSubmit.filter(
      (h: { _teamagentTag?: string }) => h._teamagentTag === "teamagent-user-prompt-submit",
    );
    expect(upTagged).toHaveLength(1);

    const stopTagged = content.hooks.Stop.filter(
      (h: { _teamagentTag?: string }) => h._teamagentTag === "teamagent-stop",
    );
    expect(stopTagged).toHaveLength(1);
  });

  it("userLevel: true preserves existing non-TeamAgent entries in ~/.claude/settings.json", () => {
    // Pre-seed user-level settings.json with foreign entries + an unrelated top-level setting.
    const userSettingsPath = path.join(fakeHome, ".claude", "settings.json");
    fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
    fs.writeFileSync(
      userSettingsPath,
      JSON.stringify({
        someUserGlobalSetting: "preserved",
        hooks: {
          PreToolUse: [
            { matcher: "Bash", hooks: [{ type: "command", command: "user-global-pre.sh" }] },
          ],
          SessionStart: [
            { hooks: [{ type: "command", command: "user-session.sh" }] },
          ],
        },
      }),
    );

    installHook({
      cwd: tmp.cwd,
      hookEntry: FAKE_HOOK_ENTRY,
      postHookEntry: FAKE_HOOK_ENTRY,
      userPromptEntry: FAKE_HOOK_ENTRY,
      stopEntry: FAKE_HOOK_ENTRY,
      homeDir: fakeHome,
      userLevel: true,
    });

    const content = JSON.parse(fs.readFileSync(userSettingsPath, "utf-8"));

    // Top-level non-hook setting preserved.
    expect(content.someUserGlobalSetting).toBe("preserved");

    // Foreign PreToolUse entry preserved AND TeamAgent entry appended.
    expect(content.hooks.PreToolUse).toHaveLength(2);
    const foreignPre = content.hooks.PreToolUse.find(
      (h: { _teamagentTag?: string; hooks: { command: string }[] }) =>
        h.hooks?.[0]?.command === "user-global-pre.sh",
    );
    expect(foreignPre).toBeDefined();
    expect(foreignPre._teamagentTag).toBeUndefined();

    const taggedPre = content.hooks.PreToolUse.find(
      (h: { _teamagentTag?: string }) => h._teamagentTag === "teamagent-pre-tool-use",
    );
    expect(taggedPre).toBeDefined();

    // B+C scope (2026-05-09): SessionStart was previously "not managed here"
    // but is now folded into installHook user-level. The foreign entry must
    // still be preserved; the teamagent entry is added alongside.
    expect(content.hooks.SessionStart).toBeDefined();
    const foreignSession = content.hooks.SessionStart.find(
      (h: { hooks: { command: string }[] }) => h.hooks?.[0]?.command === "user-session.sh",
    );
    expect(foreignSession).toBeDefined();
    expect(foreignSession._teamagentTag).toBeUndefined();
    // teamagent's SessionStart entry only registers if the bundle exists on
    // disk (default path = dist/bin-session-start.cjs from cliRoot). In dev
    // builds that bundle is present after `pnpm install`; in test
    // environments without the bundle it may be skipped. Either way the
    // foreign entry survives, which is the load-bearing assertion.
    expect(content.hooks.SessionStart.length).toBeGreaterThanOrEqual(1);
  });

  it("userLevel: false does NOT touch ~/.claude/settings.json", () => {
    const userSettingsPath = path.join(fakeHome, ".claude", "settings.json");

    installHook({
      cwd: tmp.cwd,
      hookEntry: FAKE_HOOK_ENTRY,
      postHookEntry: FAKE_HOOK_ENTRY,
      userPromptEntry: FAKE_HOOK_ENTRY,
      stopEntry: FAKE_HOOK_ENTRY,
      homeDir: fakeHome,
      userLevel: false,
    });

    // No user-level settings.json should be created.
    expect(fs.existsSync(userSettingsPath)).toBe(false);

    // Project-level write happened (sanity check — userLevel:false didn't break the old path).
    const projectPath = path.join(tmp.cwd, ".claude", "settings.local.json");
    expect(fs.existsSync(projectPath)).toBe(true);
    const proj = JSON.parse(fs.readFileSync(projectPath, "utf-8"));
    expect(proj.hooks.PreToolUse[0]._teamagentTag).toBe("teamagent-pre-tool-use");
  });
});

// ─── PR #181 fix-cycle (Worker E) — install-hook hardening ───────────────────
//
// Cases added per PR-PLAN docs/plans/2026-05-09-pr-181-fix-plan.md:
//   1. B-091 staged path under <homeDir>/.teamagent/hooks/
//   2. malformed user-level settings.json → backup + start fresh
//   3. atomic write via tmp+rename (POSIX renameSync)
//   4. B-086 untagged-legacy dedup at the user level
//   5. concurrent-init advisory lock at <homeDir>/.claude/.settings.lock
//   6. userLevel:false leaves ~/.claude/settings.json untouched (regression
//      lock — already covered above; re-run via this block to assert it
//      still passes after the staging refactor).
describe("installHook — PR #181 fix-cycle", () => {
  let tmp: ReturnType<typeof mkTmp>;
  let fakeHome: string;
  /**
   * Plant a *real-named* hook bundle at a stable path so
   * `applyUserLevelChannelOps` stages it as the right basename
   * (e.g. `bin-pre-tool-use.cjs`) under `<homeDir>/.teamagent/hooks/`.
   * `FAKE_HOOK_ENTRY` (the test file path) would stage as
   * `install-hook.test.ts` and fail the basename assertion below.
   */
  function plantBundle(dir: string, name: string): string {
    fs.mkdirSync(dir, { recursive: true });
    const p = path.join(dir, name);
    fs.writeFileSync(p, "// stub bundle\n", "utf-8");
    return p;
  }

  beforeEach(() => {
    tmp = mkTmp();
    fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "fake-home-postpr-"));
  });

  afterEach(() => {
    tmp.cleanup();
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });

  it("(1) B-091: stages hook bundles to <homeDir>/.teamagent/hooks/ and references the staged path in settings.json", () => {
    const stage = path.join(tmp.cwd, "src-stage");
    const hookEntry = plantBundle(stage, "bin-pre-tool-use.cjs");
    const postHookEntry = plantBundle(stage, "bin-post-tool-use.cjs");
    const userPromptEntry = plantBundle(stage, "bin-user-prompt-submit.cjs");
    const stopEntry = plantBundle(stage, "bin-stop.cjs");

    installHook({
      cwd: tmp.cwd,
      hookEntry,
      postHookEntry,
      userPromptEntry,
      stopEntry,
      homeDir: fakeHome,
      userLevel: true,
    });

    const userSettingsPath = path.join(fakeHome, ".claude", "settings.json");
    const content = JSON.parse(fs.readFileSync(userSettingsPath, "utf-8"));

    // PreToolUse command must reference the STAGED path (not the source dist).
    const preCmd: string = content.hooks.PreToolUse[0].hooks[0].command;
    const expectedStaged = path.join(fakeHome, ".teamagent", "hooks", "bin-pre-tool-use.cjs");
    // command is normalized to forward slashes
    expect(preCmd).toContain(expectedStaged.replace(/\\/g, "/"));
    // command must NOT reference the original src-stage path
    expect(preCmd).not.toContain(stage.replace(/\\/g, "/"));
    // The staged file must actually exist.
    expect(fs.existsSync(expectedStaged)).toBe(true);
    expect(fs.statSync(expectedStaged).isFile()).toBe(true);

    // Same for the other 3 channels.
    const postCmd: string = content.hooks.PostToolUse[0].hooks[0].command;
    expect(postCmd).toContain(
      path.join(fakeHome, ".teamagent", "hooks", "bin-post-tool-use.cjs").replace(/\\/g, "/"),
    );
    expect(fs.existsSync(path.join(fakeHome, ".teamagent", "hooks", "bin-post-tool-use.cjs"))).toBe(true);

    const upCmd: string = content.hooks.UserPromptSubmit[0].hooks[0].command;
    expect(upCmd).toContain(
      path.join(fakeHome, ".teamagent", "hooks", "bin-user-prompt-submit.cjs").replace(/\\/g, "/"),
    );
    expect(fs.existsSync(path.join(fakeHome, ".teamagent", "hooks", "bin-user-prompt-submit.cjs"))).toBe(true);

    const stopCmd: string = content.hooks.Stop[0].hooks[0].command;
    expect(stopCmd).toContain(
      path.join(fakeHome, ".teamagent", "hooks", "bin-stop.cjs").replace(/\\/g, "/"),
    );
    expect(fs.existsSync(path.join(fakeHome, ".teamagent", "hooks", "bin-stop.cjs"))).toBe(true);
  });

  it("(2) readSettings recovers from malformed user-level settings.json by backing up + starting fresh", () => {
    // Pre-seed `<home>/.claude/settings.json` with literally-malformed JSON.
    const userSettingsPath = path.join(fakeHome, ".claude", "settings.json");
    fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
    fs.writeFileSync(userSettingsPath, "{not json}", "utf-8");

    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    try {
      // Should not throw — install proceeds even with corrupt settings.
      const r = installHook({
        cwd: tmp.cwd,
        hookEntry: FAKE_HOOK_ENTRY,
        postHookEntry: FAKE_HOOK_ENTRY,
        userPromptEntry: FAKE_HOOK_ENTRY,
        stopEntry: FAKE_HOOK_ENTRY,
        homeDir: fakeHome,
        userLevel: true,
      });
      expect(r.settingsPath).toBeDefined();

      // The new file is valid JSON with TeamAgent entries.
      const after = JSON.parse(fs.readFileSync(userSettingsPath, "utf-8"));
      expect(after.hooks).toBeDefined();
      expect(after.hooks.PreToolUse[0]._teamagentTag).toBe("teamagent-pre-tool-use");

      // The original corrupt file is preserved at `<path>.bak-<ts>`.
      const claudeDir = path.dirname(userSettingsPath);
      const baks = fs
        .readdirSync(claudeDir)
        .filter((f) => f.startsWith("settings.json.bak-"));
      expect(baks.length).toBeGreaterThanOrEqual(1);
      const firstBak = baks[0];
      if (!firstBak) throw new Error("expected at least one .bak file");
      const bakContent = fs.readFileSync(path.join(claudeDir, firstBak), "utf-8");
      expect(bakContent).toBe("{not json}");

      // A stderr warning was emitted at least once mentioning malformed.
      const stderrCalls = stderrSpy.mock.calls.map((c) => String(c[0] ?? ""));
      const hasMalformedWarn = stderrCalls.some((s) =>
        s.includes("malformed") && s.includes("backed up"),
      );
      expect(hasMalformedWarn).toBe(true);
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it("(3) writeSettings is atomic via tmp+rename — fs.renameSync is called with a .tmp- source", () => {
    // We spy on fs.renameSync; the real implementation must still run so the
    // file actually lands on disk. Capture argument shape only.
    const renameSpy = vi.spyOn(fs, "renameSync");

    try {
      installHook({
        cwd: tmp.cwd,
        hookEntry: FAKE_HOOK_ENTRY,
        postHookEntry: FAKE_HOOK_ENTRY,
        userPromptEntry: FAKE_HOOK_ENTRY,
        stopEntry: FAKE_HOOK_ENTRY,
        homeDir: fakeHome,
        userLevel: true,
      });

      // Among all renameSync calls, at least one must be tmp → final settings
      // path with the .tmp-<pid>-<rand> shape (writeSettings's atomic-write
      // contract).
      const calls = renameSpy.mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(1);
      const userSettingsPath = path.join(fakeHome, ".claude", "settings.json");
      const projectSettingsPath = path.join(tmp.cwd, ".claude", "settings.local.json");
      const matched = calls.some(([src, dst]) => {
        const s = String(src);
        const d = String(dst);
        return (
          /\.tmp-\d+-/.test(s) &&
          (d === userSettingsPath || d === projectSettingsPath)
        );
      });
      expect(matched).toBe(true);

      // And the resulting file is valid JSON (no half-written state visible).
      const content = JSON.parse(fs.readFileSync(userSettingsPath, "utf-8"));
      expect(content.hooks).toBeDefined();
    } finally {
      renameSpy.mockRestore();
    }
  });

  it("(4) B-086 dedup: untagged legacy PreToolUse entry is replaced cleanly (1 entry remains)", () => {
    // Pre-seed user settings.json with an UNTAGGED entry whose command
    // contains the bundle filename — exactly the "legacy install" case
    // described in B-086. The new applyChannelOps must filter both
    // tagged AND untagged TeamAgent entries before pushing the new one.
    const userSettingsPath = path.join(fakeHome, ".claude", "settings.json");
    fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
    fs.writeFileSync(
      userSettingsPath,
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: "Bash",
              // Untagged — but command points at the channel bundle filename.
              hooks: [
                {
                  type: "command",
                  command: "node /old/path/to/bin-pre-tool-use.cjs",
                },
              ],
            },
          ],
        },
      }),
      "utf-8",
    );

    installHook({
      cwd: tmp.cwd,
      hookEntry: FAKE_HOOK_ENTRY,
      postHookEntry: FAKE_HOOK_ENTRY,
      userPromptEntry: FAKE_HOOK_ENTRY,
      stopEntry: FAKE_HOOK_ENTRY,
      homeDir: fakeHome,
      userLevel: true,
    });

    const content = JSON.parse(fs.readFileSync(userSettingsPath, "utf-8"));
    // Exactly one PreToolUse entry: the new tagged TeamAgent one.
    expect(content.hooks.PreToolUse).toHaveLength(1);
    expect(content.hooks.PreToolUse[0]._teamagentTag).toBe("teamagent-pre-tool-use");
    // The legacy command path is gone.
    const cmd: string = content.hooks.PreToolUse[0].hooks[0].command;
    expect(cmd).not.toContain("/old/path/to/bin-pre-tool-use.cjs");
  });

  it("(5) concurrent-init advisory lock — lockfile is created during the call and removed after", () => {
    const lockPath = path.join(fakeHome, ".claude", ".settings.lock");

    // Lock must not exist before.
    expect(fs.existsSync(lockPath)).toBe(false);

    // Spy on fs.openSync so we can observe the moment the lock is acquired
    // (its 'wx' open is synchronous and the lock is held until the merge
    // completes). The real openSync still runs so the actual lock is taken.
    const openSpy = vi.spyOn(fs, "openSync");

    try {
      installHook({
        cwd: tmp.cwd,
        hookEntry: FAKE_HOOK_ENTRY,
        postHookEntry: FAKE_HOOK_ENTRY,
        userPromptEntry: FAKE_HOOK_ENTRY,
        stopEntry: FAKE_HOOK_ENTRY,
        homeDir: fakeHome,
        userLevel: true,
      });

      // openSync was called with the lockfile path and "wx" flag at least once.
      const opened = openSpy.mock.calls.some(([p, flags]) => {
        return String(p) === lockPath && String(flags) === "wx";
      });
      expect(opened).toBe(true);

      // After a successful acquire (fd != null), the lock is released and
      // the lockfile is unlinked. Round-2 F1 only changed the *fd === null*
      // (degraded) branch so it no longer unlinks; the happy path is
      // unchanged.
      expect(fs.existsSync(lockPath)).toBe(false);

      // The settings file was still written successfully.
      const userSettingsPath = path.join(fakeHome, ".claude", "settings.json");
      const content = JSON.parse(fs.readFileSync(userSettingsPath, "utf-8"));
      expect(content.hooks.PreToolUse[0]._teamagentTag).toBe("teamagent-pre-tool-use");
    } finally {
      openSpy.mockRestore();
    }
  });

  // ─── PR #181 round-2 (Worker FC) — true mutual-exclusion behaviour ────────
  //
  // Round-2 finding #10 noted that case (5) above only verifies the lockfile
  // is created and removed — it does NOT exercise contention. The two cases
  // below test the actual mutual-exclusion contract:
  //
  //   (5a) stale-lock recovery — a lockfile with mtime > 30s is detected as
  //        stale, unlinked, and the install proceeds normally. Exercises the
  //        retry-with-stale-detect branch in `acquireSettingsLock`.
  //   (5b) lock held by another process — when we cannot acquire the lock
  //        within MAX_RETRIES (5 retries × 200ms = 1s), `acquireSettingsLock`
  //        degrades to fd=null and proceeds. The Round-2 F1 fix says we MUST
  //        NOT unlink the lockfile we don't own. This is the regression
  //        coverage for that fix — without F1, the second concurrent install
  //        would silently nuke the first one's lock and break mutual
  //        exclusion entirely.
  it("(5a) stale-lock recovery — stale (>30s) lockfile is detected, unlinked, and install proceeds", () => {
    const lockPath = path.join(fakeHome, ".claude", ".settings.lock");

    // Pre-create a STALE lockfile (mtime in the past, > 30s ago). The
    // stale-detect path in `acquireSettingsLock` will unlink it and retry.
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(lockPath, "", "utf-8");
    const stalePast = new Date(Date.now() - 60_000); // 60s ago > STALE_MS=30s
    fs.utimesSync(lockPath, stalePast, stalePast);

    // Sanity: the lockfile is in place and stale before we run.
    expect(fs.existsSync(lockPath)).toBe(true);
    expect(Date.now() - fs.statSync(lockPath).mtimeMs).toBeGreaterThan(30_000);

    installHook({
      cwd: tmp.cwd,
      hookEntry: FAKE_HOOK_ENTRY,
      postHookEntry: FAKE_HOOK_ENTRY,
      userPromptEntry: FAKE_HOOK_ENTRY,
      stopEntry: FAKE_HOOK_ENTRY,
      homeDir: fakeHome,
      userLevel: true,
    });

    // After install: lockfile is gone (we acquired + released it), settings
    // were written, all without throwing on the pre-existing stale lock.
    expect(fs.existsSync(lockPath)).toBe(false);
    const userSettingsPath = path.join(fakeHome, ".claude", "settings.json");
    const content = JSON.parse(fs.readFileSync(userSettingsPath, "utf-8"));
    expect(content.hooks.PreToolUse[0]._teamagentTag).toBe("teamagent-pre-tool-use");
  });

  it("(5b) Round-2 F1 regression: when lock is held by another process (fd=null), releaseSettingsLock does NOT unlink", () => {
    // This is the failure mode the round-2 /review caught: in the previous
    // implementation, `releaseSettingsLock` unconditionally unlinked the
    // lockfile — even when our own `fs.openSync(lockPath, "wx")` had failed
    // and the file was still held by another process. That defeated mutual
    // exclusion: the second install would silently nuke the first install's
    // lock partway through its read-modify-write window.
    //
    // We simulate "lock held by another process" by pre-creating the
    // lockfile with a *fresh* mtime so it never trips stale-detect, and we
    // hold the file descriptor open for the duration of installHook. The
    // contention path in `acquireSettingsLock` exhausts MAX_RETRIES and
    // returns fd=null. After Round-2 F1, releaseSettingsLock(null, ...) is
    // a no-op — the held lockfile must still exist when installHook returns.
    const lockPath = path.join(fakeHome, ".claude", ".settings.lock");
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    const otherFd = fs.openSync(lockPath, "wx");

    // Capture stderr so the degraded-path warning doesn't pollute test
    // output, AND so we can assert it was actually emitted.
    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    try {
      installHook({
        cwd: tmp.cwd,
        hookEntry: FAKE_HOOK_ENTRY,
        postHookEntry: FAKE_HOOK_ENTRY,
        userPromptEntry: FAKE_HOOK_ENTRY,
        stopEntry: FAKE_HOOK_ENTRY,
        homeDir: fakeHome,
        userLevel: true,
      });

      // The CRITICAL Round-2 F1 invariant: the lockfile that we did NOT
      // acquire must still exist. The pre-fix code would have unlinked it.
      expect(fs.existsSync(lockPath)).toBe(true);

      // The degraded-path warning was emitted.
      const stderrCalls = stderrSpy.mock.calls.map((c) => String(c[0] ?? ""));
      const hasDegradedWarning = stderrCalls.some((s) =>
        s.includes("settings lock") && s.includes("contention"),
      );
      expect(hasDegradedWarning).toBe(true);

      // The settings file was still written (degraded path proceeds without
      // the lock — race-prone but better than blocking init forever).
      const userSettingsPath = path.join(fakeHome, ".claude", "settings.json");
      const content = JSON.parse(fs.readFileSync(userSettingsPath, "utf-8"));
      expect(content.hooks.PreToolUse[0]._teamagentTag).toBe("teamagent-pre-tool-use");
    } finally {
      stderrSpy.mockRestore();
      // Clean up: release the held lockfile we created above.
      try { fs.closeSync(otherFd); } catch { /* best-effort */ }
      try { fs.unlinkSync(lockPath); } catch { /* best-effort */ }
    }
  }, 30_000);

  it("(5c) Round-2 F3 regression: stageBundleToUserTeamagent uses tmp+rename (atomic copy)", () => {
    // Round-2 finding: under Windows, an unconditional `copyFileSync` over
    // an in-use bundle throws EBUSY and crashes init. Under POSIX, an
    // in-flight hook process can otherwise see a half-written bundle. The
    // F3 fix replaces the bare copy with `copyFileSync → renameSync` via a
    // pid+rand .tmp- intermediate. This test pins that contract by spying
    // on `fs.renameSync` and confirming each staged channel goes through
    // a `.tmp-<pid>-<rand>` source.
    //
    // We have to plant *real* hook bundles in a stable directory — using
    // FAKE_HOOK_ENTRY (this test file's own path) doesn't trigger the
    // stage-skip heuristic in stageBundleToUserTeamagent (size+mtime guard)
    // when the destination doesn't yet exist, but its filename
    // `install-hook.test.ts` is not a recognized channel basename and would
    // confuse the staged-path assertions. Plant proper bundle-named files.
    const stage = fs.mkdtempSync(path.join(os.tmpdir(), "stage-bundle-"));
    try {
      const hookEntry = path.join(stage, "bin-pre-tool-use.cjs");
      const postHookEntry = path.join(stage, "bin-post-tool-use.cjs");
      const userPromptEntry = path.join(stage, "bin-user-prompt-submit.cjs");
      const stopEntry = path.join(stage, "bin-stop.cjs");
      for (const p of [hookEntry, postHookEntry, userPromptEntry, stopEntry]) {
        fs.writeFileSync(p, "// stub bundle\n", "utf-8");
      }

      const renameSpy = vi.spyOn(fs, "renameSync");
      try {
        installHook({
          cwd: tmp.cwd,
          hookEntry,
          postHookEntry,
          userPromptEntry,
          stopEntry,
          homeDir: fakeHome,
          userLevel: true,
        });

        const calls = renameSpy.mock.calls;
        // Among all renames during install (writeSettings tmp+rename for
        // each of project + user settings.json AND stageBundleToUserTeamagent
        // tmp+rename for each of 4 channels), at least 4 must be
        // bundle-staging renames whose source matches the .tmp-<pid>-<rand>
        // shape and whose destination is under <home>/.teamagent/hooks/.
        const teamagentHooksDir = path.join(fakeHome, ".teamagent", "hooks");
        const stagingRenames = calls.filter(([src, dst]) => {
          const s = String(src);
          const d = String(dst);
          return (
            d.startsWith(teamagentHooksDir) &&
            /\.tmp-\d+-[a-z0-9]+$/.test(s)
          );
        });
        expect(stagingRenames.length).toBeGreaterThanOrEqual(4);

        // Each .tmp- source name follows pid-rand contract (no static name).
        const stagingSources = stagingRenames.map(([s]) => String(s));
        for (const src of stagingSources) {
          expect(src).toMatch(/\.tmp-\d+-[a-z0-9]+$/);
        }

        // The four channel destinations all materialize as real files.
        for (const basename of [
          "bin-pre-tool-use.cjs",
          "bin-post-tool-use.cjs",
          "bin-user-prompt-submit.cjs",
          "bin-stop.cjs",
        ]) {
          const dest = path.join(teamagentHooksDir, basename);
          expect(fs.existsSync(dest)).toBe(true);
          // No leaked .tmp- intermediates next to the final files.
          const peers = fs.readdirSync(teamagentHooksDir);
          const leaks = peers.filter((p) => p.startsWith(`${basename}.tmp-`));
          expect(leaks).toEqual([]);
        }
      } finally {
        renameSpy.mockRestore();
      }
    } finally {
      fs.rmSync(stage, { recursive: true, force: true });
    }
  });

  it("(7) issue #209: user-level hook commands wrap staged path in graceful `bash -c '[ -f X ] || exit 0; exec node X'` shim", () => {
    // Regression lock: the user-level entries written into
    // ~/.claude/settings.json must be wrapped so a missing
    // ~/.teamagent/hooks/<bin>.cjs (manual rm -rf, partial install, disk-full
    // mid-stage) does NOT spam Node MODULE_NOT_FOUND traces in every Stop /
    // PreToolUse / PostToolUse / UserPromptSubmit.
    const stage = path.join(tmp.cwd, "src-stage");
    const hookEntry = plantBundle(stage, "bin-pre-tool-use.cjs");
    const postHookEntry = plantBundle(stage, "bin-post-tool-use.cjs");
    const userPromptEntry = plantBundle(stage, "bin-user-prompt-submit.cjs");
    const stopEntry = plantBundle(stage, "bin-stop.cjs");

    installHook({
      cwd: tmp.cwd,
      hookEntry,
      postHookEntry,
      userPromptEntry,
      stopEntry,
      homeDir: fakeHome,
      userLevel: true,
    });

    const userSettingsPath = path.join(fakeHome, ".claude", "settings.json");
    const content = JSON.parse(fs.readFileSync(userSettingsPath, "utf-8"));

    for (const channel of ["PreToolUse", "PostToolUse", "UserPromptSubmit", "Stop"] as const) {
      const cmd: string = content.hooks[channel][0].hooks[0].command;
      expect(cmd.startsWith("bash -c '")).toBe(true);
      expect(cmd).toContain("[ -f ");
      expect(cmd).toContain("|| exit 0");
      expect(cmd).toContain("exec node ");
      // Stale plain-`node <path>` form must NOT survive — the absence of any
      // graceful guard is exactly what issue #209 is about.
      expect(cmd.match(/^node /)).toBeNull();
    }
  });

  it("(6) userLevel: false leaves ~/.claude/settings.json untouched (regression lock for staging refactor)", () => {
    // Sanity re-check after PR #181 staging refactor — the userLevel:false
    // path must NOT touch the user-level settings file at all.
    const userSettingsPath = path.join(fakeHome, ".claude", "settings.json");

    installHook({
      cwd: tmp.cwd,
      hookEntry: FAKE_HOOK_ENTRY,
      postHookEntry: FAKE_HOOK_ENTRY,
      userPromptEntry: FAKE_HOOK_ENTRY,
      stopEntry: FAKE_HOOK_ENTRY,
      homeDir: fakeHome,
      userLevel: false,
    });

    expect(fs.existsSync(userSettingsPath)).toBe(false);
    // Lock should never have been created either.
    expect(fs.existsSync(path.join(fakeHome, ".claude", ".settings.lock"))).toBe(false);
    // Project-level path still works.
    const projectPath = path.join(tmp.cwd, ".claude", "settings.local.json");
    const proj = JSON.parse(fs.readFileSync(projectPath, "utf-8"));
    expect(proj.hooks.PreToolUse[0]._teamagentTag).toBe("teamagent-pre-tool-use");
  });
});

// B+C scope (2026-05-09): four new channels folded into installHook —
// SessionStart / SessionEnd / PreCompact / DigitalTwinTap. SessionEnd and
// PreCompact write to BOTH project and user-level settings (mirroring the
// existing four). SessionStart and DigitalTwinTap write to user-level ONLY,
// for reasons documented inline in install-hook.ts.
describe("installHook — B+C scope new channels (2026-05-09)", () => {
  let tmp: ReturnType<typeof mkTmp>;
  let fakeHome: string;

  beforeEach(() => {
    tmp = mkTmp();
    fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "teamagent-bc-home-"));
  });

  afterEach(() => {
    tmp.cleanup();
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });

  it("registers SessionEnd + PreCompact at project level (settings.local.json)", () => {
    installHook({
      cwd: tmp.cwd,
      hookEntry: FAKE_HOOK_ENTRY,
      postHookEntry: FAKE_HOOK_ENTRY,
      userPromptEntry: FAKE_HOOK_ENTRY,
      stopEntry: FAKE_HOOK_ENTRY,
      sessionEndEntry: FAKE_HOOK_ENTRY,
      preCompactEntry: FAKE_HOOK_ENTRY,
      homeDir: fakeHome,
      userLevel: false,
    });

    const projectPath = path.join(tmp.cwd, ".claude", "settings.local.json");
    const proj = JSON.parse(fs.readFileSync(projectPath, "utf-8"));
    expect(proj.hooks.SessionEnd?.[0]?._teamagentTag).toBe("teamagent-session-end");
    expect(proj.hooks.SessionEnd[0].hooks[0].timeout).toBe(30);
    expect(proj.hooks.PreCompact?.[0]?._teamagentTag).toBe("teamagent-pre-compact");
    expect(proj.hooks.PreCompact[0].hooks[0].timeout).toBe(30);
  });

  it("does NOT register SessionStart or DigitalTwinTap at project level", () => {
    installHook({
      cwd: tmp.cwd,
      hookEntry: FAKE_HOOK_ENTRY,
      postHookEntry: FAKE_HOOK_ENTRY,
      userPromptEntry: FAKE_HOOK_ENTRY,
      stopEntry: FAKE_HOOK_ENTRY,
      sessionStartEntry: FAKE_HOOK_ENTRY,
      digitalTwinEntry: FAKE_HOOK_ENTRY,
      homeDir: fakeHome,
      userLevel: false,
    });

    const projectPath = path.join(tmp.cwd, ".claude", "settings.local.json");
    const proj = JSON.parse(fs.readFileSync(projectPath, "utf-8"));
    expect(proj.hooks.SessionStart).toBeUndefined();
    // Stop has bin-stop only at project level; the digital-twin tag belongs to
    // the user-level mirror. Verify only one Stop entry with the bin-stop tag.
    expect(proj.hooks.Stop).toHaveLength(1);
    expect(proj.hooks.Stop[0]._teamagentTag).toBe("teamagent-stop");
  });

  it("registers all 8 channel tags at user level (~/.claude/settings.json)", () => {
    installHook({
      cwd: tmp.cwd,
      hookEntry: FAKE_HOOK_ENTRY,
      postHookEntry: FAKE_HOOK_ENTRY,
      userPromptEntry: FAKE_HOOK_ENTRY,
      stopEntry: FAKE_HOOK_ENTRY,
      sessionStartEntry: FAKE_HOOK_ENTRY,
      sessionEndEntry: FAKE_HOOK_ENTRY,
      preCompactEntry: FAKE_HOOK_ENTRY,
      digitalTwinEntry: FAKE_HOOK_ENTRY,
      homeDir: fakeHome,
      userLevel: true,
    });

    const userSettings = JSON.parse(
      fs.readFileSync(path.join(fakeHome, ".claude", "settings.json"), "utf-8"),
    );
    const allTags = new Set<string>();
    for (const ch of Object.keys(userSettings.hooks ?? {})) {
      const list = userSettings.hooks[ch] as Array<{ _teamagentTag?: string }>;
      for (const entry of list) {
        if (entry._teamagentTag) allTags.add(entry._teamagentTag);
      }
    }
    expect(allTags).toEqual(
      new Set([
        "teamagent-pre-tool-use",
        "teamagent-post-tool-use",
        "teamagent-user-prompt-submit",
        "teamagent-stop",
        "teamagent-session-start",
        "teamagent-session-end",
        "teamagent-pre-compact",
        "teamagent-digital-twin-tap",
      ]),
    );
    // Stop should host BOTH the bin-stop tag and the digital-twin-tap tag.
    expect(userSettings.hooks.Stop).toHaveLength(2);
  });

  it("uninstallHook cleans SessionEnd / PreCompact / DigitalTwinTap tags", () => {
    installHook({
      cwd: tmp.cwd,
      hookEntry: FAKE_HOOK_ENTRY,
      postHookEntry: FAKE_HOOK_ENTRY,
      userPromptEntry: FAKE_HOOK_ENTRY,
      stopEntry: FAKE_HOOK_ENTRY,
      sessionEndEntry: FAKE_HOOK_ENTRY,
      preCompactEntry: FAKE_HOOK_ENTRY,
      digitalTwinEntry: FAKE_HOOK_ENTRY,
      homeDir: fakeHome,
      userLevel: false,
    });

    // Sanity: project-level entries exist before uninstall.
    const projectPath = path.join(tmp.cwd, ".claude", "settings.local.json");
    const before = JSON.parse(fs.readFileSync(projectPath, "utf-8"));
    expect(before.hooks.SessionEnd).toBeDefined();
    expect(before.hooks.PreCompact).toBeDefined();

    const r = uninstallHook({ cwd: tmp.cwd });
    expect(r.removed).toBe(true);

    const after = JSON.parse(fs.readFileSync(projectPath, "utf-8"));
    expect(after.hooks?.SessionEnd).toBeUndefined();
    expect(after.hooks?.PreCompact).toBeUndefined();
    expect(after.hooks?.Stop).toBeUndefined(); // only TeamAgent tags existed
  });
});

describe("auditOrphanShellHooks (B+C scope, 2026-05-09)", () => {
  let tmp: ReturnType<typeof mkTmp>;

  beforeEach(() => {
    tmp = mkTmp();
  });

  afterEach(() => {
    tmp.cleanup();
  });

  it("returns empty list when .claude/hooks is missing", async () => {
    const { auditOrphanShellHooks } = await import("../commands/install-hook.js");
    expect(auditOrphanShellHooks(tmp.cwd)).toEqual([]);
  });

  it("returns empty list when no .sh files exist", async () => {
    fs.mkdirSync(path.join(tmp.cwd, ".claude", "hooks"), { recursive: true });
    const { auditOrphanShellHooks } = await import("../commands/install-hook.js");
    expect(auditOrphanShellHooks(tmp.cwd)).toEqual([]);
  });

  it("flags an orphan .sh that no settings file references", async () => {
    const hooksDir = path.join(tmp.cwd, ".claude", "hooks");
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(path.join(hooksDir, "orphan.sh"), "#!/bin/bash\n");

    const { auditOrphanShellHooks } = await import("../commands/install-hook.js");
    expect(auditOrphanShellHooks(tmp.cwd)).toEqual(["orphan.sh"]);
  });

  it("does NOT flag a .sh that committed settings.json references", async () => {
    const claudeDir = path.join(tmp.cwd, ".claude");
    const hooksDir = path.join(claudeDir, "hooks");
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(path.join(hooksDir, "wired.sh"), "#!/bin/bash\n");
    fs.writeFileSync(
      path.join(claudeDir, "settings.json"),
      JSON.stringify({
        hooks: {
          Stop: [
            {
              hooks: [
                { type: "command", command: "bash .claude/hooks/wired.sh", timeout: 5 },
              ],
            },
          ],
        },
      }),
    );

    const { auditOrphanShellHooks } = await import("../commands/install-hook.js");
    expect(auditOrphanShellHooks(tmp.cwd)).toEqual([]);
  });

  it("does NOT flag a .sh that settings.local.json references", async () => {
    const claudeDir = path.join(tmp.cwd, ".claude");
    const hooksDir = path.join(claudeDir, "hooks");
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(path.join(hooksDir, "host-local.sh"), "#!/bin/bash\n");
    fs.writeFileSync(
      path.join(claudeDir, "settings.local.json"),
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              hooks: [
                { type: "command", command: "bash .claude/hooks/host-local.sh" },
              ],
            },
          ],
        },
      }),
    );

    const { auditOrphanShellHooks } = await import("../commands/install-hook.js");
    expect(auditOrphanShellHooks(tmp.cwd)).toEqual([]);
  });

  it("returns sorted list when multiple orphans", async () => {
    const hooksDir = path.join(tmp.cwd, ".claude", "hooks");
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(path.join(hooksDir, "z-orphan.sh"), "#!/bin/bash\n");
    fs.writeFileSync(path.join(hooksDir, "a-orphan.sh"), "#!/bin/bash\n");
    fs.writeFileSync(path.join(hooksDir, "m-orphan.sh"), "#!/bin/bash\n");

    const { auditOrphanShellHooks } = await import("../commands/install-hook.js");
    expect(auditOrphanShellHooks(tmp.cwd)).toEqual([
      "a-orphan.sh",
      "m-orphan.sh",
      "z-orphan.sh",
    ]);
  });

  it("survives malformed settings.json (treats as zero references, all .sh are orphans)", async () => {
    const claudeDir = path.join(tmp.cwd, ".claude");
    const hooksDir = path.join(claudeDir, "hooks");
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(path.join(hooksDir, "lonely.sh"), "#!/bin/bash\n");
    fs.writeFileSync(path.join(claudeDir, "settings.json"), "{ malformed json");

    const { auditOrphanShellHooks } = await import("../commands/install-hook.js");
    // Malformed file is treated as "no references" → the .sh shows as orphan.
    expect(auditOrphanShellHooks(tmp.cwd)).toEqual(["lonely.sh"]);
  });
});

// Issue #146 install-hook TODO — bin-uploader.cjs staging via install-hook.
describe("daemon binary staging (issue #146 install-hook TODO)", () => {
  let tmp: ReturnType<typeof mkTmp>;
  let fakeHome: string;
  // The staged daemon source can be any file; we use a fake .cjs sentinel
  // so existsSync passes and copyFileSync round-trips bytes we can verify.
  let fakeDaemonSrc: string;

  beforeEach(() => {
    tmp = mkTmp();
    fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "iht-home-"));
    fakeDaemonSrc = path.join(fakeHome, "fake-bin-uploader.cjs");
    fs.writeFileSync(fakeDaemonSrc, "// fake bin-uploader.cjs v1\n");
  });

  afterEach(() => {
    tmp.cleanup();
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });

  it("stageDaemonBinaryToUser copies bin-uploader.cjs to <home>/.teamagent/digital-twin/", () => {
    const result = stageDaemonBinaryToUser(fakeDaemonSrc, fakeHome);
    expect(result.staged).toBe(true);
    expect(result.destPath).toBe(
      path.join(fakeHome, ".teamagent", "digital-twin", "bin-uploader.cjs"),
    );
    expect(fs.existsSync(result.destPath)).toBe(true);
    expect(fs.readFileSync(result.destPath, "utf-8")).toBe(
      "// fake bin-uploader.cjs v1\n",
    );
  });

  it("stageDaemonBinaryToUser returns staged=false when source missing (best-effort)", () => {
    const result = stageDaemonBinaryToUser(
      path.join(fakeHome, "nonexistent.cjs"),
      fakeHome,
    );
    expect(result.staged).toBe(false);
    expect(result.reason).toContain("source missing");
    // Dest path is reported even on failure so callers can log it.
    expect(result.destPath).toBe(
      path.join(fakeHome, ".teamagent", "digital-twin", "bin-uploader.cjs"),
    );
    // No file created on failure.
    expect(fs.existsSync(result.destPath)).toBe(false);
  });

  it("stageDaemonBinaryToUser is idempotent (skip-if-newer)", () => {
    const r1 = stageDaemonBinaryToUser(fakeDaemonSrc, fakeHome);
    expect(r1.staged).toBe(true);
    const mtime1 = fs.statSync(r1.destPath).mtimeMs;
    // Second call: skip-if-newer should NOT touch the file.
    const r2 = stageDaemonBinaryToUser(fakeDaemonSrc, fakeHome);
    expect(r2.staged).toBe(true);
    expect(r2.reason).toMatch(/up-to-date/);
    const mtime2 = fs.statSync(r2.destPath).mtimeMs;
    expect(mtime2).toBe(mtime1);
  });

  it("stageDaemonBinaryToUser overwrites stale destination (newer source wins)", () => {
    // First install: write v1 to dest.
    stageDaemonBinaryToUser(fakeDaemonSrc, fakeHome);
    const dest = path.join(fakeHome, ".teamagent", "digital-twin", "bin-uploader.cjs");

    // Force the dest to look stale: replace its bytes + bump mtime backwards.
    const past = new Date(Date.now() - 60_000);
    fs.utimesSync(dest, past, past);

    // Bump the source mtime forward + change content to v2.
    fs.writeFileSync(fakeDaemonSrc, "// fake bin-uploader.cjs v2\n");
    const future = new Date(Date.now() + 5_000);
    fs.utimesSync(fakeDaemonSrc, future, future);

    const r = stageDaemonBinaryToUser(fakeDaemonSrc, fakeHome);
    expect(r.staged).toBe(true);
    expect(r.reason).toBeUndefined(); // not the up-to-date path
    expect(fs.readFileSync(dest, "utf-8")).toBe("// fake bin-uploader.cjs v2\n");
  });

  it("installHook stages daemon binary into <home>/.teamagent/digital-twin/ (full integration)", () => {
    const r = installHook({
      cwd: tmp.cwd,
      hookEntry: FAKE_HOOK_ENTRY,
      homeDir: fakeHome,
      daemonBinaryEntry: fakeDaemonSrc,
      // userLevel:true is the default; daemon staging happens unconditionally.
    });
    expect(r.daemonBinary.staged).toBe(true);
    expect(r.daemonBinary.destPath).toBe(
      path.join(fakeHome, ".teamagent", "digital-twin", "bin-uploader.cjs"),
    );
    expect(fs.existsSync(r.daemonBinary.destPath)).toBe(true);
    expect(fs.readFileSync(r.daemonBinary.destPath, "utf-8")).toBe(
      "// fake bin-uploader.cjs v1\n",
    );
  });

  it("installHook reports staged=false when daemonBinaryEntry source missing (no throw)", () => {
    const r = installHook({
      cwd: tmp.cwd,
      hookEntry: FAKE_HOOK_ENTRY,
      homeDir: fakeHome,
      daemonBinaryEntry: path.join(fakeHome, "missing-bin-uploader.cjs"),
    });
    // installHook itself succeeds — daemon staging is best-effort.
    expect(r.daemonBinary.staged).toBe(false);
    expect(r.daemonBinary.reason).toContain("source missing");
    expect(fs.existsSync(r.daemonBinary.destPath)).toBe(false);
  });
});

describe("install-user-hook deprecation (B+C scope, 2026-05-09)", () => {
  it("installUserHook emits a deprecation warning to stderr", async () => {
    const { installUserHook } = await import("../commands/install-user-hook.js");
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "teamagent-iuh-home-"));
    try {
      const captured: string[] = [];
      const origWrite = process.stderr.write.bind(process.stderr);
      const writeSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: any) => {
        captured.push(typeof chunk === "string" ? chunk : String(chunk));
        return true;
      });
      try {
        installUserHook({
          homeDir: fakeHome,
          sessionStartEntry: FAKE_HOOK_ENTRY,
        });
      } finally {
        writeSpy.mockRestore();
        // safety: never let mocked stderr leak across tests
        void origWrite;
      }

      const joined = captured.join("");
      expect(joined.toLowerCase()).toContain("deprecat");
    } finally {
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });
});

describe("applyChannelOps soft-warn on missing bundle (issue #299)", () => {
  // The bug: when an install-table entry references a bundle whose file is
  // absent (e.g. dist/bin-digital-twin-tap.cjs missing from a release tarball),
  // applyChannelOps used to `continue;` silently — install reports success,
  // settings.json never gets the entry, no stderr line.
  // The fix: print one stderr line `teamagent: skipping channel <ch> — bundle
  // <file> not found` then continue. Other channels still install.

  let tmp: ReturnType<typeof mkTmp>;

  beforeEach(() => {
    tmp = mkTmp();
  });

  afterEach(() => {
    tmp.cleanup();
  });

  it("writes a stderr line naming the channel + bundle filename when a user-level Stop bundle is missing", () => {
    // Real PreToolUse bundle exists (this test file's own path), but the
    // digital-twin Stop entry is intentionally pointed at a non-existent path
    // → applyChannelOps must warn AND continue.
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "install-hook-warn-"));
    const captured: string[] = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    (process.stderr as any).write = ((chunk: any, ...rest: any[]) => {
      captured.push(typeof chunk === "string" ? chunk : chunk?.toString?.() ?? "");
      return origWrite(chunk, ...rest);
    }) as typeof process.stderr.write;

    try {
      installHook({
        cwd: tmp.cwd,
        hookEntry: FAKE_HOOK_ENTRY,
        userLevel: true,
        homeDir: fakeHome,
        // Point the digital-twin entry at a missing path; everything else
        // defaults so the rest of the channels still resolve via cliRoot().
        digitalTwinEntry: path.join(fakeHome, "does", "not", "exist", "bin-digital-twin-tap.cjs"),
      });
    } finally {
      (process.stderr as any).write = origWrite;
    }

    const joined = captured.join("");
    expect(joined).toContain("teamagent: skipping channel Stop");
    expect(joined).toContain("bin-digital-twin-tap.cjs");
    expect(joined).toContain("not found");

    fs.rmSync(fakeHome, { recursive: true, force: true });
  });

  it("install still succeeds with other channels intact when one bundle is missing", () => {
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "install-hook-partial-"));
    try {
      const r = installHook({
        cwd: tmp.cwd,
        hookEntry: FAKE_HOOK_ENTRY,
        userLevel: true,
        homeDir: fakeHome,
        digitalTwinEntry: path.join(fakeHome, "does", "not", "exist", "bin-digital-twin-tap.cjs"),
      });

      // Project-level settings.local.json was written → install succeeded.
      expect(fs.existsSync(r.settingsPath)).toBe(true);
      const userSettingsPath = path.join(fakeHome, ".claude", "settings.json");
      expect(fs.existsSync(userSettingsPath)).toBe(true);

      // The non-digital-twin user-level Stop entry (bin-stop.cjs) — if its
      // bundle exists in cliRoot/dist — should still be present.
      const user = JSON.parse(fs.readFileSync(userSettingsPath, "utf-8"));
      const stopList = user.hooks?.Stop ?? [];
      const hasDigitalTwin = (stopList as any[]).some(
        (e) => e._teamagentTag === "teamagent-digital-twin-tap",
      );
      // Missing-bundle entry must NOT be in settings.
      expect(hasDigitalTwin).toBe(false);
    } finally {
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });
});
