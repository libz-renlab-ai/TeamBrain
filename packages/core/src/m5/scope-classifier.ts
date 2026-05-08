import type {
  ScopeClassifierPort,
  ScopeClassification,
} from "@teamagent/ports";

/**
 * 闸门 2：作用域启发式分类器。
 * 纯函数 + Port 实现工厂。
 *
 * 策略：保守。只有命中 shareable 强信号且无 personal 强信号才返回 shareable。
 * 模糊不清统一返回 personal（按设计：默认私密）。
 */

/** personal 强信号：本机/个人身份 */
const PERSONAL_SIGNALS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /(?:\/Users|\/home|\/root)\/[A-Za-z0-9._-]+/,
    reason: "包含本机绝对路径",
  },
  {
    pattern: /[A-Za-z]:\\(?:Users|Program Files)\\/,
    reason: "包含 Windows 用户目录路径",
  },
  {
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
    reason: "包含具体邮箱",
  },
  {
    pattern: /(?:张|李|王|刘|陈|杨|赵|周|吴|徐|孙|马|朱|胡|郭|何|高|林|罗|郑)[一-龥]{1,3}(?:之前|之前在|说过|告诉|认为|说不行|说行)/,
    reason: "包含具体人名 + 上下文",
  },
  // W15-007: free-text personal-context markers — these mean "this is my
  // own working note", which the historical classifier ignored on
  // mixed-language input that also contained an engineering keyword
  // ("PR", "review", "CI", ...) and got auto-promoted to L2.
  {
    pattern: /我个人|我的电脑|我自己|我本机|私人(?:笔记|记录|草稿)?|本地草稿|草稿(?:版|本)?(?![一-鿿]*(?:协议|流程|约定))/,
    reason: "出现个人/本机/草稿等私人上下文标记",
  },
  {
    pattern: /\b(?:my\s+(?:personal|local|own|private)|just\s+for\s+me|local\s+note|draft\s+note)\b/i,
    reason: "出现 personal / local / draft 等英文私人标记",
  },
];

/** shareable 强信号：通用工程经验/规则/流程 */
const SHAREABLE_SIGNALS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /\b(PR|merge|commit|review|CI|test|typecheck|lint)\b/i,
    reason: "讨论 PR/CI/测试等工程流程",
  },
  {
    pattern: /(契约|测试|实现|端到端|纯函数|签名|抽象|接口|Port|Adapter)/,
    reason: "讨论代码模式或架构概念",
  },
  {
    pattern: /(?:必须|应当|不要|禁止|建议|应该|不该|约定)/,
    reason: "明确陈述项目约定或规则",
  },
  {
    pattern: /\b(?:codex|claude|chatgpt|gpt|llm|agent|hook)\b/i,
    reason: "讨论 AI/工具链使用经验",
  },
];

/** 纯函数：分类一段文本的作用域。 */
export function classifyScope(text: string): ScopeClassification {
  const trimmed = text.trim();
  if (trimmed.length < 8) {
    return {
      scope: "uncertain",
      reason: "文本太短，无法判断",
    };
  }

  const personalHits = PERSONAL_SIGNALS.filter((s) => s.pattern.test(text));
  if (personalHits.length > 0) {
    return {
      scope: "personal",
      reason: `命中 personal 信号: ${personalHits.map((h) => h.reason).join("; ")}`,
    };
  }

  const shareableHits = SHAREABLE_SIGNALS.filter((s) => s.pattern.test(text));
  if (shareableHits.length >= 1) {
    return {
      scope: "shareable",
      reason: `命中 shareable 信号: ${shareableHits.map((h) => h.reason).join("; ")}`,
    };
  }

  return {
    scope: "personal",
    reason: "未命中任何强信号——保守按 personal",
  };
}

/** Port 实现工厂。 */
export function createScopeClassifier(): ScopeClassifierPort {
  return {
    async classify(text: string): Promise<ScopeClassification> {
      return classifyScope(text);
    },
  };
}
