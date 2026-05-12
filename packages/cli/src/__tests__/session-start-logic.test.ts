import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  decideAction,
  maybeShowReinstallBanner,
  maybeShowVersionCheckBanner,
  REINSTALL_BANNER_THROTTLE_MS,
} from "../session-start-logic.js";

describe("decideAction", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "ss-"));
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it("无 .teamagent/knowledge.db + 非项目目录 → skip-not-a-project", () => {
    const action = decideAction(cwd, new Date());
    expect(action).toBe("skip-not-a-project");
  });

  it("无 db + 有 package.json → auto-init", () => {
    writeFileSync(join(cwd, "package.json"), "{}");
    expect(decideAction(cwd, new Date())).toBe("auto-init");
  });

  it("无 db + 有 .git → auto-init", () => {
    mkdirSync(join(cwd, ".git"), { recursive: true });
    expect(decideAction(cwd, new Date())).toBe("auto-init");
  });

  it("无 db + .teamagent/auto-init.disabled 存在 → skip-auto-init-disabled", () => {
    writeFileSync(join(cwd, "package.json"), "{}");
    mkdirSync(join(cwd, ".teamagent"), { recursive: true });
    writeFileSync(join(cwd, ".teamagent", "auto-init.disabled"), "");
    expect(decideAction(cwd, new Date())).toBe("skip-auto-init-disabled");
  });

  it("已存在 knowledge.db → skip-already-initialized", () => {
    // PR #181: walk-up now requires BOTH knowledge.db AND a project-marker.
    // Plant a `.git/` dir alongside the DB so the new contract matches.
    mkdirSync(join(cwd, ".teamagent"), { recursive: true });
    writeFileSync(join(cwd, ".teamagent", "knowledge.db"), "");
    mkdirSync(join(cwd, ".git"), { recursive: true });
    expect(decideAction(cwd, new Date())).toBe("skip-already-initialized");
  });

  // Issue #161: walk-up logic — decideAction must honour an ancestor's
  // .teamagent/knowledge.db so SessionStart from a sub-directory does not
  // spawn a duplicate child auto-init.
  describe("issue #161 ancestor-aware walk-up", () => {
    let root: string;
    let sub: string;

    beforeEach(() => {
      root = mkdtempSync(join(tmpdir(), "teamagent-w4-"));
      sub = join(root, "sub");
      mkdirSync(sub, { recursive: true });
    });
    afterEach(() => {
      rmSync(root, { recursive: true, force: true });
    });

    it("ancestor 有 .teamagent/knowledge.db + project-marker，子目录调用 → skip-already-initialized", () => {
      // PR #181: walk-up requires both knowledge.db AND project-marker.
      mkdirSync(join(root, ".teamagent"), { recursive: true });
      writeFileSync(join(root, ".teamagent", "knowledge.db"), "");
      mkdirSync(join(root, ".git"), { recursive: true });
      // sub itself has no .teamagent/knowledge.db
      expect(decideAction(sub, new Date())).toBe("skip-already-initialized");
    });

    it("无任何 ancestor 有 db + cwd 是项目目录 → auto-init", () => {
      // No .teamagent anywhere along the chain; cwd has package.json marker.
      writeFileSync(join(sub, "package.json"), "{}");
      expect(decideAction(sub, new Date())).toBe("auto-init");
    });

    it("无 ancestor db + cwd 有 .teamagent/auto-init.disabled → skip-auto-init-disabled", () => {
      // No knowledge.db anywhere; only the per-cwd disabled marker exists.
      mkdirSync(join(sub, ".teamagent"), { recursive: true });
      writeFileSync(join(sub, ".teamagent", "auto-init.disabled"), "");
      expect(decideAction(sub, new Date())).toBe("skip-auto-init-disabled");
    });

    // ─── PR #181 fix-cycle (Worker E) — autoInitDisabled walk-up ──────────
    //
    // PR-PLAN finding #8: autoInitDisabled was asymmetric vs decideAction's
    // walk-up — only checked cwd & $HOME. After the WD fix, autoInitDisabled
    // walks up too, so an ancestor's `auto-init.disabled` is honoured from a
    // child cwd. Scenario: ancestor has .git + .teamagent/auto-init.disabled
    // but NO knowledge.db (user opted out before ever initializing). Child
    // cwd has a package.json marker. Pre-fix: "auto-init"; post-fix:
    // "skip-auto-init-disabled".
    it("PR #181: ancestor's auto-init.disabled marker is honored from a child cwd (no ancestor knowledge.db)", () => {
      // Plant ancestor: .git + .teamagent/auto-init.disabled, NO knowledge.db.
      mkdirSync(join(root, ".git"), { recursive: true });
      mkdirSync(join(root, ".teamagent"), { recursive: true });
      writeFileSync(join(root, ".teamagent", "auto-init.disabled"), "");
      // Child cwd is a project dir on its own (has package.json marker).
      writeFileSync(join(sub, "package.json"), "{}");

      // Pre-fix would return "auto-init" because:
      //   - sub has no knowledge.db
      //   - sub has package.json (project dir)
      //   - autoInitDisabled only checked cwd + $HOME, neither of which had
      //     the disabled marker.
      // Post-fix: autoInitDisabled walks up; finds the ancestor's disabled
      // marker → returns true → decideAction yields skip-auto-init-disabled.
      expect(decideAction(sub, new Date())).toBe("skip-auto-init-disabled");
    });
  });
});

describe("maybeShowReinstallBanner (B-104)", () => {
  let teamagentDir: string;          // 直接对应 ~/.teamagent
  let originalEnv: string | undefined;

  beforeEach(() => {
    // session-start-logic 的 teamagentHome() 把 TEAMAGENT_HOME 直接当作
    // .teamagent 目录用（不再追加 .teamagent 子目录）。所以测试必须把 env
    // 指向最终的 .teamagent 目录本身。
    const root = mkdtempSync(join(tmpdir(), "rb-"));
    teamagentDir = join(root, ".teamagent");
    mkdirSync(teamagentDir, { recursive: true });
    originalEnv = process.env.TEAMAGENT_HOME;
    process.env.TEAMAGENT_HOME = teamagentDir;
  });
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.TEAMAGENT_HOME;
    else process.env.TEAMAGENT_HOME = originalEnv;
    rmSync(teamagentDir, { recursive: true, force: true });
  });

  function writeState(state: object): void {
    writeFileSync(
      join(teamagentDir, "update-state.json"),
      JSON.stringify(state),
      "utf-8",
    );
  }

  it("无 update-state.json 时不输出任何 banner", () => {
    let captured = "";
    maybeShowReinstallBanner((s) => { captured += s; }, () => 1_000_000);
    expect(captured).toBe("");
  });

  it("consecutive_install_failures=0 时不输出（健康状态）", () => {
    writeState({
      consecutive_install_failures: 0,
      last_install_error: null,
      reinstall_banner_shown_at: 0,
    });
    let captured = "";
    maybeShowReinstallBanner((s) => { captured += s; }, () => 1_000_000);
    expect(captured).toBe("");
  });

  it("consecutive_install_failures>=1 + 有 error → 显示红字 + 重装命令", () => {
    writeState({
      consecutive_install_failures: 3,
      last_install_error: "Connection closed by 198.18.0.18 port 22",
      reinstall_banner_shown_at: 0,
    });
    let captured = "";
    const now = 1_000_000_000_000;
    maybeShowReinstallBanner((s) => { captured += s; }, () => now);
    expect(captured).toContain("自动更新已连续失败 3 次");
    expect(captured).toContain("npm install -g");
    expect(captured).toContain("archive/refs/heads/release.tar.gz");
    // Throttle 标记应被写回
    const after = JSON.parse(
      readFileSync(join(teamagentDir, "update-state.json"), "utf-8"),
    );
    expect(after.reinstall_banner_shown_at).toBe(now);
  });

  it("24h 内已显示过 → 不重复显示（throttle）", () => {
    const lastShown = 1_000_000_000_000;
    writeState({
      consecutive_install_failures: 5,
      last_install_error: "ssh fail",
      reinstall_banner_shown_at: lastShown,
    });
    let captured = "";
    // 23h 后还在 throttle 窗口内
    const now = lastShown + 23 * 60 * 60 * 1000;
    maybeShowReinstallBanner((s) => { captured += s; }, () => now);
    expect(captured).toBe("");
  });

  it("24h 后再次显示", () => {
    const lastShown = 1_000_000_000_000;
    writeState({
      consecutive_install_failures: 5,
      last_install_error: "ssh fail",
      reinstall_banner_shown_at: lastShown,
    });
    let captured = "";
    const now = lastShown + REINSTALL_BANNER_THROTTLE_MS + 1;
    maybeShowReinstallBanner((s) => { captured += s; }, () => now);
    expect(captured).toContain("自动更新已连续失败");
    const after = JSON.parse(
      readFileSync(join(teamagentDir, "update-state.json"), "utf-8"),
    );
    expect(after.reinstall_banner_shown_at).toBe(now);
  });

  it("有 failures 但 last_install_error 为 null（防御）→ 不显示", () => {
    writeState({
      consecutive_install_failures: 2,
      last_install_error: null,
      reinstall_banner_shown_at: 0,
    });
    let captured = "";
    maybeShowReinstallBanner((s) => { captured += s; }, () => 1_000_000);
    expect(captured).toBe("");
  });

  it("REINSTALL_BANNER_THROTTLE_MS 是 24 小时", () => {
    expect(REINSTALL_BANNER_THROTTLE_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe("maybeShowVersionCheckBanner (issue #313 Tier 3)", () => {
  let teamagentDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    const root = mkdtempSync(join(tmpdir(), "vcb-"));
    teamagentDir = join(root, ".teamagent");
    mkdirSync(teamagentDir, { recursive: true });
    originalEnv = process.env.TEAMAGENT_HOME;
    process.env.TEAMAGENT_HOME = teamagentDir;
  });
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.TEAMAGENT_HOME;
    else process.env.TEAMAGENT_HOME = originalEnv;
    rmSync(teamagentDir, { recursive: true, force: true });
  });

  function writeState(state: object): void {
    writeFileSync(
      join(teamagentDir, "update-state.json"),
      JSON.stringify(state),
      "utf-8",
    );
  }

  it("无 update-state.json 时不输出", () => {
    let captured = "";
    maybeShowVersionCheckBanner((s) => { captured += s; });
    expect(captured).toBe("");
  });

  it("last_install_error 为 null → 不输出", () => {
    writeState({ last_install_error: null });
    let captured = "";
    maybeShowVersionCheckBanner((s) => { captured += s; });
    expect(captured).toBe("");
  });

  it("last_install_error 不带 'version-check failed:' 前缀 → 不输出（避免与 reinstall banner 冲突）", () => {
    writeState({ last_install_error: "Connection closed by 198.18.0.18 port 22" });
    let captured = "";
    maybeShowVersionCheckBanner((s) => { captured += s; });
    expect(captured).toBe("");
  });

  it("last_install_error 带 'version-check failed:' 前缀 → 显示 Tier 3 banner + 3 条恢复路径", () => {
    writeState({
      last_install_error: "version-check failed: pages=pages_5xx (Pages server error 503); npm=npm_5xx (npm registry server error 503)",
    });
    let captured = "";
    maybeShowVersionCheckBanner((s) => { captured += s; });
    expect(captured).toContain("暂时查不到新版本");
    expect(captured).toContain("version-check failed:");
    // 三条恢复路径必须都出现
    expect(captured).toContain("npm i -g teamagent@latest");
    expect(captured).toContain("等下次启动");
    expect(captured).toContain("TEAMAGENT_GITHUB_TOKEN");
    // 不该有内部术语 "GitHub anonymous rate limit"
    expect(captured).not.toContain("anonymous rate limit");
  });

  it("不消耗 reinstall_banner_shown_at（与 reinstall banner 独立）", () => {
    writeState({
      last_install_error: "version-check failed: pages=pages_network (ECONNREFUSED); npm=npm_network (ECONNREFUSED)",
      reinstall_banner_shown_at: 0,
    });
    let captured = "";
    maybeShowVersionCheckBanner((s) => { captured += s; });
    expect(captured).not.toBe("");
    // 不修改 reinstall_banner_shown_at (它属于另一个 banner 的 throttle 状态)
    const after = JSON.parse(
      readFileSync(join(teamagentDir, "update-state.json"), "utf-8"),
    );
    expect(after.reinstall_banner_shown_at).toBe(0);
  });
});
