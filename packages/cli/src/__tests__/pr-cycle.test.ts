import { describe, it, expect, vi } from "vitest";
import { executePrCycle, parsePrCycleArgs } from "../commands/pr-cycle.js";

describe("parsePrCycleArgs", () => {
  it("parses existing PR and wait flags", () => {
    expect(parsePrCycleArgs(["--pr", "17", "--wait-seconds=12"])).toMatchObject({
      prNumber: 17,
      waitMs: 12_000,
    });
  });

  it("parses create options", () => {
    expect(parsePrCycleArgs([
      "--title", "Ship it",
      "--body=Verification included",
      "--base", "main",
      "--head=feature/pr-cycle",
      "--draft",
      "--repo", "LiuShiyuMath/TeamBrain",
      "--claudefast-bin", "claudefast",
      "--codexfastg-bin=codexfastg",
    ])).toMatchObject({
      title: "Ship it",
      body: "Verification included",
      base: "main",
      head: "feature/pr-cycle",
      draft: true,
      repo: "LiuShiyuMath/TeamBrain",
      claudefastBin: "claudefast",
      codexfastgBin: "codexfastg",
    });
  });

  it("rejects invalid numeric args", () => {
    expect(() => parsePrCycleArgs(["--pr=0"])).toThrow(/--pr 必须是正整数/);
    expect(() => parsePrCycleArgs(["--wait-ms=-1"])).toThrow(/--wait-ms 必须是非负整数/);
  });
});

describe("executePrCycle", () => {
  it("dry-run explains expected commands without running gh or sleeping", async () => {
    const runner = vi.fn();
    const sleep = vi.fn();
    const result = await executePrCycle({
      dryRun: true,
      title: "Add feature",
      waitMs: 123,
      cmdRunner: runner,
      sleep,
    });

    expect(result.blocked).toBe(false);
    expect(runner).not.toHaveBeenCalled();
    expect(sleep).not.toHaveBeenCalled();
    expect(result.output).toContain("TeamAgent PR Cycle (dry-run)");
    expect(result.output).toContain("gh pr create --title 'Add feature'");
    expect(result.output).toContain("将等待: 123ms");
    expect(result.output).toContain("!claudefast -p");
    expect(result.output).toContain("!codexfastg -p");
  });

  it("creates a PR, waits, checks reviews, and blocks on actionable feedback", async () => {
    const calls: string[] = [];
    const runner = vi.fn(async (cmd: string) => {
      calls.push(cmd);
      if (cmd === "gh --version") return "gh version 2.70.0";
      if (cmd === "gh pr create --fill") return "https://github.com/acme/repo/pull/17\n";
      if (cmd === "gh pr view --json number,url,reviews") {
        return JSON.stringify({ number: 17, url: "https://github.com/acme/repo/pull/17", reviews: [] });
      }
      if (cmd === "gh pr view 17 --json number,url,reviews") {
        return JSON.stringify({
          number: 17,
          url: "https://github.com/acme/repo/pull/17",
          reviews: [
            { state: "CHANGES_REQUESTED", body: "Please document the rule before fixing this review." },
            { state: "APPROVED", body: "Looks good overall." },
          ],
        });
      }
      throw new Error(`unexpected command ${cmd}`);
    });
    const sleep = vi.fn(async () => {});

    const result = await executePrCycle({ cmdRunner: runner, sleep, waitMs: 300_000 });

    expect(result.blocked).toBe(true);
    expect(calls).toEqual([
      "gh --version",
      "gh pr create --fill",
      "gh pr view --json number,url,reviews",
      "gh pr view 17 --json number,url,reviews",
    ]);
    expect(sleep).toHaveBeenCalledWith(300_000);
    expect(result.output).toContain("PR 已定位: #17");
    expect(result.output).toContain("Review 检查发现 1 条");
    expect(result.output).toContain("先更新项目文档/规则");
    expect(result.output).toContain('!claudefast -p "17 根据规则，我们应该怎么解决这个review出来的问题？"');
    expect(result.output).toContain('!codexfastg -p "17 根据规则，我们应该怎么解决这个review出来的问题？"');
    expect(result.output).toContain("teamagent ingest --from-pr 17 --dry-run");
  });

  it("uses an existing PR and passes when there are no actionable reviews", async () => {
    const runner = vi.fn(async (cmd: string) => {
      if (cmd === "gh --version") return "gh version 2.70.0";
      if (cmd === "gh pr view 9 --json number,url,reviews") {
        return JSON.stringify({
          number: 9,
          url: "https://github.com/acme/repo/pull/9",
          reviews: [{ state: "APPROVED", body: "Looks good overall." }],
        });
      }
      throw new Error(`unexpected command ${cmd}`);
    });

    const result = await executePrCycle({
      prNumber: 9,
      waitMs: 0,
      cmdRunner: runner,
      sleep: vi.fn(async () => {}),
    });

    expect(result.blocked).toBe(false);
    expect(result.output).toContain("没有需要先写规则的 review");
  });

  it("reports unavailable gh as blocked", async () => {
    const result = await executePrCycle({
      cmdRunner: vi.fn(async () => {
        throw new Error("gh missing");
      }),
      sleep: vi.fn(async () => {}),
    });

    expect(result.blocked).toBe(true);
    expect(result.output).toContain("gh CLI 未安装");
  });
});
