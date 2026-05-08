import type { RawErrorSignal } from "./cross-session-cluster.js";

/**
 * 为一批同类型（same category）错误信号构造 LLM 提取 prompt。
 * 纯函数。
 */
export function buildBatchErrorExtractionPrompt(
  signals: RawErrorSignal[],
  category: "C" | "E" | "S" | "K",
): string {
  const categoryDesc: Record<"C" | "E" | "S" | "K", string> = {
    C: "代码层（语法、类型、API 用法）",
    E: "工程层（架构、依赖、工具链、构建）",
    S: "策略层（任务分解、实现顺序、取舍）",
    K: "认知层（用户偏好、心智模型、协作方式）",
  };

  const signalBlock = signals
    .map(
      (s, i) =>
        `--- 信号 ${i + 1} [${s.signalType}] weight=${s.weight.toFixed(2)} sessions=${s.sessionIds.length} ---\n${s.context.trim()}`,
    )
    .join("\n\n");

  return `你是知识提取器。下面是 ${signals.length} 条来自开发过程的错误信号，类别为 ${category}（${categoryDesc[category]}）。

请分析这些信号，提炼出 1-3 条有价值的"知识条目"（如果信号太弱或内容重复，提炼更少条甚至 0 条）。

【错误信号】
${signalBlock}

【输出字段（每条知识条目）】
- category: "${category}"（固定）
- tags: string[] 自由标签，2-5 个短词
- type: "avoidance" | "practice"
- nature: "objective" | "subjective"
- trigger: string 何时生效，通用场景描述
- wrong_pattern: string 错误做法关键字；不适用填 ""
- correct_pattern: string 正确做法一句话
- reasoning: string 一句话解释原因

【严格要求】
1. 只输出一个 JSON 数组（在 \`\`\`json fenced block 里），数组元素是 0-3 个知识条目对象
2. 如果所有信号都太弱或太私人化，输出空数组 \`[]\`
3. 不要输出除 JSON 以外的任何文字

【示例输出】
\`\`\`json
[
  {
    "category": "E",
    "tags": ["vitest", "windows", "concurrency"],
    "type": "avoidance",
    "nature": "objective",
    "trigger": "在 Windows 环境下配置 vitest",
    "wrong_pattern": "fileParallelism: true",
    "correct_pattern": "fileParallelism: false",
    "reasoning": "Windows 下 vitest 并发模式会导致 OOM，必须顺序跑"
  }
]
\`\`\``;
}
