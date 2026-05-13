import { describe, it, expect } from "vitest";
import {
  matchPrompt,
  matchPromptWithIntentCheck,
  parseExtraTriggersEnv,
} from "../prompt-matcher.js";

describe("matchPrompt (sync)", () => {
  it.each([
    "总结一下今天的日报",
    "总结今天的日报",
    "今日日报",
    "生成日报",
    "daily summary today",
    "today's daily summary",
  ])("fires on default whitelist phrase: %s", (phrase) => {
    const result = matchPrompt(phrase);
    expect(result.fire).toBe(true);
    expect(result.reason).toBe("whitelist");
    expect(result.matchedPhrase).toBe(phrase);
  });

  it("fires on whitelist phrase embedded in larger prompt", () => {
    const result = matchPrompt("hey 总结一下今天的日报 thanks");
    expect(result.fire).toBe(true);
    expect(result.reason).toBe("whitelist");
  });

  it.each(["/daily", "/daily --archive", "/daily\nplease"])(
    "fires on slash command: %s",
    (s) => {
      const result = matchPrompt(s);
      expect(result.fire).toBe(true);
      expect(result.reason).toBe("slash");
    },
  );

  it("does not fire on unrelated prompts", () => {
    const result = matchPrompt("how do I run the tests?");
    expect(result.fire).toBe(false);
    expect(result.reason).toBe("passthrough");
  });

  it("does not fire on 日报 keyword without whitelist match (sync path)", () => {
    const result = matchPrompt("我刚刚看到日报里有个 bug，能看看吗");
    expect(result.fire).toBe(false);
    expect(result.reason).toBe("passthrough");
  });

  it("honors disabled flag", () => {
    const result = matchPrompt("总结一下今天的日报", { disabled: true });
    expect(result.fire).toBe(false);
    expect(result.reason).toBe("disabled");
  });

  it("honors extraTriggers", () => {
    const result = matchPrompt("帮我做个 weeklog", {
      extraTriggers: ["weeklog"],
    });
    expect(result.fire).toBe(true);
    expect(result.reason).toBe("whitelist");
    expect(result.matchedPhrase).toBe("weeklog");
  });
});

describe("matchPromptWithIntentCheck (async)", () => {
  it("returns sync match if whitelist already fired", async () => {
    const result = await matchPromptWithIntentCheck("/daily");
    expect(result.fire).toBe(true);
    expect(result.reason).toBe("slash");
  });

  it("returns passthrough if no daily keyword present (regardless of checker)", async () => {
    const result = await matchPromptWithIntentCheck("run tests please", {
      intentChecker: async () => true,
    });
    expect(result.fire).toBe(false);
    expect(result.reason).toBe("passthrough");
  });

  it("calls intentChecker when keyword present but whitelist missed", async () => {
    let called = false;
    const result = await matchPromptWithIntentCheck(
      "我想看看今天的日报情况",
      {
        intentChecker: async () => {
          called = true;
          return true;
        },
      },
    );
    expect(called).toBe(true);
    expect(result.fire).toBe(true);
    expect(result.reason).toBe("intent-check");
  });

  it("degrades gracefully when intentChecker is not provided", async () => {
    const result = await matchPromptWithIntentCheck("看一下今天日报里的数字");
    expect(result.fire).toBe(false);
    expect(result.reason).toBe("passthrough");
  });

  it("treats intent-checker rejection as passthrough", async () => {
    const result = await matchPromptWithIntentCheck("看一下今天日报里的数字", {
      intentChecker: async () => false,
    });
    expect(result.fire).toBe(false);
    expect(result.reason).toBe("passthrough");
  });

  it("treats intent-checker error as passthrough", async () => {
    const result = await matchPromptWithIntentCheck("看一下今天日报里的数字", {
      intentChecker: async () => {
        throw new Error("boom");
      },
    });
    expect(result.fire).toBe(false);
    expect(result.reason).toBe("passthrough");
  });
});

describe("parseExtraTriggersEnv", () => {
  it("returns [] for undefined and empty", () => {
    expect(parseExtraTriggersEnv(undefined)).toEqual([]);
    expect(parseExtraTriggersEnv("")).toEqual([]);
  });

  it("splits, trims, and drops empties", () => {
    expect(parseExtraTriggersEnv("alpha, beta ,, gamma")).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
  });
});
