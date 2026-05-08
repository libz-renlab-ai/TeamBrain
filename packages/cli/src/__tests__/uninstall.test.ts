import { describe, it, expect, beforeEach, afterEach } from "vitest";
import nodeFs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  disable,
  enable,
  uninstall,
  stripTeamagentBlock,
  parseUninstallArgs,
  renderUninstallResult,
} from "../commands/uninstall.js";

function mkTmp() {
  const root = nodeFs.mkdtempSync(path.join(os.tmpdir(), "uninstall-"));
  const cwd = path.join(root, "proj");
  const home = path.join(root, "home");
  nodeFs.mkdirSync(cwd, { recursive: true });
  nodeFs.mkdirSync(home, { recursive: true });
  return {
    cwd,
    home,
    cleanup: () => nodeFs.rmSync(root, { recursive: true, force: true }),
  };
}

describe("stripTeamagentBlock", () => {
  it("leaves content unchanged when block absent", () => {
    const md = "# hi\n\nsome prose\n";
    const r = stripTeamagentBlock(md);
    expect(r.changed).toBe(false);
    expect(r.content).toBe(md);
  });

  it("removes block, preserves surrounding content", () => {
    const md = `# Project

Manual rules here.

<!-- TEAMAGENT:START - auto -->
## TeamAgent 经验
- rule 1
- rule 2
<!-- TEAMAGENT:END -->

## Ops section stays.`;
    const r = stripTeamagentBlock(md);
    expect(r.changed).toBe(true);
    expect(r.content).toContain("# Project");
    expect(r.content).toContain("Manual rules here.");
    expect(r.content).toContain("Ops section stays.");
    expect(r.content).not.toContain("TEAMAGENT:START");
    expect(r.content).not.toContain("TEAMAGENT:END");
    expect(r.content).not.toContain("rule 1");
  });

  it("handles block at end of file", () => {
    const md = `# Project
Prose.

<!-- TEAMAGENT:START - auto -->
- auto rule
<!-- TEAMAGENT:END -->`;
    const r = stripTeamagentBlock(md);
    expect(r.changed).toBe(true);
    expect(r.content).toContain("Prose.");
    expect(r.content).not.toContain("TEAMAGENT");
  });

  it("malformed block (start without end) → no change", () => {
    const md = `prose

<!-- TEAMAGENT:START - auto -->
- rule`;
    const r = stripTeamagentBlock(md);
    expect(r.changed).toBe(false);
  });
});

describe("disable / enable", () => {
  let tmp: ReturnType<typeof mkTmp>;
  beforeEach(() => {
    tmp = mkTmp();
  });
  afterEach(() => tmp.cleanup());

  it("disable when no hook installed → reports not removed", () => {
    const r = disable({ cwd: tmp.cwd });
    expect(r.removed).toBe(false);
  });

  it("enable refuses when explicit bundle path does not exist", () => {
    expect(() =>
      enable({ cwd: tmp.cwd, hookEntry: "/nonexistent/bundle.cjs" }),
    ).toThrow(/Hook bundle not found/);
  });

  it("disable → enable round-trip with stub bundle", () => {
    // Create a stub bundle so enable() doesn't refuse
    const bundle = path.join(tmp.cwd, "stub-bundle.cjs");
    nodeFs.writeFileSync(bundle, "// stub");
    const r1 = enable({ cwd: tmp.cwd, hookEntry: bundle });
    expect(r1.alreadyInstalled).toBe(false);
    const settingsPath = path.join(tmp.cwd, ".claude", "settings.local.json");
    expect(nodeFs.existsSync(settingsPath)).toBe(true);

    const d = disable({ cwd: tmp.cwd });
    expect(d.removed).toBe(true);

    const r2 = enable({ cwd: tmp.cwd, hookEntry: bundle });
    expect(r2.alreadyInstalled).toBe(false); // fresh re-enable
  });
});

describe("uninstall", () => {
  let tmp: ReturnType<typeof mkTmp>;
  beforeEach(() => {
    tmp = mkTmp();
  });
  afterEach(() => tmp.cleanup());

  it("dry-run on a fully-installed project: reports actions, writes nothing", () => {
    // Simulate a prior install
    nodeFs.mkdirSync(path.join(tmp.cwd, ".claude"), { recursive: true });
    nodeFs.writeFileSync(
      path.join(tmp.cwd, ".claude", "settings.local.json"),
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: "Bash",
              _teamagentTag: "teamagent-pre-tool-use",
              hooks: [{ type: "command", command: "node x" }],
            },
          ],
        },
      }),
    );
    nodeFs.writeFileSync(
      path.join(tmp.cwd, "CLAUDE.md"),
      "# Manual\n<!-- TEAMAGENT:START - auto -->\n- r\n<!-- TEAMAGENT:END -->\n",
    );

    const r = uninstall({ cwd: tmp.cwd, homeDir: tmp.home, dryRun: true });
    expect(r.dryRun).toBe(true);
    expect(r.actions.join("\n")).toContain("dry-run");

    // Files untouched
    const md = nodeFs.readFileSync(path.join(tmp.cwd, "CLAUDE.md"), "utf-8");
    expect(md).toContain("TEAMAGENT:START");
    const settings = nodeFs.readFileSync(
      path.join(tmp.cwd, ".claude", "settings.local.json"),
      "utf-8",
    );
    expect(settings).toContain("teamagent-pre-tool-use");
  });

  it("removes hook + CLAUDE.md block, preserves data by default", () => {
    nodeFs.mkdirSync(path.join(tmp.cwd, ".claude"), { recursive: true });
    nodeFs.writeFileSync(
      path.join(tmp.cwd, ".claude", "settings.local.json"),
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: "Bash",
              _teamagentTag: "teamagent-pre-tool-use",
              hooks: [{ type: "command", command: "node x" }],
            },
          ],
        },
      }),
    );
    nodeFs.writeFileSync(
      path.join(tmp.cwd, "CLAUDE.md"),
      "# Manual\n\nprose\n\n<!-- TEAMAGENT:START - auto -->\n- r\n<!-- TEAMAGENT:END -->\n",
    );
    // Simulate data
    const globalStore = path.join(tmp.home, ".teamagent", "global", "knowledge.jsonl");
    nodeFs.mkdirSync(path.dirname(globalStore), { recursive: true });
    nodeFs.writeFileSync(globalStore, '{"id":"x"}\n');

    const r = uninstall({ cwd: tmp.cwd, homeDir: tmp.home });
    expect(r.dryRun).toBe(false);

    // Hook gone
    const settings = JSON.parse(
      nodeFs.readFileSync(
        path.join(tmp.cwd, ".claude", "settings.local.json"),
        "utf-8",
      ),
    );
    const preHooks = settings.hooks?.PreToolUse ?? [];
    expect(
      preHooks.some((h: any) => h._teamagentTag === "teamagent-pre-tool-use"),
    ).toBe(false);

    // CLAUDE.md cleaned but manual content preserved
    const md = nodeFs.readFileSync(path.join(tmp.cwd, "CLAUDE.md"), "utf-8");
    expect(md).not.toContain("TEAMAGENT");
    expect(md).toContain("Manual");
    expect(md).toContain("prose");

    // Data preserved
    expect(nodeFs.existsSync(globalStore)).toBe(true);
  });

  it("--delete-data removes ~/.teamagent and ./.teamagent too", () => {
    const globalStore = path.join(tmp.home, ".teamagent", "global", "knowledge.jsonl");
    nodeFs.mkdirSync(path.dirname(globalStore), { recursive: true });
    nodeFs.writeFileSync(globalStore, '{"id":"x"}\n');
    const teamStore = path.join(tmp.cwd, ".teamagent", "knowledge.jsonl");
    nodeFs.mkdirSync(path.dirname(teamStore), { recursive: true });
    nodeFs.writeFileSync(teamStore, '{"id":"y"}\n');

    uninstall({ cwd: tmp.cwd, homeDir: tmp.home, deleteData: true });

    expect(nodeFs.existsSync(globalStore)).toBe(false);
    expect(nodeFs.existsSync(teamStore)).toBe(false);
  });

  it("empty project → no actions failing, just skip notices", () => {
    const r = uninstall({ cwd: tmp.cwd, homeDir: tmp.home });
    expect(r.actions.some((a) => a.includes("跳过"))).toBe(true);
  });
});

describe("parseUninstallArgs", () => {
  it("defaults", () => {
    expect(parseUninstallArgs([])).toEqual({});
  });
  it("flags combined", () => {
    expect(parseUninstallArgs(["--delete-data", "--dry-run"])).toEqual({
      deleteData: true,
      dryRun: true,
    });
  });
});

describe("renderUninstallResult", () => {
  it("renders dry-run header + actions", () => {
    const out = renderUninstallResult({
      dryRun: true,
      actions: ["(dry-run) would remove X"],
    });
    expect(out).toContain("dry-run");
    expect(out).toContain("would remove X");
  });

  // 真实卸载且确实移除了 hook 时，必须给用户一行 reinstall 路径。
  // 否则用户跑完 uninstall 后 statusline + 三类 hook 全没了、却完全不知道
  // 怎么恢复——这就是触发本次 fix 的 UX 盲区（详见 bugs.md B-155）。
  it("appends reinstall hint when teamagent artifacts were actually removed", () => {
    const out = renderUninstallResult({
      dryRun: false,
      actions: [
        "已移除 hook 注册: /tmp/.claude/settings.local.json",
        "已从 CLAUDE.md 移除 TEAMAGENT 区块",
      ],
    });
    expect(out).toContain("install-hook");
    expect(out).toMatch(/恢复|重新启用|reinstall/);
  });

  it("does not show reinstall hint on dry-run (user is just inspecting)", () => {
    const out = renderUninstallResult({
      dryRun: true,
      actions: ["(dry-run) 会从 .../settings.local.json 移除 TeamAgent hook"],
    });
    expect(out).not.toContain("install-hook");
  });

  it("does not show reinstall hint when nothing was removed", () => {
    const out = renderUninstallResult({
      dryRun: false,
      actions: [
        "无 .claude/settings.local.json，跳过 hook 卸载",
        "无 CLAUDE.md，跳过区块清理",
      ],
    });
    expect(out).not.toContain("install-hook");
  });
});
