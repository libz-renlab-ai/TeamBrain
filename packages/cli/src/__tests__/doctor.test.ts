// packages/cli/src/__tests__/doctor.test.ts
import { describe, it, expect } from "vitest";
import {
  renderDoctorResult,
  parseDoctorArgs,
  checkClaudeCode,
  pathContainsNodeModulesBin,
  type ClaudeProbe,
  type ClaudeProbeResult,
  type DoctorCheckResult,
  type DoctorResult,
} from "../commands/doctor.js";

function makeResult(overrides: Partial<DoctorResult> = {}): DoctorResult {
  return {
    checks: [],
    passed: 0,
    failed: 0,
    skipped: 0,
    allPassed: true,
    ...overrides,
  };
}

describe("renderDoctorResult", () => {
  it("shows all-pass message when allPassed=true", () => {
    const out = renderDoctorResult(makeResult({ allPassed: true, passed: 8 }));
    expect(out).toContain("全部检查通过");
    expect(out).toContain("TeamAgent 运行正常");
  });

  it("shows failure count and fix hint when failed > 0", () => {
    const checks: DoctorCheckResult[] = [
      { name: "node-version", status: "fail", detail: "v18.0.0 (需要 ≥ 22)", fix: "nvm install 22" },
      { name: "claude-code", status: "skip", detail: "跳过" },
    ];
    const out = renderDoctorResult(makeResult({
      checks,
      passed: 0,
      failed: 1,
      skipped: 1,
      allPassed: false,
    }));
    expect(out).toContain("❌ node-version");
    expect(out).toContain("nvm install 22");
    expect(out).toContain("⏭");
    expect(out).toContain("1 项失败");
  });

  it("shows ✅ for passing checks", () => {
    const checks: DoctorCheckResult[] = [
      { name: "node-version", status: "pass", detail: "v22.4.0" },
    ];
    const out = renderDoctorResult(makeResult({ checks, passed: 1, allPassed: true }));
    expect(out).toContain("✅ node-version");
    expect(out).toContain("v22.4.0");
  });
});

describe("parseDoctorArgs", () => {
  it("defaults all false", () => {
    const opts = parseDoctorArgs([]);
    expect(opts.fix).toBe(false);
    expect(opts.json).toBe(false);
    expect(opts.postinstall).toBe(false);
  });

  it("parses --fix --json --postinstall", () => {
    const opts = parseDoctorArgs(["--fix", "--json", "--postinstall"]);
    expect(opts.fix).toBe(true);
    expect(opts.json).toBe(true);
    expect(opts.postinstall).toBe(true);
  });
});

describe("executeDoctor --fix", () => {
  it("parseDoctorArgs recognizes --fix", () => {
    expect(parseDoctorArgs(["--fix"]).fix).toBe(true);
  });
});

describe("checkClaudeCode", () => {
  function makeProbe(opts: {
    localResult: ClaudeProbeResult;
    globalResult?: ClaudeProbeResult;
  }): { probe: ClaudeProbe; callCount: () => number } {
    let count = 0;
    const probe: ClaudeProbe = (env) => {
      count += 1;
      if (env === undefined) return opts.localResult;
      return opts.globalResult ?? { ok: false, stdout: "", stderr: "command not found: claude" };
    };
    return { probe, callCount: () => count };
  }

  // process.env.PATH must contain node_modules/.bin for the retry path to fire
  // (envWithoutNodeModulesBin returns null when there's nothing to strip).
  function withInjectedNodeModulesPath(fn: () => void): void {
    const originalPath = process.env.PATH;
    if (!originalPath || !pathContainsNodeModulesBin(originalPath)) {
      process.env.PATH = `/repo/node_modules/.bin${originalPath ? ":" + originalPath : ""}`;
    }
    try {
      fn();
    } finally {
      if (originalPath !== undefined) process.env.PATH = originalPath;
      else delete process.env.PATH;
    }
  }

  const BROKEN_STUB_STDERR =
    "Error: claude native binary not installed.\n\nEither postinstall did not run (--ignore-scripts, some pnpm configs)\nor the platform-native optional dependency was not downloaded\n(--omit=optional).\n\nRun the postinstall manually:\n  node node_modules/@anthropic-ai/claude-code/install.cjs\n";

  it("(a) local broken + global working → pass with fallback note", () => {
    withInjectedNodeModulesPath(() => {
      const { probe, callCount } = makeProbe({
        localResult: { ok: false, stdout: "", stderr: BROKEN_STUB_STDERR },
        globalResult: { ok: true, stdout: "2.1.126 (Claude Code)\n", stderr: "" },
      });
      const result = checkClaudeCode(probe);
      expect(result.status).toBe("pass");
      expect(result.detail).toContain("2.1.126");
      expect(result.detail).toMatch(/全局|fallback|本地 pnpm 副本损坏/);
      expect(callCount()).toBe(2);
    });
  });

  it("(b) local broken + global missing → fail with new fix message", () => {
    withInjectedNodeModulesPath(() => {
      const { probe } = makeProbe({
        localResult: { ok: false, stdout: "", stderr: BROKEN_STUB_STDERR },
        globalResult: { ok: false, stdout: "", stderr: "claude: command not found" },
      });
      const result = checkClaudeCode(probe);
      expect(result.status).toBe("fail");
      expect(result.detail).toContain("本地 pnpm 副本");
      expect(result.fix).toContain("install.cjs");
      expect(result.fix).toContain("全局 claude");
    });
  });

  it("(c) global pass on first try → pass as today", () => {
    const { probe, callCount } = makeProbe({
      localResult: { ok: true, stdout: "2.1.126 (Claude Code)\n", stderr: "" },
    });
    const result = checkClaudeCode(probe);
    expect(result.status).toBe("pass");
    expect(result.detail).toBe("2.1.126 (Claude Code)");
    expect(result.fix).toBeUndefined();
    expect(callCount()).toBe(1);
  });

  it("(d) generic command-not-found (no broken-stub signature) → original fail message", () => {
    const { probe } = makeProbe({
      localResult: { ok: false, stdout: "", stderr: "claude: command not found" },
    });
    const result = checkClaudeCode(probe);
    expect(result.status).toBe("fail");
    expect(result.detail).toBe("未找到 claude 命令");
    expect(result.fix).toBe("npm install -g @anthropic-ai/claude-code");
  });
});
