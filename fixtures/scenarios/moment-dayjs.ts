import type { Scenario } from "../../packages/core/src/index.js";

/**
 * 场景 6: moment-dayjs
 *
 * AI 使用 moment 后被用户纠正为 dayjs。系统学到规则后，
 * 下一次 Bash 准备安装 moment 时必须拦截。
 */
export const momentDayjsScenario: Scenario = {
  id: "moment-dayjs",
  description: "AI 使用 moment 被纠正为 dayjs；系统学到，下次 npm install moment 时拦截",
  meta: { category: "engineering" },
  phaseA: {
    session: {
      sessionId: "scenario-moment-dayjs",
      startTime: "2026-05-11T00:00:00Z",
      endTime: "2026-05-11T00:10:00Z",
      turns: [
        {
          turnIndex: 0,
          userMessage: "给这个 TypeScript 项目加一个日期格式化工具",
          assistantText:
            "我会安装 moment，并写 formatToday() 使用 moment().format('YYYY-MM-DD')。",
          toolCalls: [
            {
              id: "tool-1",
              name: "Bash",
              input: { command: "npm install moment" },
              succeeded: true,
            },
          ],
          timestamp: "2026-05-11T00:01:00Z",
        },
        {
          turnIndex: 1,
          userMessage: "不对，不要 moment，用 dayjs。moment 太重而且我们项目标准是 dayjs。",
          assistantText: "明白，改用 dayjs。",
          toolCalls: [
            {
              id: "tool-2",
              name: "Bash",
              input: { command: "npm install dayjs" },
              succeeded: true,
            },
          ],
          timestamp: "2026-05-11T00:02:00Z",
        },
      ],
    },
    expectedCorrections: [
      { signal: "explicit_denial", minWeight: 0.9, turnIndex: 1 },
    ],
  },
  phaseB: {
    mockLLMResponse: JSON.stringify({
      category: "E",
      tags: ["date-library", "moment", "dayjs"],
      type: "avoidance",
      nature: "objective",
      trigger: "项目里需要安装或使用日期格式化库",
      wrong_pattern: "moment",
      correct_pattern: "dayjs",
      reasoning: "moment 包体积大且不是项目标准；本项目日期格式化应使用 dayjs",
    }),
    expectedRule: {
      categoryEquals: "E",
      typeEquals: "avoidance",
      natureEquals: "objective",
      wrongPatternContains: "moment",
      correctPatternContains: "dayjs",
      reasoningContains: "项目标准",
    },
  },
  phaseC: {
    toolCall: {
      toolName: "Bash",
      input: { command: "npm install moment" },
    },
    expectedBehavior: "block",
  },
};
