import {
  InMemoryKnowledgeStore
} from "./chunk-NPSW37EI.js";
import {
  llmBasedKnowledgeExtractor,
  ruleBasedCorrectionDetector,
  runVerify
} from "./chunk-4Y7LCJVR.js";
import {
  init_esm_shims
} from "./chunk-ZWU7KJPP.js";

// ../cli/src/commands/verify.ts
init_esm_shims();
import path from "path";
import fs from "fs";

// ../../fixtures/scenarios/index.ts
init_esm_shims();

// ../../fixtures/scenarios/python-version.ts
init_esm_shims();
var pythonVersionScenario = {
  id: "python-version",
  description: "AI \u5199 'python script.py' \u88AB\u7EA0\u6B63\u7528 python3\uFF0C\u7CFB\u7EDF\u5B66\u5230\uFF0C\u4E0B\u6B21\u62E6\u622A",
  meta: {
    category: "code"
  },
  phaseA: {
    session: {
      sessionId: "scenario-python-version",
      startTime: "2026-04-15T00:00:00Z",
      endTime: "2026-04-15T00:10:00Z",
      turns: [
        {
          turnIndex: 0,
          userMessage: "\u8DD1\u4E00\u4E0B python script.py",
          assistantText: "\u597D\uFF0C\u6211\u7528 python script.py \u6765\u8DD1",
          toolCalls: [
            {
              id: "tool-1",
              name: "Bash",
              input: { command: "python script.py" },
              succeeded: false,
              result: "command not found: python"
            }
          ],
          timestamp: "2026-04-15T00:01:00Z"
        },
        {
          turnIndex: 1,
          userMessage: "\u4E0D\u5BF9\uFF0C\u672C\u673A\u7684 python \u662F python3\uFF0C\u8981\u7528 python3 \u547D\u4EE4",
          assistantText: "\u597D\uFF0C\u6539\u7528 python3",
          toolCalls: [
            {
              id: "tool-2",
              name: "Bash",
              input: { command: "python3 script.py" },
              succeeded: true
            }
          ],
          timestamp: "2026-04-15T00:02:00Z"
        }
      ]
    },
    expectedCorrections: [{ signal: "explicit_denial", minWeight: 0.9, turnIndex: 1 }]
  },
  phaseB: {
    mockLLMResponse: JSON.stringify({
      category: "C",
      tags: ["python", "command"],
      type: "avoidance",
      nature: "objective",
      trigger: "\u5728\u672C\u673A\u6267\u884C Python \u811A\u672C",
      wrong_pattern: "python ",
      correct_pattern: "python3",
      reasoning: "\u672C\u673A\u7684 python \u522B\u540D\u6307\u5411 python3\uFF1B\u76F4\u63A5\u7528 python \u4F1A\u627E\u4E0D\u5230\u547D\u4EE4"
    }),
    expectedRule: {
      categoryEquals: "C",
      typeEquals: "avoidance",
      natureEquals: "objective",
      wrongPatternContains: "python",
      correctPatternContains: "python3"
    }
  },
  phaseC: {
    toolCall: {
      toolName: "Bash",
      input: { command: "python script.py" }
    },
    expectedBehavior: "block"
    // confidence=0.95 (signal weight) + objective → block
  }
};

// ../../fixtures/scenarios/tech-choice.ts
init_esm_shims();
var techChoiceScenario = {
  id: "tech-choice",
  description: "AI \u63A8\u8350 Redux\uFF0C\u7528\u6237\u504F\u597D Zustand\uFF1B\u7CFB\u7EDF\u5B66\u5230\uFF0C\u4E0B\u6B21 npm install Redux \u65F6\u62E6\u622A",
  meta: { category: "engineering" },
  phaseA: {
    session: {
      sessionId: "scenario-tech-choice",
      startTime: "2026-04-15T00:00:00Z",
      endTime: "2026-04-15T00:10:00Z",
      turns: [
        {
          turnIndex: 0,
          userMessage: "\u7ED9\u8FD9\u4E2A React app \u52A0\u4E00\u4E2A\u72B6\u6001\u7BA1\u7406\u5E93",
          assistantText: "\u6211\u63A8\u8350\u7528 Redux Toolkit\uFF0C\u6BD4\u8F83\u6210\u719F",
          toolCalls: [],
          timestamp: "2026-04-15T00:01:00Z"
        },
        {
          turnIndex: 1,
          userMessage: "\u4E0D\u5BF9\uFF0C\u7528 Zustand\uFF0C\u6211\u4EEC\u8981\u8F7B\u91CF",
          assistantText: "\u597D\uFF0C\u6539\u7528 Zustand",
          toolCalls: [
            { id: "t1", name: "Bash", input: { command: "pnpm add zustand" }, succeeded: true }
          ],
          timestamp: "2026-04-15T00:02:00Z"
        }
      ]
    },
    expectedCorrections: [
      { signal: "explicit_denial", minWeight: 0.9, turnIndex: 1 }
    ]
  },
  phaseB: {
    mockLLMResponse: JSON.stringify({
      category: "E",
      tags: ["state-management", "react", "tech-choice"],
      type: "avoidance",
      nature: "subjective",
      trigger: "\u524D\u7AEF\u9879\u76EE\u9700\u8981\u9009\u62E9\u72B6\u6001\u7BA1\u7406\u5E93",
      wrong_pattern: "redux|@reduxjs/toolkit",
      correct_pattern: "Zustand",
      reasoning: "\u7528\u6237\u504F\u597D\u8F7B\u91CF\u65B9\u6848\uFF1BRedux Toolkit \u6837\u677F\u4EE3\u7801\u591A\uFF0CZustand API \u6781\u7B80"
    }),
    expectedRule: {
      categoryEquals: "E",
      typeEquals: "avoidance",
      natureEquals: "subjective",
      wrongPatternContains: "redux",
      correctPatternContains: "Zustand"
    }
  },
  phaseC: {
    toolCall: {
      toolName: "Bash",
      input: { command: "npm install @reduxjs/toolkit" }
    },
    // subjective + 0.95 → warn (subjective caps at warn)
    expectedBehavior: "warn"
  }
};

// ../../fixtures/scenarios/api-hallucination.ts
init_esm_shims();
var apiHallucinationScenario = {
  id: "api-hallucination",
  description: "AI \u5199\u4E86 JS \u6570\u7EC4 .removeAt(i) (\u4E0D\u5B58\u5728)\uFF0C\u7528\u6237\u7EA0\u6B63\u7528 splice\uFF1B\u4E0B\u6B21\u62E6\u622A",
  meta: { category: "code" },
  phaseA: {
    session: {
      sessionId: "scenario-api-hallucination",
      startTime: "2026-04-15T00:00:00Z",
      endTime: "2026-04-15T00:10:00Z",
      turns: [
        {
          turnIndex: 0,
          userMessage: "\u4ECE\u8FD9\u4E2A\u6570\u7EC4\u91CC\u5220\u6389\u7B2C 3 \u4E2A\u5143\u7D20",
          assistantText: "\u597D\uFF0C\u7528 array.removeAt(3) \u5C31\u884C",
          toolCalls: [
            {
              id: "t1",
              name: "Edit",
              input: {
                file_path: "src/list.ts",
                old_string: "// remove item",
                new_string: "items.removeAt(3);"
              },
              succeeded: true
            }
          ],
          timestamp: "2026-04-15T00:01:00Z"
        },
        {
          turnIndex: 1,
          userMessage: "\u9519\u4E86\uFF0CJS \u6570\u7EC4\u6CA1\u6709 removeAt \u65B9\u6CD5\uFF0C\u7528 splice(3, 1)",
          assistantText: "\u5BF9\uFF0C\u6211\u641E\u6DF7\u4E86 .NET \u548C JS",
          toolCalls: [
            {
              id: "t2",
              name: "Edit",
              input: {
                file_path: "src/list.ts",
                old_string: "items.removeAt(3);",
                new_string: "items.splice(3, 1);"
              },
              succeeded: true
            }
          ],
          timestamp: "2026-04-15T00:02:00Z"
        }
      ]
    },
    expectedCorrections: [
      { signal: "explicit_denial", minWeight: 0.9, turnIndex: 1 }
    ]
  },
  phaseB: {
    mockLLMResponse: JSON.stringify({
      category: "C",
      tags: ["javascript", "array", "api"],
      type: "avoidance",
      nature: "objective",
      trigger: "\u9700\u8981\u4ECE JavaScript \u6570\u7EC4\u4E2D\u5220\u9664\u5143\u7D20",
      wrong_pattern: ".removeAt(",
      correct_pattern: ".splice(",
      reasoning: "JavaScript Array \u6CA1\u6709 removeAt \u65B9\u6CD5\uFF08\u8FD9\u662F .NET \u98CE\u683C\uFF09\uFF1B\u6807\u51C6\u505A\u6CD5\u662F Array.prototype.splice(index, 1)"
    }),
    expectedRule: {
      categoryEquals: "C",
      typeEquals: "avoidance",
      natureEquals: "objective",
      wrongPatternContains: "removeAt",
      correctPatternContains: "splice"
    }
  },
  phaseC: {
    toolCall: {
      toolName: "Edit",
      input: {
        file_path: "src/another.ts",
        old_string: "// here",
        new_string: "list.removeAt(0);"
      }
    },
    // objective + 0.95 → block
    expectedBehavior: "block"
  }
};

// ../../fixtures/scenarios/security.ts
init_esm_shims();
var securityScenario = {
  id: "security",
  description: "AI \u628A sk- \u5F00\u5934\u7684 API key \u786C\u7F16\u7801\u5230 .ts \u6587\u4EF6\uFF0C\u7528\u6237\u7EA0\u6B63\u7528 env var\uFF1B\u4E0B\u6B21\u62E6\u622A",
  meta: { category: "code" },
  phaseA: {
    session: {
      sessionId: "scenario-security",
      startTime: "2026-04-15T00:00:00Z",
      endTime: "2026-04-15T00:10:00Z",
      turns: [
        {
          turnIndex: 0,
          userMessage: "\u52A0\u4E0A OpenAI \u5BA2\u6237\u7AEF\u8C03\u7528",
          assistantText: "\u597D\uFF0C\u521D\u59CB\u5316 client \u7684\u65F6\u5019\u52A0 API key",
          toolCalls: [
            {
              id: "t1",
              name: "Write",
              input: {
                file_path: "src/openai-client.ts",
                content: "import OpenAI from 'openai';\nexport const client = new OpenAI({ apiKey: 'sk-proj-FAKE12345' });\n"
              },
              succeeded: true
            }
          ],
          timestamp: "2026-04-15T00:01:00Z"
        },
        {
          turnIndex: 1,
          userMessage: "\u4E0D\u5BF9\uFF0Csecret \u4E0D\u80FD\u5199\u4EE3\u7801\u91CC\uFF0C\u7528 process.env.OPENAI_API_KEY",
          assistantText: "\u5BF9\uFF0C\u6211\u5E94\u8BE5\u7528 env var",
          toolCalls: [
            {
              id: "t2",
              name: "Edit",
              input: {
                file_path: "src/openai-client.ts",
                old_string: "apiKey: 'sk-proj-FAKE12345'",
                new_string: "apiKey: process.env.OPENAI_API_KEY"
              },
              succeeded: true
            }
          ],
          timestamp: "2026-04-15T00:02:00Z"
        }
      ]
    },
    expectedCorrections: [
      { signal: "explicit_denial", minWeight: 0.9, turnIndex: 1 }
    ]
  },
  phaseB: {
    mockLLMResponse: JSON.stringify({
      category: "S",
      tags: ["security", "secret", "env-var"],
      type: "avoidance",
      nature: "objective",
      trigger: "\u5728\u6E90\u4EE3\u7801\u91CC\u914D\u7F6E\u5916\u90E8\u670D\u52A1\u7684\u8BA4\u8BC1\u5BC6\u94A5",
      wrong_pattern: `apiKey: 'sk-|apiKey: "sk-`,
      correct_pattern: "apiKey: process.env.<NAME>",
      reasoning: "\u786C\u7F16\u7801 secret \u4F1A\u8FDB git history \u6C38\u4E45\u6CC4\u6F0F\uFF1B\u5FC5\u987B\u4ECE\u73AF\u5883\u53D8\u91CF\u8BFB\u53D6"
    }),
    expectedRule: {
      categoryEquals: "S",
      typeEquals: "avoidance",
      natureEquals: "objective",
      wrongPatternContains: "sk-",
      correctPatternContains: "process.env"
    }
  },
  phaseC: {
    toolCall: {
      toolName: "Write",
      input: {
        file_path: "src/anthropic-client.ts",
        content: "import Anthropic from '@anthropic-ai/sdk';\nexport const c = new Anthropic({ apiKey: 'sk-ant-OTHER999' });\n"
      }
    },
    // objective + 0.95 → block
    expectedBehavior: "block"
  }
};

// ../../fixtures/scenarios/workflow-order.ts
init_esm_shims();
var workflowOrderScenario = {
  id: "workflow-order",
  description: "AI \u7528 'git add .' \u592A\u5BBD\uFF1B\u7528\u6237\u6559\u53EA add \u5177\u4F53\u6587\u4EF6\uFF1B\u4E0B\u6B21 warn \u63D0\u9192",
  meta: { category: "strategy" },
  phaseA: {
    session: {
      sessionId: "scenario-workflow-order",
      startTime: "2026-04-15T00:00:00Z",
      endTime: "2026-04-15T00:10:00Z",
      turns: [
        {
          turnIndex: 0,
          userMessage: "\u628A\u8FD9\u6B21\u7684\u4FEE\u6539\u63D0\u4EA4\u4E86",
          assistantText: "\u597D\uFF0Cgit add . \u7136\u540E commit",
          toolCalls: [
            { id: "t1", name: "Bash", input: { command: "git add ." }, succeeded: true }
          ],
          timestamp: "2026-04-15T00:01:00Z"
        },
        {
          turnIndex: 1,
          userMessage: "\u4E0D\u5BF9\uFF0Cgit add . \u592A\u5BBD\u5BB9\u6613\u628A .env \u8FD9\u79CD\u5E26\u8FDB\u53BB\uFF0C\u8981 add \u5177\u4F53\u6587\u4EF6",
          assistantText: "\u5BF9\uFF0C\u5E94\u8BE5\u660E\u786E",
          toolCalls: [
            {
              id: "t2",
              name: "Bash",
              input: { command: "git add src/api.ts src/utils.ts" },
              succeeded: true
            }
          ],
          timestamp: "2026-04-15T00:02:00Z"
        }
      ]
    },
    expectedCorrections: [
      { signal: "explicit_denial", minWeight: 0.9, turnIndex: 1 }
    ]
  },
  phaseB: {
    mockLLMResponse: JSON.stringify({
      category: "S",
      tags: ["git", "workflow", "safety"],
      type: "avoidance",
      nature: "subjective",
      trigger: "git \u63D0\u4EA4\u524D staging \u6587\u4EF6",
      wrong_pattern: "git add .|git add -A",
      correct_pattern: "git add <\u5177\u4F53\u6587\u4EF6>",
      reasoning: "git add . \u5BB9\u6613\u628A .env / credentials / \u5927\u6587\u4EF6\u7B49\u654F\u611F\u6216\u4E0D\u8BE5\u5165\u5E93\u7684\u5185\u5BB9\u5E26\u8FDB\u53BB\uFF1B\u660E\u786E\u52A0\u6587\u4EF6\u66F4\u5B89\u5168"
    }),
    expectedRule: {
      categoryEquals: "S",
      typeEquals: "avoidance",
      natureEquals: "subjective",
      wrongPatternContains: "git add .",
      correctPatternContains: "\u5177\u4F53\u6587\u4EF6"
    }
  },
  phaseC: {
    toolCall: {
      toolName: "Bash",
      input: { command: "git add ." }
    },
    // subjective → max enforcement = warn
    expectedBehavior: "warn"
  }
};

// ../../fixtures/scenarios/moment-dayjs.ts
init_esm_shims();
var momentDayjsScenario = {
  id: "moment-dayjs",
  description: "AI \u4F7F\u7528 moment \u88AB\u7EA0\u6B63\u4E3A dayjs\uFF1B\u7CFB\u7EDF\u5B66\u5230\uFF0C\u4E0B\u6B21 npm install moment \u65F6\u62E6\u622A",
  meta: { category: "engineering" },
  phaseA: {
    session: {
      sessionId: "scenario-moment-dayjs",
      startTime: "2026-05-11T00:00:00Z",
      endTime: "2026-05-11T00:10:00Z",
      turns: [
        {
          turnIndex: 0,
          userMessage: "\u7ED9\u8FD9\u4E2A TypeScript \u9879\u76EE\u52A0\u4E00\u4E2A\u65E5\u671F\u683C\u5F0F\u5316\u5DE5\u5177",
          assistantText: "\u6211\u4F1A\u5B89\u88C5 moment\uFF0C\u5E76\u5199 formatToday() \u4F7F\u7528 moment().format('YYYY-MM-DD')\u3002",
          toolCalls: [
            {
              id: "tool-1",
              name: "Bash",
              input: { command: "npm install moment" },
              succeeded: true
            }
          ],
          timestamp: "2026-05-11T00:01:00Z"
        },
        {
          turnIndex: 1,
          userMessage: "\u4E0D\u5BF9\uFF0C\u4E0D\u8981 moment\uFF0C\u7528 dayjs\u3002moment \u592A\u91CD\u800C\u4E14\u6211\u4EEC\u9879\u76EE\u6807\u51C6\u662F dayjs\u3002",
          assistantText: "\u660E\u767D\uFF0C\u6539\u7528 dayjs\u3002",
          toolCalls: [
            {
              id: "tool-2",
              name: "Bash",
              input: { command: "npm install dayjs" },
              succeeded: true
            }
          ],
          timestamp: "2026-05-11T00:02:00Z"
        }
      ]
    },
    expectedCorrections: [
      { signal: "explicit_denial", minWeight: 0.9, turnIndex: 1 }
    ]
  },
  phaseB: {
    mockLLMResponse: JSON.stringify({
      category: "E",
      tags: ["date-library", "moment", "dayjs"],
      type: "avoidance",
      nature: "objective",
      trigger: "\u9879\u76EE\u91CC\u9700\u8981\u5B89\u88C5\u6216\u4F7F\u7528\u65E5\u671F\u683C\u5F0F\u5316\u5E93",
      wrong_pattern: "moment",
      correct_pattern: "dayjs",
      reasoning: "moment \u5305\u4F53\u79EF\u5927\u4E14\u4E0D\u662F\u9879\u76EE\u6807\u51C6\uFF1B\u672C\u9879\u76EE\u65E5\u671F\u683C\u5F0F\u5316\u5E94\u4F7F\u7528 dayjs"
    }),
    expectedRule: {
      categoryEquals: "E",
      typeEquals: "avoidance",
      natureEquals: "objective",
      wrongPatternContains: "moment",
      correctPatternContains: "dayjs",
      reasoningContains: "\u9879\u76EE\u6807\u51C6"
    }
  },
  phaseC: {
    toolCall: {
      toolName: "Bash",
      input: { command: "npm install moment" }
    },
    expectedBehavior: "block"
  }
};

// ../../fixtures/scenarios/index.ts
var allScenarios = [
  pythonVersionScenario,
  techChoiceScenario,
  apiHallucinationScenario,
  securityScenario,
  workflowOrderScenario,
  momentDayjsScenario
];

// ../cli/src/commands/verify.ts
async function executeVerify(opts = {}) {
  const scenarios = opts.scenarios ?? allScenarios;
  const now = opts.now ?? (() => /* @__PURE__ */ new Date());
  const result = await runVerify(scenarios, {
    detector: ruleBasedCorrectionDetector,
    extractor: llmBasedKnowledgeExtractor,
    makeStore: () => new InMemoryKnowledgeStore(),
    now
  });
  let reportPath;
  if (opts.reportPath) {
    const md = renderVerifyMarkdown(result, now());
    fs.mkdirSync(path.dirname(opts.reportPath), { recursive: true });
    fs.writeFileSync(opts.reportPath, md, "utf-8");
    reportPath = opts.reportPath;
  }
  return { result, reportPath };
}
function renderVerifyTerminal(r) {
  const lines = [];
  lines.push("\u{1F52C} TeamAgent Verify");
  lines.push("");
  for (const s of r.scenarios) {
    const sym = s.passed ? "\u2713" : "\u2717";
    lines.push(
      `  ${sym} ${s.scenarioId.padEnd(20)} PRR=${s.prr.toString().padStart(3)}  KP=${s.kp.toFixed(1)}`
    );
    if (!s.passed) {
      const failed = [];
      if (!s.phaseA.passed) failed.push("A");
      if (!s.phaseB.passed) failed.push("B");
      if (!s.phaseC.passed) failed.push("C");
      lines.push(
        `      Phase \u5931\u8D25: ${failed.join(", ")}  expectedBehavior=${s.phaseC.expectedBehavior} actual=${s.phaseC.actualBehavior}`
      );
      for (const e of s.errors.slice(0, 3)) lines.push(`      \u26A0 ${e.slice(0, 100)}`);
    }
  }
  lines.push("");
  lines.push("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
  lines.push(`  \u901A\u8FC7: ${r.passed}/${r.total}`);
  lines.push(`  \u5E73\u5747 PRR: ${r.averagePRR.toFixed(1)}`);
  lines.push(`  \u5E73\u5747 KP:  ${r.averageKP.toFixed(2)}/5`);
  lines.push("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
  return lines.join("\n") + "\n";
}
function renderVerifyMarkdown(r, now) {
  const lines = [];
  lines.push("# TeamAgent Verify \u62A5\u544A");
  lines.push("");
  lines.push(`> \u751F\u6210\u65F6\u95F4: ${now.toISOString()}`);
  lines.push(`> \u573A\u666F\u6570: ${r.total}`);
  lines.push("");
  lines.push("## \u603B\u89C8");
  lines.push("");
  lines.push("| \u6307\u6807 | \u503C |");
  lines.push("|------|----|");
  lines.push(`| \u901A\u8FC7\u7387 | ${r.passed}/${r.total} (${(r.passed / r.total * 100).toFixed(0)}%) |`);
  lines.push(`| \u5E73\u5747 PRR (Pitfall Reduction Rate) | ${r.averagePRR.toFixed(1)} |`);
  lines.push(`| \u5E73\u5747 KP (Knowledge Precision, 1-5) | ${r.averageKP.toFixed(2)} |`);
  lines.push("");
  lines.push("## \u6BCF\u4E2A\u573A\u666F\u660E\u7EC6");
  lines.push("");
  for (const s of r.scenarios) {
    lines.push(`### ${s.scenarioId} ${s.passed ? "\u2713" : "\u2717"}`);
    lines.push("");
    lines.push(`- PRR: ${s.prr}`);
    lines.push(`- KP: ${s.kp.toFixed(2)}`);
    lines.push("");
    lines.push("**Phase A (\u8E29\u5751)**:");
    lines.push("");
    lines.push(`- detector \u8C03\u7528: ${s.phaseA.detectorCalled ? "\u2713" : "\u2717"}`);
    lines.push(`- \u8BC6\u522B\u5230\u7EA0\u6B63: ${s.phaseA.correctionsFound} \u6761`);
    for (const m of s.phaseA.expectedMatches) {
      lines.push(`  - ${m.signal}: ${m.matched ? "\u2713" : "\u2717"}`);
    }
    lines.push("");
    lines.push("**Phase B (\u5B66\u4E60)**:");
    lines.push("");
    lines.push(`- \u89C4\u5219\u751F\u6210: ${s.phaseB.ruleGenerated ? "\u2713" : "\u2717"}`);
    if (s.phaseB.rulePredicates.length > 0) {
      for (const p of s.phaseB.rulePredicates) {
        lines.push(`  - ${p.predicate}: ${p.passed ? "\u2713" : "\u2717"}`);
      }
    }
    lines.push("");
    lines.push("**Phase C (\u907F\u5751)**:");
    lines.push("");
    lines.push(`- \u671F\u671B\u884C\u4E3A: ${s.phaseC.expectedBehavior}`);
    lines.push(`- \u5B9E\u9645\u884C\u4E3A: ${s.phaseC.actualBehavior}`);
    lines.push(`- \u901A\u8FC7: ${s.phaseC.passed ? "\u2713" : "\u2717"}`);
    lines.push("");
    if (s.errors.length > 0) {
      lines.push("**\u9519\u8BEF**:");
      lines.push("");
      for (const e of s.errors) lines.push(`- ${e}`);
      lines.push("");
    }
  }
  lines.push("---");
  lines.push("");
  lines.push("## \u5173\u4E8E\u8FD9\u4EFD\u62A5\u544A");
  lines.push("");
  lines.push(
    "5 \u4E2A\u573A\u666F\u6D4B\u8BD5\u7CFB\u7EDF\u80FD\u5426\u5B8C\u6210\u5B8C\u6574\u95ED\u73AF\uFF08**\u8E29\u5751\u8BC6\u522B \u2192 \u77E5\u8BC6\u63D0\u53D6 \u2192 \u540E\u7EED\u62E6\u622A**\uFF09\u3002"
  );
  lines.push(
    "Phase B \u7528 mock LLM \u6CE8\u5165\u786E\u5B9A\u54CD\u5E94\u2014\u2014\u5B9E\u9645\u90E8\u7F72\u65F6\u662F\u771F `claude -p`\uFF0C\u8F93\u51FA\u4F1A\u6709\u6296\u52A8\u4F46 shape \u4E00\u81F4\u3002"
  );
  lines.push("");
  lines.push(
    "PRR=100% \u8868\u793A\u89C4\u5219\u6210\u529F\u5728 Phase C \u62E6\u4F4F\u4E86\u76F8\u4F3C\u9519\u8BEF\uFF1BKP=5/5 \u8868\u793A\u63D0\u53D6\u7684\u89C4\u5219\u5B57\u6BB5\u5168\u90E8\u7B26\u5408\u9884\u671F\u3002"
  );
  return lines.join("\n") + "\n";
}
var VERIFY_KNOWN_FLAGS = /* @__PURE__ */ new Set(["--report"]);
var VerifyArgError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "VerifyArgError";
  }
};
function parseVerifyArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--report" && argv[i + 1]) {
      opts.reportPath = argv[i + 1];
      i++;
    } else if (a.startsWith("--report=")) {
      opts.reportPath = a.slice("--report=".length);
    } else if (a.startsWith("--")) {
      const base = a.split("=")[0];
      if (!VERIFY_KNOWN_FLAGS.has(base)) {
        throw new VerifyArgError(
          `verify: unknown flag "${a}". Run 'teamagent --help' for valid flags.`
        );
      }
    }
  }
  return opts;
}

export {
  allScenarios,
  executeVerify,
  renderVerifyTerminal,
  renderVerifyMarkdown,
  VerifyArgError,
  parseVerifyArgs
};
