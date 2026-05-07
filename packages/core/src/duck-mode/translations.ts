export interface DuckTranslation {
  term: string;
  aliases?: string[];
  duck: string;
}

export const TRANSLATIONS: DuckTranslation[] = [
  {
    term: "Skills",
    aliases: ["skills", "skill", "Skill"],
    duck: "鸭鸭说: Skills 就是鸭鸭准备好的小本事，每个 .md 文件就是一招呷~ 装上 Skills，鸭鸭可以多会一招事。",
  },
  {
    term: "hooks",
    aliases: ["hook", "Hook", "Hooks"],
    duck: "呷呷~ Hook 是 Claude 做事前/后的小钩子，鸭鸭可以悄悄在中间加一道关卡 (>ω<)",
  },
  {
    term: "PreToolUse",
    aliases: ["pre-tool-use", "pretooluse"],
    duck: "鸭鸭说: PreToolUse 是 Claude 工具调用前的钩子，鸭鸭可以在动手前提一句呷~",
  },
  {
    term: "Stop hook",
    aliases: ["stop-hook", "Stop Hook"],
    duck: "呷呷~ Stop hook 是每轮回答结束触发，鸭鸭借此偷偷做总结、记笔记 (>ω<)",
  },
  {
    term: "embedding",
    aliases: ["embeddings", "向量模型", "向量化"],
    duck: "鸭鸭说: embedding 是把文字捏成一串数字，鸭鸭就能算两段话有多像呷~",
  },
  {
    term: "vector",
    aliases: ["vectors", "向量"],
    duck: "呷呷~ vector 是 embedding 出来的一串数字，鸭鸭用它在大堆话里找最像的那条 (>ω<)",
  },
  {
    term: "matcher",
    aliases: ["matching", "match"],
    duck: "鸭鸭说: matcher 是鸭鸭的小雷达，扫过一句话看有没有匹配的规则呷~",
  },
  {
    term: "RAG",
    aliases: ["rag"],
    duck: "呷呷~ RAG 就是先去鸭鸭的资料库捞几条相关笔记，再让 Claude 看完笔记答题 (>ω<)",
  },
  {
    term: "quantization",
    aliases: ["quantized", "量化"],
    duck: "鸭鸭说: quantization 是把模型缩水让它跑更快、占更少内存呷~ 像鸭鸭把胖羽毛压扁。",
  },
  {
    term: "canonical",
    aliases: ["canonical+", "Canonical"],
    duck: "呷呷~ canonical 表示这条规则非常稳，已经升级成鸭鸭的官方教科书等级 (>ω<)",
  },
  {
    term: "token 预算",
    aliases: ["token budget", "token-budget"],
    duck: "鸭鸭说: token 预算是 Claude 一次能装多少话的上限，鸭鸭得挑最重要的塞进去呷~",
  },
  {
    term: "MCP",
    aliases: ["mcp", "Model Context Protocol"],
    duck: "呷呷~ MCP 是让 Claude 接外部小工具的标准接口，鸭鸭借此装上各种插件 (>ω<)",
  },
  {
    term: "reload",
    aliases: ["reloading"],
    duck: "鸭鸭说: reload 就是重新加载，鸭鸭把刚改的设定再吃一遍呷~",
  },
  {
    term: "statusLine",
    aliases: ["statusline", "status line"],
    duck: "呷呷~ statusLine 是终端最底下那条提示条，鸭鸭把它用来显示状态 (>ω<)",
  },
  {
    term: "settings.local.json",
    duck: "鸭鸭说: settings.local.json 是 Claude Code 的项目专属配置呷~ 里面写了哪些 hook 和工具开了。",
  },
  {
    term: "tier",
    aliases: ["tiers", "experimental", "probation"],
    duck: "鸭鸭说: tier 就是规则的修炼等级呷~ 新规则算 experimental，可信了升 probation，再稳就到 canonical 教科书级 (>ω<)",
  },
  {
    term: "confidence",
    aliases: ["conf"],
    duck: "鸭鸭说: confidence 是这条规则的可信度分数，越高鸭鸭越敢按它来办事呷~",
  },
  {
    term: "demerit",
    aliases: ["demerits"],
    duck: "呷呷~ demerit 是规则犯错的扣分记录，鸭鸭用它来识别失效的旧规则 (>ω<)",
  },
  {
    term: "归因渲染",
    aliases: ["attribution", "AttributionBus"],
    duck: "鸭鸭说: 归因渲染就是把'系统帮你做了什么'拼成一段人话给你看呷~",
  },
  {
    term: "知识种子",
    aliases: ["seed", "seeds"],
    duck: "呷呷~ 知识种子是预先打包给鸭鸭的一袋通用规则，鸭鸭装完就能跑 (>ω<)",
  },
  {
    term: "元原则",
    aliases: ["meta-principle", "meta principles"],
    duck: "鸭鸭说: 元原则是最顶层的几条铁律，比如'不要让代码自己评价自己'呷~",
  },
  {
    term: "knowledge.db",
    duck: "呷呷~ knowledge.db 是鸭鸭存所有规则的小本本（SQLite 文件）(>ω<)",
  },
  {
    term: "Codex",
    aliases: ["codex", ".codex/skills"],
    duck: "鸭鸭说: Codex 是另一个 AI 编程助手，鸭鸭也给它准备一份 Skills 让它读呷~",
  },
  {
    term: "plugins",
    aliases: ["plugin", "Plugin"],
    duck: "呷呷~ plugins 是给 Claude Code 装的小扩展包，鸭鸭借此让 Claude 多会几招呷~ (>ω<)",
  },
  {
    term: "verbose",
    aliases: ["Verbose"],
    duck: "鸭鸭说: verbose 模式 = 鸭鸭话比较多，会把过程说更细呷~",
  },
];
