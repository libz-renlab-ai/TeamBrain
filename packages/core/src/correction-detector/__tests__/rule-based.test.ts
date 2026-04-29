import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ruleBasedCorrectionDetector } from "../rule-based.js";
import { parseSessionFile } from "../../session-parser/index.js";

const FIXTURE_ROOT = path.resolve(process.cwd(), "fixtures/sessions");

function loadFixture(name: string) {
  return parseSessionFile(
    fs.readFileSync(path.join(FIXTURE_ROOT, name), "utf-8"),
  );
}

describe("ruleBasedCorrectionDetector", () => {
  describe("explicit_denial signal", () => {
    it("catches '不对' in user message", () => {
      const session = loadFixture("correction-denial-01.jsonl");
      const corrections = ruleBasedCorrectionDetector.detect(session);
      expect(corrections.length).toBeGreaterThanOrEqual(1);
      const hit = corrections.find((c) => c.signal === "explicit_denial");
      expect(hit).toBeDefined();
      expect(hit!.weight).toBeGreaterThanOrEqual(0.9);
      expect(hit!.turnIndex).toBe(1);
      expect(hit!.correctionText).toContain("不对");
    });

    it("catches '思路不对' variant", () => {
      const session = loadFixture("correction-denial-02.jsonl");
      const corrections = ruleBasedCorrectionDetector.detect(session);
      const hit = corrections.find((c) => c.signal === "explicit_denial");
      expect(hit).toBeDefined();
    });

    it("catches '错了' variant", () => {
      const session = loadFixture("correction-denial-03.jsonl");
      const corrections = ruleBasedCorrectionDetector.detect(session);
      const hit = corrections.find((c) => c.signal === "explicit_denial");
      expect(hit).toBeDefined();
    });

    it("captures surrounding context (prev assistant + tool calls)", () => {
      const session = loadFixture("correction-denial-01.jsonl");
      const [hit] = ruleBasedCorrectionDetector.detect(session);
      expect(hit!.previousAssistantText).toContain("axios");
      expect(hit!.previousToolCalls.length).toBeGreaterThan(0);
      expect(hit!.previousToolCalls[0]).toContain("Write");
    });

    it("catches concrete correction phrasing without broad bare '不是'", () => {
      const session = {
        sessionId: "s-specific-denial",
        turns: [
          {
            turnIndex: 0,
            userMessage: "build it",
            assistantText: "I'll implement directly.",
            toolCalls: [],
            timestamp: "2026-04-14T10:00:00Z",
          },
          {
            turnIndex: 1,
            userMessage: "不是这个意思，应该先写测试再实现",
            assistantText: "",
            toolCalls: [],
            timestamp: "2026-04-14T10:00:10Z",
          },
        ],
      };
      const corrections = ruleBasedCorrectionDetector.detect(session as any);
      const hit = corrections.find((c) => c.signal === "explicit_denial");
      expect(hit).toBeDefined();
      expect(hit!.weight).toBeGreaterThanOrEqual(0.8);
    });
  });

  describe("multi_failure signal", () => {
    it("detects repeated tool failure before user intervention", () => {
      const session = loadFixture("correction-multi-failure-01.jsonl");
      const corrections = ruleBasedCorrectionDetector.detect(session);
      const hit = corrections.find((c) => c.signal === "multi_failure");
      expect(hit).toBeDefined();
      expect(hit!.weight).toBeGreaterThanOrEqual(0.8);
    });

    it("triggers even when user stays silent after failed tool (weight 0.70)", () => {
      const session = {
        sessionId: "s-silent",
        turns: [
          {
            turnIndex: 0,
            userMessage: "install moment",
            assistantText: "running install",
            toolCalls: [
              {
                id: "t1", name: "Bash",
                input: { command: "npm install moment" },
                result: "npm ERR! 404 Not Found", succeeded: false,
              },
            ],
            timestamp: "2026-04-14T10:00:00Z",
          },
          {
            // user silent — no userMessage, just auto-continue
            turnIndex: 1,
            userMessage: "",
            assistantText: "retrying",
            toolCalls: [],
            timestamp: "2026-04-14T10:00:10Z",
          },
        ],
      };
      const corrections = ruleBasedCorrectionDetector.detect(session as any);
      const hit = corrections.find((c) => c.signal === "multi_failure");
      expect(hit).toBeDefined();
      expect(hit!.weight).toBeCloseTo(0.70);
      // context includes failed tool stderr preview
      expect(hit!.previousToolCalls[0]).toMatch(/✗/);
      expect(hit!.previousToolCalls[0]).toContain("npm ERR!");
    });
  });

  describe("suggestion_override signal", () => {
    it("detects when user pivots to different tool/library", () => {
      const session = loadFixture("correction-override-01.jsonl");
      const corrections = ruleBasedCorrectionDetector.detect(session);
      // 用户说 "Zustand" 而 AI 推荐了 "Redux" — override pattern
      const hit = corrections.find(
        (c) => c.signal === "suggestion_override" || c.signal === "explicit_denial",
      );
      expect(hit).toBeDefined();
    });

    it("detects scoped package override phrasing", () => {
      const session = {
        sessionId: "s-scoped-override",
        turns: [
          {
            turnIndex: 0,
            userMessage: "state management?",
            assistantText: "I recommend Redux for this.",
            toolCalls: [],
            timestamp: "2026-04-14T10:00:00Z",
          },
          {
            turnIndex: 1,
            userMessage: "用 @reduxjs/toolkit instead of redux classic",
            assistantText: "",
            toolCalls: [],
            timestamp: "2026-04-14T10:00:10Z",
          },
        ],
      };
      const corrections = ruleBasedCorrectionDetector.detect(session as any);
      expect(
        corrections.find(
          (c) => c.signal === "suggestion_override" || c.signal === "explicit_denial",
        ),
      ).toBeDefined();
    });
  });

  describe("tool context quality", () => {
    it("includes string tool inputs in the correction context", () => {
      const session = {
        sessionId: "s-tool-context",
        turns: [
          {
            turnIndex: 0,
            userMessage: "install date lib",
            assistantText: "I'll install moment.",
            toolCalls: [
              {
                id: "t1",
                name: "Bash",
                input: { command: "npm install moment" },
                result: "",
                succeeded: true,
              },
            ],
            timestamp: "2026-04-14T10:00:00Z",
          },
          {
            turnIndex: 1,
            userMessage: "不用 moment，改用 dayjs",
            assistantText: "",
            toolCalls: [],
            timestamp: "2026-04-14T10:00:10Z",
          },
        ],
      };
      const [hit] = ruleBasedCorrectionDetector.detect(session as any);
      expect(hit!.previousToolCalls[0]).toContain("command=npm install moment");
    });
  });

  describe("code_edit signal", () => {
    it("detects Edit tool with much-larger new_string (user rewrote AI code)", () => {
      const session = loadFixture("correction-code-edit-01.jsonl");
      const corrections = ruleBasedCorrectionDetector.detect(session);
      const hit = corrections.find((c) => c.signal === "code_edit");
      expect(hit).toBeDefined();
      expect(hit!.weight).toBeGreaterThanOrEqual(0.7);
    });
  });

  describe("error_in_context signal (Signal E)", () => {
    it("detects when user pastes error trace after AI tool call", () => {
      const session = loadFixture("correction-error-in-context-01.jsonl");
      const corrections = ruleBasedCorrectionDetector.detect(session);
      expect(corrections.length).toBeGreaterThanOrEqual(1);
      // Uses multi_failure signal type (reused for error-in-context)
      const hit = corrections.find((c) => c.signal === "multi_failure");
      expect(hit).toBeDefined();
      expect(hit!.correctionText).toContain("Error:");
    });
  });

  describe("no signal (negative cases)", () => {
    it("plain info query → no corrections", () => {
      const session = loadFixture("negative-no-signal-01.jsonl");
      const corrections = ruleBasedCorrectionDetector.detect(session);
      expect(corrections).toEqual([]);
    });

    it("success-only fixture → no corrections", () => {
      const session = loadFixture("success-praise-01.jsonl");
      const corrections = ruleBasedCorrectionDetector.detect(session);
      expect(corrections).toEqual([]);
    });
  });

  describe("mixed fixture", () => {
    it("correctly identifies the denial in mixed session", () => {
      const session = loadFixture("mixed-01.jsonl");
      const corrections = ruleBasedCorrectionDetector.detect(session);
      const hit = corrections.find((c) => c.signal === "explicit_denial");
      expect(hit).toBeDefined();
      expect(hit!.correctionText).toContain("不要");
    });
  });

  describe("ordering", () => {
    it("returns corrections sorted by turn order", () => {
      const session = loadFixture("mixed-01.jsonl");
      const corrections = ruleBasedCorrectionDetector.detect(session);
      for (let i = 1; i < corrections.length; i++) {
        expect(corrections[i]!.turnIndex).toBeGreaterThanOrEqual(
          corrections[i - 1]!.turnIndex,
        );
      }
    });
  });

  // B-064: rule-based detector must ignore system-injected user messages
  // (skill loader output, system reminders, local-command-caveat blocks)
  // and polite "能…吗？" queries — those are not corrections. Previously
  // analyze --commit on a QA session falsely extracted 3 rules from such
  // turns, polluting the global rule library.
  describe("B-064 noise filtering", () => {
    function makeSession(turns: Array<{ user: string; assistant: string }>) {
      return {
        sessionId: "noise-test",
        startTime: "2026-04-28T00:00:00Z",
        endTime: "2026-04-28T00:01:00Z",
        turns: turns.map((t, i) => ({
          turnIndex: i,
          userMessage: t.user,
          assistantText: t.assistant,
          toolCalls: [],
          timestamp: `2026-04-28T00:00:${String(i).padStart(2, "0")}Z`,
        })),
      };
    }

    it("ignores skill loader system message ('Base directory for this skill:...')", () => {
      const session = makeSession([
        { user: "请帮我跑测试", assistant: "好的" },
        { user: "Base directory for this skill: C:\\Users\\x\\.claude\\skills\\foo\n# foo skill\nUse when ... not ... never ... don't ...", assistant: "我看了 skill" },
      ]);
      const corrections = ruleBasedCorrectionDetector.detect(session as never);
      const denial = corrections.find((c) => c.turnIndex === 1 && c.signal === "explicit_denial");
      expect(denial).toBeUndefined();
    });

    it("ignores <system-reminder> wrapped messages", () => {
      const session = makeSession([
        { user: "做点事", assistant: "ok" },
        { user: "<system-reminder>\nDo not use X. Don't break things. Never commit secrets.\n</system-reminder>", assistant: "懂了" },
      ]);
      const corrections = ruleBasedCorrectionDetector.detect(session as never);
      expect(corrections.find((c) => c.turnIndex === 1 && c.signal === "explicit_denial")).toBeUndefined();
    });

    it("ignores <local-command-caveat> wrapped messages", () => {
      const session = makeSession([
        { user: "做点事", assistant: "ok" },
        { user: "<local-command-caveat>这个命令的输出 don't be alarmed: not what I asked</local-command-caveat>", assistant: "懂了" },
      ]);
      const corrections = ruleBasedCorrectionDetector.detect(session as never);
      expect(corrections.find((c) => c.turnIndex === 1 && c.signal === "explicit_denial")).toBeUndefined();
    });

    it("ignores polite '能…吗？' query (not a correction)", () => {
      const session = makeSession([
        { user: "做点事", assistant: "ok" },
        { user: "能不要在这里换行吗？", assistant: "好的" },
      ]);
      const corrections = ruleBasedCorrectionDetector.detect(session as never);
      // 这条用户消息含 "不要" 但语义是请求/疑问，不应识别为纠正
      expect(corrections.find((c) => c.turnIndex === 1 && c.signal === "explicit_denial")).toBeUndefined();
    });

    it("still catches genuine '不对' even when previous turn was system-injected", () => {
      const session = makeSession([
        { user: "<system-reminder>noise</system-reminder>", assistant: "noise" },
        { user: "做点事", assistant: "我用 axios" },
        { user: "不对，应该用 fetch", assistant: "好" },
      ]);
      const corrections = ruleBasedCorrectionDetector.detect(session as never);
      const hit = corrections.find((c) => c.turnIndex === 2 && c.signal === "explicit_denial");
      expect(hit).toBeDefined();
    });
  });
});
